-- 0303_een_aandeel_blijft_van_zijn_eigenaar.sql — een aandeeldoel is in elke
-- teamgroep alleen van zijn eigenaar, op het goedkeurvenster na, en een
-- teamgroep heeft nooit een klassement (QS8-661, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0302 van QS8-655. Het nummer botst met
--    productie (0299–0302 van QS8-233); niet hernummeren zonder besluit van
--    Quinten.
--
-- ROLLBACK-PAD (alleen functie- en policylichamen; geen gegevens):
--   shares_group_with_goal(), deelt_open_groep_met_doel() en groep_klassement()
--   terugzetten uit hun vorige definitie (de lichamen hieronder zijn die, plus
--   de gemarkeerde QS8-661-voorwaarde); de vier policies hieronder terugzetten
--   zonder de tak `aandeel_wacht_op_teamgenoot()`;
--   drop function if exists public.aandeel_wacht_op_teamgenoot(uuid);
--   drop function if exists public.is_aandeel_van_een_ander(uuid);
--   alter table public.groups add constraint groups_team_beschermd_tot_qs8_661
--     check (organization_id is null or zichtbaarheid = 'beschermd');
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- Besluit 5, 11, 18, 21, 22 en 25 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- en de keuzes in `docs/decisions/2026-11-17-een-aandeel-blijft-van-zijn-eigenaar.md`.
--
-- 1. **Eén plek voor bijna elke leesroute.** `goals`, `milestones`,
--    `goal_events`, `breathers`, `daily_moves`, `completions`,
--    `completion_approval_rules` en de beschermde tak van `weekly_goals` lopen
--    allemaal via `shares_group_with_goal()`; de open tak van `weekly_goals` via
--    `deelt_open_groep_met_doel()`. Beide geven nu `false` voor een aandeel van
--    een ander, in een beschermde én een open teamgroep (besluit 11 en 21).
-- 2. **Het goedkeurvenster.** Besluit 5 wil dat een teamgenoot een aandeel
--    goedkeurt, en daarvoor moet hij de voltooiing zien:
--    `completion_approvals_insert` en `openstaande_beoordelingen()` lezen
--    `completions`, `weekly_goals` en `goals` met zijn rechten. Dus ziet een
--    actief lid van de teamgroep een aandeel zolang er een weekdoel op
--    `pending` staat, en dan alleen dat weekdoel, zijn voltooiing en de rij van
--    het doel. Na de goedkeuring verdwijnt het weer. Dat is een positief
--    signaal, en het is het minimum dat besluit 5 vraagt.
-- 3. `groep_klassement()` geeft nul rijen in een teamgroep (besluit 22, 25).
-- 4. De tijdelijke CHECK van 0301 vervalt: een teamgroep mag weer open zijn
--    (besluit 18).
--
-- ⚠️ **Het goedkeurvenster zit in een definer-helper en niet in de policy.** Een
--    `goals`-policy die via RLS naar `weekly_goals` kijkt, waarvan de policy
--    weer naar `goals` kijkt, is oneindige recursie.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De helpers
-- ---------------------------------------------------------------------------

-- Is dit doel een aandeel van iemand anders dan de aanroeper?
create or replace function public.is_aandeel_van_een_ander(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from team_goal_shares s
     where s.goal_id = g
       and s.user_id is distinct from (select auth.uid())
  );
$$;
revoke all on function public.is_aandeel_van_een_ander(uuid) from public, anon, authenticated;
grant execute on function public.is_aandeel_van_een_ander(uuid) to authenticated;

-- Het goedkeurvenster: de aanroeper is actief lid van de teamgroep van dit
-- aandeel, de eigenaar ook, het aandeel hangt aan die groep, de groep is niet
-- gearchiveerd, en er staat een weekdoel op `pending`.
create or replace function public.aandeel_wacht_op_teamgenoot(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from team_goal_shares s
      join team_goals t       on t.id = s.team_goal_id
      join goal_group_links l on l.goal_id = s.goal_id and l.group_id = t.group_id
      join groups gr          on gr.id = t.group_id and gr.status <> 'archived'
      join group_members m    on m.group_id = t.group_id
                             and m.user_id  = (select auth.uid())
                             and m.status  <> 'inactive'
      join group_members o    on o.group_id = t.group_id
                             and o.user_id  = s.user_id
                             and o.status  <> 'inactive'
     where s.goal_id = g
       and s.user_id <> (select auth.uid())
       and exists (select 1 from weekly_goals w where w.goal_id = g and w.status = 'pending')
  );
$$;
revoke all on function public.aandeel_wacht_op_teamgenoot(uuid) from public, anon, authenticated;
grant execute on function public.aandeel_wacht_op_teamgenoot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De twee gedeelde leeshelpers sluiten een aandeel van een ander uit
-- ---------------------------------------------------------------------------
--
-- ⚠️ Gekopieerd uit de huidige definitie (0122 en 0141) en alleen aangevuld met
--    de gemarkeerde regel: een register in een functielichaam verliest anders
--    stil wat een andere tak erbij zette (QS8-358).

create or replace function public.shares_group_with_goal(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d on d.id       = l.goal_id
    join groups        gr on gr.id     = l.group_id
    -- De kijker hoort er nog bij.
    join group_members m on m.group_id = l.group_id
                        and m.user_id  = auth.uid()
                        and m.status  <> 'inactive'
    -- En de eigenaar ook. Dit was de ontbrekende helft.
    join group_members o on o.group_id = l.group_id
                        and o.user_id  = d.owner_id
                        and o.status  <> 'inactive'
    where l.goal_id  = g
      and gr.status <> 'archived'
  )
  -- QS8-661: een aandeel is van zijn eigenaar, in elke teamgroep (besluit 11, 21).
  and not public.is_aandeel_van_een_ander(g);
$$;

create or replace function public.deelt_open_groep_met_doel(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d  on d.id       = l.goal_id
    join groups        gr on gr.id      = l.group_id
    join group_members m  on m.group_id = l.group_id
                         and m.user_id  = auth.uid()
                         and m.status  <> 'inactive'
    join group_members o  on o.group_id = l.group_id
                         and o.user_id  = d.owner_id
                         and o.status  <> 'inactive'
    where l.goal_id        = g
      and gr.zichtbaarheid = 'open'
      and gr.status       <> 'archived'
  )
  -- QS8-661: ook in een open teamgroep blijft een aandeel dicht (besluit 21).
  and not public.is_aandeel_van_een_ander(g);
$$;

-- ---------------------------------------------------------------------------
-- 3. Het goedkeurvenster in vier leesregels
-- ---------------------------------------------------------------------------

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using ((owner_id = (select auth.uid()))
         or shares_group_with_goal(id)
         or aandeel_wacht_op_teamgenoot(id));

drop policy if exists weekly_goals_select on public.weekly_goals;
create policy weekly_goals_select on public.weekly_goals
  for select to authenticated
  using ((exists (select 1 from goals g
                   where g.id = weekly_goals.goal_id and g.owner_id = (select auth.uid())))
         or (shares_group_with_goal(goal_id)
             and status <> all (array['missed', 'carried', 'cancelled', 'excused']))
         or deelt_open_groep_met_doel(goal_id)
         or (status = 'pending' and aandeel_wacht_op_teamgenoot(goal_id)));

drop policy if exists completions_select on public.completions;
create policy completions_select on public.completions
  for select to authenticated
  using (exists (select 1
                   from weekly_goals w
                   join goals g on g.id = w.goal_id
                  where w.id = completions.weekly_goal_id
                    and ((g.owner_id = (select auth.uid()))
                         or shares_group_with_goal(g.id)
                         or (w.status = 'pending' and aandeel_wacht_op_teamgenoot(g.id)))));

drop policy if exists completion_approval_rules_select on public.completion_approval_rules;
create policy completion_approval_rules_select on public.completion_approval_rules
  for select to authenticated
  using (exists (select 1
                   from completions c
                   join weekly_goals w on w.id = c.weekly_goal_id
                   join goals g on g.id = w.goal_id
                  where c.id = completion_approval_rules.completion_id
                    and ((g.owner_id = (select auth.uid()))
                         or shares_group_with_goal(g.id)
                         or (w.status = 'pending' and aandeel_wacht_op_teamgenoot(g.id)))));

-- ---------------------------------------------------------------------------
-- 4. Nooit een klassement in een teamgroep
-- ---------------------------------------------------------------------------

create or replace function public.groep_klassement(p_group_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, punten integer, positie bigint, total_members bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with standen as (
    select
      m.user_id                                   as user_id,
      p.display_name                              as display_name,
      greatest(coalesce((
        select sum(pl.delta)
        from points_ledger pl
        where pl.group_id = p_group_id
          and pl.user_id  = m.user_id
      ), 0), 0)::integer                          as punten
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  gerangschikt as (
    select
      s.user_id,
      s.display_name,
      s.punten,
      rank() over (order by s.punten desc)        as positie,
      count(*) over ()                            as total_members
    from standen s
  )
  select
    g.user_id,
    g.display_name,
    g.punten,
    g.positie,
    g.total_members
  from gerangschikt g
  where lid_van_open_groep(p_group_id)
    -- QS8-661, besluit 22 en 25: nooit een klassement in een teamgroep, ook
    -- niet in een open. Een eigen voorwaarde en niet via `lid_van_open_groep()`,
    -- zodat A57 (QS8-666) hem niet stil verliest als die poort verandert.
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
  -- ⚠️ Dezelfde volgorde als `positie`, plus twee tiebreakers. Zonder een
  --    deterministische volgorde kan één lid op twee pagina's staan en een
  --    ander op geen enkele — dat is niet cosmetisch maar een verkeerd
  --    klassement.
  order by g.punten desc, g.display_name asc, g.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

-- ---------------------------------------------------------------------------
-- 5. De tijdelijke grendel van 0301 vervalt
-- ---------------------------------------------------------------------------
--
-- Hij hield een teamgroep dicht tot deze migratie er was (securityreview
-- QS8-654, H1). Besluit 18 laat de organisatie weer kiezen.
alter table public.groups drop constraint if exists groups_team_beschermd_tot_qs8_661;
