-- 0288_de_verlooppoort_meet_aan_de_bevroren_strafklok.sql — de verlooppoort van
-- `beslis_deadline_verzoek()` mat aan `profiles.tz`, en dat is de klok die de
-- gestrafte zelf zet (QS8-531)
--
-- ROLLBACK-PAD:
--   drop function if exists public.doeldatum(uuid, uuid);
--   `beslis_deadline_verzoek(uuid, boolean, text)` terug op de versie van 0177:
--   twee losse aanroepen van `eigenaarsdatum(r.requester_id)` in plaats van de
--   eenmalig berekende `v_vandaag`.
--   `vraag_deadline_verschuiving(uuid, uuid, date, text)` terug op de versie van
--   0208: `if p_new_date < mijn_datum() then`.
--   Verder niets: deze migratie raakt geen tabel, geen kolom en geen policy aan,
--   en `create or replace` behoudt de bestaande grants van die twee.
--
--   ⚠️ Terugdraaien zet het gat terug dat deze migratie sluit: een verlopen
--      uitstelverzoek is dan weer te verzilveren door de eigen tijdzone naar het
--      westen te zetten, en een `due` straf komt daarmee terug op `set`.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden in de security-ronde op QS8-530, en hier zelf nagemeten tegen
-- `pg_get_functiondef('public.beslis_deadline_verzoek(uuid,boolean,text)')` —
-- niet tegen 0171 of 0177, want een migratiebestand is niet de waarheid.
--
-- De functie stelde twee keer dezelfde vraag aan dezelfde klok:
--
--     if p_akkoord and r.new_date < eigenaarsdatum(r.requester_id) then
--       return jsonb_build_object('ok', false, 'reason', 'verzoek_verlopen');
--     ...
--     if r.new_date >= eigenaarsdatum(r.requester_id) then
--       update commitments c set status = 'set' ...
--
-- `r.requester_id` is de doeleigenaar, dus de gestrafte. `eigenaarsdatum()` is
-- `(now() at time zone profiles.tz)::date`, en 📏
-- `has_column_privilege('authenticated','public.profiles','tz','UPDATE')` is
-- `t` — hier nagemeten.
--
-- 📏 **End to end nagemeten** op 17-09-2026 om 14:40 UTC, als de goedkeurende
--    buddy, met echte rijen en teruggerold. Straf op `due`, verzoek `open`, en
--    als énige variabele de `profiles.tz` van de aanvrager:
--
--     zone                  verzoek        uitkomst                     straf
--     --------------------  -------------  ---------------------------  -----
--     Pacific/Kiritimati    2 dagen terug  verzoek_verlopen             due
--     UTC                   2 dagen terug  verzoek_verlopen             due
--     Etc/GMT+12            2 dagen terug  verzoek_verlopen             due
--     Pacific/Kiritimati    1 dag   terug  verzoek_verlopen             due
--     UTC                   1 dag   terug  ok, straffen_teruggezet: 1   set
--     Etc/GMT+12            1 dag   terug  ok, straffen_teruggezet: 1   set
--
-- ⚠️⚠️ **De onderste helft is het gat, en hij staat vierentwintig uur per dag
--    open.** Een verzoek van één dag te laat wordt geweigerd voor wie oostelijk
--    staat en gaat door voor wie westelijk staat — en `profiles.tz` is met één
--    PATCH te verzetten.
--
-- ⚠️ **De bovenste helft week af van de meting in het issue, en dat is geen
--    tegenspraak maar het uur van de dag.** Het issue mat `Etc/GMT+12` op twee
--    dagen wél door de poort; deze meting niet. De spreiding over alle zones is
--    26 uur, dus van 10:00 tot 12:00 UTC bestaan er drie datums tegelijk en de
--    rest van de dag twee (QS8-529). Het **bereik** is dus één dag of twee,
--    afhankelijk van het uur; dát er een bereik is, is constant. Een meting die
--    het uur niet noemt, laat de volgende lezer denken dat de twee elkaar
--    tegenspreken.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Besluit van Quinten, 17-09-2026: bevriezen op `commitments.tz`
-- ---------------------------------------------------------------------------
--
-- Dit is grens 1 — het verandert wanneer een straf verschuldigd is, en dat is
-- wat een gebruiker als consequentie beloofd is. Daarom voorgelegd en niet zelf
-- beslist, precies zoals 0280 dat deed.
--
-- Staat er een straf op het doel, dan meet de verlooppoort aan de zone die bij
-- het aangaan is vastgelegd (`commitments.tz`, bevroren sinds 0280) en niet aan
-- de levende `profiles.tz`. Dat is de enige van de drie opties die niemands
-- belofte verandert: je houdt de coulance die je had toen je je vastlegde.
--
-- ⚠️⚠️ **Hier stond "en je kunt hem achteraf niet meer verschuiven". Dat is te
--    sterk, en het is in de security-ronde op deze branch nagemeten.** De
--    bevroren zone van een bestáánde straf is niet te verzetten — 📏 `update
--    commitments set tz = …` als de eigenaar geeft `42501`, en
--    `bevries_commitmentzone()` werpt bovendien. Maar een straf is te
--    **annuleren en opnieuw aan te gaan**, en dan wordt de zone opnieuw
--    bevroren. Gemeten, als de eigenaar zelf, onder RLS:
--
--      1. straf aangegaan met profiel op Europe/Amsterdam  ->  tz = Europe/Amsterdam
--      2. update commitments set tz = 'Pacific/Midway'     ->  42501, geweigerd
--      3. profiel naar Midway, annuleren, opnieuw aangaan  ->  tz = Pacific/Midway
--      4. profiel terug naar Amsterdam                     ->  levende straf op Midway
--
--    ⚠️ **Dat is geen verruiming van deze migratie.** Vóór 0288 was dezelfde
--       speling er met één PATCH op `profiles.tz`, op het moment zelf en zonder
--       voorbereiding; nu kost het een annulering en een nieuwe afspraak, en het
--       laat een auditspoor achter (`noteer_commitment()` schrijft `cancelled`
--       en `confirmed` in `commitment_events`). Maar "je kunt hem niet meer
--       verschuiven" gold over de rij en niet over de afspraak, en dat verschil
--       hoort hier te staan in plaats van weggeschreven te worden: een
--       geruststelling die niet klopt, leest de volgende persoon als een reden
--       om er niet aan te twijfelen.
--
--    De route staat als toets in
--    `tests/rls/de-poort-onder-een-verlopen-verzoek.test.ts` en als QS8-536 in
--    Linear; hem sluiten is opnieuw grens 1.
--
-- Afgewezen: meten aan `deadline_requests.created_at` in UTC (neemt speling af
-- van wie oostelijk zit zonder dat hij iets fout deed) en laten staan (het gat
-- is geen randgeval). Afweging in
-- `docs/decisions/2026-09-17-de-poort-en-de-klok-eronder.md`.
--
-- ⚠️ **Staat er géén straf op het doel, dan blijft `eigenaarsdatum()` staan.**
--    Zonder commitment device is er geen consequentie om aan te sleutelen, en de
--    dag van de aanvrager is daar de juiste maat — dat is de reden die 0171 bij
--    deze poort opschreef en die blijft gelden. De bevriezing hangt aan de
--    straf, niet aan de poort.
--
-- ⚠️⚠️ **Eén waarde en geen twee aanroepen, en dat is de helft die het langst
--    meegaat.** De functie vroeg het twee keer los: één keer in de verlooppoort
--    en één keer in de terugzetter. Twee aanroepen van dezelfde vraag zijn twee
--    plekken waar de volgende schrijver er één kan verzetten — dezelfde vorm als
--    QS8-515, waar `create_group()` de naam met `btrim()` streek terwijl de CHECK
--    hem met `schone_naam()` toetste. `v_vandaag` wordt nu één keer bepaald.
--
-- ⚠️ **`max()` en niet `limit 1`, hoewel er er maar één kan zijn.** 📏 Gemeten:
--    `commitments_een_open_per_soort` is een unieke index op `(goal_id, type)`
--    waar `status in (set, unlocked, due)`, dus een doel draagt hoogstens één
--    open straf. `max()` geeft daar hetzelfde antwoord, en als die index ooit
--    verdwijnt kiest hij de **strengste** klok in plaats van een willekeurige.
--    Regel 18 vraag 6: dit is de plek waar "er is er precies één" een aanname
--    wordt zodra iemand die index aanraakt.
--
-- ⚠️ **`status in (set, due)` en niet alle statussen.** Een `resolved` of
--    `cancelled` straf is afgehandeld; zijn zone meenemen zou een afgesloten
--    afspraak nog laten meewegen in een poort die over een levende gaat.
--
-- ---------------------------------------------------------------------------
-- Wat hier níet in zit
-- ---------------------------------------------------------------------------
--
-- 📏 `eigenaarsdatum()` heeft zes aanroepers, en van die zes raken er twee
--    `commitments`: `wikkel_commitments_af()` (bevroren in 0280) en deze. De
--    andere vier — `herbereken_risico`, `plan_adempauze`, `weekdoel_cyclus_klopt`
--    en `zet_week_startdag` — beslissen niets over een consequentie en houden
--    terecht de levende zone. Geteld in `pg_proc`, niet geschat.
--
-- ⚠️ Het zevendaagse schild in `maak_straffen_verschuldigd()` heeft dezelfde
--    klasse en staat als QS8-533 open. Dat zit niet hier: `p_vandaag` komt daar
--    van buiten de database, uit `supabase/functions/rollover/index.ts`, en dat
--    is een andere laag met een ander risico. Eén branch per issue.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De andere kant van de naad gaat wél mee, en dat is geen uitbreiding maar
--       het wegnemen van een regressie die deze migratie zelf maakte
-- ---------------------------------------------------------------------------
--
-- `vraag_deadline_verschuiving()` weigert een verzoek op `p_new_date <
-- mijn_datum()` — de **levende** klok. Die twee konden vóór 0288 niet uit elkaar
-- lopen, want de beslisser mat aan diezelfde klok. Met alleen de besliskant
-- verzet, wél.
--
-- 📏 Gemeten op 17-09-2026, straf aangegaan in `Pacific/Kiritimati`, profiel
--    daarna naar `Pacific/Midway` — een doodgewone verhuizing en geen aanval:
--
--      INDIENEN  met new_date = 2026-09-17 (= mijn_datum())  ->  ok: true
--      BESLISSEN direct erna                                 ->  verzoek_verlopen
--      bevroren strafklok Kiritimati -> 2026-09-18
--      levende profielzone Midway    -> 2026-09-17
--
--    Het verzoek blijft `open` (0171 by design) en `already_open` blokkeert een
--    nieuw verzoek, dus de gebruiker moet het eerst intrekken. Geen doodlopende
--    weg, wel een deterministische regressie voor iedereen wiens profielzone
--    westelijk van zijn strafzone staat — en precies de fout die dit issue
--    repareert, één laag hoger teruggelegd. Gevonden in de security-ronde op
--    deze branch.
--
-- Daarom staat de vraag vanaf nu op één plek: `public.doeldatum(goal, eigenaar)`.
-- Beide kanten van de naad roepen hem aan, dus ze kunnen niet meer uit elkaar
-- lopen zonder dat iemand die ene functie verzet.
--
-- ⚠️ **Dat is de enige reden dat `vraag_deadline_verschuiving()` hier staat.**
--    De rest van die functie is woordelijk die van 0208; alleen de datumregel
--    verandert.

/**
 * De dag waaraan een streefdatum van dít doel gemeten wordt — QS8-531.
 *
 * ⚠️ Staat er een levende straf op het doel, dan is dat de dag in de zone die
 *    bij het aangaan is bevroren (`commitments.tz`, 0280). Anders de dag van de
 *    eigenaar — de regel die 0171 en 0208 met reden opschreven: zonder
 *    commitment device is er geen consequentie om aan te sleutelen.
 *
 * ⚠️⚠️ **Eén functie en geen twee gelijke regels.** Hij wordt aangeroepen door
 *    `vraag_deadline_verschuiving()` (mag ik dit vragen) en door
 *    `beslis_deadline_verzoek()` (is dit nog te beslissen). Die twee moeten
 *    hetzelfde antwoord geven; de enige manier om dat vast te houden is één
 *    bron. De kop draagt de meting van wat er gebeurde toen ze uiteenliepen.
 *
 * ⚠️ `max()` hoewel `commitments_een_open_per_soort` er hoogstens één toelaat:
 *    zo wint de strengste klok in plaats van een willekeurige als die index ooit
 *    verdwijnt.
 *
 * ⚠️⚠️ **`status in (set, due)` is vandaag volledig voor een straf, en dat is
 *    gemeten en niet aangenomen.** Elke plek die `unlocked` zet draagt
 *    `and type = 'reward'` (0057, 0134, 0238, 0280), dus een straf komt er nooit
 *    op. Zou dat ooit veranderen, dan geeft `max()` hier `null` en valt deze
 *    functie stil terug op de levende klok — een fail-open door omissie.
 *    `tests/rls/de-poort-onder-een-verlopen-verzoek.test.ts` legt die aanname
 *    vast in plaats van erop te vertrouwen.
 *
 * ⚠️ `current_date` is de terugval achter de terugval en staat met zijn reden in
 *    het register van `scripts/klokgrens-controle.mjs`.
 */
create or replace function public.doeldatum(p_goal_id uuid, p_eigenaar uuid)
  returns date
  language sql
  stable
  security definer
  set search_path = public, pg_catalog, pg_temp
as $$
  select coalesce(
    (select max((now() at time zone c.tz)::date)
       from commitments c
      where c.goal_id = p_goal_id
        and c.type    = 'penalty'
        and c.status in ('set', 'due')),
    eigenaarsdatum(p_eigenaar),
    current_date
  );
$$;

comment on function public.doeldatum(uuid, uuid) is
  'De dag waaraan een streefdatum van dit doel gemeten wordt: de bevroren '
  'commitments.tz van de levende straf, anders de dag van de eigenaar. Eén bron '
  'voor vraag_deadline_verschuiving() en beslis_deadline_verzoek() (QS8-531, '
  'migratie 0288).';

-- ⚠️ **`from public, anon, authenticated` en niet `from public, anon`.** In
--    Supabase deelt `alter default privileges` élke nieuwe functie uit aan
--    `anon`, `authenticated` én `service_role`, en `revoke ... from public, anon`
--    houdt precies de rol over waaronder iedere ingelogde gebruiker draait.
--
-- ⚠️ **En hier hoort géén `grant` tegenover te staan.** Deze functie wordt
--    uitsluitend aangeroepen vanuit twee `security definer`-functies die als
--    eigenaar draaien. Hij leest de bevroren zone van een straf, en dat is
--    precies wat `commitments.tz` buiten elke kolomgrant houdt — hem hier
--    uitdelen zou die grens langs de achterdeur openzetten.
revoke all on function public.doeldatum(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.beslis_deadline_verzoek(p_request_id uuid, p_akkoord boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r          deadline_requests%rowtype;
  g          goals%rowtype;
  schoon     text := nullif(btrim(coalesce(p_note, '')), '');
  teruggezet integer := 0;
  v_vandaag  date;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into r from deadline_requests where id = p_request_id;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  if r.requester_id = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yourself');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = r.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if schoon is not null and char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  -- ⚠️⚠️ **De klok, één keer bepaald** — QS8-531, besluit van Quinten.
  --
  --    Staat er een levende straf op dit doel, dan is de maat de zone die bij
  --    het aangaan is vastgelegd (`commitments.tz`, bevroren sinds 0280). Die
  --    kolom staat in géén enkele grant aan `authenticated`; de zone in zijn
  --    profiel wél, en 📏
  --    `has_column_privilege('authenticated','public.profiles','tz','UPDATE')`
  --    is `t`. Wát die bevriezing vastlegt en wat níet, staat in de kop — lees
  --    dat vóór je hier een geruststelling uit afleidt.
  --
  --    Staat er géén straf, dan blijft de dag van de aanvrager de maat: zonder
  --    commitment device is er geen consequentie om aan te sleutelen, en dat is
  --    de reden die 0171 bij deze poort opschreef. Zie de kop.
  --
  v_vandaag := doeldatum(r.goal_id, r.requester_id);

  -- ⚠️ **Alleen bij een akkoord, en alleen als de gevraagde datum al voorbij
  --    is.** Afwijzen mag altijd — dat verschuift niets en laat niets afgaan.
  --
  -- ⚠️ Vóór de `update` op `deadline_requests`, zodat het verzoek `open` blijft
  --    in plaats van als beslist weggeschreven te worden.
  if p_akkoord and r.new_date < v_vandaag then
    return jsonb_build_object('ok', false, 'reason', 'verzoek_verlopen');
  end if;

  update deadline_requests
  set status        = case when p_akkoord then 'approved' else 'rejected' end,
      decided_by    = auth.uid(),
      decided_at    = now(),
      decision_note = schoon
  where id = r.id;

  if not p_akkoord then
    return jsonb_build_object('ok', true, 'moved', false);
  end if;

  select * into g from goals where id = r.goal_id;

  update goals set target_date = r.new_date where id = r.goal_id;

  -- ⚠️ **De straf komt terug van `due` naar `set`** (QS8-308). Domeinregel 11:
  --    een straf treedt alleen in werking bij een verstreken deadline, en die
  --    is dat na deze verschuiving niet meer. Zonder dit blok blijft hij
  --    verschuldigd terwijl zijn voorwaarde vervallen is.
  --
  -- ⚠️ **Alleen `penalty` en alleen vanaf `due`.** Een `resolved` of
  --    `cancelled` straf is afgehandeld en komt nooit terug; een beloning heeft
  --    met de streefdatum niets te maken.
  --
  -- ⚠️ **En alleen als de nieuwe datum écht in de toekomst ligt.** De verlooptak
  --    hierboven dekt dat al, maar deze voorwaarde staat er zodat het blok op
  --    zichzelf klopt: hij zet niets terug waarvan de reden nog geldt.
  --
  -- ⚠️⚠️ **Dezelfde `v_vandaag` als de poort hierboven, en niet een tweede
  --    aanroep.** Tot 0288 stond hier dezelfde vraag nog een keer los gesteld.
  --    Twee plekken die hetzelfde moeten weten, zijn twee plekken waar de
  --    volgende schrijver er één kan verzetten (QS8-531).
  --
  -- ⚠️ `commitments_update` heeft `using (status = 'set' …)`, dus vanaf `due` is
  --    deze kolom voor geen enkele client te verzetten. Dat dit hier kan, komt
  --    doordat deze functie `security definer` is — en dat is precies waarom
  --    het auditspoor eronder niet optioneel is (domeinregel 6). De trigger
  --    `commitments_audit` schrijft de `reverted`-rij.
  --
  -- ⚠️ **Hier stond "sinds deze migratie heet die overgang ook zo in plaats van
  --    `triggered`". Dat sloeg op 0177 en is met de functie meegekomen uit
  --    `pg_get_functiondef()`; 0288 raakt `noteer_commitment()` niet aan.** 📏 De
  --    `reverted`-tak staat er sinds 0177 en is herhaald in 0220. Een lezer die
  --    0288 terugdraait, zou anders denken dat hij de auditnaam meeneemt — en dat
  --    is precies de kostbare kant van een commentaar dat met code meereist.
  if r.new_date >= v_vandaag then
    update commitments c
       set status = 'set'
     where c.goal_id = r.goal_id
       and c.type = 'penalty'
       and c.status = 'due';

    get diagnostics teruggezet = row_count;
  end if;

  -- ⚠️ De goedkeurder staat sinds 0085 in `approved_by_id` en niet meer in
  --    `new_value`: een uuid in jsonb heeft geen foreign key en overleeft dus
  --    het verwijderen van dat account.
  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value, approved_by_id)
  values (r.goal_id, r.requester_id, 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', r.new_date, 'request_id', r.id,
                             'straffen_teruggezet', teruggezet),
          auth.uid());

  return jsonb_build_object('ok', true, 'moved', true, 'straffen_teruggezet', teruggezet);
end;
$function$;


comment on function public.beslis_deadline_verzoek(uuid, boolean, text) is
  'Beslist over een uitstelverzoek. De verlooppoort en de terugzetter meten '
  'allebei aan dezelfde dag: de bevroren commitments.tz als er een levende '
  'straf op het doel staat, anders de dag van de aanvrager (QS8-531, '
  'migratie 0288).';

-- ---------------------------------------------------------------------------
-- De andere kant van de naad
-- ---------------------------------------------------------------------------
--
-- ⚠️ Uit `pg_get_functiondef()` overgenomen en niet uit 0208 gereconstrueerd —
--    de les van 0084. Eén regel anders: de datumgrens.

CREATE OR REPLACE FUNCTION public.vraag_deadline_verschuiving(p_goal_id uuid, p_group_id uuid, p_new_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g        goals%rowtype;
  schoon   text := btrim(coalesce(p_reason, ''));
  nieuw    uuid;
  vandaag  integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if not exists (
    select 1 from goal_group_links l
    where l.goal_id = p_goal_id and l.group_id = p_group_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_linked');
  end if;

  -- ⚠️ **Is hier iemand die ja kan zeggen?** (QS8-309) `beslis_deadline_verzoek()`
  --    weigert de aanvrager met `not_yourself`, dus in een groep waar jij het
  --    enige actieve lid bent kan niemand dit verzoek beslissen — het kan
  --    alleen verlopen. Sinds 0174 houdt zo'n verzoek bovendien een straf
  --    tegen, en dan is het een schild dat niemand kan wegnemen.
  --
  -- ⚠️ Vóór de datum- en tekstcontroles: dit is een eigenschap van de groep en
  --    niet van wat je invult, dus het is eerlijker om het meteen te zeggen dan
  --    pas nadat iemand twintig tekens motivatie heeft getypt.
  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id <> auth.uid()
      and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'geen_beslisser');
  end if;

  if p_new_date is null or p_new_date = g.target_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). Niet
  --    `current_date`: de grens is de dag van de gebruiker en niet die van de
  --    server, anders wordt iemand op UTC-10 geweigerd op zijn eigen vandaag.
  --
  -- ⚠️⚠️ **`doeldatum()` en niet `mijn_datum()`** — QS8-531, migratie 0288.
  --    Staat er een straf op dit doel, dan beslist `beslis_deadline_verzoek()`
  --    aan de bevroren strafklok. Bleef hier `mijn_datum()` staan, dan zou deze
  --    functie een verzoek accepteren dat de beslisser onmiddellijk `verlopen`
  --    noemt — gemeten, zie de kop van 0288. De vraag en het antwoord horen aan
  --    dezelfde klok te hangen.
  --
  -- ⚠️ `auth.uid()` is hier de eigenaar: een eind hierboven staat `not_owner`
  --    voor iedereen die dat niet is.
  if p_new_date < doeldatum(p_goal_id, (select auth.uid())) then
    return jsonb_build_object('ok', false, 'reason', 'datum_in_verleden');
  end if;

  if char_length(schoon) < 20 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_short');
  end if;

  if char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;

  if exists (
    select 1 from deadline_requests r where r.goal_id = p_goal_id and r.status = 'open'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_open');
  end if;

  select count(*) into vandaag
  from deadline_requests r
  where r.requester_id = auth.uid()
    and r.created_at > now() - interval '1 day';

  if vandaag >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into deadline_requests
    (goal_id, group_id, requester_id, old_date, new_date, reason)
  values
    (p_goal_id, p_group_id, auth.uid(), g.target_date, p_new_date, schoon)
  returning id into nieuw;

  begin
    perform plaats_systeembericht(
      p_group_id,
      'deadline_requested',
      'Een lid vraagt de groep om een streefdatum te verschuiven.'
    );
  exception
    when others then
      raise warning 'Systeembericht deadline_requested is niet geplaatst: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'request_id', nieuw);
end;
$function$;
