-- 0159_een_adempauze_telt_niet_als_gemiste_week.sql — de Risico-radar strafte een voorziening die de app zelf aanbiedt (QS8-275)
--
-- ROLLBACK-PAD:
--   `create or replace` op `herbereken_risico()` met `count(distinct
--   w.cycle_start_date)` zonder filter als eerste kolom — de vorm uit 0157. Er
--   verandert geen data en geen handtekening; `goal_risk` wordt bij elke
--   aanroep overschreven.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-review op 0157 en zelf nagemeten. Drie weken op het
-- plafond, plus één vierde afgesloten cyclus met wisselende status:
--
--   vierde cyclus = geen      -> on_track  (tempo 1.00)
--   vierde cyclus = excused   -> at_risk   (tempo 0.75)
--   vierde cyclus = cancelled -> at_risk   (tempo 0.75)
--   vierde cyclus = carried   -> at_risk   (tempo 0.75)
--   vierde cyclus = missed    -> at_risk   (tempo 0.75)
--
-- `v_recent_totaal` telde élke cyclusstatus terwijl `v_recent_goed` alleen
-- `approved` telt. Een adempauze zat dus in de noemer en niet in de teller.
--
-- ---------------------------------------------------------------------------
-- ⚠️ De lijst komt uit het puntenmodel en niet uit een oordeel
-- ---------------------------------------------------------------------------
--
-- Welke statussen "tellen tegen je" is geen smaakkwestie: het staat al ergens
-- vast. Gemeten over het hele schema en de Edge Functions — **alleen `missed`
-- levert een `cycle_missed`-boeking op**. `supabase/functions/rollover/index.ts`
-- zet daar de status (regel 353) en het minpunt (regel 366) in één handeling.
-- `excused`, `cancelled` en `carried` boeken niets.
--
--   excused   — adempauze of weekpas; domeinregel 10 zet hem expliciet op `0`
--   cancelled — `sluit_weekdoel_af()`, je hebt de week zelf afgesloten
--   carried   — `schuif_weekdoel_door()`, het weekdoel staat in een látere
--               cyclus als nieuwe rij; meetellen straft één verplaatsing twee keer
--
-- De Risico-radar was daarmee het enige onderdeel dat een adempauze als een
-- gemiste week behandelde — een voorziening die de app zelf aanbiedt, en waar
-- een weekpas niet tegen beschermt omdat die de réeks bewaakt en niet dit.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat deze keuze óók doet, en dat hoort er eerlijk bij
-- ---------------------------------------------------------------------------
--
-- Een afgesloten cyclus die nog op `todo` of `pending` staat — de rollover heeft
-- hem nog niet aangeraakt — valt nu eveneens uit de noemer.
--
-- Dat is bewust de conservatieve kant: **de app hoort een gebruiker niet te
-- straffen voor een achtergrondjob die niet gedraaid heeft.** Het maakt een
-- kapotte rollover wel stiller in de Risico-radar, en dat is de prijs. De
-- rollover heeft zijn eigen bewaking; de radar is niet de plek om hem te
-- monitoren, en zeker niet ten koste van de gebruiker die er niets aan kan doen.
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

  -- ⚠️ **`+ 6 <` en niet `<`, en dat is de correctie van 0157.** Een cyclus loopt
  --    van `cycle_start_date` tot en met `+ 6` — die vorm staat als grendel in
  --    `afvinking_binnen_de_cyclus()`. `cycle_start_date < v_vandaag` betekent
  --    dus niet "de cyclus is afgelopen" maar "de cyclus is niet vandáág
  --    begonnen", en dat dekt één dag van de zeven.
  --
  --    Gemeten wat dat kostte: drie weken op het plafond met het weekdoel van
  --    déze week nog op `todo` gaf `tempo = 0.75` en `at_risk` zodra de week
  --    één of meer dagen geleden begon — en `tempo = 1.00` met `on_track` als
  --    hij vandaag begon. Een lopende week telde in de noemer terwijl hij nog
  --    niet goedgekeurd kán zijn.
  --
  --    Met deze grens vallen precies de cyclusstarts op `-28`, `-21`, `-14` en
  --    `-7` in het venster: vier afgesloten cycli, en `c_venster` betekent
  --    eindelijk wat hij belooft.
  -- ⚠️ **De noemer telt alleen cycli die een óórdeel gekregen hebben**, en dat is
  --    de reparatie van 0158. Hij telde élke status, dus ook `excused`
  --    (adempauze, weekpas), `cancelled` (je hebt de week zelf afgesloten) en
  --    `carried` (het weekdoel is naar een latere cyclus verplaatst en staat
  --    dáár als nieuwe rij). Die drie zaten wél in de noemer en niet in de
  --    teller, en drukten het tempo precies zo hard als een gemiste week.
  --
  --    Gemeten — drie plafondweken plus één vierde afgesloten cyclus:
  --
  --      vierde cyclus = geen      -> on_track  (tempo 1.00)
  --      vierde cyclus = excused   -> at_risk   (tempo 0.75)
  --      vierde cyclus = cancelled -> at_risk   (tempo 0.75)
  --      vierde cyclus = carried   -> at_risk   (tempo 0.75)
  --      vierde cyclus = missed    -> at_risk   (tempo 0.75)
  --
  -- ⚠️ **De lijst komt niet uit een oordeel maar uit het puntenmodel.** Gemeten
  --    over het hele schema en de Edge Functions: alléén `missed` levert een
  --    `cycle_missed`-boeking op (`rollover/index.ts` zet daar de status en het
  --    minpunt in één handeling). De andere drie boeken niets. De Risico-radar
  --    was het enige onderdeel dat een adempauze als een gemiste week behandelde,
  --    terwijl domeinregel 10 hem op `0` zet.
  select count(distinct w.cycle_start_date) filter (where w.status in ('approved', 'missed')),
         count(distinct w.cycle_start_date) filter (where w.status = 'approved')
    into v_recent_totaal, v_recent_goed
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.cycle_start_date >= v_venster_start
     and w.cycle_start_date + 6 < v_vandaag;

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
     and w.cycle_start_date + 6 < v_vandaag
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
