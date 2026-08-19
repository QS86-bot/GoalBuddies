-- 0045_doorschuiven_en_afsluiten.sql — A39 en A40 (EPIC 8)
--
-- ROLLBACK-PAD:
--   -- 1. herstel `herbereken_reeks()` uit 0014 (carried weer neutraal)
--   -- 2. herstel `markeer_doorgeschoven()` uit 0023 (accepteert weer todo)
--   -- 3. drop function if exists sluit_weekdoel_af(uuid);
--   -- 4. create policy weekly_goals_delete ... (zie 0044) en
--   --    grant delete on public.weekly_goals to authenticated;
--   -- 5. alter table weekly_goals drop constraint weekly_goals_status_valid,
--   --    en zet de versie zonder 'cancelled' terug — kan alleen als er geen
--   --    enkele rij op 'cancelled' staat.
--   -- Rijen die al op 'cancelled' staan blijven staan: het zijn gebeurtenissen
--   -- en die worden niet teruggedraaid (domeinregel 6).
--
-- ⚠️ Waarom deze migratie bestaat. 0043 dichtte de directe route naar het
--    wegpoetsen van een gemiste week, en de review daarop vond er twee andere.
--    Quinten heeft op 19-08 voor allebei een richting gekozen.
--
-- ══════════════════════════════════════════════════════════════════════════
-- A39 — doorschuiven verplaatst het wérk, niet de geschiedenis
-- ══════════════════════════════════════════════════════════════════════════
--
-- `markeer_doorgeschoven()` zette een gemiste week op `carried`, en
-- `herbereken_reeks()` brak de reeks alléén op `missed`. `carried` viel in geen
-- enkele tak en was dus neutraal. Eén RPC-aanroep per gemiste week herstelde de
-- reeks daarmee met terugwerkende kracht, zonder weekpas, onbeperkt — en de
-- groep zag die herstelde reeks via `group_visible_streaks`. Erger nog: de
-- rollover had de weekpas op dat moment al verbruikt, dus doorschuiven was
-- **goedkoper dan de munt die QS8-81 invoert**.
--
-- **Besluit van Quinten (19-08): doorschuiven blijft mogelijk — QS8-47 vraagt er
-- letterlijk om — maar het repareert je reeks niet.** `carried` gaat hieronder
-- dezelfde tak in als `missed`, inclusief de weekpas-ontsnapping. Wie zijn reeks
-- wil redden zet er een pas op; wie doorschuift verplaatst zijn werk naar een
-- nieuwe week en houdt een gebroken reeks. Het minpunt was al geboekt door de
-- rollover en blijft staan.
--
-- ⚠️ En daarom accepteert `markeer_doorgeschoven()` voortaan **alleen `missed`**
--    en niet meer `todo`. Twee redenen, en de tweede is een gat:
--
--      1. Een `todo` in de lópende cyclus doorschuiven is zinloos:
--         `schuifDoor()` maakt het nieuwe weekdoel in `huidigeCyclus()`, dus je
--         zou een duplicaat in dezelfde week krijgen. En het zou de reeks nú
--         breken voor een week die nog niet eens voorbij is.
--      2. Een `todo` in een verstréken cyclus doorschuiven vóórdat de rollover
--         langskomt, ontliep het minpunt: de rollover raakt uitsluitend `todo`,
--         dus een rij die al `carried` is wordt nooit meer `missed` en er wordt
--         nooit iets geboekt. Gratis wegkomen onder domeinregel 10.
--
--    De rollover krijgt nu dus altijd eerst zijn beurt. Praktisch kost dat
--    hooguit een uur wachten (hij draait elk uur, ná de coulanceperiode van
--    twaalf uur), en `schuifDoor()` zegt dat met zoveel woorden.
--
-- ══════════════════════════════════════════════════════════════════════════
-- A40 — verwijderen wordt afsluiten
-- ══════════════════════════════════════════════════════════════════════════
--
-- De rollover stempelt een week pas ná afloop als `missed`. Tot dat moment staat
-- de rij op `todo`, en die mocht je sinds 0043 verwijderen — terecht, want een
-- verkeerd aangemaakt weekdoel moet je kunnen weggooien. Maar wie zondagavond
-- weet dat hij het niet haalt en zijn weekdoel wist, heeft die week nooit
-- gemist: geen minpunt, geen onderbreking, en zijn reeks stalt in plaats van te
-- breken.
--
-- **Besluit van Quinten (19-08): de rij verdwijnt niet meer maar krijgt de
-- status `cancelled`.** Dat sluit aan op QS8-47, dat naast doorschuiven al
-- letterlijk "of afsluiten" noemt.
--
-- ⚠️ De elegantie zit hem erin dat `cancelled` zich gedraagt als `todo` en niet
--    als een nieuw geval: de rollover veegt hem bij het verstrijken van de
--    cyclus gewoon mee naar `missed`, mét minpunt, en de weekpas kan hem redden
--    zoals elke andere gemiste week. Daardoor hoeft `herbereken_reeks()` niets
--    van `cancelled` te weten en blijft een afgesloten weekdoel in de lópende
--    cyclus neutraal — precies zoals `todo`. Er is dus nergens een berekening
--    nodig van "is deze cyclus al voorbij", en dat mag ook niet in SQL
--    (correctheidsregel 7).
--
-- ⚠️ Domeinregel 7: `cancelled` moet uit `weekly_goals_select` voor
--    groepsgenoten. Een afgesloten weekdoel is een opgegeven week, en dat is
--    exact het soort tegenslagsignaal dat 0019 en 0020 voor `missed` en
--    `carried` hebben weggehaald. Vergeten we dat, dan lekt deze migratie
--    precies wat 0020 dichtte.

-- ---------------------------------------------------------------------------
-- 1. De nieuwe status
-- ---------------------------------------------------------------------------

alter table public.weekly_goals drop constraint if exists weekly_goals_status_valid;

alter table public.weekly_goals add constraint weekly_goals_status_valid
  check (status in ('todo', 'pending', 'approved', 'missed', 'carried', 'excused', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 2. Domeinregel 7 — een afgesloten week is niet van de groep
-- ---------------------------------------------------------------------------

drop policy if exists weekly_goals_select on public.weekly_goals;

create policy weekly_goals_select on public.weekly_goals
  for select to authenticated
  using (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
    or (
      shares_group_with_goal(goal_id)
      and status <> all (array['missed', 'carried', 'cancelled'])
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Doorschuiven: alleen vanaf `missed`
-- ---------------------------------------------------------------------------

create or replace function public.markeer_doorgeschoven(p_weekly_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  w weekly_goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ⚠️ Alleen `missed`. Zie de kop: `todo` toestaan liet iemand het minpunt
  --    ontlopen door door te schuiven vóórdat de rollover langskwam.
  if w.status <> 'missed' then
    return jsonb_build_object('ok', false, 'reason', 'not_missed');
  end if;

  update weekly_goals set status = 'carried' where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.markeer_doorgeschoven(uuid) from public, anon;
grant execute on function public.markeer_doorgeschoven(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Afsluiten in plaats van verwijderen
-- ---------------------------------------------------------------------------

create or replace function public.sluit_weekdoel_af(p_weekly_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  w weekly_goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- Alleen iets dat nog niets is. Een ingediende, beoordeelde, gemiste,
  -- vrijgestelde of doorgeschoven week is geschiedenis (domeinregel 6).
  if w.status <> 'todo' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update weekly_goals set status = 'cancelled' where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sluit_weekdoel_af(uuid) from public, anon;
grant execute on function public.sluit_weekdoel_af(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verwijderen kan niet meer
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zowel de policy als het tabelrecht weg. De policy alleen zou stil weigeren
--    (RLS filtert de rij weg en een DELETE die niets raakt is geen fout); zonder
--    het recht komt er een luide 42501, en dat is wat je wilt bij een handeling
--    die een gebruiker bewust probeert.
drop policy if exists weekly_goals_delete on public.weekly_goals;

revoke delete on public.weekly_goals from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. De reeks: `carried` breekt, tenzij er een weekpas op staat
-- ---------------------------------------------------------------------------
--
-- ⚠️ Ongewijzigd ten opzichte van 0014 op één plek na: de `elsif` accepteert nu
--    `missed` én `carried`. De weekpas-ontsnapping geldt voor allebei, want een
--    doorgeschoven week ís een gemiste week — alleen het werk is verhuisd.
create or replace function public.herbereken_reeks(p_user_id uuid, p_goal_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  huidig   integer := 0;
  beste    integer := 0;
  loopt    integer := 0;
  laatste  date;
  r        record;
begin
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
    elsif r.status in ('missed', 'carried') then
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
