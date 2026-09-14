-- 0268_een_weergavenaam_draagt_geen_bidi_stuurteken.sql — een weergavenaam
-- draagt geen bidi-stuurteken meer, en kan de tekens eromheen dus niet meer
-- omkeren (QS8-450).
--
-- ⚠️⚠️ **De kop zei eerst "kan niet meer als een ándere naam renderen", en dat
--    was breder dan wat hier geleverd wordt.** 📏 Gemeten in de security-ronde
--    op deze branch: `schone_naam(U&'Ja\200Bn')` geeft een naam van **vier**
--    tekens die als `Jan` rendert, en die haalt béíde CHECKs. Hetzelfde voor
--    `U+FEFF` en `U+00AD`. Twee leden in dezelfde groep kunnen dus een
--    pixel-identieke naam dragen zónder bidi en zónder homoglyph.
--
--    Dat gat blijft open en staat mét zijn meting in `docs/ENGINEER-REVIEW.md`.
--    Een kop die meer belooft dan hij levert is in dit project duurder dan een
--    ontbrekende grendel — die valt op.
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan:
--
--     begin;
--     alter table public.profiles
--       drop constraint if exists profiles_display_name_geen_bidi;
--     create or replace function public.schone_naam(p_ruw text) ... (de versie
--       uit 0256: één regexp_replace-paar op de randen, zónder zonder_bidi());
--     drop function if exists public.zonder_bidi(text);
--     commit;
--
--   ⚠️ **In die volgorde en in één transactie.** De CHECK roept `zonder_bidi()`
--      aan, dus die functie kan niet weg zolang hij staat; en `schone_naam()`
--      roept hem óók aan. Los in autocommit geeft dat een halve terugzet waarin
--      `schone_naam()` naar een verdwenen functie wijst — en dan faalt élke
--      profielschrijving, want de CHECK van 0256 roept hém aan.
--
--   ⚠️ **Stap 0, verplicht en vóór stap 1.** Meet eerst of er namen staan die de
--      CHECK zou weigeren — het `do $$`-blok onderin dit bestand doet dat bij het
--      toepassen, maar bij een terugzet draait dat blok niet:
--
--        select count(*) from public.profiles
--        where display_name <> public.zonder_bidi(display_name);
--
--      Staat daar iets, dan is wat daarmee gebeurt een productbeslissing (de
--      naam van een echte gebruiker herschrijven) en geen rollbackstap.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 13-09-2026 door de security-review op QS8-448, en op 14-09
--    nagemeten op de draaiende opbouw ná 0256:
--
--      schone_naam(U&'gxp\202Eeterces')  ->  gxp‮eterces   (11 tekens)
--      schone_naam(U&'a\202Db')          ->  a‭b            (3 tekens)
--      schone_naam(U&'a\2067b')          ->  a⁧b            (3 tekens)
--
--    `U+202E` staat wél in de bereikenlijst van 0256, maar `schone_naam()`
--    strijkt met opzet alleen de **randen** — dus met tekst eromheen blijft hij
--    staan. De reviewer mat `display_name` = `gxp‮eterces`, wat als
--    `secrete.pxg` rendert.
--
-- ⚠️ **`display_name` is groepszichtbaar** via `profiles_select`: dit staat in
--    de ledenlijst van iedereen die een groep met je deelt. Een naam die als de
--    naam van een ánder groepslid rendert, is precies het soort verwarring waar
--    peer-goedkeuring op leunt (domeinregel 3 — wie keur je eigenlijk goed).
--
-- ---------------------------------------------------------------------------
-- Waarom dit géén uitbreiding van de randenlijst is
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Randtrimmen is per constructie het verkeerde gereedschap**, en dat is
--    de reden dat dit een eigen issue is en geen regel erbij in 0256. De
--    bereikenlijst daar beantwoordt *"rendert dit als niets aan de rand"*. Deze
--    vraag is *"rendert dit de rest van de naam anders"*, en het antwoord daarop
--    moet **overal in de string** gelden.
--
-- ⚠️⚠️ **En daarom mag deze lijst nooit de bereikenlijst van 0256 worden.** 📏
--    Die lijst bevat `U+200D`, de zero-width joiner, en die ís de lijm in
--    `👨‍👩‍👧‍👦` (`U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466`).
--    Een `g`-vlag over die lijst houdt vier losse mensen over in plaats van één
--    gezin. Twee lijsten, twee vormen: de ene verankerd aan de randen, de andere
--    met `g` — en de tweede is met opzet klein.
--
-- ---------------------------------------------------------------------------
-- Welke negen tekens, en waarom niet meer
-- ---------------------------------------------------------------------------
--
-- `U+202A`–`U+202E` (embedding, override, pop) en `U+2066`–`U+2069` (isolate,
-- pop). Dat zijn de tekens die de **volgorde** van de tekens eromheen omkeren.
--
-- ⚠️ **`U+200E` (LRM), `U+200F` (RLM) en `U+061C` (ALM) staan er met opzet
--    níét in, en dat is een besluit en geen omissie.** Dat zijn *markeringen*,
--    geen overrides: ze zetten de richting van de **neutrale** tekens ernaast,
--    en ze kunnen een run met sterke tekens niet omkeren. Ze hebben wél
--    legitiem gebruik in een naam die schriften mengt — een Arabische naam met
--    een punt erin heeft er soms een nodig om die punt aan de goede kant te
--    houden. Ze worden aan de rand al gestreken door `schone_naam()`.
--
--    De voorwaarde waaronder dit besluit vervalt staat in
--    `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **Homoglyphen worden hier niet opgelost, en dat is óók een besluit.**
--    📏 Gemeten: `schone_naam(U&'J\0430n')` geeft `Jаn` met een Cyrillische `а`.
--    Twee leden in dezelfde groep kunnen dus een identiek renderende naam
--    hebben. Het middel daartegen is een schriftmengregel, en die weigert
--    legitieme namen — een Nederlandse naam met één Grieks teken bestaat. Dat is
--    een andere afweging met andere kosten, en ze hoort niet als bijvangst in
--    een migratie over stuurtekens. Onderbouwing in
--    `docs/decisions/2026-09-14-een-naam-die-als-een-andere-naam-rendert.md`.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `immutable`, `strict`-vrij en zonder `security definer`, om dezelfde drie
--    redenen als `schone_naam()` in 0256: de CHECK onderaan roept hem aan, hij
--    hangt alleen van zijn invoer af, en hij leest niets.
--
-- ⚠️ `'pg_temp'` achteraan in het zoekpad. Noemt een `search_path` hem niet, dan
--    zet Postgres hem vooraan, en dan pakt hij daar relatie- en typenamen.
create or replace function public.zonder_bidi(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- ⚠️⚠️ **Hier stáát de `g`-vlag, en dat is het hele punt van deze functie.**
  --    `schone_naam()` mag hem niet hebben (de zero-width joiner), deze moet hem
  --    hebben: een override midden in de naam is precies het geval.
  --
  -- ⚠️ Als escapes en niet als letterlijke tekens. Een `.sql` met een echte
  --    RIGHT-TO-LEFT OVERRIDE erin is niet te reviewen — je ziet niet wat er
  --    staat, en de regel eromheen rendert achterstevoren.
  select regexp_replace(
    coalesce(p_ruw, ''),
    '[' || U&'\202A-\202E\2066-\2069' || ']',
    '',
    'g'
  );
$$;

comment on function public.zonder_bidi(text) is
  'Een tekst zonder bidi-overrides en -isolaten — QS8-450. Spiegelt '
  '`zonderBidi()` uit `src/shared/tekst`; '
  '`tests/rls/naamnormalisatie.test.ts` loopt het hele codepuntbereik af met '
  'een teken in het midden en legt de twee oordelen naast elkaar.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`.** In Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie, en
--    `revoke ... from public` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait (beveiligingsregel 4).
revoke execute on function public.zonder_bidi(text) from public, anon, authenticated;

-- ⚠️⚠️ **En dan meteen weer een `grant`, want anders breekt élke
--    profielschrijving.** 📏 Dat is in 0256 gemeten en het was een ship-stopper:
--    met een CHECK die een functie aanroept en zónder deze grant valt een
--    doodgewone `update profiles set locale` om op
--    `permission denied for function zonder_bidi`. Postgres toetst EXECUTE op
--    een functie in een CHECK op het moment van **schrijven**.
--
--    ⚠️ Een dichte deur leest als een veilige deur. De must-allow-helft staat
--       daarom expliciet in `tests/rls/profielschrijven.test.ts`.
grant execute on function public.zonder_bidi(text) to authenticated;

-- ---------------------------------------------------------------------------
-- `schone_naam()` neemt hem op, zodat de aanmeldtrigger hem gratis krijgt
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Twee schrijvers en niet één.** 📏 Dat is de les van 7a in
--    `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`: de
--    eerste versie van QS8-448 repareerde de aanmeldtrigger en liet de
--    `PATCH /rest/v1/profiles` open — de mákkelijkere route, want om
--    groepszichtbaar te zijn heb je toch al een account.
--
--    `display_name` heeft er nog steeds precies twee, en ze krijgen elk hun
--    eigen middel:
--
--      de trigger  -> `schone_naam()` **strijkt** (een aanmelding mag niet
--                     omvallen op een naam die de provider aanlevert)
--      de PATCH    -> de CHECK **weigert**
--
--    Dezelfde tweedeling als bij de lege naam in 0256, en met dezelfde reden.
--
-- ⚠️⚠️ **Maar er zijn drie gedragingen op één waarde en niet twee, en dat is in
--    de security-ronde rechtgezet.** Hier stond dat de gebruiker "een nette
--    melding terug krijgt". 📏 Dat klopt niet: `profielSchema.display_name`
--    doet `.transform(schoneNaam)`, en `schoneNaam()` componeert sinds deze
--    wijziging `zonderBidi()` — de **client strijkt dus stilletjes** en er komt
--    nooit een melding.
--
--    Dat is beter dan wat er beloofd werd (een Arabische gebruiker die zijn
--    naam uit Word plakt loopt niet vast), maar het hoort opgeschreven te staan:
--
--      de trigger  -> strijkt
--      de client   -> strijkt, zonder melding
--      de database -> weigert, en dat is de énige grens
--
--    De CHECK raakt alleen wie de client overslaat en rechtstreeks met
--    PostgREST praat — en dat is precies waarvoor hij bestaat.
--
-- ⚠️ **Eerst strippen, dán de randen.** `' \202E Jan '` wordt zo `'Jan'`. De
--    andere volgorde geeft hetzelfde resultaat maar leest als toeval.
--
-- ⚠️ De randenlijst is woordelijk die uit 0256 en mag niet afwijken —
--    `tests/rls/naamnormalisatie.test.ts` legt hem codepunt voor codepunt naast
--    `ONZICHTBARE_BEREIKEN` in `src/shared/tekst/index.ts`.
create or replace function public.schone_naam(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
    regexp_replace(public.zonder_bidi(coalesce(p_ruw, '')), '^[' || rand || ']+', ''),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' as rand
  ) s;
$$;

comment on function public.schone_naam(text) is
  'Een naam zonder onzichtbare randen en zonder bidi-stuurtekens — QS8-448, '
  'uitgebreid in QS8-450. Spiegelt `schoneNaam()` uit `src/shared/tekst`; '
  '`tests/rls/naamnormalisatie.test.ts` loopt het hele codepuntbereik af en '
  'legt de twee oordelen naast elkaar, aan de rand én in het midden.';

-- ⚠️ `schone_naam()` bestond al en had zijn grant al. `create or replace`
--    behoudt die, dus hier hoort geen tweede `grant`.
--
--    ⚠️⚠️ **En hóé `tests/rls/functiegrants.test.ts` dat dekt, staat er nu bij.**
--       Hier stond eerst alleen dát hij het dekt. 📏 Gemeten in de
--       security-ronde: `grep zonder_bidi\|schone_naam` op dat bestand geeft
--       **nul** treffers — hij noemt geen enkele functie bij naam. Hij leest
--       élk migratiebestand van schijf en zeeft er `grant execute on function
--       … to …`-regels uit, en legt die naast de functies die `authenticated`
--       daadwerkelijk mag uitvoeren. De dekking is dus echt, maar wie hem
--       opzoekt op de naam van deze functie vindt niets — en concludeert dat de
--       grendel er niet is. Zelfde klasse als QS8-412, één slag milder.

-- ---------------------------------------------------------------------------
-- De grens zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **In de database en niet in `profielSchema`.** Dat schema draait in de
--    browser van de aanvaller; het is een nette melding vóór de grens, niet de
--    grens. Precies die fout zat in de eerste versie van QS8-448.
--
-- ⚠️ **`drop … if exists` eerst, want de migratie moet idempotent zijn.**
--    `npm run idempotent:controle` speelt elke migratie direct na zichzelf nog
--    een keer af op een eigen lege database.
alter table public.profiles
  drop constraint if exists profiles_display_name_geen_bidi;

-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECK, niet erna
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit stond eerst ná de `add constraint`, en dan draait het nooit.** 📏
--    Gemeten in de security-ronde op deze branch, met een proeftabel die twee
--    schendende rijen draagt en exact de volgorde die hier eerst stond:
--
--      ERROR:  check constraint "zz_c" of relation "zz_verify" is violated by some row
--      ERROR:  current transaction is aborted, commands ignored until end of transaction block
--
--    De melding erna komt er dus niet, en op productie — waar écht profielen
--    staan — valt de migratie om met een fout die de rij niet noemt, terwijl het
--    vangnet dat daarvoor geschreven was niet vuurt.
--
-- ⚠️⚠️ **En de tekst die hier stond was feitelijk onjuist.** Er stond dat
--    Postgres bestaande rijen "niet opnieuw toetst". 📏 Allebei de kanten op
--    gemeten: een `add constraint` **zónder** `not valid` toetst élke bestaande
--    rij en weigert; mét `not valid` gaat hij door. Dat is geen detail voor de
--    volgende migratieschrijver: wie gelooft dat oude rijen gegrandfatherd
--    worden, zet een CHECK op een gevulde tabel en krijgt een mislukte deploy.
--
-- ⚠️ Wat er met zo'n rij moet gebeuren is een productbeslissing — je herschrijft
--    de naam van een echte gebruiker — en dus geen migratiestap. Dit blok meet
--    en waarschuwt; het repareert niets.
do $$
declare
  v_aantal bigint;
begin
  select count(*) into v_aantal
  from public.profiles
  where display_name <> public.zonder_bidi(display_name);

  if v_aantal > 0 then
    raise notice
      '⚠️ % profiel(en) dragen een bidi-stuurteken in display_name. De CHECK '
      'hierna gaat daar op om, en deze migratie stopt. Bepaal eerst wat er met '
      'die namen gebeurt — dat is een productbeslissing, geen migratiestap.',
      v_aantal;
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_display_name_geen_bidi
  check (display_name = public.zonder_bidi(display_name));

comment on constraint profiles_display_name_geen_bidi on public.profiles is
  'Een weergavenaam draagt geen bidi-override of -isolaat — QS8-450. De naam is '
  'groepszichtbaar via profiles_select, en een omgekeerde naam rendert als de '
  'naam van iemand anders.';

