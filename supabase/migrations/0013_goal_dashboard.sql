-- 0013_goal_dashboard.sql — voortgang per doel in één query
--
-- ROLLBACK-PAD:
--   drop view if exists goal_dashboard;
--
-- QS8-33 eist: "geen N+1, voortgang in één query, niet per doel opnieuw". Het
-- beslisdocument noemt dit met naam als de klassieke valkuil van dit project.
--
-- ⚠️ `security_invoker = true` en dat is hier juist wél de bedoeling — anders dan
--    bij `group_visible_streaks` (0005). Deze view geeft geen projectie van iets
--    dat afgeschermd hoort te blijven; hij telt alleen rijen die de aanroeper
--    sowieso al mag zien. De RLS van `goals`, `milestones` en `weekly_goals`
--    hoort dus gewoon te gelden, en een groepsgenoot ziet daardoor vanzelf
--    alleen de doelen die aan een gedeelde groep hangen.
--
-- ⚠️ Gecorreleerde subqueries en geen joins. Twee left joins op `milestones` en
--    `weekly_goals` vermenigvuldigen elkaars rijen, en dan telt een doel met
--    3 mijlpalen en 4 weekdoelen er ineens 12. Dat is een fout die er in een
--    test met één mijlpaal nooit uitkomt.

drop view if exists goal_dashboard;

create view goal_dashboard with (security_invoker = true) as
  select
    g.*,
    (
      select count(*) from milestones m
      where m.goal_id = g.id and m.status <> 'dropped'
    ) as milestones_total,
    (
      select count(*) from milestones m
      where m.goal_id = g.id and m.status = 'done'
    ) as milestones_done,
    (
      select count(*) from weekly_goals w
      where w.goal_id = g.id
    ) as weekly_total,
    (
      select count(*) from weekly_goals w
      where w.goal_id = g.id and w.status = 'approved'
    ) as weekly_approved
  from goals g;

comment on view goal_dashboard is
  'Doelen met hun mijlpaal- en weekdoeltellingen. Bestaat om de N+1 in het '
  'dashboard te voorkomen (QS8-33). security_invoker = true: de RLS van de '
  'onderliggende tabellen hoort hier gewoon te gelden.';

grant select on goal_dashboard to authenticated;
