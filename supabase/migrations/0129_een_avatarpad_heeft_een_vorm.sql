-- 0129_een_avatarpad_heeft_een_vorm.sql — de CHECK van 0127 toetste alleen het begin
--
-- ROLLBACK-PAD:
--   alter table public.profiles drop constraint if exists profiles_avatar_url_eigen_pad;
--   alter table public.profiles add constraint profiles_avatar_url_eigen_pad
--     check (avatar_url is null or avatar_url like id::text || '/%');
--   ⚠️ Dat is de zwakkere versie. Zie hieronder waaróm hij te zwak was.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-reviewer bij 0127, en zelf nagemeten. 0127 zegt in
-- zijn eigen kop dat hij twee gevallen sluit. Het eerste (een externe URL) was
-- dicht. Het tweede — "het pad van een groepsgenoot", uitdrukkelijk het geval dat
-- de ondertekening níét dekt — was het niet.
--
-- 📏 Gemeten tegen `like id::text || '/%'`, vijf padvormen:
--
--   | pad                                   | 0127 | deze |
--   |---------------------------------------|------|------|
--   | `<mij>/foto.jpg`                      |  ja  |  ja  |
--   | `<mij>/../<ander>/a.png`              |  ja  | nee  |
--   | `<mij>/` + newline + `https://…`      |  ja  | nee  |
--   | `<mij>/map/dieper.png`                |  ja  | nee  |
--   | `<ander>/foto.jpg`                    | nee  | nee  |
--
-- ⚠️ **`like '<mij>/%'` kijkt naar het begin en verder niet.** Alles wat daarna
--    komt mag, inclusief `..`, een regeleinde met een URL erachter, en een
--    willekeurig diep subpad. Dat is precies de impersonatie die 0127 zegt te
--    sluiten: zet je `avatar_url` op `<mij>/../<ander>/a.png` en iedereen die met
--    jullie beiden een groep deelt, kan zijn gezicht naast jouw naam krijgen.
--
-- ⚠️ **Of dat werkelijk lukt, hangt af van iets dat hier niet te meten is:**
--    normaliseert de Storage-API `..` vóór hij het object opzoekt? De lokale
--    schil heeft geen storage-dienst. Doet hij dat niet, dan levert het niets op
--    (geen match, `null`, initialen). Doet hij dat wél, dan werkt het.
--    **Dat is precies de reden om het hier te sluiten** en niet af te wachten:
--    de zwakte van de CHECK is gemeten, de exploiteerbaarheid hangt af van een
--    dienst waarvan wij het gedrag niet bepalen.
--
-- ⚠️ **Wat níet verandert: het echte slot is RLS.** `avatars_select` en
--    `avatars_delete` toetsen de mapnaam van de gevónden rij, dus lezen buiten je
--    groep en andermans bestand weggooien bleven ook onder 0127 geblokkeerd — dat
--    is gemeten in `tests/rls/avatarbucket.test.ts`. Deze CHECK bewaakt wat er in
--    de kólom staat, en dat is een tweede slot en niet het eerste.
--
-- 📏 Veilig te verscherpen: nul rijen met een `avatar_url`, gemeten op productie
--    vóór 0127 en sindsdien is er geen uploadpad gedraaid.
--
-- ⚠️ **De vorm is opzettelijk smal.** `[A-Za-z0-9._-]+` dekt precies wat
--    `avatarPad()` maakt (basis-36 tijd, een streepje, basis-36 toeval, een punt,
--    de extensie) en niets meer. Verandert die functie ooit van vorm, dan is dit
--    de plek die rood wordt — en dat is de bedoeling.
--
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_avatar_url_eigen_pad;

alter table public.profiles
  add constraint profiles_avatar_url_eigen_pad
  check (
    avatar_url is null
    or avatar_url ~ ('^' || id::text || '/[A-Za-z0-9._-]+$')
  );

comment on constraint profiles_avatar_url_eigen_pad on public.profiles is
  'Migraties 0127 en 0129. avatar_url is een pad in je eigen map van de privebucket '
  'avatars, en niets anders: precies een map diep, en geen ".." of regeleinde. 0127 '
  'toetste alleen het prefix en liet <mij>/../<ander>/a.png door.';
