-- 0014_points_engine.sql — punten en reeksen, in de database
--
-- ROLLBACK-PAD:
--   drop trigger if exists completion_approvals_award on completion_approvals;
--   drop function if exists award_points_on_approval, herbereken_reeks;
--
-- Domeinregel 10 in code: plafond +2, vloer +1, gemiste week −1, adempauze 0.
--
-- ⚠️ Waarom in de database en niet in de app. Punten boeken raakt drie tabellen
--    tegelijk (`weekly_goals.status`, `points_ledger`, `user_streaks`) en dat
--    moet één transactie zijn. Een client die halverwege wegvalt, zou anders een
--    goedgekeurd weekdoel zonder punten achterlaten — of erger, punten zonder
--    goedkeuring.
--
-- ⚠️ Wat hier NIET staat is cyclusrekenwerk. Geen enkele datumberekening: de
--    trigger leest `cycle_start_date` uit rijen die er al zijn. Weken uitrekenen
--    gebeurt uitsluitend in `shared/time` (CLAUDE.md, correctheidsregel 7), en
--    de rollover-job doet dat in TypeScript.

-- ---------------------------------------------------------------------------
-- 1. De reeks herberekenen uit de gebeurtenissen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Herberekenen en niet ophogen. `user_streaks` is cache, geen waarheid
--    (beslisdocument §1, principe 3): hij moet op elk moment volledig
--    herbouwbaar zijn uit `points_ledger` en `weekly_goals`. Een teller die je
--    optelt, loopt vroeg of laat uit de pas en dan weet niemand meer wat waar is.

create or replace function herbereken_reeks(p_user_id uuid, p_goal_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  huidig   integer := 0;
  beste    integer := 0;
  loopt    integer := 0;
  laatste  date;
  r        record;
begin
  -- Cycli op volgorde. `excused` (adempauze) breekt de reeks niet en telt hem
  -- ook niet op: die week bestaat gewoon niet mee.
  for r in
    select w.cycle_start_date, w.status
    from weekly_goals w
    where w.goal_id = p_goal_id
    group by w.cycle_start_date, w.status
    order by w.cycle_start_date
  loop
    if r.status = 'approved' then
      loopt := loopt + 1;
      if loopt > beste then beste := loopt; end if;
      laatste := r.cycle_start_date;
    elsif r.status = 'missed' then
      -- ⚠️ Een weekpas beschermt de reeks, niet het punt. Is er voor deze cyclus
      --    een pas uitgegeven, dan loopt de reeks door en blijft het minpunt
      --    gewoon staan. Anders is missen gratis en zegt de score niets meer.
      if exists (
        select 1 from week_pass_events p
        where p.user_id = p_user_id
          and p.goal_id = p_goal_id
          and p.event = 'spent'
          and p.cycle_start_date = r.cycle_start_date
      ) then
        laatste := r.cycle_start_date;
      else
        loopt := 0;
      end if;
    end if;
  end loop;

  huidig := loopt;

  insert into user_streaks (user_id, goal_id, current_streak, best_streak, last_cycle_start, total_points, updated_at)
  values (
    p_user_id,
    p_goal_id,
    huidig,
    beste,
    laatste,
    coalesce((select sum(delta) from points_ledger where user_id = p_user_id and goal_id = p_goal_id), 0),
    now()
  )
  on conflict (user_id, goal_id) do update
    set current_streak   = excluded.current_streak,
        best_streak      = greatest(user_streaks.best_streak, excluded.best_streak),
        last_cycle_start = excluded.last_cycle_start,
        total_points     = excluded.total_points,
        updated_at       = now();
end;
$$;

comment on function herbereken_reeks(uuid, uuid) is
  'Bouwt user_streaks volledig opnieuw op uit de gebeurtenissen. Cache, geen '
  'waarheid: een teller die je ophoogt loopt uit de pas.';

revoke all on function herbereken_reeks(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Punten boeken bij een goedkeuring
-- ---------------------------------------------------------------------------

create or replace function award_points_on_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
begin
  -- "Vertel me meer" is geen goedkeuring: geen status, geen punten.
  if new.status <> 'approved' then
    return new;
  end if;

  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ Al goedgekeurd? Dan gebeurt er niets meer. Eén goedkeuring is genoeg
  --    (6.3), en een tweede buddy mag geen tweede keer punten opleveren.
  if w.status = 'approved' then
    return new;
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
    reden  := 'completion_approved_ceiling';
  else
    punten := w.points_floor;
    reden  := 'completion_approved_floor';
  end if;

  update weekly_goals set status = 'approved' where id = w.id;

  -- De unieke index points_ledger_dedupe_idx maakt dit idempotent: dezelfde
  -- reden voor dezelfde referentie kan maar één keer geboekt worden.
  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id)
  on conflict do nothing;

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$$;

comment on function award_points_on_approval() is
  'Zet het weekdoel op approved, boekt de punten en herberekent de reeks — in '
  'een transactie. Losse stappen laten bij een halve run punten zonder '
  'goedkeuring achter, of andersom.';

drop trigger if exists completion_approvals_award on completion_approvals;
create trigger completion_approvals_award
  after insert on completion_approvals
  for each row execute function award_points_on_approval();

revoke all on function award_points_on_approval() from public, anon, authenticated;
