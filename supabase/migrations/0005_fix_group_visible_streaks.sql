-- 0005_fix_group_visible_streaks.sql — de gedeelde reeks werkte niet
--
-- Gevonden door de RLS-testsuite van QS8-98, niet door te lezen. Precies waarom
-- die suite bestaat.
--
-- ROLLBACK-PAD:
--   drop view if exists group_visible_streaks;
--   -- daarna de definitie uit 0003_rls.sql opnieuw uitvoeren
--
-- ⚠️ Raakt alleen een view, geen tabel. Geen dataverlies mogelijk; `npm run
--    db:dump` vooraf blijft niettemin de regel (gratis tier, geen backups).

-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- De view stond op `security_invoker = true` en draaide daarmee onder de rechten
-- én de RLS van de aanroeper. De policy op `user_streaks` is `user_id = auth.uid()`,
-- dus de view liet iedereen precies één ding zien: zijn eigen reeks. De hele reden
-- van de view — groepsgenoten de reeks van een ander gunnen — werkte nooit.
--
-- Het is geen lek maar het omgekeerde: te veel dicht. Toch is het ernstig, want
-- het groepsoverzicht (QS8-55) en De Ketting (QS8-80) hangen eraan, en een lege
-- kolom ziet er in de UI uit als "deze buddy doet niets".
--
-- ---------------------------------------------------------------------------
-- Waarom een definer-view en niet een extra policy
-- ---------------------------------------------------------------------------
--
-- Een SELECT-policy op `user_streaks` voor groepsgenoten zou de view overbodig
-- maken — en precies daarom deugt hij niet: dan kan iedere groepsgenoot
-- `select total_points from user_streaks` doen. Een dalend puntentotaal is
-- zichtbaar bewijs van een gemiste week (domeinregel 7 en 10).
--
-- De view moet dus de enige route blijven, en dan moet hij de RLS van de
-- onderliggende tabel juist wél overslaan. `security_invoker = false` doet dat.
-- De autorisatie verhuist naar de WHERE-regel van de view zelf.
--
-- ⚠️ Ná deze migratie is de kolomlijst van de view de ENIGE bescherming van
--    `total_points` en `last_cycle_start`. Eén kolom erbij in de select en het
--    puntentotaal is groepszichtbaar. Raak deze select niet aan zonder de test
--    in tests/rls/policies.test.ts erbij te pakken.
--
-- ⚠️ Deze reparatie leunt op de keuze in 0003_rls.sql om `force row level
--    security` NIET te zetten. Zet iemand FORCE ooit aan als hardening, dan geeft
--    deze view zonder foutmelding weer nul rijen — en de verleiding is dan om de
--    policy op `user_streaks` te verbreden, waarmee `total_points` alsnog lekt.
--    Die koppeling tussen twee bestanden is onzichtbaar; daarom staat hij hier.

drop view if exists group_visible_streaks;

create view group_visible_streaks
  with (
    security_invoker = false,
    -- Zonder barrier mag Postgres door de aanroeper aangeleverde quals evalueren
    -- vóór shares_group_with_goal(). Die functie is `stable` en niet `leakproof`,
    -- dus met de barrier draait hij gegarandeerd als eerste. Via PostgREST is dat
    -- vandaag niet te misbruiken, maar de view is ook vanuit RPC's bereikbaar.
    security_barrier = true
  ) as
  select s.user_id, s.goal_id, s.current_streak, s.best_streak
  from user_streaks s
  join goals g on g.id = s.goal_id
  -- ⚠️ Twee voorwaarden, en ze doen echt allebei iets:
  --    1. de kijker deelt een groep met dit doel, én
  --    2. de reeks hoort bij de eigenaar van dat doel.
  --    Vandaag volgt (2) uit het feit dat alleen het systeem in user_streaks
  --    schrijft, maar de view hoort op zichzelf te lezen als correct.
  where g.owner_id = s.user_id
    and shares_group_with_goal(g.id);

comment on view group_visible_streaks is
  'De enige projectie van user_streaks die de groep mag zien. Geen total_points, '
  'geen last_cycle_start: uit allebei is een gemiste week af te leiden. '
  'security_invoker = false is noodzakelijk, zie 0005.';

revoke all on group_visible_streaks from public;
grant select on group_visible_streaks to authenticated;
