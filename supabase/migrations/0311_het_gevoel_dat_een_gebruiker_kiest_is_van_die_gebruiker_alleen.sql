-- 0311_het_gevoel_dat_een_gebruiker_kiest_is_van_die_gebruiker_alleen.sql
-- — twee kolommen op `profiles` voor de vraag "Hoe wil je je voelen?" in de
-- vragenlijst (QS8-733): `feeling` (één van zes voorstellen) en `feeling_own`
-- (een eigen omschrijving). Allebei alleen voor de eigenaar leesbaar.
--
-- ROLLBACK-PAD:
--   create or replace view public.mijn_profiel … zonder `feeling` en `feeling_own`
--     (de kolomlijst van 0310; `create or replace view` kan geen kolommen weghalen,
--      dus eerst `drop view public.mijn_profiel`, daarna create view met 0310's lijst,
--      `alter view … owner to postgres` en `grant select … to authenticated`);
--   alter table public.profiles drop constraint if exists profiles_feeling_bekend;
--   alter table public.profiles drop constraint if exists profiles_feeling_own_len;
--   alter table public.profiles drop column if exists feeling;
--   alter table public.profiles drop column if exists feeling_own;
--
-- ⚠️ Beide kolommen zijn nieuw en dus leeg; `drop column` valt hier niet onder
--    grens 2 van de beslisbevoegdheid. Wordt dit teruggedraaid nádat er gevoelens
--    in staan, dan is dat een andere handeling met een `pg_dump` ervoor.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie bevat `grant` en de herdefinitie van een view, en wordt dus niet
--    door een bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 19-11-2026, op QS8-733 (reacties van 12:49 en 12:58):
-- de vraag biedt zes voorstellen aan (rustig, gemotiveerd, trots, gesteund,
-- energiek, gefocust) en laat de gebruiker het gevoel ook zelf omschrijven.
--
--   * Een voorstel stuurt alleen de tekst van de dagelijkse herinnering
--     (`nudgeBericht()`); een vaste, positieve zin per gevoel in beide talen.
--   * Een eigen omschrijving komt **uitsluitend op het eigen scherm** (als eigen
--     motto bij de herinneringsinstellingen). Ze wordt nooit letterlijk in een
--     melding of bericht gevoegd en is nooit zichtbaar voor de groep.
--
-- ---------------------------------------------------------------------------
-- Waarom op `profiles` en niet in een eigen tabel (zoals 0303)
-- ---------------------------------------------------------------------------
--
-- 0303 koos voor een aparte tabel omdat een voorkeurskolom op `profiles` alleen
-- veilig is zolang niemand hem in de kolomgrant van 0089 zet. Hier is de keuze
-- anders gevallen, om drie redenen die allemaal gemeten zijn:
--
--   1. Dit is hetzelfde soort antwoord als de vier andere vragen van de
--      vragenlijst (0143), die op `profiles` staan en door `patchUitVragenlijst()`
--      geschreven worden. Twee plekken voor één vragenlijst is een naad die
--      uit elkaar kan lopen.
--   2. `profiles` heeft géén tabelbrede select-grant voor `authenticated`: de
--      kolomgrant van 0089 geeft `id`, `display_name` en `avatar_url`, en dit
--      bestand voegt daar niets aan toe. De eigenaar leest via `mijn_profiel`
--      (`id = auth.uid()`), een groepslid heeft dus geen leespad naar deze
--      kolommen — ook niet met één API-verzoek. `tests/rls/gevoel.test.ts`
--      toetst dat met echte JWT's, en `groepskolommen:controle` rekent ze tot
--      de kolommen die niet groepszichtbaar zijn.
--   3. De edge function die de nudge opstelt leest `profiles` al met de
--      service-role; een tweede tabel was een tweede query per gebruiker per uur.
--
-- ---------------------------------------------------------------------------
-- Wat hier met opzet níet staat
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Geen select-grant op `feeling` of `feeling_own`.** RLS kan geen kolommen
--    beperken; de eis "een groepslid leest dit niet" wordt door de kolomgrant
--    afgedwongen en niet door een policy. Een `grant select (feeling…)` hier zou
--    het gat openen dat `profiles_select` (groepsgenoten) al heeft voor de drie
--    kolommen van 0089.
--
-- ⚠️ **Geen NOT NULL en geen default.** Niet beantwoorden mag (QS8-37, criterium
--    4): `null` is "niet beantwoord" en `patchUitVragenlijst()` laat een
--    overgeslagen antwoord met rust.
--
-- ⚠️ **Geen derde kolom en geen verbinding tussen de twee.** Wie een voorstel én
--    een eigen tekst kiest, bewaart beide; ze sturen elk een ander ding (de
--    herinneringstekst, het motto). `feeling_own` zonder `feeling` geeft een
--    herinnering zonder gevoel-variant.

begin;

alter table public.profiles
  add column if not exists feeling text;

alter table public.profiles
  add column if not exists feeling_own text;

-- ⚠️ Een kopie van `GEVOELENS` in `src/modules/goals/vragenlijst-schemas.ts`;
--    `tests/rls/gevoel.test.ts` legt ze in beide richtingen naast elkaar. Een
--    nieuw gevoel vraagt dus eerst een migratie, en een onbekende waarde faalt dicht.
alter table public.profiles drop constraint if exists profiles_feeling_bekend;
alter table public.profiles add constraint profiles_feeling_bekend
  check (feeling is null
         or feeling in ('calm', 'motivated', 'proud', 'supported', 'energetic', 'focused'));

-- ⚠️ 60 codepunten, geteld door Postgres en door `telTekens()` in de client op
--    dezelfde manier (CLAUDE.md, emoji-sectie). Een lege of alleen-spaties tekst
--    is geen omschrijving; de client trimt, de database weigert de rest.
alter table public.profiles drop constraint if exists profiles_feeling_own_len;
alter table public.profiles add constraint profiles_feeling_own_len
  check (feeling_own is null
         or (char_length(feeling_own) between 1 and 60 and btrim(feeling_own) <> ''));

comment on column public.profiles.feeling is
  'Hoe deze persoon zich wil voelen: een van zes voorstellen (QS8-733). Stuurt '
  'alleen de tekst van de dagelijkse herinnering. NULL = niet beantwoord. '
  'Alleen voor de eigenaar leesbaar, via mijn_profiel — domeinregel 7.';

comment on column public.profiles.feeling_own is
  'Eigen omschrijving van dat gevoel, max 60 tekens (QS8-733). ⚠️ Alleen op het '
  'eigen scherm: nooit letterlijk in een melding of bericht, nooit voor de groep. '
  'Alleen voor de eigenaar leesbaar, via mijn_profiel. NULL = niet ingevuld.';

-- ⚠️ Alleen update (geen insert: `profiles` heeft sinds 0197 geen client-INSERT) en nooit select (zie de kop). De eigenaar schrijft via
--    PostgREST op de eigen rij; `profiles_update` laat alleen `id = auth.uid()` toe.
grant update (feeling, feeling_own) on public.profiles to authenticated;

-- ⚠️ Lichaam gekopieerd van 0310 (de laatste definitie op `main`), met de twee
--    kolommen achteraan. `create or replace view` laat nieuwe kolommen alleen aan
--    het eind toe, en behoudt eigenaar en grants.
create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true) as
  select id,
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
         quiet_to,
         vindbaar,
         platform_beheerder,
         notify_group_digest,
         feeling,
         feeling_own
    from public.profiles p
   where id = (select auth.uid());

commit;
