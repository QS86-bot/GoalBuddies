-- 0043_weekly_goals_aanmaken_en_verwijderen_op_slot.sql — A35 en A36 (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop policy if exists weekly_goals_insert on public.weekly_goals;
--   drop policy if exists weekly_goals_update on public.weekly_goals;
--   drop policy if exists weekly_goals_delete on public.weekly_goals;
--   create policy weekly_goals_write on public.weekly_goals for all to authenticated
--     using (exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()))
--     with check (exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()));
--   grant insert on public.weekly_goals to authenticated;
--
-- ⚠️ Waarom deze migratie bestaat. De security-review op QS8-81 vond dat het
--    slot van 0023 maar op één van de drie deuren zat, en `docs/ENGINEER-REVIEW.md`
--    had dat punt als opgelost afgevinkt. Dat is de gevaarlijkste soort
--    bevinding: een dichtgestreepte regel waar niemand meer naar kijkt.
--
--    0023 dichtte `weekly_goals.status` voor **wijzigen** — `revoke update`, met
--    vier kolommen terug — omdat de eigenaar anders zijn eigen week op
--    `approved` kon zetten zonder buddy. De redenering die daar boven staat is
--    letterlijk: *"een autorisatiegrens is pas dicht als ook het gevólg ervan op
--    slot zit"*. Precies diezelfde redenering is nooit toegepast op **aanmaken**
--    en **verwijderen**.
--
-- ⚠️ A35 — aanmaken. `weekly_goals_write` was `for all` met alleen een
--    eigenaarstoets, en de tabelbrede INSERT-grant dekt élke kolom. Zes keer
--    `POST /rest/v1/weekly_goals` met `{"status":"approved"}` op zes
--    verschillende maandagen leverde daarmee op: een reeks van zes die de groep
--    via `group_visible_streaks` te zien krijgt, én twee weekpassen, want
--    `verdien_weekpassen()` telt goedgekeurde cycli. Geen buddy, geen
--    goedkeuring, één verzoek per week.
--
-- ⚠️ A36 — verwijderen. Diezelfde policy dekte DELETE. `herbereken_reeks()`
--    loopt over de rijen die er zíjn, dus wie een week miste kon die rij
--    weggooien: de onderbreking bestond niet meer en de reeks liep ongebroken
--    door — zonder weekpas, zonder bovengrens, zo vaak als je wilt. Daarmee was
--    de hele economie van QS8-81 een deur naast een muur die er niet stond. Het
--    botst bovendien met domeinregel 6: corrigeren gebeurt met een
--    correctie-record, niet door geschiedenis weg te gooien.
--
-- ⚠️ Waarom de `for all`-policy uit elkaar gaat in drie. Binnen één `for all`
--    kun je DELETE niet strenger maken dan INSERT — er is maar één `using`. Drie
--    losse policies maken het verschil expliciet, en voldoen meteen aan
--    onwrikbare regel 1 (een policy per bewerking). De SELECT-arm van de oude
--    policy valt weg en dat mag: `weekly_goals_select` (0019/0020) laat de
--    eigenaar al zijn eigen rijen zien.
--
-- ⚠️ Waarom een kolomgrant en niet een CHECK of een trigger. RLS kan geen
--    kolommen beperken — de vaste les van dit project (0006, 0010, 0019, 0023,
--    0029). Een CHECK zou `status = 'todo'` afdwingen bij élke insert, óók die
--    van `service_role`, en dan kan de rollover geen `missed` meer schrijven.
--    Een kolomgrant raakt uitsluitend `authenticated` en laat de server met rust.
--
-- ⚠️ Valkuil 17: een ingetrokken kolomrecht breekt de app stil, want typecheck
--    en lint blijven groen. Nagelopen vóór het intrekken:
--      - `maakWeekdoel()` (`src/modules/goals/weekly.ts`) zet goal_id,
--        milestone_id, title, floor_text, ceiling_text, cycle_start_date en
--        cycle_index — géén status. Blijft werken.
--      - `verwijderWeekdoel()` bestaat wel maar wordt door geen enkel scherm
--        aangeroepen. Blijft werken voor een weekdoel dat nog `todo` is.
--      - In `tests/` schrijft alleen `weekpassen.test.ts` als cliënt naar deze
--        tabel, en dat zijn precies de twee tests die dit gat aantoonden.
--        Alle andere tests schrijven met de service-role-client en gaan
--        ongemoeid, want die rol slaat policies én kolomgrants over.
--
-- ⚠️ De punten-kolommen blijven bewust insertable. `points_ceiling`,
--    `points_floor` en `points_miss` worden begrensd door de CHECK uit 0007, en
--    die bewaakt ze ook voor server-side paden. Er staat een test op die een
--    plafond van 100.000 probeert; die hoort op die CHECK af te gaan en niet op
--    een grant, anders bewijst hij iets anders dan hij zegt.

-- ---------------------------------------------------------------------------
-- 1. Aanmaken: alles behalve de status
-- ---------------------------------------------------------------------------

revoke insert on public.weekly_goals from authenticated;

grant insert (
  id,
  goal_id,
  milestone_id,
  title,
  floor_text,
  ceiling_text,
  points_ceiling,
  points_floor,
  points_miss,
  cycle_start_date,
  cycle_index,
  ai_generated,
  created_at
) on public.weekly_goals to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drie policies in plaats van één `for all`
-- ---------------------------------------------------------------------------

drop policy if exists weekly_goals_write on public.weekly_goals;

create policy weekly_goals_insert on public.weekly_goals
  for insert to authenticated
  with check (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );

-- ⚠️ Blijft nodig ondanks `revoke update` in 0023: dat liet vier kolommen staan
--    (title, floor_text, ceiling_text, milestone_id) en zonder UPDATE-policy
--    kan de eigenaar die vier niet meer bijwerken.
create policy weekly_goals_update on public.weekly_goals
  for update to authenticated
  using (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );

-- ⚠️ Alleen een weekdoel dat nog niets is. Zodra een week is ingediend
--    (`pending`), beoordeeld (`approved`), gemist (`missed`), vrijgesteld
--    (`excused`) of meegenomen (`carried`), is hij geschiedenis — en
--    geschiedenis gooi je niet weg (domeinregel 6). `missed` is de reden dat
--    deze regel bestaat.
create policy weekly_goals_delete on public.weekly_goals
  for delete to authenticated
  using (
    status = 'todo'
    and exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
  );
