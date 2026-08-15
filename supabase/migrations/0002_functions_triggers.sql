-- 0002_functions_triggers.sql — hulpfuncties en triggers
--
-- Volgt docs/decisions/001-datamodel.md.
-- Idempotent: `create or replace` plus `drop trigger if exists`.
--
-- ROLLBACK-PAD:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop trigger if exists profiles_touch on profiles;
--   drop trigger if exists goals_touch on goals;
--   drop trigger if exists completion_approvals_subject on completion_approvals;
--   drop trigger if exists weekly_goals_recalc_max_points on weekly_goals;
--   drop function if exists handle_new_user, touch_updated_at,
--     fill_approval_subject, recalc_goal_max_points,
--     is_group_member, shares_group_with_goal;

-- ---------------------------------------------------------------------------
-- 1. RLS-hulpfuncties
-- ---------------------------------------------------------------------------
--
-- ⚠️ SECURITY DEFINER is hier geen gemak maar een noodzaak: zonder dat verwijst
--    de policy op group_members naar group_members en loopt Postgres vast in
--    oneindige recursie. Dit is de klassieke Supabase-valkuil.
--
--    Prijs: SECURITY DEFINER omzeilt RLS. Deze twee functies moeten daarom regel
--    voor regel kloppen. Ze doen allebei precies één ding: bestaat er een rij die
--    de HUIDIGE gebruiker (auth.uid()) aan deze groep of dit doel koppelt.
--    Ze geven nooit data terug, alleen een boolean.
--
--    `set search_path = public, pg_temp` voorkomt dat een aanvaller met rechten op
--    een ander schema een eigen `group_members` binnensmokkelt.

create or replace function is_group_member(gid uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members
    where group_id = gid
      and user_id  = auth.uid()
  );
$$;

comment on function is_group_member(uuid) is
  'Is de huidige gebruiker lid van deze groep? SECURITY DEFINER tegen RLS-recursie.';

create or replace function shares_group_with_goal(g uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join group_members    m on m.group_id = l.group_id
    where l.goal_id = g
      and m.user_id = auth.uid()
  );
$$;

comment on function shares_group_with_goal(uuid) is
  'Deelt de huidige gebruiker een groep met dit doel? Bepaalt wie een doel mag zien.';

create or replace function shares_group_with_user(other uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id   = auth.uid()
      and theirs.user_id = other
  );
$$;

comment on function shares_group_with_user(uuid) is
  'Zit deze gebruiker in een van mijn groepen? Bepaalt wie een profiel mag zien.';

revoke all on function is_group_member(uuid)        from public;
revoke all on function shares_group_with_goal(uuid) from public;
revoke all on function shares_group_with_user(uuid) from public;
grant execute on function is_group_member(uuid)        to authenticated;
grant execute on function shares_group_with_goal(uuid) to authenticated;
grant execute on function shares_group_with_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Deelnemen aan een groep via uitnodigingscode
-- ---------------------------------------------------------------------------
--
-- ⚠️ Er is bewust GEEN open INSERT-policy op group_members. Zonder deze RPC zou
--    iedereen die een group_id raadt zichzelf lid kunnen maken. Toetreden loopt
--    daarom uitsluitend via de code, gecontroleerd in de database.

create or replace function join_group_with_code(code text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    raise exception 'Deze uitnodigingslink werkt niet meer';
  end if;

  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update
    set status = 'active';          -- terugkeren na inactief mag altijd

  -- Een nieuwe deelnemer wekt een slapende groep.
  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return target.id;
end;
$$;

comment on function join_group_with_code(text) is
  'Enige route naar lidmaatschap. Werkt voor nieuwe én bestaande accounts (5.2).';

revoke all on function join_group_with_code(text) from public;
grant execute on function join_group_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profiel aanmaken bij registratie
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      'Naamloos'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. updated_at bijhouden
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch
  before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists goals_touch on goals;
create trigger goals_touch
  before update on goals
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. De autorisatiegrens: nooit jezelf goedkeuren
-- ---------------------------------------------------------------------------
--
-- De CHECK-constraint `approver_id <> subject_id` kan zijn werk alleen doen als
-- subject_id klopt. Een client mag die waarde dus niet zelf kiezen: deze trigger
-- overschrijft hem altijd met de eigenaar van de voltooiing.
--
-- Dit is samen met de RLS-policy op completion_approvals domeinregel 3.

create or replace function fill_approval_subject()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select c.user_id into owner
  from completions c
  where c.id = new.completion_id;

  if owner is null then
    raise exception 'Voltooiing % bestaat niet', new.completion_id;
  end if;

  -- Nooit de meegestuurde waarde vertrouwen.
  new.subject_id := owner;

  if new.approver_id = owner then
    raise exception 'Je kunt je eigen voltooiing niet goedkeuren';
  end if;

  return new;
end;
$$;

drop trigger if exists completion_approvals_subject on completion_approvals;
create trigger completion_approvals_subject
  before insert or update on completion_approvals
  for each row execute function fill_approval_subject();

-- ---------------------------------------------------------------------------
-- 5. Puntenplafond per doel
-- ---------------------------------------------------------------------------
--
-- "Per doel is een vooraf bepaald maximaal aantal punten te behalen, tenzij je
--  extra taken toevoegt aan jouw doel." (review 15-08-2026)

create or replace function recalc_goal_max_points()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.goal_id, old.goal_id);
begin
  update goals g
  set max_points = coalesce((
    select sum(w.points_ceiling)
    from weekly_goals w
    where w.goal_id = target
      and w.status <> 'excused'
  ), 0)
  where g.id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists weekly_goals_recalc_max_points on weekly_goals;
create trigger weekly_goals_recalc_max_points
  after insert or update of points_ceiling, status, goal_id or delete
  on weekly_goals
  for each row execute function recalc_goal_max_points();
