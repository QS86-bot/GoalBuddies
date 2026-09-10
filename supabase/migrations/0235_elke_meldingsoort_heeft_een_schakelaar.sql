-- 0235_elke_meldingsoort_heeft_een_schakelaar.sql — vier van de vijf soorten
-- meldingen waren niet uit te zetten (QS8-92)
--
-- ROLLBACK-PAD:
--   revoke update (notify_approval_request, notify_approval_received,
--                  notify_cycle_summary, notify_commitment_witness)
--     on public.profiles from authenticated;
--   alter table public.profiles
--     drop column if exists notify_approval_request,
--     drop column if exists notify_approval_received,
--     drop column if exists notify_cycle_summary,
--     drop column if exists notify_commitment_witness;
--
--   ⚠️⚠️ **En daarna `mijn_profiel` opnieuw zetten, en dat kan hier NIET met
--      `create or replace`.** Kolommen tóevoegen aan een view mag daarmee;
--      wéghalen niet. De terugweg is dus `drop view public.mijn_profiel;` gevolgd
--      door de `create view` uit 0089 met de achttien kolommen van vóór deze
--      migratie, plus `alter view ... owner to postgres` en
--      `grant select on public.mijn_profiel to authenticated`. In die volgorde.
--      De heenweg en de terugweg zijn hier niet symmetrisch, en dat is precies
--      het soort ding dat 's nachts niemand meer weet.
--
--   ⚠️ Terugdraaien zet iedereen weer op "alles aan". Dat is de veilige kant —
--      niemand mist er een melding door — maar het is wél het intrekken van een
--      keuze die de gebruiker zelf gemaakt heeft.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 10-09-2026: van de vijf meldingsoorten heeft er precies één een
--    uitschakelaar. `profiles.reminder_enabled` zet `nudge` uit; voor
--    `approval_request`, `approval_received`, `cycle_summary` en
--    `commitment_witness` bestaat er geen. Wie er één niet wil, kan alleen zijn
--    hele pushregistratie weggooien — en verliest dan ook de soorten die hij wél
--    wilde.
--
-- ---------------------------------------------------------------------------
-- 1. Vier kolommen, alle vier standaard aan
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`default true` en niet `false`.** Deze migratie mag op zichzelf geen
--    enkel waarneembaar gedrag veranderen: wie niets instelt, krijgt exact wat
--    hij gisteren kreeg. "Beschermd is de standaard" uit domeinregel 7 gaat over
--    wat ánderen van jou te zien krijgen, niet over wat jij van jezelf te horen
--    krijgt. Dat is hier een acceptatiecriterium en geen gevoel.
--
-- ⚠️ **Er komt geen `notify_nudge`.** De schakelaar voor `nudge` is
--    `reminder_enabled`, en er hangen `reminder_time` en `reminder_tone` aan.
--    Een tweede kolom voor hetzelfde feit is QS8-125.
--    `tests/rls/meldingsvoorkeuren.test.ts` verbiedt hem met zoveel woorden.

alter table public.profiles
  add column if not exists notify_approval_request   boolean not null default true,
  add column if not exists notify_approval_received  boolean not null default true,
  add column if not exists notify_cycle_summary      boolean not null default true,
  add column if not exists notify_commitment_witness boolean not null default true;

comment on column public.profiles.notify_approval_request is
  'Meldingen over een buddy die op jouw oordeel wacht. QS8-92.';
comment on column public.profiles.notify_approval_received is
  'Meldingen over een goedkeuring die je zelf ontving. QS8-92.';
comment on column public.profiles.notify_cycle_summary is
  'De melding met je weekoverzicht. QS8-92.';
comment on column public.profiles.notify_commitment_witness is
  'Meldingen dat een straf waarvan jij getuige bent verschuldigd werd. Mag uit: '
  'dempen verandert het commitment niet en de getuigenis blijft in de app '
  'zichtbaar. Zie docs/decisions/2026-09-10-een-getuige-mag-zijn-telefoon-'
  'stil-zetten.md.';

-- ---------------------------------------------------------------------------
-- 2. Schrijfrecht — additief, en met opzet géén leesrecht
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Alleen `grant`, nooit een `revoke update on profiles`.** 0139 heeft het
--    tabelbrede UPDATE-recht ingetrokken en er kolomgrants voor in de plaats
--    gezet. Wie hier het patroon van 0139 naïef overneemt — eerst `revoke`, dan
--    `grant` op de nieuwe kolommen — wist die bestaande grants, en dan valt élke
--    profielopslag om met 42501.
--
-- ⚠️ **En bewust géén `grant select`.** `authenticated` leest van `profiles`
--    alleen `id`, `display_name` en `avatar_url`; `profiles_select` staat
--    groepsgenoten toe, dus een SELECT-grant hier zou je dagritme aan je
--    buddy's geven. RLS kan geen kolommen beperken — de kolomgrant is de
--    grendel. De eigenaar leest ze via de view in §3.

grant update (
  notify_approval_request,
  notify_approval_received,
  notify_cycle_summary,
  notify_commitment_witness
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `mijn_profiel` opnieuw zetten — de stille val van deze migratie
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`select p.*` in een view is géén levende ster.** Postgres expandeert hem
--    bij het aanmaken tot een vaste kolomlijst. 📏 Nagemeten met
--    `pg_get_viewdef()`: er stonden achttien kolommen uitgeschreven. Een nieuwe
--    kolom op `profiles` verschijnt daar dus niet vanzelf in.
--
--    Zonder dit blok is er niets kapot en niets rood: de kolom bestaat, de grant
--    staat er, de policy klopt — en de eigenaar kan zijn eigen instelling niet
--    lezen. `fetchProfiel()` cast bovendien naar `Profiel`, dus TypeScript
--    belooft een `boolean` waar `undefined` staat, en het scherm toont een
--    schakelaar die altijd uit lijkt te staan. Elk onderdeel af, de keten stuk —
--    onwrikbare regel 18, vraag 5.
--
--    `tests/beloftes/mijn-profiel-is-volledig.test.ts` bewaakt dit voor élke
--    volgende kolom, en toetst de belofte ("wat de groep niet mag lezen, leest
--    de eigenaar via de view") in plaats van een lijst namen.
--
-- ⚠️ `create or replace` en geen `drop`: droppen zou de eigenaar en de grant
--    meenemen. Kolommen aan het eind toevoegen mag met `replace`.

create or replace view public.mijn_profiel as
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
    notify_commitment_witness
  from public.profiles p
  where id = auth.uid();
