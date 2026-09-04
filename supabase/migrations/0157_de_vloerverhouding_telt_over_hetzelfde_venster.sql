-- 0157_de_vloerverhouding_telt_over_hetzelfde_venster.sql — je vloer halen kon een waarschuwing opleveren (QS8-271)
--
-- ROLLBACK-PAD:
--   `create or replace` op `herbereken_risico()` met de vloerquery uit 0155:
--   `count(*)` in plaats van `count(distinct w.cycle_start_date)`, en de regel
--   `and w.cycle_start_date < v_vandaag` eruit. Er verandert geen data en geen
--   handtekening; `goal_risk` wordt bij elke aanroep overschreven.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-review op 0156 en daarna nagemeten in
-- `pg_get_functiondef()`. Staat er sinds 0051 en is los van 0155, die alleen de
-- klok van deze functie raakte.
--
-- De noemer draagt beide grenzen:
--
--   and w.cycle_start_date >= v_venster_start
--   and w.cycle_start_date <  v_vandaag        <- bovengrens
--
-- De teller droeg alleen de ondergrens. Twee gevolgen, allebei dezelfde soort
-- fout en allebei één kant op:
--
--   1. De lópende cyclus telde wél in de teller en niet in de noemer.
--   2. De teller was `count(*)` over wéékdoelen, de noemer
--      `count(distinct cycle_start_date)` over cycli — een cyclus met twee
--      weekdoelen telde dubbel.
--
-- `v_vloerdeel` kon daardoor bóven 1 uitkomen, en de drempel is 0,75.
--
-- ---------------------------------------------------------------------------
-- Wat het voor een gebruiker betekende
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Haal je déze week je vloer en keurt een buddy dat goed, dan kon de app je
--    daarvoor `at_risk` teruggeven.** Een risicowaarschuwing als antwoord op een
--    geslaagde week.
--
-- Dat botst met twee dingen die dit project met zoveel woorden heeft
-- opgeschreven:
--
--   * Domeinregel 8 — "Vloer gehaald betekent dat de week telt... De reeks dient
--     de gebruiker, nooit andersom."
--   * De dossierrij van 20-08 over deze functie: het gevaarlijkste geval is een
--     onterecht zwaardere stand, want "hij komt op het moment dat iemand toch al
--     twijfelt".
--
-- Het was dus geen afrondingskwestie maar precies het signaal dat deze feature
-- niet mag geven.
--
-- ---------------------------------------------------------------------------
-- Waarom de suite hem niet zag
-- ---------------------------------------------------------------------------
--
-- `risicoradar.test.ts` heeft zeven scenario's over de tempodimensie, maar zijn
-- opbouwer zet elke cyclus in het verléden (`-7 * wekenTerug`, en `wekenTerug`
-- is minstens 1). Er was dus nooit een voltooiing in de lopende cyclus, en
-- `vloeraandeel` stond in geen enkele assertie. De tests toetsten een
-- eigenschap van het onderdeel; deze grens zat in de naad ertussen.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op één functie, handtekening onveranderd.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.herbereken_risico(p_goal_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- ⚠️ **Teller en noemer over hetzelfde venster en in dezelfde eenheid.**
  --    Vóór 0157 telde deze query `count(*)` over wéékdoelen en miste hij de
  --    bovengrens `< v_vandaag` die `v_recent_goed` hierboven wél heeft. Twee
  --    fouten van dezelfde soort, allebei één kant op: de lopende cyclus telde
  --    mee in de teller en niet in de noemer, en een cyclus met twee weekdoelen
  --    telde dubbel. `v_vloerdeel` kon daardoor boven 1 uitkomen.
  select count(distinct w.cycle_start_date)
    into v_recent_vloer
    from weekly_goals w
    join completions c on c.weekly_goal_id = w.id and c.superseded_by is null
   where w.goal_id = p_goal_id
     and w.status = 'approved'
     and w.cycle_start_date >= v_venster_start
     and w.cycle_start_date < v_vandaag
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
$function$;
