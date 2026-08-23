-- 0051_haalbaarheid.sql — QS8-93, de motor onder de Risico-radar (EPIC 12)
--
-- ROLLBACK-PAD:
--   drop trigger if exists completion_approvals_risico on public.completion_approvals;
--   drop function if exists risico_na_goedkeuring();
--   drop function if exists herbereken_risico(uuid);
--
-- ⚠️ **Rekenwerk, geen taalmodel.** De issue zegt het met zoveel woorden: begin
--    zonder AI. Een heuristiek die je kunt uitleggen is hier meer waard dan een
--    model dat je moet vertrouwen — en de uitkomst moet uitlegbaar zijn
--    (acceptatiecriterium 5), dus de signalen gaan mee in `goal_risk.reason`.
--
-- ⚠️ **Waarom deze berekening in SQL staat en niet in TypeScript.** Hij moet
--    draaien bij de rollover én bij elke goedkeuring. De rollover is een Edge
--    Function, goedkeuring gebeurt in een trigger. Eén implementatie in SQL kan
--    door allebei aangeroepen worden; twee implementaties zijn twee kopieën, en
--    die zijn in dit project al een keer geruisloos uit elkaar gelopen (A32).
--    De TypeScript-kant doet alleen de uitleg in gewone taal, uit `reason`.
--
-- ⚠️ **"Weken over", niet "cycli op jouw raster".** De haalbaarheid telt hele
--    weken tussen vandaag en de streefdatum, en kijkt bewust níét naar de
--    persoonlijke week-startdag. Dat scheelt een tweede kopie van `shared/time`
--    in SQL, en het is inhoudelijk juister: of je deadline haalbaar is, hangt af
--    van hoeveel tijd er nog is, niet van de dag waarop jouw week begint.
--
-- ⚠️ **Dit is een heuristiek die ik zelf bedacht heb.** Er zit geen onderzoek
--    achter en geen gebruikersdata — dat staat ook zo in ENGINEER-REVIEW. De
--    drempels hieronder zijn beredeneerd, niet gemeten. Ze staan daarom op één
--    plek en met naam, zodat ze te verstellen zijn zonder de logica te herlezen.
--    Bij een verkeerde "deadline onhaalbaar" verlies je vertrouwen op precies
--    het verkeerde moment; vandaar dat die stand de strengste eis heeft.

begin;

create or replace function public.herbereken_risico(p_goal_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  -- De drempels, met naam en op één plek.
  -- Een doel loopt "achter" zodra je meer dan anderhalf keer je recente tempo
  -- nodig hebt; "oppassen" zodra je er überhaupt bovenuit moet.
  c_achterstand_factor  constant numeric := 1.5;
  c_venster             constant integer := 4;   -- cycli waarover het tempo telt
  c_vloer_aandeel       constant numeric := 0.75; -- structureel alleen de vloer
  c_min_geschiedenis    constant integer := 3;   -- minder is geen patroon

  v_doel            record;
  v_weken_over      integer;
  v_open_mijlpalen  integer;
  v_afgerond        integer;
  v_venster_start   date;
  v_recent_totaal   integer;
  v_recent_goed     integer;
  v_recent_vloer    integer;
  v_tempo           numeric;
  v_benodigd        numeric;
  v_vloerdeel       numeric;
  v_stand           text;
  v_reden           jsonb;
begin
  select g.id, g.owner_id, g.target_date, g.status
    into v_doel
    from goals g
   where g.id = p_goal_id;

  if v_doel.id is null then
    return null;
  end if;

  -- Een gearchiveerd of afgerond doel heeft geen risico meer. De rij blijft
  -- staan met 'on_track' in plaats van te verdwijnen: een ontbrekende rij zou
  -- straks "nog niet berekend" moeten betekenen, en dat verschil wil je niet
  -- hoeven raden (zie de valkuil over lege tabellen).
  if v_doel.status <> 'active' then
    insert into goal_risk (goal_id, status, reason, computed_at)
    values (p_goal_id, 'on_track', jsonb_build_object('reden', 'niet_actief'), now())
    on conflict (goal_id) do update
      set status = excluded.status, reason = excluded.reason, computed_at = excluded.computed_at;
    return 'on_track';
  end if;

  v_weken_over := greatest(0, floor((v_doel.target_date - current_date) / 7.0)::integer);

  select count(*) filter (where m.status = 'todo'),
         count(*) filter (where m.status = 'done')
    into v_open_mijlpalen, v_afgerond
    from milestones m
   where m.goal_id = p_goal_id and m.status <> 'dropped';

  -- Het tempo over de laatste vier cycli. `cycle_start_date` is de sleutel, want
  -- een cyclus kan meer dan één weekdoel bevatten.
  v_venster_start := current_date - (c_venster * 7);

  select count(distinct w.cycle_start_date),
         count(distinct w.cycle_start_date) filter (where w.status = 'approved')
    into v_recent_totaal, v_recent_goed
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.cycle_start_date >= v_venster_start
     and w.cycle_start_date < current_date;

  -- Structureel alleen de vloer halen is een vroeg signaal, en het is er een dat
  -- je alléén ziet als je ernaar kijkt: de weken tellen gewoon mee, de reeks
  -- loopt door, en toch schuift het plafond steeds verder weg.
  select count(*)
    into v_recent_vloer
    from weekly_goals w
    join completions c on c.weekly_goal_id = w.id and c.superseded_by is null
   where w.goal_id = p_goal_id
     and w.status = 'approved'
     and w.cycle_start_date >= v_venster_start
     and c.achieved_level = 'floor';

  v_tempo := case when v_recent_totaal = 0 then null
                  else v_recent_goed::numeric / v_recent_totaal end;

  v_benodigd := case when v_weken_over = 0 then null
                     else v_open_mijlpalen::numeric / v_weken_over end;

  v_vloerdeel := case when v_recent_goed = 0 then null
                      else v_recent_vloer::numeric / v_recent_goed end;

  -- -----------------------------------------------------------------------
  -- De vier standen, van streng naar mild. De eerste die past, wint.
  -- -----------------------------------------------------------------------

  if v_open_mijlpalen > 0 and v_weken_over = 0 then
    -- De streefdatum is er, en er ligt nog werk. Dit is de enige stand die
    -- geen schatting is maar een feit.
    v_stand := 'unreachable';

  elsif v_open_mijlpalen > v_weken_over then
    -- Zelfs in een perfecte week-per-mijlpaal loopt dit niet af vóór de datum.
    v_stand := 'unreachable';

  elsif v_tempo is null then
    -- ⚠️ Acceptatiecriterium 4: een nieuw doel zonder geschiedenis staat op "op
    --    koers" en niet op "onbekend". Iemand die net begint, hoort geen
    --    waarschuwing te zien over een patroon dat nog niet bestaat.
    v_stand := 'on_track';

  elsif v_recent_totaal >= c_min_geschiedenis
        and v_benodigd is not null
        and v_tempo > 0
        and v_benodigd > v_tempo * c_achterstand_factor then
    v_stand := 'behind';

  elsif v_recent_totaal >= c_min_geschiedenis and v_tempo = 0 then
    -- Vier cycli op rij niets afgerond, met werk dat nog moet.
    v_stand := case when v_open_mijlpalen > 0 then 'behind' else 'at_risk' end;

  elsif v_benodigd is not null and v_tempo > 0 and v_benodigd > v_tempo then
    v_stand := 'at_risk';

  elsif v_recent_goed >= c_min_geschiedenis
        and v_vloerdeel is not null
        and v_vloerdeel >= c_vloer_aandeel then
    v_stand := 'at_risk';

  else
    v_stand := 'on_track';
  end if;

  -- ⚠️ De onderbouwing gaat mee, want de UI moet kunnen tonen wáárom
  --    (acceptatiecriterium 5). Ruwe getallen en geen zinnen: de tekst hoort in
  --    de app, waar hij vertaald en bijgeschaafd kan worden zonder migratie.
  v_reden := jsonb_build_object(
    'weken_over',       v_weken_over,
    'open_mijlpalen',   v_open_mijlpalen,
    'mijlpalen_af',     v_afgerond,
    'cycli_bekeken',    v_recent_totaal,
    'cycli_gehaald',    v_recent_goed,
    'tempo',            v_tempo,
    'benodigd_tempo',   v_benodigd,
    'vloeraandeel',     v_vloerdeel
  );

  insert into goal_risk (goal_id, status, reason, computed_at)
  values (p_goal_id, v_stand, v_reden, now())
  on conflict (goal_id) do update
    set status = excluded.status, reason = excluded.reason, computed_at = excluded.computed_at;

  return v_stand;
end;
$$;

-- ⚠️ Niet voor de client. Een gebruiker die zijn eigen risicostand kan laten
--    herberekenen is op zichzelf onschuldig, maar het is een gratis
--    rekenopdracht op een gratis tier en er is geen scherm dat het nodig heeft:
--    de rollover en de goedkeuring dekken alle momenten waarop de uitkomst kan
--    veranderen (acceptatiecriterium 2).
revoke all on function public.herbereken_risico(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Herberekenen bij elke goedkeuring
-- ---------------------------------------------------------------------------
--
-- ⚠️ Gooit nooit. Een mislukte risicoberekening mag een goedkeuring niet
--    terugdraaien — dat is dezelfde vorm als `meld_mijlpaal()`, en de reden is
--    dezelfde: de goedkeuring is het echte werk, het risico is een afgeleide.

create or replace function public.risico_na_goedkeuring()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_goal_id uuid;
begin
  begin
    select w.goal_id into v_goal_id
      from completions c
      join weekly_goals w on w.id = c.weekly_goal_id
     where c.id = new.completion_id;

    if v_goal_id is not null then
      perform herbereken_risico(v_goal_id);
    end if;
  exception
    when others then
      raise warning 'Risico niet herberekend na goedkeuring %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists completion_approvals_risico on public.completion_approvals;
create trigger completion_approvals_risico
  after insert on public.completion_approvals
  for each row execute function public.risico_na_goedkeuring();

commit;
