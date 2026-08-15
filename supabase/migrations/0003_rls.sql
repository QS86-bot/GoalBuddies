-- 0003_rls.sql — Row Level Security
--
-- Volgt docs/decisions/001-datamodel.md §4.
-- Idempotent: elke policy wordt eerst gedropt.
--
-- ROLLBACK-PAD: `alter table <naam> disable row level security;` per tabel.
--
-- Uitgangspunten
--   * Elke tabel krijgt RLS aan. Geen policy = geen toegang (default deny).
--   * `service_role` heeft BYPASSRLS en is daarmee de enige route voor
--     systeemschrijfacties: punten boeken, kettingschakels, jobs, systeemberichten.
--     Die key komt nooit client-side.
--   * FORCE ROW LEVEL SECURITY is bewust NIET gezet. ENABLE dekt anon en
--     authenticated; FORCE raakt alleen de table owner en levert in Supabase vooral
--     verwarrende storingen op zonder extra bescherming tegen de client.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or shares_group_with_user(id));

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Geen DELETE-policy: een profiel verdwijnt alleen met het auth-account.

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
alter table groups enable row level security;

drop policy if exists groups_select on groups;
create policy groups_select on groups for select to authenticated
  using (is_group_member(id));

drop policy if exists groups_insert on groups;
create policy groups_insert on groups for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists groups_update on groups;
create policy groups_update on groups for update to authenticated
  using (exists (
    select 1 from group_members m
    where m.group_id = groups.id and m.user_id = auth.uid() and m.role = 'admin'
  ));

drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete to authenticated
  using (exists (
    select 1 from group_members m
    where m.group_id = groups.id and m.user_id = auth.uid() and m.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
alter table group_members enable row level security;

drop policy if exists group_members_select on group_members;
create policy group_members_select on group_members for select to authenticated
  using (is_group_member(group_id));

-- ⚠️ Alleen de oprichter van een groep voegt zichzelf toe. Iedere andere
--    toetreding loopt via join_group_with_code(); zie 0002.
drop policy if exists group_members_insert_founder on group_members;
create policy group_members_insert_founder on group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from groups g
      where g.id = group_members.group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists group_members_update on group_members;
create policy group_members_update on group_members for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from group_members m
      where m.group_id = group_members.group_id
        and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

drop policy if exists group_members_delete on group_members;
create policy group_members_delete on group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from group_members m
      where m.group_id = group_members.group_id
        and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
alter table goals enable row level security;

drop policy if exists goals_select on goals;
create policy goals_select on goals for select to authenticated
  using (owner_id = auth.uid() or shares_group_with_goal(id));

drop policy if exists goals_insert on goals;
create policy goals_insert on goals for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists goals_update on goals;
create policy goals_update on goals for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists goals_delete on goals;
create policy goals_delete on goals for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- goal_events
-- ---------------------------------------------------------------------------
alter table goal_events enable row level security;

drop policy if exists goal_events_select on goal_events;
create policy goal_events_select on goal_events for select to authenticated
  using (exists (
    select 1 from goals g
    where g.id = goal_events.goal_id
      and (g.owner_id = auth.uid() or shares_group_with_goal(g.id))
  ));

drop policy if exists goal_events_insert on goal_events;
create policy goal_events_insert on goal_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- goal_interviews — ⚠️ alleen de eigenaar, nooit de groep
-- ---------------------------------------------------------------------------
alter table goal_interviews enable row level security;

drop policy if exists goal_interviews_all on goal_interviews;
create policy goal_interviews_all on goal_interviews for all to authenticated
  using (exists (
    select 1 from goals g where g.id = goal_interviews.goal_id and g.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from goals g where g.id = goal_interviews.goal_id and g.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- goal_group_links
-- ---------------------------------------------------------------------------
alter table goal_group_links enable row level security;

drop policy if exists goal_group_links_select on goal_group_links;
create policy goal_group_links_select on goal_group_links for select to authenticated
  using (is_group_member(group_id));

drop policy if exists goal_group_links_insert on goal_group_links;
create policy goal_group_links_insert on goal_group_links for insert to authenticated
  with check (
    is_group_member(group_id)
    and exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
  );

drop policy if exists goal_group_links_delete on goal_group_links;
create policy goal_group_links_delete on goal_group_links for delete to authenticated
  using (exists (
    select 1 from goals g where g.id = goal_group_links.goal_id and g.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- milestones en weekly_goals — zichtbaar als het doel zichtbaar is,
-- schrijfbaar door de eigenaar van het doel
-- ---------------------------------------------------------------------------
alter table milestones enable row level security;

drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select to authenticated
  using (exists (
    select 1 from goals g
    where g.id = milestones.goal_id
      and (g.owner_id = auth.uid() or shares_group_with_goal(g.id))
  ));

drop policy if exists milestones_write on milestones;
create policy milestones_write on milestones for all to authenticated
  using (exists (
    select 1 from goals g where g.id = milestones.goal_id and g.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from goals g where g.id = milestones.goal_id and g.owner_id = auth.uid()
  ));

alter table weekly_goals enable row level security;

drop policy if exists weekly_goals_select on weekly_goals;
create policy weekly_goals_select on weekly_goals for select to authenticated
  using (exists (
    select 1 from goals g
    where g.id = weekly_goals.goal_id
      and (g.owner_id = auth.uid() or shares_group_with_goal(g.id))
  ));

drop policy if exists weekly_goals_write on weekly_goals;
create policy weekly_goals_write on weekly_goals for all to authenticated
  using (exists (
    select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- completions — append-only: geen UPDATE, geen DELETE
-- ---------------------------------------------------------------------------
alter table completions enable row level security;

drop policy if exists completions_select on completions;
create policy completions_select on completions for select to authenticated
  using (exists (
    select 1 from weekly_goals w
    join goals g on g.id = w.goal_id
    where w.id = completions.weekly_goal_id
      and (g.owner_id = auth.uid() or shares_group_with_goal(g.id))
  ));

drop policy if exists completions_insert on completions;
create policy completions_insert on completions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from weekly_goals w
      join goals g on g.id = w.goal_id
      where w.id = weekly_goal_id and g.owner_id = auth.uid()
    )
  );

-- ⚠️ Bewust geen UPDATE- of DELETE-policy. Corrigeren gebeurt met een nieuwe rij
--    en superseded_by op de oude, gezet door een Edge Function (domeinregel 6).

-- ---------------------------------------------------------------------------
-- completion_approvals — ⚠️ de autorisatiegrens (domeinregel 3)
-- ---------------------------------------------------------------------------
alter table completion_approvals enable row level security;

drop policy if exists completion_approvals_select on completion_approvals;
create policy completion_approvals_select on completion_approvals for select to authenticated
  using (is_group_member(group_id));

drop policy if exists completion_approvals_insert on completion_approvals;
create policy completion_approvals_insert on completion_approvals for insert to authenticated
  with check (
    -- je beoordeelt altijd namens jezelf
    approver_id = auth.uid()
    -- en alleen in een groep waar je lid van bent
    and is_group_member(group_id)
    -- en het doel moet daadwerkelijk aan díé groep gekoppeld zijn
    and exists (
      select 1
      from completions   c
      join weekly_goals  w on w.id = c.weekly_goal_id
      join goal_group_links l on l.goal_id = w.goal_id
      where c.id = completion_id
        and l.group_id = completion_approvals.group_id
        -- en het is niet je eigen voltooiing
        and c.user_id <> auth.uid()
    )
  );

-- Geen UPDATE of DELETE: een beoordeling is een gebeurtenis, geen toestand.
-- De trigger fill_approval_subject() vult subject_id en blokkeert zelfgoedkeuring
-- nog een tweede keer. Drie sloten op dezelfde deur, met opzet.

-- ---------------------------------------------------------------------------
-- daily_moves — standaard privé
-- ---------------------------------------------------------------------------
alter table daily_moves enable row level security;

drop policy if exists daily_moves_select on daily_moves;
create policy daily_moves_select on daily_moves for select to authenticated
  using (
    user_id = auth.uid()
    or (
      visibility = 'group'
      and weekly_goal_id is not null
      and exists (
        select 1 from weekly_goals w
        where w.id = daily_moves.weekly_goal_id
          and shares_group_with_goal(w.goal_id)
      )
    )
  );

drop policy if exists daily_moves_write on daily_moves;
create policy daily_moves_write on daily_moves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- week_reviews en chain_links
-- ---------------------------------------------------------------------------
alter table week_reviews enable row level security;

drop policy if exists week_reviews_select on week_reviews;
create policy week_reviews_select on week_reviews for select to authenticated
  using (is_group_member(group_id));

drop policy if exists week_reviews_write on week_reviews;
create policy week_reviews_write on week_reviews for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_group_member(group_id));

alter table chain_links enable row level security;

drop policy if exists chain_links_select on chain_links;
create policy chain_links_select on chain_links for select to authenticated
  using (is_group_member(group_id));

-- Schakels worden door de rollover-job gezet, niet door de client.

-- ---------------------------------------------------------------------------
-- Punten en reeksen — ⚠️ privé (domeinregel 7 en 10)
-- ---------------------------------------------------------------------------
alter table points_ledger enable row level security;

drop policy if exists points_ledger_select on points_ledger;
create policy points_ledger_select on points_ledger for select to authenticated
  using (user_id = auth.uid());

alter table user_streaks enable row level security;

drop policy if exists user_streaks_select on user_streaks;
create policy user_streaks_select on user_streaks for select to authenticated
  using (user_id = auth.uid());

-- Groepsgenoten zien uitsluitend de reeks, nooit het puntentotaal en nooit
-- last_cycle_start: uit die twee is een gemiste week af te leiden.
create or replace view group_visible_streaks
  with (security_invoker = true) as
  select s.user_id, s.goal_id, s.current_streak, s.best_streak
  from user_streaks s
  join goals g on g.id = s.goal_id
  where shares_group_with_goal(g.id);

comment on view group_visible_streaks is
  'De enige projectie van user_streaks die de groep mag zien. Geen punten.';

grant select on group_visible_streaks to authenticated;

alter table week_pass_events enable row level security;

drop policy if exists week_pass_events_select on week_pass_events;
create policy week_pass_events_select on week_pass_events for select to authenticated
  using (user_id = auth.uid());

alter table breathers enable row level security;

drop policy if exists breathers_select on breathers;
create policy breathers_select on breathers for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from goals g
      where g.id = breathers.goal_id and shares_group_with_goal(g.id)
    )
  );

drop policy if exists breathers_write on breathers;
create policy breathers_write on breathers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- commitments — de begunstigde groep leest pas vanaf 'due'
-- ---------------------------------------------------------------------------
alter table commitments enable row level security;

drop policy if exists commitments_select on commitments;
create policy commitments_select on commitments for select to authenticated
  using (
    exists (select 1 from goals g where g.id = commitments.goal_id and g.owner_id = auth.uid())
    or (
      beneficiary_group_id is not null
      and status in ('unlocked', 'due', 'resolved')
      and is_group_member(beneficiary_group_id)
    )
  );

drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments for insert to authenticated
  with check (exists (
    select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid()
  ));

-- Wijzigen mag alleen zolang het commitment nog niet in werking is getreden.
drop policy if exists commitments_update on commitments;
create policy commitments_update on commitments for update to authenticated
  using (
    status = 'set'
    and exists (select 1 from goals g where g.id = commitments.goal_id and g.owner_id = auth.uid())
  );

alter table commitment_events enable row level security;

drop policy if exists commitment_events_select on commitment_events;
create policy commitment_events_select on commitment_events for select to authenticated
  using (exists (
    select 1 from commitments c
    where c.id = commitment_events.commitment_id
      and exists (select 1 from goals g where g.id = c.goal_id and g.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
alter table chat_messages enable row level security;

drop policy if exists chat_messages_select on chat_messages;
create policy chat_messages_select on chat_messages for select to authenticated
  using (is_group_member(group_id));

drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_insert on chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_group_member(group_id) and type <> 'system');

drop policy if exists chat_messages_update on chat_messages;
create policy chat_messages_update on chat_messages for update to authenticated
  using (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
  with check (sender_id = auth.uid());

drop policy if exists chat_messages_delete on chat_messages;
create policy chat_messages_delete on chat_messages for delete to authenticated
  using (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ai_jobs en invite_events — ⚠️ alleen de eigenaar leest, systeem schrijft
-- ---------------------------------------------------------------------------
alter table ai_jobs enable row level security;

drop policy if exists ai_jobs_select on ai_jobs;
create policy ai_jobs_select on ai_jobs for select to authenticated
  using (user_id = auth.uid());

alter table invite_events enable row level security;
-- Geen enkele policy: uitsluitend leesbaar en schrijfbaar via service_role.
-- Rate limiting mag geen informatie lekken over andermans uitnodigingen.
