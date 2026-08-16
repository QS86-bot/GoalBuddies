-- 0020_weekly_goals_select_preciezer.sql — 0019 was te grof
--
-- ROLLBACK-PAD:
--   -- de policy uit 0019 opnieuw uitvoeren
--
-- ⚠️ 0019 beperkte groepsgenoten tot `pending` en `approved`. Dat sloot het gat
--    (`status = 'missed'` was leesbaar) maar het sloot ook twee dingen die wél
--    moeten werken, en allebei kwamen ze meteen als rode test terug:
--
--    1. `completion_approvals_insert` joint `completions → weekly_goals` om te
--       toetsen of het doel aan díé groep hangt. Een weekdoel dat is afgevinkt
--       maar nog niet goedgekeurd staat op `todo` — niets zet `pending` — dus de
--       goedkeurder zag de rij niet en kon niet goedkeuren. Dat is EPIC 6 in zijn
--       geheel.
--
--    2. `daily_moves_select` laat een gedeelde Dagzet zien via het weekdoel
--       waar hij onder hangt. Ook dat weekdoel staat op `todo`, dus een gedeelde
--       Dagzet werd onzichtbaar voor de groep.
--
-- De les: hou de beperking bij wat hij moet tegenhouden. `todo` is geen
-- tegenslag maar het plan van deze week, en dat is nu juist wat een buddy hóórt
-- te zien. Wat wél tegenslag is: `missed` (gemist) en `carried` (doorgeschoven).
-- Die twee gaan naar de eigenaar alleen.
--
-- ⚠️ Waarom dit als aparte migratie staat en niet als correctie in 0019: 0019 is
--    al toegepast, en een migratie die je achteraf herschrijft is een migratie
--    waarvan niemand meer weet wat er echt gedraaid heeft. De vorige stap hoort
--    zichtbaar te blijven, inclusief waarom hij te ver ging.
--
-- ⚠️ Wat hiermee niet dichtgaat, en dat is bewust: uit de afwézigheid van een
--    weekdoel in een cyclus valt nog steeds iets af te leiden. Maar afwezigheid
--    is dubbelzinnig — misschien had die persoon die week gewoon niets gepland —
--    en dat is een orde van grootte zwakker dan `status = 'missed'` letterlijk
--    kunnen uitlezen.

drop policy if exists weekly_goals_select on weekly_goals;
create policy weekly_goals_select on weekly_goals for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()
    )
    or (
      shares_group_with_goal(weekly_goals.goal_id)
      and weekly_goals.status not in ('missed', 'carried')
    )
  );

comment on policy weekly_goals_select on weekly_goals is
  'De eigenaar ziet alles. Een groepsgenoot ziet het plan en wat gelukt is, maar '
  'nooit een gemiste of doorgeschoven week (domeinregel 7). RLS kan geen '
  'kolommen beperken, dus de beperking zit op de rij.';
