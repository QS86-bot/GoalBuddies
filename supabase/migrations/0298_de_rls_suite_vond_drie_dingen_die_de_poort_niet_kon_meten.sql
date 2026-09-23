-- 0298_de_rls_suite_vond_drie_dingen_die_de_poort_niet_kon_meten.sql — een kolomgrant in plaats van een kaal revoke, een index, en een kolom in de view.
--
-- ROLLBACK-PAD:
--   revoke select on public.reports from authenticated;
--   drop index if exists public.reports_afhandelaar_idx;
--   -- `mijn_profiel` terug naar de vorm van 0272 (zonder `platform_beheerder`);
--   -- let op: `create or replace view` kan géén kolommen laten vallen, dus dat is
--   -- `drop view public.mijn_profiel;` + de definitie van 0272 + `grant select`.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze migratie bestaat omdat de poort dit niet kón meten, en dat is de
--    les en niet de drie reparaties.** `npm run poort` gaf in een cloudsessie
--    drie keer achter elkaar *"niets staat rood"* met **24** controles die niets
--    gemeten hadden, en de **RLS-suite** was er daar één van. CI draait hem wél,
--    tegen een schema dat uit de migratiemap opgebouwd wordt, en vond er 📏
--    **vijf** rode testbestanden op `0297` — op de 189 die er staan.
--
--    De poort houdt *ongemeten* en *groen* met opzet uit elkaar en faalt op
--    allebei. Het is dus geen fout van de poort maar van de lezer: ik heb "niets
--    staat rood" gelezen als "dit klopt", terwijl er onderaan stond dat
--    vierentwintig dingen zwegen.
--
-- 📏 Wat CI vond op `78a7a581` (beide runs, dezelfde sha, dus geen flake) —
--    `tests/rls/melding-komt-aan.test.ts` zelf was **groen** op alle tien:
--
--   1. `anonleesrecht.test.ts` — *"Deze tabellen geven `authenticated` geen enkel
--      leesrecht meer. Een revoke heeft te ver gegrepen."* Het kale
--      `revoke select on public.reports` van `0297` haalde óók het leesrecht van
--      de **melder op zijn eigen melding** weg.
--   2. `veiligheid.test.ts` — *"de melder ziet zijn eigen melding: expected [] to
--      have a length of 1"*. Dezelfde oorzaak, van de andere kant gezien: er
--      stond al een toets op die belofte sinds QS8-232, en `0297` brak hem.
--   3. `indexdekking.test.ts` — `reports_afgehandeld_door_fkey` heeft geen index
--      op zijn kolom. Dat is onwrikbare regel 11 en het is een omissie van
--      `0296`, niet van `0297`.
--   4. `mijn-profiel-is-volledig.test.ts` — *"deze kolommen staan op profiles maar
--      niet in mijn_profiel: platform_beheerder"*. Ook `0296`.
--   5. `hulpfunctiemodel.test.ts` — de drie hulpfuncties van `0297` staan niet in
--      het register. Dat is een testbestand en geen migratie; het staat hier
--      alleen zodat de vijf compleet zijn.
--
-- ⚠️⚠️ **Nummer 1 en 2 zijn dezelfde fout, en het is er een van de vorm die dit
--    project het duurst betaalt.** `0297` repareerde K3 (*`reporter_id` was van
--    de tabel te lezen*) met het grofste instrument dat werkt — álles intrekken —
--    en nam daarmee een belofte weg die niemand had opgezegd. CLAUDE.md noemt
--    de drie juiste instrumenten met zoveel woorden: *een kolomgrant, een view
--    met expliciete kolomlijst of een rijbeperking.* Van die drie is de
--    kolomgrant hier de juiste, en `0297` koos geen van drieën.
--
--    Dat het meteen rood werd, is precies het punt: de toets die het ving stond
--    er al sinds QS8-232 en hij toetste een belofte die niemand opnieuw bekeken
--    had. **Een revoke is geen reparatie tot je gemeten hebt wat hij ook
--    dichttrekt.**
--
-- Uitleg in `docs/decisions/2026-09-22-een-melding-die-nergens-aankomt.md` §10.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De melder leest zijn eigen melding weer — maar niemand leest `reporter_id`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een kolomgrant en geen tabelgrant, en dat verschil ís de reparatie van
--    K3.** `reports_select` is sinds `0297` `reporter_id = auth.uid()`: de
--    rijgrens laat alleen je eigen melding door. Wat er ontbrak was de
--    kolomgrens, en die kan RLS niet leveren.
--
-- ⚠️ **`reporter_id` staat er met opzet niet in, en `afgehandeld_door` ook niet.**
--    De eerste is de hele reden dat `0297` bestaat. De tweede is dezelfde soort
--    vraag: wie er geoordeeld heeft, is administratie voor de moderatie en niet
--    iets wat de gemelde of de melder hoort te kunnen uitlezen.
--
-- ⚠️ Een policy mág verwijzen naar een kolom die je niet mag lezen — de
--    `using`-clausule wordt niet door de kolomgrant beperkt. `reporter_id =
--    auth.uid()` blijft dus werken terwijl de kolom onleesbaar is. Dat is
--    precies waarom deze vorm werkt en een view hier niet nodig is.
grant select (
  id,
  group_id,
  subject_id,
  message_id,
  bericht_kopie,
  reden,
  toelichting,
  status,
  created_at,
  afgehandeld_op
) on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Onwrikbare regel 11 — een index op elke foreign key
-- ---------------------------------------------------------------------------
--
-- ⚠️ `reports.afgehandeld_door` kwam in `0296` binnen mét een foreign key en
--    zónder index. Zonder hem kost het verwijderen van een account een seq scan
--    over `reports` per rij die de cascade aanraakt — en ná `0297` is dat juist
--    het pad dat weer open moest.
create index if not exists reports_afhandelaar_idx
  on public.reports (afgehandeld_door);

-- ---------------------------------------------------------------------------
-- 3. De eigenaar leest zijn eigen vlag
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`create or replace view` kan kolommen toevoegen maar niet laten vallen**,
--    dus de nieuwe kolom staat achteraan en de volgorde van `0272` blijft staan.
--    Het rollback-pad hierboven is om diezelfde reden asymmetrisch.
--
-- ⚠️ **Dit maakt de vlag leesbaar en niet schrijfbaar.** `mijn_profiel` heeft
--    voor `authenticated` alleen `select` (📏 `relacl = authenticated=r/postgres`)
--    en `security_invoker = false`, dus er is geen schrijfpad door de view heen
--    dat de kolomrevoke van `0296` zou omzeilen. Je eigen moderatorstatus is
--    bovendien geen geheim vóór jezelf; de grens die telt is dat je hem niet kunt
--    zétten, en die staat in `0296` en verandert hier niet.
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
         platform_beheerder
    from public.profiles p
   where id = (select auth.uid());

comment on view public.mijn_profiel is
  'De eigenaar leest zijn hele profielrij; een groepsgenoot leest drie kolommen '
  'van de tabel (QS8-92, uitgebreid in 0298 met platform_beheerder).';
