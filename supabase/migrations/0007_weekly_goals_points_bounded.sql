-- 0007_weekly_goals_points_bounded.sql — het puntenmodel is een model
--
-- ROLLBACK-PAD:
--   alter table weekly_goals drop constraint if exists weekly_goals_points_bounded;
--
-- `points_ceiling`, `points_floor` en `points_miss` waren volledig
-- client-bestuurd; de enige constraints waren `ceiling >= floor` en `miss <= 0`.
-- Een weekdoel met `points_ceiling = 100000` was dus gewoon toegestaan. Bewezen
-- met een test in tests/rls/policies.test.ts.
--
-- Domeinregel 10 legt het model vast op plafond +2, vloer +1, gemist −1. De
-- kolommen blijven bestaan omdat het datamodel bewust ruimte houdt om dat later
-- per groep of per doel te variëren — maar die ruimte hoort begrensd te zijn.
-- Anders is de score betekenisloos en is domeinregel 10 een tekst in een document
-- in plaats van een eigenschap van de database.
--
-- De grenzen liggen ruim genoeg voor variatie en te krap voor inflatie.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weekly_goals_points_bounded'
  ) then
    alter table weekly_goals
      add constraint weekly_goals_points_bounded check (
        points_ceiling between 0 and 5
        and points_floor  between 0 and 5
        and points_miss   between -5 and 0
      );
  end if;
end $$;

comment on constraint weekly_goals_points_bounded on weekly_goals is
  'Domeinregel 10: plafond +2, vloer +1, gemist -1. De kolommen mogen varieren, '
  'maar niet zo ver dat de score betekenisloos wordt.';
