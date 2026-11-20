-- 0313_een_weekbelofte_wordt_verschuldigd_of_gehouden_aan_het_einde_van_haar_week.sql
-- — een weekbelofte wordt aan het einde van haar eigen week `due` (gebroken) of
-- `cancelled` (gehouden), en een lopende belofte houdt de startdag vast
-- (QS8-759, x.2 van de poort QS8-744).
--
-- ROLLBACK-PAD:
--   de drie functies terug uit hun vorige definitie:
--     maak_straffen_verschuldigd(uuid)                 0312
--     wikkel_commitments_af(uuid)                      0280
--     zet_week_startdag(smallint, date, date)          0201
--   drop function if exists public.beslis_weekbeloftes(uuid, timestamptz);
--   (eerst de drie terugzetten: `maak_straffen_verschuldigd()` roept hem aan.)
--
-- ⚠️ Raakt geen tabel, kolom, index of policy, en wist niets. Terugdraaien laat
--    een belofte die al `due` of `cancelled` is staan zoals ze is; een lopende
--    belofte blijft dan `set` tot er weer een beslispad is. Tot x.3 (QS8-760)
--    kan een client geen belofte aanmaken, dus er bestaan er dan geen.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie herdefinieert drie functies op het strafpad en wordt dus niet door
--    een bouwsessie op productie gezet. Volgorde: 0312 vóór 0313.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten (19-11-2026, poort QS8-744; akkoord op de verruiming van
-- domeinregel 11 op 20-11-2026). Uitleg en de bevindingen van de spec-ronde in
-- `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md`;
-- wat dit issue erbij besloot in
-- `docs/decisions/2026-11-20-een-weekbelofte-beslist-aan-het-einde-van-haar-week.md`.
--
-- 📏 Gemeten op de lokale stack (stand 0312), en twee ervan spreken het issue
--    tegen:
--
--   * **Een weekpas zet de week níet op `excused`.** `verbruik_weekpas()` laat
--     het weekdoel op `missed` staan en schrijft een `week_pass_events`-rij met
--     `event = 'spent'` voor `(goal_id, cycle_start_date)`. Het issue las uit
--     een comment (0159) dat het `excused` werd. Een week die een pas redde
--     telt hier als gehouden: dát is de toets, niet de status.
--   * **Een zelf afgesloten weekdoel (`cancelled`) is nog niet beslist.** De
--     rollover pakt `todo` én `cancelled` en zet ze bij het verstrijken op
--     `missed` (A40, 0045). Wachten op alleen `todo` zou een zelf opgegeven
--     week als gehouden lezen in de run waarin de week sluit.
--   * De rollover roept `maak_straffen_verschuldigd()` aan vóór
--     `sluitVerstrekenWekenAf()` (`supabase/functions/rollover/index.ts`,
--     `verwerkProfiel()`). In de run waarin de week sluit staan de weekdoelen
--     dus nog open, en beslist de belofte pas in de volgende run.
--   * `cancelled` vanuit `set` geeft geen push aan een getuige (0293:
--     `getuigenissen_voor()` heeft een gate op `due`) en `meld_commitment()`
--     plaatst alleen bij `due` een bericht. Een gehouden belofte op `cancelled`
--     is dus vanzelf stil; er hoeft geen trigger voor te wijken.
--   * `noteer_commitment()` schrijft de actor als `auth.uid()` een profiel
--     heeft. De rollover draait als `service_role` zonder JWT-onderwerp, dus de
--     spoorregel van een beslissing heeft `actor_id null`.
--
-- ---------------------------------------------------------------------------
-- 1. De beslissing
-- ---------------------------------------------------------------------------
--
-- Een belofte op `set` is rijp als
--   (a) de dag in haar bevroren `tz` (0280) op of na `periode_einde` ligt —
--       de bevroren klok en niet `profiles.tz`, de les van 0294;
--   (b) ze ouder is dan 24 uur — hetzelfde wachtvenster als de doelstraf (0171);
--   (c) geen weekdoel van het doel in haar week meer op `todo` of `cancelled`
--       staat — de week is door de rollover afgesloten.
--
-- Een rijpe belofte is **gebroken** als er in haar week een weekdoel op
-- `missed` staat zonder bestede weekpas voor die cyclus, en er in die week
-- niets `approved` of `pending` is (een lopende keuring kan de week nog laten
-- tellen). Dat laatste is de regel van de reeks (A37,
-- `herbereken_reeks()`: één gehaald weekdoel laat de week tellen) en van
-- `verbruik_weekpas()`, die in zo'n week geen pas besteedt; zonder die eis werd
-- een week die voor de reeks telt, voor de belofte gebroken. Dan `due`, en
-- `meld_commitment()` plaatst het bestaande `commitment_due` in de begunstigde
-- groep (of de getuige krijgt de bestaande push). Anders is ze **gehouden**:
-- `cancelled`, en nooit `resolved` — beide zichtbaarheidslijsten bevatten
-- `resolved` (0168), en dan las de begunstigde de tekst van een gehouden
-- belofte.
--
-- Gehouden is dus ook: `approved`, `pending` (telt niet als gemist; het
-- issue), `carried`, `excused` (adempauze), een gehaalde vloer (die is
-- `approved`), een gemiste week die een pas redde, en een week zonder
-- weekdoel. ⚠️ Die laatste en `carried` zijn uitwegen die de poort bewust
-- openliet (bevinding bij punt 2 van *Wat Quinten nog moet bevestigen*): bij
-- twijfel niet verschuldigd.
--
-- ⚠️⚠️ **`carried` is zwaarder dan de poort dacht, en ligt bij Quinten.**
--    📏 `schuif_weekdoel_door()` (0185) zet alleen een `missed`-rij op
--    `carried`, en `herbereken_reeks()` telt `carried` als gemist (0216). Een
--    `carried`-week ís dus een gemiste week. Tussen de run die de week sluit en
--    de run die beslist kan de eigenaar elke gemiste week doorschuiven, en dan
--    is de belofte gehouden. Gebouwd zoals getekend (niet strenger dan wat
--    Quinten aftekende, grens 1); de vraag staat op QS8-759.
--
-- ⚠️ **Geen punten.** Deze functie schrijft niets in `points_ledger`; de
--    gemiste week kostte al zijn `−1` in de rollover (A43, domeinregel 10).

-- ⚠️ **Security invoker, en uitvoerbaar voor niemand dan de eigenaar.** Hij
--    draait alleen binnen `maak_straffen_verschuldigd()` (definer, eigenaar
--    `postgres`) en in de suite. Een `p_moment` van buiten is precies de vorm
--    die 0294 wegnam (`p_vandaag`): een klok die de aanroeper zet. Daarom geen
--    grant aan `service_role` of wie dan ook.
create or replace function public.beslis_weekbeloftes(p_owner_id uuid, p_moment timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  r       record;
  v_due   integer := 0;
begin
  if p_owner_id is null or p_moment is null then
    return 0;
  end if;

  -- ⚠️ `for update of c`: een gelijktijdige intrekking (x.4) of een tweede
  --    rollover-run wacht, en de voorwaarden worden na de vergrendeling
  --    opnieuw gelezen (READ COMMITTED), dus een rij die intussen `cancelled`
  --    werd valt eruit.
  for r in
    select c.id,
           not exists (
             select 1
               from weekly_goals h
              where h.goal_id = c.goal_id
                and h.cycle_start_date >= c.periode_start
                and h.cycle_start_date <  c.periode_einde
                -- ⚠️ Ook `pending` (security-ronde): een keuring die nog loopt
                --    kan de week alsnog laten tellen, en een `due` is niet terug
                --    te draaien. Bij twijfel niet verschuldigd.
                and h.status in ('approved', 'pending')
           )
           and exists (
             select 1
               from weekly_goals w
              where w.goal_id = c.goal_id
                and w.cycle_start_date >= c.periode_start
                and w.cycle_start_date <  c.periode_einde
                and w.status = 'missed'
                and not exists (
                  select 1
                    from week_pass_events e
                   where e.user_id = p_owner_id
                     and e.goal_id = w.goal_id
                     and e.event = 'spent'
                     and e.cycle_start_date = w.cycle_start_date
                )
           ) as gebroken
      from commitments c
      join goals g on g.id = c.goal_id
     where g.owner_id = p_owner_id
       and c.type = 'penalty'
       and c.status = 'set'
       and c.periode_start is not null
       and (p_moment at time zone c.tz)::date >= c.periode_einde
       and c.created_at < p_moment - interval '24 hours'
       and not exists (
         select 1
           from weekly_goals w
          where w.goal_id = c.goal_id
            and w.cycle_start_date >= c.periode_start
            and w.cycle_start_date <  c.periode_einde
            and w.status in ('todo', 'cancelled')
       )
     order by c.id
       for update of c
  loop
    update commitments
       set status = case when r.gebroken then 'due' else 'cancelled' end
     where id = r.id;

    if r.gebroken then
      v_due := v_due + 1;
    end if;
  end loop;

  return v_due;
end;
$function$;

revoke all on function public.beslis_weekbeloftes(uuid, timestamptz) from public, anon, authenticated, service_role;

comment on function public.beslis_weekbeloftes(uuid, timestamptz) is
  'QS8-759 (0313): beslist de rijpe weekbeloftes van één eigenaar op p_moment — due bij een gemiste week zonder bestede weekpas, anders cancelled (gehouden). Alleen via maak_straffen_verschuldigd(); niet uitvoerbaar voor een client of service_role.';

-- ---------------------------------------------------------------------------
-- 2. De tweede tak in `maak_straffen_verschuldigd()`
-- ---------------------------------------------------------------------------
--
-- Lichaam uit `pg_get_functiondef()` op een database tot en met 0312 (= `main`
-- op 791b134); er komt één toewijzing bij. Grant-regels woordelijk zoals 0312.

CREATE OR REPLACE FUNCTION public.maak_straffen_verschuldigd(p_owner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_aantal integer;
begin
  if p_owner_id is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
         cross join lateral (
           select public.doeldatum(g.id, g.owner_id) as vandaag
         ) d
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     -- ⚠️ QS8-758 (0312): alleen een doelstraf. Een weekbelofte
     --    (`periode_start is not null`) hangt niet aan `goals.target_date`
     --    maar aan het einde van haar eigen week; dat beslist x.2.
     and c.periode_start is null
     and g.target_date < d.vandaag
     and c.created_at < now() - interval '24 hours'
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= d.vandaag
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         and g.target_date > d.vandaag - 7
         and not exists (
           select 1
           from deadline_requests eerder
           where eerder.goal_id = g.id
             and eerder.status = 'rejected'
             and eerder.old_date = g.target_date
         )
     );

  get diagnostics v_aantal = row_count;

  -- ⚠️ QS8-759 (0313): de tweede tak, voor een weekbelofte. Zelfde handtekening,
  --    zodat de gedeployde rollover hem zonder nieuwe deploy meeneemt. Het
  --    moment is `now()`; `beslis_weekbeloftes()` neemt het als argument zodat
  --    de suite de DST-wissel op een vast moment kan toetsen.
  v_aantal := v_aantal + beslis_weekbeloftes(p_owner_id, now());

  return v_aantal;
end;
$function$;

revoke all on function public.maak_straffen_verschuldigd(uuid) from public, anon, authenticated;
grant execute on function public.maak_straffen_verschuldigd(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Afronden binnen de week houdt de belofte — `wikkel_commitments_af()`
-- ---------------------------------------------------------------------------
--
-- 📏 Vóór deze migratie annuleerde hij bij op tijd afronden élke straf op
-- `set`, gemeten aan `goals.target_date` — dus ook een belofte, maar met de
-- klok van het doel. Besloten (QS8-759, op de vraag in de reactie op het issue):
-- **wie zijn doel afrondt binnen de week van de belofte, heeft haar gehouden.**
-- Dezelfde handeling laat al een doelstraf vervallen (besluit 21-08-2026 in
-- `rondDoelAf()`); een belofte strenger behandelen dan de straf op het hele doel
-- zou de enige plek zijn waar afronden je iets kost. Ná de week niet meer: dan
-- staat de uitslag van die week al vast in de weekdoelen.
--
-- ⚠️ Het spoor draagt hier de eigenaar als actor (`rond_doel_af()` draait onder
--    zijn JWT), en de doelstatus `completed` in de payload — zo onderscheidt het
--    zich van een intrekking. Lichaam uit `pg_get_functiondef()`, stand 0312.

CREATE OR REPLACE FUNCTION public.wikkel_commitments_af(p_goal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_doel        record;
  v_vandaag     date;
  v_op_tijd     boolean;
  v_vrij        integer := 0;
  v_verlopen    integer := 0;
  v_vervallen   integer := 0;
  v_blijft      integer := 0;
  v_gehouden    integer := 0;
begin
  select g.id, g.target_date, g.status, g.owner_id
    into v_doel
    from goals g
   where g.id = p_goal_id;

  if v_doel.id is null then
    return jsonb_build_object(
      'vrijgespeeld', 0, 'verlopen', 0, 'vervallen', 0, 'blijft_staan', 0
    );
  end if;

  -- De beloningsklok: ongewijzigd sinds 0057, met het argument van 0057.
  v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);
  v_op_tijd := v_vandaag <= v_doel.target_date + 1;

  if v_op_tijd then
    update commitments
       set status = 'unlocked'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_vrij = row_count;
  else
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_verlopen = row_count;
  end if;

  -- ⚠️ **De straf wordt per commitment beoordeeld, met de zone die bij het
  --    aangaan is vastgelegd.** Niet met `v_op_tijd` hierboven: die hangt aan de
  --    zone van vandaag, en dat is de klok die de gestrafte zelf zet.
  --
  -- ⚠️ **Op tijd afgerond laat de straf vervallen, en dat blijft zo.** Dat is
  --    het besluit van 21-08-2026 dat in `rondDoelAf()` staat: afronden is de
  --    handeling die je straf laat vervallen. Wat er verandert is uitsluitend
  --    wélke klok bepaalt of je op tijd was.
  update commitments c
     set status = 'cancelled'
   where c.goal_id = p_goal_id
     and c.type = 'penalty'
     and c.status = 'set'
     -- ⚠️ QS8-759 (0313): alleen een doelstraf meet aan `target_date`. Een
     --    weekbelofte heeft haar eigen week; zie de update hieronder.
     and c.periode_start is null
     and (now() at time zone c.tz)::date <= v_doel.target_date + 1;
  get diagnostics v_vervallen = row_count;

  -- ⚠️ QS8-759 (0313): **een doel dat binnen de week van een belofte wordt
  --    afgerond, houdt die belofte.** Gemeten aan de bevroren zone van de
  --    belofte en aan háár week, niet aan `target_date`: dat is de klok van het
  --    doel. Na het einde van de week beslist de week zelf
  --    (`beslis_weekbeloftes()`), anders kon je een gebroken week nog
  --    wegpoetsen door het doel af te ronden vóór de volgende rollover-run.
  --    Telt mee in `vervallen`: voor het scherm is het dezelfde uitkomst.
  update commitments c
     set status = 'cancelled'
   where c.goal_id = p_goal_id
     and c.type = 'penalty'
     and c.status = 'set'
     and c.periode_start is not null
     and (now() at time zone c.tz)::date < c.periode_einde;
  get diagnostics v_gehouden = row_count;
  v_vervallen := v_vervallen + v_gehouden;

  -- ⚠️ Wat blijft staan, blijft op `set` en wordt hier níet verschuldigd
  --    gemaakt. `maak_straffen_verschuldigd()` doet dat zodra zijn eigen
  --    grendels het toelaten; een commitment device treedt nooit stilzwijgend
  --    in werking (domeinregel 5). `v_blijft` telt alleen — het is wat het
  --    scherm de gebruiker moet vertellen.
  select count(*) into v_blijft
    from commitments
   where goal_id = p_goal_id and type = 'penalty' and status = 'set';

  return jsonb_build_object(
    'vrijgespeeld', v_vrij,
    'verlopen',     v_verlopen,
    'vervallen',    v_vervallen,
    'blijft_staan', v_blijft
  );
end;
$function$;

revoke all on function public.wikkel_commitments_af(uuid) from public, anon, authenticated;
grant execute on function public.wikkel_commitments_af(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Een lopende belofte houdt de startdag vast — `zet_week_startdag()`
-- ---------------------------------------------------------------------------
--
-- Lichaam uit `pg_get_functiondef()`, stand 0312 (vorm van 0201); er komt één
-- weigering bij, `weekbelofte_loopt`. Na `cancelled` of `due` lukt het weer.

CREATE OR REPLACE FUNCTION public.zet_week_startdag(p_dag smallint, p_oude_start date, p_nieuwe_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_vandaag  date;
  v_verzet   integer := 0;
  v_oude_dag smallint;
begin
  -- ⚠️ Expliciet op null toetsen en niet op `<> `. Zonder sessie is `auth.uid()`
  --    NULL, en `null <> x` is NULL en dus niet waar — de val die veertig regels
  --    kostte en in elke definer-functie sindsdien zo staat.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  if p_dag is null or p_dag < 0 or p_dag > 6 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_dag');
  end if;

  if p_oude_start is null or p_nieuwe_start is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  -- De eigen datum van deze gebruiker, uit de gedeelde helper van 0137. Niet
  -- `current_date`: die is UTC, en dan verschilt de grens per woonplaats.
  v_vandaag := eigenaarsdatum(v_uid);

  -- ⚠️ Een ontbrekend profiel is hier **weigeren** en niet doorlaten. Bij
  --    `wikkel_commitments_af()` viel de terugval de milde kant op omdat de
  --    twijfel daar een beloning kostte; hier zou doorlaten de grens hieronder
  --    uitschakelen, en dat is de kant die geld kost.
  if v_vandaag is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  -- ---------------------------------------------------------------------
  -- De grendel, en dit is het deel dat ertoe doet
  -- ---------------------------------------------------------------------
  --
  -- ⚠️ **Een RPC die een cliënt-berekende datum aanneemt, is een route naar een
  --    weggepoetste week.** Zonder deze toets kon je een `todo` die op het punt
  --    staat gemist te worden naar de huidige cyclus schuiven, en dan komt het
  --    minpunt nooit. Dat is dezelfde klasse als de vier routes die 0043 t/m
  --    0046 hebben dichtgezet.
  --
  -- ⚠️ **De toets is een datumbereik en geen weekberekening**, en dat is met
  --    opzet: zo ontstaat er geen tweede opvatting van "welke week is het" in
  --    SQL. Beide cycli moeten vandáág bevatten. Daarmee is het legitieme geval
  --    precies gekarakteriseerd — je verhuist van de cyclus waar je nú in zit
  --    naar de cyclus waar je onder de nieuwe dag nú in zit — en een `todo` uit
  --    een écht voorbije week haalt hem nooit.
  if v_vandaag < p_oude_start or v_vandaag >= p_oude_start + 7
     or v_vandaag < p_nieuwe_start or v_vandaag >= p_nieuwe_start + 7 then
    return jsonb_build_object('ok', false, 'reason', 'cyclus_bevat_vandaag_niet');
  end if;

  -- ---------------------------------------------------------------------
  -- De tweede grendel: een cyclus begint op de week-startdag — QS8-357
  -- ---------------------------------------------------------------------
  --
  -- ⚠️⚠️ **De venstertoets hierboven zegt niets over de dag waarop een cyclus
  --    begint**, en dat is precies wat 0198 als invariant vestigt. Die migratie
  --    doet dat met een -trigger op `weekly_goals`, en deze
  --    functie schrijft met een `update` — waar die trigger niet vuurt.
  --
  -- 📏 Gemeten vóór deze reparatie: `zet_week_startdag(4, <maandag>, <dinsdag>)`
  --    gaf `{ok: true, verzet: 1}` en zette `cycle_start_date` op een dinsdag,
  --    terwijl `week_start_day` op donderdag kwam te staan. Beide datums lagen
  --    binnen het venster, dus de toets hierboven zag er niets van.
  --
  -- ⚠️ **De vorm is die van `weekdoel_cyclus_klopt()`**, met opzet:
  --    `extract(dow from ...)::smallint`. Een tweede opvatting van "welke dag is
  --    dit" in SQL is precies wat correctheidsregel 7 verbiedt.
  if extract(dow from p_nieuwe_start)::smallint <> p_dag then
    return jsonb_build_object('ok', false, 'reason', 'cyclus_valt_niet_op_startdag');
  end if;

  -- ⚠️ **En de óude cyclus tegen de óude dag.** Zonder deze toets verhuist de
  --    RPC een rij die zelf al scheef stond: de uitkomst is dan recht, maar de
  --    selectie (`where w.cycle_start_date = p_oude_start`) niet — en dan
  --    verplaatst hij een weekdoel dat helemaal niet in de lopende cyclus hoorde.
  --
  -- ⚠️ Dit moet vóór de `update profiles` staan. Erna is `week_start_day` al de
  --    níeuwe dag en toetst deze regel zichzelf.
  -- ⚠️⚠️ **`for update`, en dat is geen overdaad — het is de reparatie van een
  --    gemeten race.** Zonder rijvergrendeling lezen twee gelijktijdige
  --    aanroepen dezelfde oude dag, komen ze allebei door beide toetsen heen, en
  --    schrijven ze daarna in willekeurige volgorde. 📏 Nagemeten met twaalf keer
  --    twee parallelle verzoeken: **elf keer** eindigde het met
  --    `week_start_day` ≠ `dow(cycle_start_date)` — precies de toestand die deze
  --    migratie zegt te sluiten.
  --
  --    Met de vergrendeling leest de tweede aanroeper de níeuwe dag en wordt hij
  --    correct geweigerd met `oude_cyclus_valt_niet_op_startdag`.
  --
  -- ⚠️ De race bestond al vóór deze migratie. Hij staat hier omdat dít de
  --    migratie is die beweert dat het gat dicht is, en een bewering die maar
  --    voor één verzoek tegelijk geldt, is geen grendel.
  select p.week_start_day into v_oude_dag
    from profiles p where p.id = v_uid
     for update;

  -- ⚠️ QS8-759 (0313): **een lopende weekbelofte houdt de startdag vast.** De
  --    startdag verschuift de lopende cyclus, en de week van de belofte is
  --    bevroren op de oude: weekdoelen zouden dan buiten haar periode vallen en
  --    de beslissing ziet ze niet meer. Zelfde vorm als `straf_staat_open` bij
  --    `zet_streefdatum()` (0184). Ná de `for update` hierboven, zodat de
  --    insertgrendel van x.3 (die `week_start_day` leest) hier niet langs kan.
  if exists (
    select 1
      from commitments c
      join goals g on g.id = c.goal_id
     where g.owner_id = v_uid
       and c.type = 'penalty'
       and c.status = 'set'
       and c.periode_start is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'weekbelofte_loopt');
  end if;

  -- ⚠️ `week_start_day` is `not null` met default 1, en een ontbrekend profiel is
  --    hierboven al afgevangen op `v_vandaag`. Deze `is not null` kán vandaag dus
  --    niet vuren; hij staat er defensief, en dat is met zoveel woorden gezegd in
  --    plaats van dat de tekst gedrag beschrijft dat niet bestaat.
  if v_oude_dag is not null
     and extract(dow from p_oude_start)::smallint <> v_oude_dag then
    return jsonb_build_object('ok', false, 'reason', 'oude_cyclus_valt_niet_op_startdag');
  end if;

  update profiles set week_start_day = p_dag where id = v_uid;

  -- ⚠️ Alleen als er iets te verhuizen valt. Bij gelijke data (de onboarding
  --    zet zijn dag terwijl er nog geen weekdoel bestaat) is dit een no-op, en
  --    dan hoort er geen lege `update` te draaien die `updated_at` aanraakt.
  if p_nieuwe_start <> p_oude_start then
    update weekly_goals w
       set cycle_start_date = p_nieuwe_start
      from goals g
     where g.id = w.goal_id
       and g.owner_id = v_uid
       and w.cycle_start_date = p_oude_start
       -- Alleen `todo`. Zie de kop voor de reden per status.
       and w.status = 'todo';

    get diagnostics v_verzet = row_count;
  end if;

  return jsonb_build_object('ok', true, 'verzet', v_verzet);
end;
$function$;

revoke all on function public.zet_week_startdag(smallint, date, date) from public, anon, authenticated;
grant execute on function public.zet_week_startdag(smallint, date, date) to authenticated;
