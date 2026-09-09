-- 0213_een_systeembericht_bakt_geen_naam_meer_in.sql — de weergavenaam wordt niet
-- meer als platte tekst in `chat_messages.body` gebakken; het scherm rendert hem
-- toch al uit de catalogus met een verse join (QS8-372)
--
-- ROLLBACK-PAD:
--   Zet de acht functies terug naar hun vorm van vóór deze migratie (0059 t/m
--   0212, elk een `create or replace`). De bodies van bestaande systeemberichten
--   zijn dan níét terug te draaien: de naam die eruit gehaald is, staat er niet
--   meer. Dat is precies de bedoeling — het is een AVG-wissing en geen
--   opmaakwijziging.
--
--   ⚠️ Draai je `trek_goedkeuring_in()` terug zonder de bodies terug te zetten,
--      dan zoekt hij weer op `body = tekst` en vindt hij niets meer. Die twee
--      horen bij elkaar.
--
-- ---------------------------------------------------------------------------
-- Wat er lekte
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-ronde op de branch van QS8-335. **Ouder dan die
-- branch.**
--
-- Acht functies bakten de weergavenaam als platte tekst in `chat_messages.body`
-- op het moment dat ze het bericht plaatsten. Het scherm is netjes: sinds 0059
-- rendert `systeemberichtTekst()` uit de catalogus met `naam(subject_name)`, en
-- na een accountverwijdering is `subject_name` `null` — dus daar staat "Een
-- oud-lid".
--
-- De database niet. `groepschat()` geeft `body` gewoon terug, en `authenticated`
-- heeft kolom-SELECT op `chat_messages.body`. Eén verzoek volstaat:
--
--   supabase.from('chat_messages').select('body').eq('group_id', …)
--   → "Alice heeft een doel afgerond."
--
-- De naam die volgens het scherm gewist is, staat er nog. Dat is letterlijk de
-- tweede vraag uit domeinregel 7: *kan iemand dat met één API-verzoek uitlezen
-- buiten de UI om?*
--
-- ⚠️ **Het issue noemde er vijf; het waren er acht.** `meld_commitment()` (twee
--    gebeurtenissen) en `vraag_deadline_verschuiving()` stonden er niet bij, en
--    `trek_goedkeuring_in()` bouwde de zin zelfs opnieuw op. 📏 Gevonden met een
--    scan over `pg_proc.prosrc` op `weergavenaam(` in plaats van met de lijst uit
--    het issue.
--
-- ---------------------------------------------------------------------------
-- Waarom de body en niet de leesroute
-- ---------------------------------------------------------------------------
--
-- Het issue noemde drie richtingen. De eerste — `groepschat()` de body laten
-- inhouden — sluit maar één van de twee routes: een kale
-- `select body from chat_messages` loopt er omheen, en acceptatiecriterium 1
-- noemt die met zoveel woorden.
--
-- 📏 Die route dichtzetten met een kolomgrant kán niet zonder de autorisatie te
--    verbouwen: `groepschat()` is `SECURITY INVOKER` en leunt op
--    `chat_messages_select` voor het lidmaatschap. Neem je `authenticated` het
--    SELECT-recht op `body` af, dan breekt de functie zelf. Er `SECURITY DEFINER`
--    van maken zou betekenen dat de lidmaatschapstoets met de hand in de functie
--    moet — een nieuwe definer-functie op een leesoppervlak, precies waar QS8-181
--    al over gaat.
--
-- **Dus de naam gaat uit de body.** Dan is er geen route meer om te sluiten: niet
-- de RPC, niet de kale select, niet realtime, en ook geen route die morgen
-- bedacht wordt. En het is een echte wissing in plaats van een afscherming.
--
-- ⚠️ **Dit raakt de onveranderlijkheid uit beslisdocument 002 §3 niet.** Die
--    regel gaat over wat er gebeurd is: wie, wat, wanneer. Dat blijft ongemoeid —
--    `system_event`, `subject_id`, `actor_id`, `payload` en `created_at`
--    veranderen niet. Wat hier verandert is de **terugvalzin**, en die is
--    machinaal gemaakt en wordt in het normale pad niet eens getoond. Niemand
--    heeft hem geschreven, dus er wordt niemands woorden herschreven.
--
-- ---------------------------------------------------------------------------
-- De naad die dit blootlegde
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`trek_goedkeuring_in()` gebruikte de zin als sleutel.** Hij bouwde
--    `weergavenaam(approver) || ' bevestigde de week van ' ||
--    weergavenaam(subject)` opnieuw op en zocht het bericht met `body = tekst`,
--    om het te verwijderen als een bevestiging werd ingetrokken.
--
-- Dat werkte alleen zolang er een naam in stond. Zonder naam dragen twee
-- bevestigingen van dezelfde beoordelaar voor dezelfde persoon in dezelfde groep
-- exact dezelfde tekst; `treffers` wordt 2, de `if` slaat over, en er blijft een
-- bericht staan dat zegt dat een week bevestigd is terwijl de bevestiging is
-- ingetrokken.
--
-- Dat is onwrikbare regel 18 vraag 6: deze wijziging tilt een aanname van "er is
-- er altijd precies één" naar "er kunnen er meer zijn". Het bericht draagt daarom
-- sinds deze migratie zijn `completion_id` in `payload`, en daar wordt op gezocht.
--
-- ⚠️ Een voltooiing is geen persoon, dus dat mag in `payload`. De regel uit 0059
--    is dat er nóóit een **persoon** in gaat: een uuid in jsonb heeft geen foreign
--    key en overleeft een accountverwijdering. Een `completion_id` cascadeert juist
--    mee en blijft als betekenisloze waarde achter.
--
-- ⚠️ **Bestaande `completion_approved`-berichten krijgen die `completion_id`
--    niet**, want er is geen betrouwbare koppeling terug — dat gemis ís het
--    probleem. Gevolg: een bevestiging die op het moment van uitrollen nog binnen
--    haar intrekvenster van vijftien minuten valt, laat bij intrekken haar bericht
--    staan. Vijftien minuten, en de conservatieve kant op (een bericht te veel,
--    nooit een bericht te weinig).
--
-- Volledige afweging: docs/decisions/002-domeinregel7-oppervlakken.md §3.
--
-- ---------------------------------------------------------------------------
-- De bestaande voorraad
-- ---------------------------------------------------------------------------

update chat_messages set body = 'Een lid heeft een doel afgerond.'
 where type = 'system' and system_event = 'goal_completed';

update chat_messages set body = 'Een lid doet mee.'
 where type = 'system' and system_event = 'member_joined';

update chat_messages set body = 'Een lid heeft een mijlpaal gehaald.'
 where type = 'system' and system_event = 'milestone_done';

update chat_messages set body = 'Een lid heeft een week afgerond en wacht op bevestiging.'
 where type = 'system' and system_event = 'completion_pending';

update chat_messages set body = 'Een lid bevestigde de week van een ander.'
 where type = 'system' and system_event = 'completion_approved';

update chat_messages set body = 'Een lid heeft een beloning vrijgespeeld.'
 where type = 'system' and system_event = 'commitment_unlocked';

update chat_messages set body = 'De inzet die een lid zelf heeft ingesteld, is verschuldigd geworden.'
 where type = 'system' and system_event = 'commitment_due';

update chat_messages set body = 'Een lid vraagt de groep om een streefdatum te verschuiven.'
 where type = 'system' and system_event = 'deadline_requested';

-- ---------------------------------------------------------------------------
-- De acht functies
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.meld_commitment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_id uuid;
begin
  begin
    if old.status = new.status then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    if new.type = 'reward' and new.status = 'unlocked' then
      perform plaats_systeembericht_in_doelgroepen(
        new.goal_id,
        'commitment_unlocked',
        'Een lid heeft een beloning vrijgespeeld.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_unlocked', 'bereik', 'doelgroepen'));

    elsif new.type = 'penalty'
      and new.status = 'due'
      and new.beneficiary_group_id is not null
    then
      perform plaats_systeembericht(
        new.beneficiary_group_id,
        'commitment_due',
        'De inzet die een lid zelf heeft ingesteld, is verschuldigd geworden.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_due',
                                 'bereik', 'begunstigde_groep',
                                 'group_id', new.beneficiary_group_id));
    end if;
  exception
    when others then
      raise warning 'Systeembericht voor commitment % is niet geplaatst: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.meld_doel_af()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    if new.status <> 'completed' or old.status = 'completed' then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.id,
      'goal_completed',
      'Een lid heeft een doel afgerond.',
      new.owner_id
    );
  exception
    when others then
      raise warning 'Systeembericht goal_completed is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.meld_goedkeuring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    if new.status <> 'approved' then return new; end if;

    -- ⚠️ **Pas melden als de week het ook echt gehaald heeft** (QS8-65). Zonder
    --    deze regel verschijnt "bevestigde de week van X" in de groepschat op de
    --    eerste van drie bevestigingen, en dan staat er iets in de feed dat niet
    --    waar is. Bij `approval_rule = 'any'` is de drempel 1 en gedraagt hij
    --    zich precies als voorheen.
    --
    -- ⚠️ Bewust `gehaald` en niet "de bevestiging die hem tipte": wie als vierde
    --    bevestigt op een week die er drie nodig had, hééft die week bevestigd.
    --    Dat is een positief signaal en domeinregel 7 gunt de groep die.
    if not goedkeuringsdrempel_gehaald(new.completion_id) then return new; end if;

    -- De enige gebeurtenis met twee personen: `subject_id` is degene wiens week
    -- bevestigd is, `actor_id` de buddy die het deed.
    perform plaats_systeembericht(
      new.group_id,
      'completion_approved',
      'Een lid bevestigde de week van een ander.',
      new.subject_id,
      new.approver_id,
      -- ⚠️ **De voltooiing, zodat `trek_goedkeuring_in()` dit bericht kan
      --    terugvinden zonder de zin te lezen.** Zie de kop van 0213: die
      --    functie zocht op `body = tekst`, en dat werkt alleen zolang de zin
      --    een naam draagt en dus toevallig uniek is.
      --
      -- ⚠️ Een voltooiing is geen persoon, dus dit mag hier — de regel uit 0059
      --    is dat er nóóit een persoon in `payload` gaat, want een uuid in jsonb
      --    heeft geen foreign key en overleeft een accountverwijdering. Een
      --    `completion_id` cascadeert juist mee en blijft als losse waarde
      --    zonder betekenis achter.
      jsonb_build_object('completion_id', new.completion_id)
    );
  exception
    when others then
      raise warning 'Systeembericht completion_approved is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.meld_mijlpaal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_id uuid;
begin
  begin
    if new.status <> 'done' or old.status = 'done' then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.goal_id,
      'milestone_done',
      'Een lid heeft een mijlpaal gehaald.',
      v_owner_id
    );
  exception
    when others then
      raise warning 'Systeembericht milestone_done is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.meld_nieuw_lid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Alleen een terugkeer uit `inactive` telt als een toetreding. Elke andere
  -- update laat deze trigger met rust.
  if tg_op = 'UPDATE'
     and not (old.status = 'inactive' and new.status = 'active')
  then
    return new;
  end if;

  begin
    if exists (
      select 1 from groups g where g.id = new.group_id and g.created_by = new.user_id
    ) then
      return new;
    end if;

    perform plaats_systeembericht(
      new.group_id,
      'member_joined',
      'Een lid doet mee.',
      new.user_id
    );
  exception
    when others then
      raise warning 'Systeembericht member_joined is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.meld_voltooiing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_goal_id uuid;
begin
  begin
    if exists (
      select 1 from completions c
      where c.weekly_goal_id = new.weekly_goal_id and c.id <> new.id
    ) then
      return new;
    end if;

    select w.goal_id into v_goal_id from weekly_goals w where w.id = new.weekly_goal_id;
    if v_goal_id is null then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      v_goal_id,
      'completion_pending',
      'Een lid heeft een week afgerond en wacht op bevestiging.',
      new.user_id
    );
  exception
    when others then
      raise warning 'Systeembericht completion_pending is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$

;

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
      'Een lid vraagt de groep om een streefdatum te verschuiven.'
    );
  exception
    when others then
      raise warning 'Systeembericht deadline_requested is niet geplaatst: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'request_id', nieuw);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.trek_goedkeuring_in(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a        completion_approvals%rowtype;
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  treffers integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into a from completion_approvals where id = p_approval_id;

  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- ⚠️⚠️ **`is distinct from` en niet `<>`, en dat is een reparatie** (QS8-371).
  --    `completion_approvals.approver_id` staat op `on delete set null`, dus zodra
  --    de goedkeurder zijn account verwijdert is dit `null`. `null <> auth.uid()`
  --    is `null` en niet `true`, dus plpgsql sloeg de `then`-tak over en deze
  --    eigendomstoets weigerde niemand meer.
  --
  -- 📏 Gemeten: Alice bevestigt de week van Bob en verwijdert haar account;
  --    Mallory, een willekeurig ander actief lid van de groep, komt daarna langs
  --    `not_yours`, langs de lidmaatschapstoets, langs het venster en langs
  --    `already_withdrawn`. Wat haar tegenhield was een `not null` in een ándere
  --    tabel — eerst `approval_withdrawals.approver_id`, en na 0212 nog alleen
  --    `points_ledger.user_id`. Een toevallige muur, geen slot.
  --
  -- ⚠️ **Dit is de weiger-kant.** Op de toesta-kant sluit een `null`; hier opent
  --    hij. Dezelfde nul, tegengestelde uitwerking, en dat verschil is de reden
  --    dat deze regel in dezelfde migratie hoort als de kolom die de nul mogelijk
  --    maakt.
  if a.approver_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = a.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if a.created_at <= now() - (intrekvenster_minuten() || ' minutes')::interval then
    return jsonb_build_object('ok', false, 'reason', 'window_closed');
  end if;

  if exists (select 1 from approval_withdrawals x where x.approval_id = a.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_withdrawn');
  end if;

  insert into approval_withdrawals (approval_id, completion_id, approver_id)
  values (a.id, a.completion_id, a.approver_id);

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (a.approver_id, null, a.group_id, -1, 'correction', 'completion', a.completion_id);

  if a.status <> 'approved' then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  select * into c from completions   where id = a.completion_id;
  select * into w from weekly_goals  where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ **Hier stond `nog_geldig > 0`, en dat was dezelfde som op een tweede
  --    plek** (QS8-65). Met een drempel boven één zou die som "nog iemand
  --    anders is akkoord" hebben gelezen als "de regel is nog gehaald", en dan
  --    blijft een week bevestigd die de meerderheid niet meer heeft.
  --
  --    De intrekking staat hierboven al in `approval_withdrawals`, dus de telling
  --    hieronder ziet hem niet meer meetellen. Eén bron, twee aanroepers.
  if goedkeuringsdrempel_gehaald(a.completion_id) then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
  else
    punten := w.points_floor;
  end if;

  update weekly_goals set status = 'pending' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, a.group_id, -punten, 'correction', 'weekly_goal', w.id);

  perform herbereken_reeks(g_owner, w.goal_id);

  -- ⚠️⚠️ **Hier stond `and m.body = tekst`, en dat is met 0213 weg** (QS8-372).
  --    Deze functie bouwde de zin opnieuw op — `weergavenaam(approver) ||
  --    ' bevestigde de week van ' || weergavenaam(subject)` — en zocht het
  --    bericht daarmee terug. De zin wás het identificatiemiddel.
  --
  -- 📏 Dat werkte alleen doordat er een naam in stond en de zin dus toevallig
  --    uniek genoeg was. 0213 haalt de naam uit elke systeemberichtzin, en dan
  --    dragen twee bevestigingen van dezelfde beoordelaar voor dezelfde persoon
  --    in dezelfde groep exact dezelfde tekst. `treffers` wordt dan 2, de `if`
  --    slaat over, en er blijft een bericht staan dat zegt dat een week
  --    bevestigd is terwijl de bevestiging is ingetrokken.
  --
  -- ⚠️ **Een zin is geen sleutel.** Het bericht draagt sinds 0213 de
  --    `completion_id` in zijn `payload`, en dáár wordt nu op gezocht. Dat is
  --    exact één rij per voltooiing, ongeacht wat er in de zin staat.
  --
  -- ⚠️ De telling blijft staan en blijft `= 1` eisen: liever een bericht laten
  --    staan dan er twee weghalen. `treffers` is nu wel een bewering die kan
  --    kloppen in plaats van een die van de tekst afhangt.
  select count(*) into treffers
  from chat_messages m
  where m.group_id     = a.group_id
    and m.type         = 'system'
    and m.system_event = 'completion_approved'
    and m.payload->>'completion_id' = a.completion_id::text
    and m.created_at  >= a.created_at;

  if treffers = 1 then
    delete from chat_messages m
    where m.group_id     = a.group_id
      and m.type         = 'system'
      and m.system_event = 'completion_approved'
      and m.payload->>'completion_id' = a.completion_id::text
      and m.created_at  >= a.created_at;
  end if;

  return jsonb_build_object('ok', true, 'reverted', true);
end;
$function$

;
