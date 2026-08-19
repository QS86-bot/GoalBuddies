-- 0044_missen_kost_altijd_een_punt.sql — nakomer op 0043 (EPIC 8)
--
-- ROLLBACK-PAD:
--   grant insert (points_miss, id, created_at) on public.weekly_goals to authenticated;
--   -- De policies hieronder zijn identiek aan die van 0043; alleen de
--   -- `drop … if exists` ervoor is nieuw, dus terugdraaien heeft geen zin.
--
-- ⚠️ Drie nakomers uit de security-review op 0043 zelf. De migratie deed wat er
--    stond, maar de onderbouwing eronder klopte op één punt niet — en dat punt
--    was precies een gat.
--
-- ⚠️ 1. `points_miss = 0` was toegestaan, en dus was missen gratis te maken.
--    0043 liet de punten-kolommen bewust insertable met als argument dat de
--    CHECK uit 0007 ze begrenst. Voor `points_ceiling` en `points_floor` klopt
--    dat (0 t/m 5 is begrensde variatie in je eigen nadeel). Voor `points_miss`
--    niet: de CHECK is `points_miss <= 0` en `between -5 and 0`, en **nul zit
--    daarin**. Eén insert met `{"points_miss": 0}` en een gemiste week kost je
--    nooit meer een punt — de rollover boekt letterlijk `delta:
--    weekdoel.points_miss`.
--
--    Dat is domeinregel 10 ("week gemist −1") en het ondergraaft precies wat de
--    weekpas moet betekenen: als missen gratis is, zegt de score niets meer.
--    De kolom gaat daarom uit de grant; de standaardwaarde −1 doet het werk. De
--    CHECK blijft staan zoals hij is, want die bewaakt ook `service_role`, en
--    hem aanscherpen naar `between -5 and -1` is een wijziging aan een bestaande
--    tabel. Staat als voorstel bij **A39** in `docs/Q-TODO.docx`.
--
-- ⚠️ 2. `id` en `created_at` hoorden niet in de grant. De app zet ze niet
--    (`maakWeekdoel()` laat beide aan de database), en een client-instelbare
--    `created_at` is de bug die 0010 voor `chat_messages` moest repareren:
--    daar maakte hij het bewerkvenster van vijftien minuten waardeloos. Hier
--    beïnvloedt hij de sortering van `fetchWeekdoelen()`. Geen aanval, wel een
--    kolom die niemand nodig heeft.
--
-- ⚠️ 3. 0043 was niet idempotent (onwrikbare regel 20). Er stond wél een
--    `drop policy if exists` vóór het weghalen van `weekly_goals_write`, maar
--    niet vóór de drie nieuwe `create policy`-regels — een tweede run zou falen
--    met "policy already exists". Dat is een reële voetangel, want valkuil 15
--    zegt dat de repo en het project uit elkaar lopen en de standaardreactie
--    daarop is "draai hem opnieuw". Hieronder staan ze zoals het hoort.
--
-- ⚠️ En één correctie op de kop van 0043, want die beweert iets dat niet klopt.
--    Daar staat dat in `tests/` alleen `weekpassen.test.ts` als cliënt naar
--    `weekly_goals` schrijft. Dat is onjuist: er zijn client-side inserts in
--    `policies.test.ts`, `besluiten.test.ts`, `epic7.test.ts` en
--    `epic8.test.ts`. Geen daarvan stuurt `status` mee, dus er brak niets en de
--    suite bleef groen — maar de conclusie klopte bij toeval en de controle
--    niet. Dat is dezelfde vorm als valkuil 18: wie dit later leest gelooft de
--    zin in plaats van hem te herhalen. De zin is rechtgezet in 0043.

revoke insert on public.weekly_goals from authenticated, anon;

grant insert (
  goal_id,
  milestone_id,
  title,
  floor_text,
  ceiling_text,
  points_ceiling,
  points_floor,
  cycle_start_date,
  cycle_index,
  ai_generated
) on public.weekly_goals to authenticated;

-- Idempotent opnieuw neergezet; inhoudelijk gelijk aan 0043.
drop policy if exists weekly_goals_insert on public.weekly_goals;
drop policy if exists weekly_goals_update on public.weekly_goals;
drop policy if exists weekly_goals_delete on public.weekly_goals;

create policy weekly_goals_insert on public.weekly_goals
  for insert to authenticated
  with check (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );

create policy weekly_goals_update on public.weekly_goals
  for update to authenticated
  using (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );

create policy weekly_goals_delete on public.weekly_goals
  for delete to authenticated
  using (
    status = 'todo'
    and exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );
