-- 0074_een_gehaald_weekdoel_redt_de_week.sql — QS8-127 (Q-TODO A37)
--
-- ROLLBACK-PAD:
--   Zet `herbereken_reeks()` terug naar de vorm uit 0014 (group by
--   cycle_start_date, status) en draai hem opnieuw voor elk paar in
--   `user_streaks`. ⚠️ Dat brengt ook de onbepaaldheid terug die hieronder
--   beschreven staat; doe het niet zonder reden.
--
-- Besluit van Quinten, 24-08-2026: **is er in een cyclus één weekdoel gehaald,
-- dan telt die week mee en kan de reeks er niet door breken.**
--
-- ## Wat er mis was
--
-- `herbereken_reeks()` liep over `group by w.cycle_start_date, w.status`. Heeft
-- iemand twee weekdoelen op hetzelfde doel in dezelfde week en haalt hij er één,
-- dan levert die groepering **twee rijen voor dezelfde datum** — `approved` en
-- `missed` — en de `order by` sorteert alleen op datum.
--
-- ⚠️ **Welke van de twee als laatste langskwam, bepaalde of de reeks doorliep.**
--    Postgres belooft daar niets over. Dezelfde gebruiker met dezelfde
--    geschiedenis kon dus twee verschillende reeksen krijgen.
--
-- ## Waarom dat dragend werd
--
-- `verbruik_weekpas()` weigert zichzelf op een cyclus waarin al iets `approved`
-- staat, met als reden dat de week toch meetelt. Dat was de helft van de tijd
-- niet waar. **Netto kon iemand zijn weekdoel halen, tóch zijn reeks verliezen,
-- én de pas die dat had opgevangen geweigerd zien.**
--
-- De weekpas had het dus bij het rechte eind en de reeksfunctie niet. Deze
-- migratie trekt de reeks naar de weekpas toe, niet andersom.
--
-- ## Wat er niet verandert
--
-- ⚠️ **De punten blijven per weekdoel.** Domeinregel 10 rekent per weekdoel af,
--    dus twee weekdoelen in één week kunnen `+2` en `−1` opleveren. Dat is geen
--    tegenstrijdigheid maar het verschil tussen score en reeks: de reeks zegt
--    "je was er die week", de score zegt hoeveel je hebt afgemaakt. Die twee zijn
--    in dit product bewust niet hetzelfde (domeinregel 10, laatste alinea).
--
-- Idempotent: `create or replace`, en de herberekening is een pure functie van
-- wat er in `weekly_goals` staat.

begin;

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
  -- ⚠️ **Eén rij per cyclus, en `approved` wint.** Dat is het hele besluit van
  --    A37 in één `group by`. De oude vorm groepeerde óók op status en leverde
  --    daarmee twee rijen voor dezelfde week.
  for r in
    select w.cycle_start_date,
           bool_or(w.status = 'approved')              as gehaald,
           bool_or(w.status in ('missed', 'carried'))  as gemist
    from weekly_goals w
    where w.goal_id = p_goal_id
    group by w.cycle_start_date
    order by w.cycle_start_date
  loop
    if r.gehaald then
      loopt := loopt + 1;
      if loopt > beste then beste := loopt; end if;
      laatste := r.cycle_start_date;

    elsif r.gemist then
      if exists (
        select 1 from week_pass_events p
        where p.user_id = p_user_id
          and p.goal_id = p_goal_id
          and p.event = 'spent'
          and p.cycle_start_date = r.cycle_start_date
      ) then
        -- Een weekpas beschermt de reeks, niet het punt (domeinregel 10).
        laatste := r.cycle_start_date;
      else
        loopt := 0;
      end if;
    end if;

    -- `todo`, `pending`, `excused` en `cancelled` doen niets: een lopende week
    -- breekt niets, en een adempauze is geen gemiste week.
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
  'Herberekent de reeks van één doel uit weekly_goals. Eén rij per cyclus, '
  'waarbij een gehaald weekdoel de week redt (QS8-127 / A37). Een weekpas '
  'beschermt de reeks maar niet het punt.';

-- ⚠️ **Een logicawijziging die de afgeleide data laat staan, is een halve
--    wijziging.** Elke bestaande rij in `user_streaks` is met de oude regel
--    gerekend, en bij een deel van die rijen was de uitkomst een gok. Opnieuw
--    rekenen is goedkoop en de functie is puur.
do $$
declare
  s record;
begin
  for s in select user_id, goal_id from user_streaks loop
    perform herbereken_reeks(s.user_id, s.goal_id);
  end loop;
end $$;

commit;
