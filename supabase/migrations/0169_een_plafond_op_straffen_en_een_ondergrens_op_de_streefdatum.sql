-- 0169_een_plafond_op_straffen_en_een_ondergrens_op_de_streefdatum.sql — één openstaand commitment per soort per doel, een streefdatum die niet in het verleden begint, en geen straf op een verstreken deadline (QS8-293)
--
-- ROLLBACK-PAD:
--   drop index if exists commitments_een_open_per_soort;
--   drop function if exists mijn_datum();
--   plus `create or replace` op `goals_insert`, `commitments_insert`,
--   `zet_streefdatum()` en `vraag_deadline_verschuiving()` zonder de datumgrens
--   — de vorige definities staan in 0001, 0032, 0110 en 0168.
--   ⚠️ De index droppen kan altijd; de grens weghalen ook. Er gaat bij een
--   terugzet niets verloren, want deze migratie voegt alleen weigeringen toe.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Security-ronde op QS8-228, waar twee reviews los van elkaar hetzelfde maten.
-- Als gewone `authenticated`-gebruiker, end-to-end:
--
--   doel met target_date = current_date - 30           -> INSERT 0 1
--   5 straffen op dat doel, allemaal bob als getuige   -> INSERT 0 5
--   maak_straffen_verschuldigd(alice, current_date)    -> 5
--   bob leest                                          -> 5 rijen, met de body
--
-- QS8-228 gaf een straf één persoon als begunstigde. Dáárvoor was de
-- begunstigde een **groep waar je zelf al lid van was**; nu is het een
-- **aangewezen individu** die er niet om gevraagd heeft, de rij niet kan
-- verwijderen en op dit oppervlak geen blokkeerknop heeft. Vijf kunnen er
-- vijfduizend zijn, elk met 500 tekens vrije tekst.
--
-- Onwrikbare regel 5 eist een limiet bij uitnodigingen, en dit is dezelfde
-- klasse — commitments stonden alleen niet in die opsomming.
--
-- ---------------------------------------------------------------------------
-- Drie grenzen, en de derde is er pas na de meting bijgekomen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Hier stond eerst "twee grenzen, en samen sluiten ze de route". Dat was
-- niet waar, en de security-ronde op deze branch heeft het aangetoond: grens 2
-- bewaakt het aanmaken van een doel en niet het aanhaken van een straf. De
-- derde grens onderaan dit bestand is de reparatie. De les hoort hier te
-- blijven staan: **twee grenzen die elk hun eigen onderdeel bewaken, bewijzen
-- niets over het geheel dat ertussen zit.**
--
-- **1. Eén openstaand commitment per soort per doel.** Het scherm nam dat al
-- aan: `app/doel/[id].tsx` zoekt de straf met `.find(c => c.type === 'penalty')`
-- en toont er precies één. Stonden er meer, dan zag de eigenaar de rest niet en
-- haalde `trekIn()` er één weg terwijl de andere bleven staan en later alsnog
-- verschuldigd werden. Dat is regel 18 vraag 6: een aanname dat er "altijd
-- precies één" is, terwijl er meer konden zijn.
--
-- ⚠️ **`resolved` en `cancelled` tellen niet mee**, en dat is de reden dat dit
-- een partiële index is en geen gewone. Een ingetrokken straf hoort je niet voor
-- altijd te blokkeren; intrekken en opnieuw vastleggen moet kunnen.
--
-- **2. Een streefdatum begint niet in het verleden.** Zonder die grens is een
-- doel met `current_date - 30` de kortste weg naar een straf die meteen
-- verschuldigd is.
--
-- ⚠️ **Op drie plekken en niet op één**, want een grens die alleen bij het
-- aanmaken geldt, verplaats je met de eerste de beste verzetknop. De drie
-- schrijvers zijn gemeten en niet geraden: `goals_insert` (de enige INSERT-route
-- — `authenticated` heeft geen UPDATE-grant op `target_date`),
-- `zet_streefdatum()` en `vraag_deadline_verschuiving()`.
--
-- ⚠️ **`beslis_deadline_verzoek()` krijgt hem met opzet niet.** Een verzoek dat
-- bij het indienen geldig was, mag niet stranden doordat een buddy er een week
-- over doet. De datum is dan al met een mens afgesproken; hem bij de goedkeuring
-- alsnog weigeren zou de gebruiker straffen voor de traagheid van een ander.
-- Dat een goedgekeurde datum inmiddels verstreken is, is een waar antwoord en
-- geen aanval — de rem daar is het akkoord van de buddy (A7).
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom er een nieuwe hulpfunctie bij komt
-- ---------------------------------------------------------------------------
--
-- De grens is "niet vóór vandaag", en *vandaag* is de dag van de **gebruiker**
-- en niet van de server. `current_date` is UTC; iemand op UTC-10 die zijn eigen
-- vandaag invult, zou geweigerd worden.
--
-- `eigenaarsdatum(uid)` doet dit al, maar `authenticated` mag hem niet
-- uitvoeren, en dat hoort zo te blijven: hij neemt een wíllekeurige uid aan en
-- geeft de lokale datum van die persoon terug — dat is andermans tijdzone. Hem
-- opengooien zou bovendien de vierde tak van `definer_bewaking()` (0167) op zijn
-- kop zetten: definer, uitvoerbaar door `authenticated`, geen `auth.uid()` in
-- het lichaam.
--
-- `mijn_datum()` neemt daarom geen argument. Hij noemt `auth.uid()` zelf, lekt
-- niets over een ander, en past daarmee in dezelfde tak.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create unique index if not exists`, `create or replace` op drie
-- functies, en de policy wordt eerst gedropt.
-- ---------------------------------------------------------------------------

/**
 * De dag van vandaag, in de tijdzone van de aanroeper zelf.
 *
 * ⚠️ Geen argument, en dat is het hele verschil met `eigenaarsdatum(uid)`. Deze
 *    mag `authenticated` uitvoeren omdat hij niets over een ánder kan zeggen.
 *
 * ⚠️ Geeft `null` als er geen profiel is. Elke vergelijking ermee wordt dan
 *    `null`, en een policy die `null` teruggeeft weigert — dat is de juiste kant
 *    om op te falen.
 */
create or replace function mijn_datum()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone p.tz)::date
  from profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function mijn_datum() from public, anon, authenticated;
grant execute on function mijn_datum() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Eén openstaand commitment per soort per doel
-- ---------------------------------------------------------------------------

create unique index if not exists commitments_een_open_per_soort
  on commitments (goal_id, type)
  where status in ('set', 'unlocked', 'due');

-- ---------------------------------------------------------------------------
-- 2. Een streefdatum begint niet in het verleden
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een CHECK kan dit niet: `current_date` en `mijn_datum()` zijn niet
--    immutable, en Postgres weigert die in een CHECK. Dit hoort dus in de policy
--    en in de twee functies die de kolom nog schrijven.
--
-- ⚠️ **`>=` en niet `>`, en dat wijkt bewust af van de client.**
--    `datumLigtInDeToekomst()` in `src/modules/goals/schemas.ts` eist `datum >
--    vandaag`: een doel moet minstens tot morgen lopen. Dat is een
--    **productregel**. Deze grens is een **misbruikgrens**: een deadline begint
--    niet in het verleden. Twee verschillende regels met twee verschillende
--    doelen, en de database is met opzet de ruimere van de twee — anders
--    weigert hij ooit iets wat een legitieme route wél mag produceren, en dan
--    is de gebruiker de dupe van een grens die voor een aanvaller bedoeld was.
--    De kant waarop ze mogen verschillen is deze: de database weigert nooit wat
--    de client toelaat.
drop policy if exists goals_insert on goals;
create policy goals_insert on goals
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and target_date >= mijn_datum()
  );

create or replace function zet_streefdatum(p_goal_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). `mijn_datum()`
  --    en niet `current_date`: de grens is de dag van de gebruiker en niet die
  --    van de server, anders wordt iemand op UTC-10 geweigerd op zijn eigen
  --    vandaag.
  if p_date < mijn_datum() then
    return jsonb_build_object('ok', false, 'reason', 'datum_in_verleden');
  end if;

  -- ⚠️ Gekoppeld aan een groep? Dan loopt het via een verzoek. Dit is het punt
  --    waar het besluit van A7 wordt afgedwongen, en het is geen UI-regel.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_group_approval');
  end if;

  -- ⚠️ En dit is de tak die de omweg dichtzet. Zonder haar is de regel hierboven
  --    een momentopname, en drie verzoeken zijn genoeg om er langs te lopen.
  --    Zie de kop: gemeten, niet vermoed.
  if g.losgekoppeld_op is not null and g.losgekoppeld_op > now() - interval '7 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'recent_ontkoppeld',
      'weer_toegestaan_op', (g.losgekoppeld_op + interval '7 days')
    );
  end if;

  if p_date = g.target_date then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update goals set target_date = p_date where id = p_goal_id;

  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value)
  values (p_goal_id, auth.uid(), 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', p_date));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

create or replace function vraag_deadline_verschuiving(p_goal_id uuid, p_group_id uuid, p_new_date date, p_reason text)
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

  if p_new_date is null or p_new_date = g.target_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). `mijn_datum()`
  --    en niet `current_date`: de grens is de dag van de gebruiker en niet die
  --    van de server, anders wordt iemand op UTC-10 geweigerd op zijn eigen
  --    vandaag.
  if p_new_date < mijn_datum() then
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
      weergavenaam(auth.uid()) || ' vraagt de groep om een streefdatum te verschuiven.'
    );
  exception
    when others then
      raise warning 'Systeembericht deadline_requested is niet geplaatst: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'request_id', nieuw);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Een straf hangt niet aan een doel waarvan de deadline al verstreken is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de naad, en hij lekte.** Grens 2 hierboven bewaakt het *aanmaken*
--    van een doel. Grens 1 bewaakt het *aantal* straffen. Allebei correct, en
--    samen dekten ze de aanval niet af — want een straf is een tweede handeling
--    op een later moment, en tussen die twee handelingen kan de datum verstrijken.
--
--    Gemeten als gewone `authenticated`-gebruiker, tegen de draaiende database
--    met grens 1 en 2 er al in:
--
--      A doel met target_date = vandaag        -> aangemaakt als gebruiker | 1
--      B straf op een verstreken deadline      -> aangemaakt als gebruiker | 1
--      C maak_straffen_verschuldigd(...)       -> 1
--      D status                                -> due
--
--    Eén dag wachten en de route uit de kop van deze migratie ligt weer open:
--    twintig doelen met de datum van vandaag, morgen bij elk een straf met
--    dezelfde persoon als getuige. Dat is regel 18 vraag 1 in zijn zuiverste
--    vorm — twee grenzen die elk hun eigen onderdeel bewaken, met de belofte
--    ertussenin.
--
-- ⚠️ **Alleen `penalty`.** Een beloning geeft niemand leesrecht en legt niemand
--    iets op; hem aan een verstreken doel hangen is hooguit zinloos. Domeinregel
--    11 gaat over de straf, en dit is de grens die daarbij hoort.
--
-- ⚠️ **In de policy en niet in `bewaak_begunstigde()`**, en dat is dezelfde
--    afweging als bij de bandtoets een stuk hoger in dit bestand: de grens gaat
--    over wat een *gebruiker* zelf mag vastleggen, en hij hangt aan
--    `mijn_datum()` — dat is `auth.uid()`, en die is leeg in de rollover. In de
--    trigger zou hij `service_role` stilzwijgend blokkeren of, met de
--    eigenaarsdatum erin, een tweede kopie van een regel worden die dan niet
--    los te ijken is. Eén plek, en de ijking kan erbij.
--
-- ⚠️ **Wat hiermee niet dicht is, en dat staat ook in `ENGINEER-REVIEW.md`:**
--    `profiles.tz` is van de gebruiker zelf, dus `mijn_datum()` is met een
--    geldige zone (0119 toetst tegen `pg_timezone_names`) één dag te verzetten —
--    UTC-12 tot UTC+14 spant precies `current_date - 1` tot `current_date + 1`.
--    Een absolute vloer `>= current_date - 1` erbij zou dus nóóit binden en is
--    daarom niet toegevoegd: dat is een conjunct die er streng uitziet en niets
--    weigert. De speling is één dag en inherent aan tijdzones; de vector die
--    overblijft loopt via het aantal doelen, en dáár zit geen grens op.
drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments
  for insert to authenticated
  with check (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    and status = 'set'
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
    and (
      type <> 'penalty'
      or exists (
        select 1 from goals g
        where g.id = commitments.goal_id and g.target_date >= mijn_datum()
      )
    )
  );
