-- 0127_een_avatarpad_wijst_naar_jezelf.sql — avatar_url is een pad in je eigen map, of niets
--
-- ROLLBACK-PAD:
--   alter table public.profiles drop constraint if exists profiles_avatar_url_eigen_pad;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 28-08-2026, direct na 0126, in `information_schema.column_privileges`:
--    `authenticated` heeft UPDATE op **veertien** kolommen van `profiles`, en
--    `avatar_url` is er één van. Er is dus geen enkele reden om aan te nemen dat
--    wat er in die kolom staat door de app geschreven is — één PostgREST-verzoek
--    zet er iets anders in.
--
-- Twee dingen die daaruit volgden, en allebei zijn ze buiten de UI om te doen:
--
--   1. **Een willekeurige URL.** `https://volgmij.example/pixel.gif` in je eigen
--      profiel, en elk groepslid laadt dat adres uit zijn eigen `<Image>`. Dat is
--      de goedkoopste manier om de IP-adressen van een groep te verzamelen.
--      ⚠️ De ondertekening van 0126 vangt dit al — wat niet te tekenen valt wordt
--      `null` — maar dat is een eigenschap van de **datalaag**, en de regel uit
--      CLAUDE.md is dat de dátabase hem afdwingt. Eén ophaalpad dat de kolom
--      rechtstreeks doorgeeft, en de bescherming is weg.
--
--   2. **Het pad van een groepsgenoot.** Dat is subtieler en niet door de
--      ondertekening gedekt: `avatars_select` laat je zijn avatar lézen, dus de
--      URL wordt netjes getekend en de app toont zijn foto naast jouw naam. Geen
--      lek — je zag die foto al — maar wel iemand anders' gezicht onder jouw
--      berichten, en dat is precies wat een avatar niet mag zijn.
--
-- ---------------------------------------------------------------------------
-- De grens hoort hier en niet in de code
-- ---------------------------------------------------------------------------
--
-- Dezelfde vorm als de policies van 0126: het eerste padsegment ís de eigenaar.
-- Deze CHECK zegt dat de kolom hetzelfde moet zeggen als de bucket.
--
-- ⚠️ **Een CHECK en geen policy, want dit is geen rij- maar een waardebeperking.**
--    RLS bepaalt wélke rij je mag schrijven; hij kan niet zeggen wat er in een
--    kolom mag staan. Een UPDATE-policy met `avatar_url like ...` zou bovendien
--    gelden voor élke profielwijziging, ook eentje die de avatar niet aanraakt.
--
-- ⚠️ **En hij geldt ook voor `service_role`.** Dat is met opzet, en dezelfde
--    keuze als bij `chat_messages_system_event_bekend` (0025) en `bewaak_tijdzone`
--    (0119): een constraint die de dienst overslaat, bewaakt alleen de mensen die
--    hem toch al niet zouden breken.
--
-- 📏 Veilig toe te voegen: de kolom is sinds migratie 0001 leeg — er was geen
--    bucket en geen uploadpad, gemeten op 28-08-2026 (nul `.storage`-aanroepen in
--    `src/` en `app/` vóór 0126). `not valid` is daarom niet nodig.
--
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_avatar_url_eigen_pad;

alter table public.profiles
  add constraint profiles_avatar_url_eigen_pad
  check (
    avatar_url is null
    or avatar_url like id::text || '/%'
  );

comment on constraint profiles_avatar_url_eigen_pad on public.profiles is
  'Migratie 0127. avatar_url draagt sinds 0126 een pad in de privébucket avatars, '
  'en het eerste segment is de eigenaar — net als in de vier policies op '
  'storage.objects. Zonder deze CHECK kan een gebruiker er een externe URL of het '
  'pad van een groepsgenoot in zetten; allebei buiten de UI om.';
