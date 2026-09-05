-- 0163_de_gemengde_cyclus_is_niet_gehaald.sql — de tempo-noemer telde een cyclus als gehaald zodra één weekdoel goedgekeurd was (QS8-279)
--
-- ROLLBACK-PAD:
--   `create or replace` op `herbereken_risico()` met de twee query's uit 0162 —
--   `count(distinct w.cycle_start_date) filter (...)` voor het tempo, en de
--   vloerquery met `>= v_venster_start` en `+ 6 < v_vandaag` in plaats van
--   `= any (v_gehaalde_cycli)`. Er verandert geen data en geen handtekening;
--   `goal_risk` wordt bij elke aanroep overschreven.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-review op 0162 (QS8-278) en zelf nagemeten. Drie
-- afgesloten cycli, elk met één goedgekeurd plafondweekdoel plus een wisselend
-- aantal weekdoelen op `missed` in diezelfde cyclus. Drie mijlpalen te gaan,
-- streefdatum over drie weken:
--
--   0 gemiste weekdoelen per cyclus naast 1 gehaalde -> on_track  tempo=1.00 bekeken=3 gehaald=3
--   1 gemiste weekdoelen per cyclus naast 1 gehaalde -> on_track  tempo=1.00 bekeken=3 gehaald=3
--   5 gemiste weekdoelen per cyclus naast 1 gehaalde -> on_track  tempo=1.00 bekeken=3 gehaald=3
--
-- Het tempo van deze gebruiker kán niet onder 1,00 komen, hoeveel weekdoelen hij
-- ook mist, zolang er per cyclus één goedgekeurd wordt. Beide helften telden
-- `count(distinct w.cycle_start_date)` over dezelfde rijen met een ander filter,
-- en een gemengde cyclus valt in allebei.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Dit is een productbeslissing en geen reparatie met één juist antwoord
-- ---------------------------------------------------------------------------
--
-- Er lagen drie lezingen van "deze cyclus is gehaald" en ze geven alle drie een
-- ander antwoord zodra er meer dan één weekdoel in een cyclus staat. Gekozen is
-- **álle beoordeelde weekdoelen goedgekeurd**, om drie redenen die in
-- `docs/decisions/2026-09-05-wanneer-is-een-cyclus-gehaald.md` uitgeschreven
-- staan. Kort:
--
--   1. Het is dezelfde eenheid en dezelfde vorm als de vloerteller — `bool_and`
--      over een cyclus. Die eenheid is één dag oud (0162) en is daar gekozen
--      omdat de belofte een eigenschap van de cyclus is, niet van het weekdoel.
--   2. `c_venster`, `c_min_geschiedenis` en `c_vloer_aandeel` zijn alle drie in
--      cycli geijkt. De verhoudingslezing telt in weekdoelen en verschuift die
--      drempels stilzwijgend mee.
--   3. Het proportionele signaal bestáát al, in het puntenmodel: `points_ledger`
--      boekt per weekdoel. De radar hoeft dat niet nog eens over te doen, en
--      hoort dat ook niet op lagere resolutie te doen.
--
-- ⚠️ **Wat deze migratie níet is.** Dit maakt de radar niet milder en niet
--    strenger dan de tekst erboven al beloofde; hij maakt hem waar. Wie zijn
--    vloer haalt, heeft zijn week gehaald — domeinregel 8 raakt dit niet, want
--    een gehaalde vloer staat op `approved` en telt onverkort mee.
--
-- ---------------------------------------------------------------------------
-- ⚠️ En wat een strengere noemer verderop brak
-- ---------------------------------------------------------------------------
--
-- De tak op `v_tempo = 0` draagt het commentaar "Vier cycli op rij niets
-- afgerond". Die zin was waar zolang een tempo van nul betekende dat er niets
-- goedgekeurd was; onder deze lezing betekent hij "geen week is héél geworden",
-- en dat is óók de stand van iemand die elke week van alles afrondt en er telkens
-- één laat liggen. Gemeten, vier cycli met twee open mijlpalen en tien weken tot
-- de streefdatum: vijf goedgekeurde plafonds náást één gemist weekdoel gaven
-- `behind` — de op één na zwaarste stand, met het advies je doel kleiner te
-- maken, bij twintig van de vierentwintig weekdoelen.
--
-- `v_recent_deels` herstelt de vóórwaarde van die tak zonder de noemer te
-- verzachten. Uitgeschreven bij de tak zelf en in het beslisdocument. Gevonden
-- door de security-review op deze migratie.
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
  v_recent_deels    integer;
  v_gehaalde_cycli  date[];
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
  --    de reparatie van 0159. Hij telde élke status, dus ook `excused`
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
  --
  -- ⚠️ **Eén oordeel per cyclus, en dát is de correctie van 0163.** Beide helften
  --    telden `count(distinct w.cycle_start_date)` over dezelfde rijen met een
  --    ánder filter, en een cyclus met zowel een `approved` als een `missed`
  --    weekdoel valt in béide. Teller en noemer kregen er allebei één bij, dus
  --    `tempo` bleef 1,00 hoeveel weekdoelen je in die week ook miste. Gemeten,
  --    drie afgesloten cycli met telkens één goedgekeurd plafond ernaast:
  --
  --      0 gemiste weekdoelen per cyclus -> on_track  tempo=1.00 bekeken=3 gehaald=3
  --      1 gemist  weekdoel  per cyclus  -> on_track  tempo=1.00 bekeken=3 gehaald=3
  --      5 gemiste weekdoelen per cyclus -> on_track  tempo=1.00 bekeken=3 gehaald=3
  --
  --    De groepering geeft nu één uitslag per cyclus en de twee tellers lezen
  --    diezelfde rij. Een cyclus is gehaald als er geen beoordeeld weekdoel in
  --    staat dat gemist is — `bool_and`, dezelfde vorm en dezelfde eenheid als de
  --    vloerteller hieronder. Welke van de drie lezingen dat is en waarom, staat
  --    in `docs/decisions/2026-09-05-wanneer-is-een-cyclus-gehaald.md`.
  --
  -- ⚠️ **De `coalesce` op de array is verdediging en geen grendel.** Gemeten:
  --    `array_agg(...) filter (...)` is null precies wanneer `count(*) filter
  --    (...)` nul is, en dan is `v_recent_goed = 0` en `v_vloerdeel` sowieso
  --    null; `= any (null)` en `= any ('{}')` geven allebei nul rijen. Hij weg
  --    halen maakt geen enkele test rood, en dat is terecht — schrijf er dus ook
  --    geen test op die niets bewaakt.
  --
  -- ⚠️ **`v_gehaalde_cycli` is er zodat de vloerteller niet zijn eigen antwoord
  --    op dezelfde vraag hoeft te geven.** Dat is de naad, en die is hier al
  --    tweemaal gescheurd: 0157 (ander venster) en 0162 (andere eenheid). Twee
  --    where-clausules die op elkaar lijken zijn geen gedeelde definitie; deze
  --    array is dat wel.
  select count(*),
         count(*) filter (where b.gehaald),
         count(*) filter (where b.iets),
         coalesce(array_agg(b.cyclus) filter (where b.gehaald), '{}'::date[])
    into v_recent_totaal, v_recent_goed, v_recent_deels, v_gehaalde_cycli
    from (
      select w.cycle_start_date as cyclus,
             bool_and(w.status = 'approved') as gehaald,
             bool_or(w.status = 'approved') as iets
        from weekly_goals w
       where w.goal_id = p_goal_id
         and w.status in ('approved', 'missed')
         and w.cycle_start_date >= v_venster_start
         and w.cycle_start_date + 6 < v_vandaag
       group by w.cycle_start_date
    ) b;

  -- Structureel alleen de vloer halen is een vroeg signaal, en het is er een dat
  -- je alléén ziet als je ernaar kijkt: de weken tellen gewoon mee, de reeks
  -- loopt door, en toch schuift het plafond steeds verder weg.
  -- ⚠️ **Teller en noemer over hetzelfde venster en in dezelfde eenheid.**
  --    Vóór 0157 telde deze query `count(*)` over wéékdoelen en miste hij de
  --    bovengrens `< v_vandaag` die `v_recent_goed` hierboven wél heeft. Twee
  --    fouten van dezelfde soort, allebei één kant op: de lopende cyclus telde
  --    mee in de teller en niet in de noemer, en een cyclus met twee weekdoelen
  --    telde dubbel. `v_vloerdeel` kon daardoor boven 1 uitkomen.
  --
  -- ⚠️ **Het venster staat hier sinds 0163 niet meer.** `= any (v_gehaalde_cycli)`
  --    is niet dezelfde grens nóg een keer opgeschreven, maar de uitslag van de
  --    noemer zelf: de teller kan geen cyclus meer tellen die de noemer niet
  --    telt, en `v_vloerdeel` kan dus niet boven 1 uitkomen — niet omdat de twee
  --    grenzen toevallig gelijk zijn, maar omdat het er één is.
  --
  --    Gemeten wat er zonder deze helft gebeurt: drie cycli met elk een
  --    goedgekeurde vloer náást een gemist weekdoel, plus één cyclus met alleen
  --    een goedgekeurd plafond. Met alleen de noemer gerepareerd geeft dat
  --    `cycli_gehaald = 1` en `vloeraandeel = 3.00` — een verhouding boven 1 in
  --    de onderbouwing die de UI toont. Met deze regel erbij: `vloeraandeel =
  --    0.00`, want geen van die drie cycli is gehaald.
  --
  -- ⚠️ **`bool_and` en niet `exists`, en dát is de correctie van 0162.** Tot hier
  --    vroeg deze query *"bestáát er een vloervoltooiing in deze cyclus"* terwijl
  --    de regel erboven *"structureel alléén de vloer"* belooft. Dat verschil is
  --    onzichtbaar zolang een cyclus precies één weekdoel heeft — en er staat
  --    geen unieke sleutel op `(goal_id, cycle_start_date)`;
  --    `weekly_goals_goal_cycle_idx` is een gewone index.
  --
  --    Gemeten, vier afgesloten cycli met een tempo van 1.00 en tien weken tot de
  --    streefdatum:
  --
  --      alleen vloer   -> at_risk   vloeraandeel 1.00
  --      twee vloeren   -> at_risk   vloeraandeel 1.00   (de reparatie van 0157)
  --      gemengd        -> at_risk   vloeraandeel 1.00   <- deze
  --      alleen plafond -> on_track  vloeraandeel 0.00
  --
  --    "Gemengd" is elke cyclus met twéé weekdoelen, één op het plafond gehaald
  --    en één op de vloer. Vier weken je plafond gehaald, en de radar zegt dat je
  --    structureel op de vloer zit — precies de onterecht zwaardere stand waar de
  --    dossierrij van 20-08 voor waarschuwt.
  --
  -- ⚠️ **De join draagt de `bool_and`.** Elke groep heeft door de join minstens
  --    één rij, dus het aggregaat loopt nooit over een lege verzameling en kan
  --    geen null opleveren. Bij één weekdoel per cyclus is de uitkomst identiek
  --    aan de vorm hierboven; het verschil zit uitsluitend in de gemengde cyclus.
  --
  -- ⚠️ **Maar de join néémt ook rijen weg, en dat hoort erbij te staan.** Een
  --    weekdoel dat `approved` is zonder actieve voltooiing valt stil uit de
  --    `bool_and`, dus "alléén de vloer" is strikt gelezen "alléén de vloer, voor
  --    zover er iets van bekend is". Gemeten: drie cycli met elk een goedgekeurde
  --    vloer plus zo'n weekdoel geven `vloeraandeel = 1.00` en `at_risk`.
  --
  --    Een `left join` repareert dat níet — aggregaten slaan null-invoer over, dus
  --    `bool_and(true, null)` is `true` en de teller komt op hetzelfde uit
  --    (gemeten). Het is bovendien drift en geen bereikbare toestand: `authenticated`
  --    heeft UPDATE alleen op `title`, `ceiling_text`, `floor_text` en
  --    `milestone_id`, dus geen client kan `status` op `approved` zetten. Dát pad
  --    wordt al bewaakt door `weekdoelstatus_afwijkingen()` uit 0096, en dat is de
  --    juiste plek — niet hier.
  --
  -- ⚠️ **Een plafond dat nog op goedkeuring wacht, telt niet als plafond.** Een
  --    cyclus met een goedgekeurde vloer naast een `pending` plafond geldt dus als
  --    "alléén de vloer" (gemeten: `vloeraandeel = 1.00`). Dat is met opzet: de
  --    teller telt dezelfde eenheid als de noemer, en `v_recent_goed` telt
  --    uitsluitend goedgekeurde weken. De prijs staat erbij — een trage buddy
  --    duwt je richting `at_risk` terwijl je je plafond wél aanraakte. De
  --    goedkeuringstermijn is zeven dagen en `keur_vastgelopen_goedkeuringen_goed()`
  --    ruimt de rest op, dus dat venster is smal; wordt het breder, dan is dit de
  --    regel om te herzien.
  select count(*)
    into v_recent_vloer
    from (
      select w.cycle_start_date
        from weekly_goals w
        join completions c on c.weekly_goal_id = w.id and c.superseded_by is null
       where w.goal_id = p_goal_id
         and w.status = 'approved'
         and w.cycle_start_date = any (v_gehaalde_cycli)
       group by w.cycle_start_date
      having bool_and(c.achieved_level = 'floor')
    ) vloercyclus;

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
    -- ⚠️ **`v_tempo = 0` betekende "er is niets afgerond" en dat is sinds 0163
    --    niet meer waar.** Deze tak stond er voor vier cycli op rij waarin
    --    niemand iets goedgekeurd kreeg, en dat was onder de oude noemer
    --    hetzelfde als een tempo van nul. Met "gehaald = élk beoordeeld weekdoel
    --    goedgekeurd" is een tempo van nul óók de stand van iemand die elke week
    --    van alles afvinkt en er telkens één laat liggen.
    --
    --    Gemeten op de nieuwe noemer, vier afgesloten cycli met twee open
    --    mijlpalen en tien weken tot de streefdatum:
    --
    --      5 goedgekeurde plafonds + 1 gemist weekdoel per cyclus -> tempo 0.00
    --      1 goedgekeurde vloer    + 1 gemist weekdoel per cyclus -> tempo 0.00
    --      niets goedgekeurd, alles gemist                        -> tempo 0.00
    --
    --    Alle drie kregen `behind` — de op één na zwaarste stand die dit systeem
    --    kent, met de tekst "geen week afgerond" en het advies je doel kleiner te
    --    maken. De eerste haalde twintig van zijn vierentwintig weekdoelen.
    --
    -- ⚠️ **`v_recent_deels` draagt het verschil, en dat is geen verzachting.**
    --    De strengere noemer blijft precies zoals hij is: geen van deze drie
    --    heeft een hele week afgerond en geen van de drie staat op koers. Wat
    --    hersteld wordt is de vóórwaarde van deze tak — hij is geschreven voor
    --    "er komt niets af", en dat geval bestaat nog steeds en krijgt nog steeds
    --    `behind`. Wie wél elke week iets afrondt, krijgt een waarschuwing en
    --    niet het zwaarste oordeel.
    --
    -- ⚠️ **Domeinregel 8 raakt dit niet, en dat is de moeite van het opschrijven
    --    waard omdat het er wél op lijkt.** De vloer van een weekdoel telt
    --    onverkort: dat weekdoel is `approved`, de reeks loopt door, de
    --    goedkeuring verloopt identiek. Wat hier meetelt is een ánder weekdoel in
    --    dezelfde week dat blééf liggen. De regel gaat over de lat van één
    --    weekdoel, niet over hoeveel weekdoelen je die week nog meer had.
    if v_recent_deels > 0 then
      v_stand := 'at_risk';
    else
      v_stand := case when v_open_mijlpalen > 0 then 'behind' else 'at_risk' end;
    end if;

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
    'cycli_deels',      v_recent_deels,
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
