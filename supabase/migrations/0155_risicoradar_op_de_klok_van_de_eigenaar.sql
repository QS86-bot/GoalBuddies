-- 0155_risicoradar_op_de_klok_van_de_eigenaar.sql — de Risico-radar rekende "vandaag" in UTC (QS8-172)
--
-- ROLLBACK-PAD:
--   Zet `herbereken_risico()` terug met de body uit 0120: `current_date` op de
--   drie plaatsen waar nu `v_vandaag` staat, en de declaratie plus de
--   toewijzing van `v_vandaag` eruit. De functie schrijft alleen naar
--   `goal_risk`, en die rij wordt bij elke aanroep overschreven — er is dus
--   geen datamigratie en geen verlies. Draai daarna `herbereken_risico()` voor
--   de actieve doelen, of laat de rollover het doen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij ENGINEER-REVIEW 28-08-2026, risico Laag: de vierde en vijfde
-- `current_date` uit de sweep van 0120 zitten hier, en het zijn er drie:
--
--   v_weken_over := greatest(0, floor((v_doel.target_date - current_date) / 7.0)::integer);
--   v_venster_start := current_date - (c_venster * 7);
--   and w.cycle_start_date < current_date;
--
-- Alle drie beantwoorden "vandaag" voor één gebruiker. Dat is per domeinregel 1
-- de klok van díe gebruiker en niet die van de server. Een gebruiker in
-- Auckland zit twaalf uur naast UTC; een gebruiker in Los Angeles zeven de
-- andere kant op. Op elke dagovergang rekent de radar dan met de verkeerde dag.
--
-- ⚠️ **Waarom het toen bewust bleef staan, en waarom dat nu niet meer geldt.**
--    De sweep van 0120 ging over het venster van De Ketting — een
--    zichtbaarheidsgrens tússen leden. Dit is een privéberekening, `goal_risk`
--    is sinds 0050 eigenaar-only, en er lekt dus niets naar de groep. Het stond
--    of viel bovendien met `profiles.tz` erdoorheen trekken, en dat raakte meer
--    dan de twee plekken die 0120 aanving.
--
--    Dat laatste is sindsdien opgelost: **0134 bouwde `eigenaarsdatum(uid)`**
--    voor QS8-173, waar dezelfde fout de respijtdag op een commitment 0, 1 of 2
--    dagen maakte afhankelijk van de tijdzone. De helper is er; deze migratie
--    gebruikt hem. Wat toen "raakt te veel" was, is nu drie regels.
--
-- ⚠️ **Wat hier níet mee verandert.** De drempels, de vier standen, de volgorde
--    waarin ze getoetst worden en de onderbouwing in `reason` blijven exact
--    zoals ze waren. Dit is één begrip — "vandaag" — dat van klok wisselt.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op één functie. De handtekening verandert
-- niet, dus er hoeft niets gedropt te worden.
-- ---------------------------------------------------------------------------

create or replace function public.herbereken_risico(p_goal_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
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
  v_vandaag         date;
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

  -- ⚠️ **"Vandaag" is hier de dag van de éigenaar en niet die van de server.**
  --    Dit is een privéberekening over één mens (`goal_risk` is sinds 0050
  --    eigenaar-only), en dan is "vandaag" per domeinregel 1 zijn kalender.
  --    `eigenaarsdatum()` staat er sinds 0134 voor precies dit doel.
  --
  -- ⚠️ **De coalesce is de terugval en niet de grens**, net als in
  --    `wikkel_commitments_af`. Hij is vandaag onbereikbaar — `goals.owner_id`
  --    is NOT NULL en cascadeert op `profiles`, dus bij een doel dat bestaat
  --    bestaat het profiel — maar hij draagt wél gewicht als die foreign key ooit
  --    verandert. Gemeten: `greatest(0, null)` is in Postgres `0` en niet null,
  --    dus een null-datum zou hier stil `v_weken_over = 0` opleveren, en dat is
  --    met openstaande mijlpalen meteen `unreachable` — het hárdste oordeel dat
  --    deze functie kent, uitgesproken op een ontbrekend profiel.
  v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);

  v_weken_over := greatest(0, floor((v_doel.target_date - v_vandaag) / 7.0)::integer);

  select count(*) filter (where m.status = 'todo'),
         count(*) filter (where m.status = 'done')
    into v_open_mijlpalen, v_afgerond
    from milestones m
   where m.goal_id = p_goal_id and m.status <> 'dropped';

  -- Het tempo over de laatste vier cycli. `cycle_start_date` is de sleutel, want
  -- een cyclus kan meer dan één weekdoel bevatten.
  v_venster_start := v_vandaag - (c_venster * 7);

  select count(distinct w.cycle_start_date),
         count(distinct w.cycle_start_date) filter (where w.status = 'approved')
    into v_recent_totaal, v_recent_goed
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.cycle_start_date >= v_venster_start
     and w.cycle_start_date < v_vandaag;

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

alter function public.herbereken_risico(uuid) set search_path = public, pg_temp;
