-- 0244_stille_uren.sql — een venster waarin een gebruiker geen meldingen
-- ontvangt (QS8-406, tweede criterium van QS8-92)
--
-- ROLLBACK-PAD:
--   alter table public.profiles
--     drop constraint if exists profiles_stilte_is_heel_of_niet,
--     drop constraint if exists profiles_stilte_is_geen_punt;
--   revoke update (quiet_from, quiet_to) on public.profiles from authenticated;
--   alter table public.profiles
--     drop column if exists quiet_from,
--     drop column if exists quiet_to;
--
--   ⚠️⚠️ **En daarna `mijn_profiel` opnieuw, en dat kan hier NIET met
--      `create or replace`.** Kolommen tóevoegen mag daarmee; wéghalen niet.
--      De terugweg is `drop view public.mijn_profiel;` gevolgd door de
--      `create view … with (security_invoker = false, security_barrier = true)`
--      met de 22 kolommen van vóór deze migratie, plus
--      `alter view … owner to postgres` en
--      `grant select … to authenticated`. In die volgorde.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-92 gaf elke meldingsoort een schakelaar. Wat er niet was, is een venster:
-- een gebruiker die de goedkeuringsverzoeken wíl maar niet om drie uur 's
-- nachts, had alleen de keuze om ze helemaal uit te zetten.
--
-- ---------------------------------------------------------------------------
-- 1. Twee kolommen, in hele uren
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`smallint` en geen `time`, en dat is geen afronding maar de werkelijke
--    precisie.** De meldingenjob draait één keer per uur en kent van de
--    ontvanger alleen `partsIn(tz, nu).hour`. Een `time`-kolom zou minuten
--    beloven die het mechanisme niet kan waarmaken: `22:30` gedraagt zich dan
--    als 22:00 of als 23:00 afhankelijk van hoe je afrondt, en die keuze is voor
--    de gebruiker onzichtbaar. Zelfde redenering als "een teller in grafemen bij
--    een grens in codepunten is een nieuwe fout en geen reparatie".
--
-- ⚠️ Het venster is `[quiet_from, quiet_to)` en mag over middernacht lopen. Het
--    uitrekenen gebeurt in `shared/time` (`inStilteVenster`) en nergens anders —
--    correctheidsregel 7. De middernachtomslag is precies het soort rekenwerk
--    dat er op twee plekken anders uit gaat zien zodra iemand het ter plekke
--    oplost.

alter table public.profiles
  add column if not exists quiet_from smallint,
  add column if not exists quiet_to   smallint;

comment on column public.profiles.quiet_from is
  'Eerste stille uur (0-23) in de tijdzone van de gebruiker, of NULL. QS8-406.';
comment on column public.profiles.quiet_to is
  'Eerste weer luide uur (0-23), of NULL. Mag lager zijn dan quiet_from: dan '
  'loopt het venster over middernacht.';

-- ---------------------------------------------------------------------------
-- 2. Twee CHECKs, allebei fail-closed
-- ---------------------------------------------------------------------------
--
-- ⚠️ Half ingevuld is geen geldige stand: één kolom gezet en de andere NULL zou
--    "stil vanaf 22:00 tot nooit" betekenen, en dat is niet uit te leggen.

alter table public.profiles
  drop constraint if exists profiles_stilte_is_heel_of_niet;

alter table public.profiles
  add constraint profiles_stilte_is_heel_of_niet check (
    (quiet_from is null) = (quiet_to is null)
    and (quiet_from is null or quiet_from between 0 and 23)
    and (quiet_to   is null or quiet_to   between 0 and 23)
  );

-- ⚠️ **`quiet_from = quiet_to` wordt verboden en niet gedefinieerd.** Het is niet
--    te onderscheiden tussen "altijd stil" en "nooit stil", en béide betekenissen
--    zijn al langs een andere weg bereikbaar: alle vier de schakelaars uit
--    (0237) respectievelijk beide kolommen op NULL. Een dubbelzinnige grens los
--    je op door hem onmogelijk te maken, niet door hem te raden.
alter table public.profiles
  drop constraint if exists profiles_stilte_is_geen_punt;

--
-- ⚠️⚠️ **`is distinct from` was hier fout, en het had élke aanmelding gebroken.**
--    📏 Gemeten: `null is distinct from null` is `false`, dus de eerste versie van
--    deze CHECK weigerde precies de stand "geen stille uren" — en `handle_new_user()`
--    maakt bij iedere nieuwe gebruiker een profielrij met béide kolommen op
--    `null`. De trigger op `auth.users` viel daardoor om; niet de feature, maar
--    het aanmelden zelf.
--
--    De `is null`-tak vangt dat: het paar is al heel-of-niet (de CHECK hierboven),
--    dus één van de twee `null` betekent allebei `null`.
alter table public.profiles
  add constraint profiles_stilte_is_geen_punt check (
    quiet_from is null or quiet_from <> quiet_to
  );

-- ---------------------------------------------------------------------------
-- 3. Schrijfrecht — additief, en met opzet géén leesrecht
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ Alleen `grant`, nooit een `revoke update on profiles`: 0139 heeft het
--    tabelbrede recht ingetrokken en er kolomgrants voor in de plaats gezet.
--    Een naïeve kopie van dat patroon wist die en laat élke profielopslag
--    omvallen met 42501.
--
-- ⚠️ Géén `grant select`. Je slaapritme is niets van je groep, en `profiles_select`
--    staat groepsgenoten toe — RLS kan geen kolommen beperken, dus de kolomgrant
--    is hier de grendel. Zie 0237 §2.

grant update (quiet_from, quiet_to) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `mijn_profiel` opnieuw zetten
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Twee dingen die `create or replace view` anders doet dan je verwacht,
--    en ze zijn allebei op 10-09 duur geweest.**
--
--    1. De kolomlijst is **bevroren**: `select p.*` wordt bij het aanmaken
--       geëxpandeerd, dus een nieuwe kolom verschijnt hier niet vanzelf in.
--       Vergeet dit blok en de eigenaar kan zijn eigen instelling niet lezen —
--       zonder fout en zonder rode test.
--    2. De **opties vallen weg** zodra de `with (…)`-clausule ontbreekt. 0237
--       trok daarmee per ongeluk `security_barrier` in; die vlag is wat
--       verhindert dat de planner een qual van de aanroeper vóór
--       `id = auth.uid()` uitvoert.
--
--    De grants blijven juist wél staan. Drie verschillende antwoorden op één
--    opdracht. `tests/rls/mijn-profiel-is-volledig.test.ts` en
--    `tests/rls/viewopties.test.ts` bewaken de eerste twee.

create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true)
as
  select
    id,
    display_name,
    avatar_url,
    week_start_day,
    tz,
    reminder_time,
    reminder_enabled,
    reminder_tone,
    share_moves_by_default,
    created_at,
    updated_at,
    onboarded_at,
    wants_own_goal,
    locale,
    focus_areas,
    minutes_per_day,
    when_i_do_it,
    what_breaks_it,
    notify_approval_request,
    notify_approval_received,
    notify_cycle_summary,
    notify_commitment_witness,
    quiet_from,
    quiet_to
  from public.profiles p
  where id = auth.uid();
