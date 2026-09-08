-- 0208_de_huddledag_verzet_de_lopende_periode_mee.sql — de huddledag verzetten
-- loopt voortaan via `zet_huddledag()`, die de lopende periode meeneemt in
-- plaats van hem onbereikbaar achter te laten (QS8-360)
--
-- ROLLBACK-PAD:
--   grant update (huddle_day) on table public.groups to authenticated;
--   en zet `guard_group_update()` terug naar de vorm van 0201 (zonder de
--   `new.huddle_day := old.huddle_day`-regel). `drop function public.zet_huddledag(uuid, smallint, date, date, boolean);`
--   De twee allowlists mogen blijven staan — een waarde die niemand meer
--   schrijft is onschadelijk — maar horen er strikt genomen ook uit:
--     alter table public.chat_messages drop constraint chat_messages_system_event_bekend;
--     ... en opnieuw toevoegen zonder 'huddle_day_changed';
--     idem group_events_type_valid.
--
--   ⚠️ Wat níét terug te draaien is: de rijen die deze functie verzet heeft.
--      Een `chain_links`- of `week_reviews`-rij die van de oude naar de nieuwe
--      periodestart is gegaan, draagt geen spoor van de oude waarde. De
--      `group_events`-rij hieronder is dat spoor wél, en die blijft staan.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack, groep met huddledag zondag, lopende periode
--    `2026-09-06`, beheerder heeft afgesloten, lid nog niet:
--
--   VOOR   group_overview(gid, '2026-09-06')   adm=true   lid=false
--   PATCH  /groups {"huddle_day": 3}           -> 204
--   NA     group_overview(gid, '2026-09-06')   adm=true   lid=false
--   NA     group_overview(gid, '2026-09-02')   adm=false  lid=false
--   lid sluit af op 2026-09-06  ->  22023, geen periodestart van deze groep
--   lid sluit af op 2026-09-02  ->  landt
--
-- **Drie dingen gaan hier mis, en het derde stond niet in het issue.**
--
-- 1. Het lid dat op het punt stond af te sluiten, kan dat voor `2026-09-06`
--    nooit meer: `bewaak_week_review_periode()` toetst tegen de níeuwe
--    huddledag.
--
-- 2. ⚠️ **Domeinregel 7.** `closed_this_period = false` betekent normaal "nog
--    niet, de week loopt". Onder de oude start betekent het vanaf nu "en dat
--    wordt het nooit meer" — een gemiste week van iemand anders, zichtbaar voor
--    de groep, veroorzaakt door een derde. In een beschermde groep tot
--    `groepsdatum - 6` voorbij is; in een **open** groep valt die datumgrens weg
--    en is het permanent.
--
-- 3. 📏 **De afsluiting van de beheerder is onder de nieuwe start weg.** Zijn
--    `chain_links`-rij draagt de oude start, en `chain_links_one_per_period`
--    staat op `(group_id, user_id, group_period_start)` — dus hij kan opnieuw
--    afsluiten en er staan twee schakels voor materieel dezelfde week. Dat telt
--    door in De Ketting.
--
-- ⚠️ Punt 3 is de reden dat alléén de oude periodestart blijven accepteren niet
--    genoeg is: dan blijft de dubbele schakel bestaan.
--
-- ---------------------------------------------------------------------------
-- Waarom dit geen `revoke` alleen is
-- ---------------------------------------------------------------------------
--
-- Bij `groups.tz` (QS8-355, 0201/0202) was dichtzetten het hele antwoord: die
-- kolom heeft geen scherm en geen ontworpen handeling. De huddledag heeft die
-- wél — `app/groep/beheer/[id].tsx` — en hij ís per ontwerp een groepsafspraak
-- die een groep mag veranderen. Wat ontbrak is de begrenzing van het moment.
--
-- Het precedent staat er al: `zet_week_startdag()` (QS8-357, 0201) doet voor de
-- persoonlijke weekstart precies dit — de dag zetten én de openstaande rijen
-- mee verzetten, met de kolom eronder ingetrokken zodat de RPC de enige weg is.
-- Deze migratie is diezelfde vorm, één laag hoger.
--
-- ⚠️ **Wat dit niet omgooit: de geschiedenis wordt niet herberekend.**
--    `src/modules/buddies/api.ts` schrijft dat een `chain_links`-rij de
--    `group_period_start` draagt waarmee hij gelegd is en dat niets die achteraf
--    herberekent. Dat blijft precies zo voor afgelopen perioden. De lopende
--    periode is geen geschiedenis: hij is nog niet afgelopen, en zijn start
--    verschuift mee met de afspraak die hem definieert.
--
-- Volledige afweging: docs/decisions/2026-09-08-de-huddledag-is-een-afspraak-en-geen-schakelaar.md
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Twee allowlists erbij
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een nieuw type systeembericht vraagt een migratie**, en dat is een
--    onwrikbare regel: `chat_messages_system_event_bekend` is een allowlist en
--    geldt ook voor `service_role`. De kopie in
--    `src/modules/buddies/chat-schemas.ts` staat onder test en gaat mee.
alter table public.chat_messages
  drop constraint if exists chat_messages_system_event_bekend;

alter table public.chat_messages
  add constraint chat_messages_system_event_bekend
  check (
    system_event is null
    or system_event = any (array[
      'chain_milestone', 'commitment_due', 'commitment_unlocked',
      'completion_approved', 'completion_pending', 'deadline_requested',
      'goal_completed', 'group_opened', 'group_protected', 'group_sleeping',
      'member_joined', 'milestone_done', 'season_recap', 'group_discoverable',
      'huddle_day_changed'
    ])
  );

alter table public.group_events
  drop constraint if exists group_events_type_valid;

alter table public.group_events
  add constraint group_events_type_valid
  check (
    event_type = any (array[
      'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
      'discoverable_changed', 'join_request_decided', 'member_removed',
      'group_reopened',
      'huddle_day_changed'
    ])
  );

-- ---------------------------------------------------------------------------
-- 2. De kolom gaat op slot, met twee sloten
-- ---------------------------------------------------------------------------
--
-- ⚠️ De `revoke` is het slot dat een client tegenkomt (42501, en dus hoorbaar);
--    de pin in de trigger is het slot voor een rol die de grant langs een andere
--    weg alsnog heeft. Dezelfde twee als bij `tz` in 0201/0202.
revoke update (huddle_day) on table public.groups from public, anon, authenticated;

create or replace function public.guard_group_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;
  new.ontdekbaar       := old.ontdekbaar;

  -- ⚠️⚠️ **De groepsklok, sinds QS8-355.** `groups.tz` is de tweede klok van
  --    domeinregel 1: `currentGroupPeriod()` leest hem, en daarmee bepaalt hij de
  --    huddledag, de weekafsluiting, De Ketting en het groepsoverzicht — voor élk
  --    lid. Eén beheerder verschoof daarmee de weekgrens van de hele groep, met
  --    één PATCH, buiten elk scherm om.
  --
  -- 📏 Nagemeten vóór deze migratie, met een echte sessie van de beheerder:
  --
  --      create_group('Klokgroep')                  -> tz Europe/Amsterdam
  --      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
  --      groepsdatum(gid)                            -> 2026-09-09
  --
  --    De serverdatum was 2026-09-08. Eén PATCH, en de groep staat een dag verder.
  new.tz               := old.tz;

  -- ⚠️⚠️ **De tak van 0060 is hier weg, en dat is gemeten en niet bedacht.**
  --    Daar stond `if old.created_by is null or new.created_by is not null`, om
  --    de overgang *van een oprichter naar geen oprichter* door te laten — de
  --    `on delete set null` die 0033 en 0060 beschrijven.
  --
  --    Die reden is achterhaald door de reparatie hierboven. Deze regel wordt
  --    **alleen nog bereikt door een client**: elke andere schrijver, de
  --    referentiële actie inbegrepen, komt niet voorbij de vroege uitgang. Dat
  --    is nagemeten — bij `delete from auth.users` draait de RI-actie met
  --    `current_user = postgres`.
  --
  --    De tak liet daarmee precies één ding door dat niemand wil: een
  --    beheerder-client die het oprichterschap van zijn eigen groep leegtrekt.
  --    Gemeten met een tijdelijk `grant update (created_by)`: **NULL**, de pin
  --    hield hem niet tegen. Met deze regel onvoorwaardelijk blijft de oprichter
  --    staan, én loopt het verwijderen van een account nog gewoon door.
  -- ⚠️⚠️ **Nieuw in 0208 (QS8-360), en om dezelfde reden als `tz` erboven.**
  --    De huddledag verschuift de groepsperiode. 📏 Gemeten vóór deze migratie:
  --    na een kale PATCH kon een lid zijn openstaande weekafsluiting nooit meer
  --    afronden, bleef het groepsoverzicht daar `false` melden — een gemiste
  --    week van iemand anders — en telde de schakel van wie wél had afgesloten
  --    niet meer mee, zodat hij er een tweede kon leggen voor dezelfde week.
  --
  --    Het verschil met `tz` is dat deze kolom een scherm hééft. Daarom een
  --    RPC ernaast en niet alleen een slot: `zet_huddledag()` verzet de dag én
  --    neemt de lopende periode mee.
  new.huddle_day       := old.huddle_day;

  new.created_by := old.created_by;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. De weg die er wél is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De database rekent de groepsklok niet uit, en dat is correctheidsregel 7.**
--    `groepsdatum()` geeft *vandaag* in de tijdzone van de groep en niet de
--    periodestart; die komt uit `shared/time` en dus van de client. Vandaar
--    `p_oude_start` en `p_nieuwe_start` als argument — precies de vorm die
--    `zet_week_startdag()` (0201) al heeft.
--
-- ⚠️ **Twee argumenten van de client zijn twee dingen om te toetsen.** Beide
--    moeten op hun eigen huddledag vallen — de oude op de dag die er nú staat,
--    de nieuwe op de dag die gevraagd wordt — en beide vensters moeten vandaag
--    bevatten. Zonder die toetsen is dit een manier om willekeurige rijen te
--    verhuizen naar een datum naar keuze.
create or replace function public.zet_huddledag(
  p_group_id     uuid,
  p_dag          smallint,
  p_oude_start   date,
  p_nieuwe_start date,
  p_bevestigd    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oude_dag     smallint;
  v_status       text;
  v_vandaag      date;
  v_recent       integer := 0;
  v_schakels     integer := 0;
  v_afsluitingen integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_dag is null or p_dag < 0 or p_dag > 6 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_dag');
  end if;

  if p_oude_start is null or p_nieuwe_start is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_periode');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  -- ⚠️ `for update` en niet alleen een `select`. Twee beheerders die tegelijk
  --    een andere dag kiezen, verzetten anders allebei dezelfde rijen vanaf
  --    dezelfde oude start — en de tweede vindt er dan geen meer, terwijl zijn
  --    dag wél landt. Dezelfde grendel als in `zet_week_startdag()`, en om
  --    dezelfde reden: 📏 daar gaf een parallelle meting 7 van de 10 paren twee
  --    keer `ok: true`.
  select g.huddle_day, g.status
    into v_oude_dag, v_status
  from groups g
  where g.id = p_group_id
  for update;

  if v_oude_dag is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  -- ⚠️ Een archief blijft een archief (0153). `archief_blijft_archief()` houdt
  --    de `update` op `groups` sowieso tegen, maar dan met een `raise` in plaats
  --    van een reden — en een RPC die een reden teruggeeft, hoort dat hier te
  --    doen.
  if v_status = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'archived');
  end if;

  if v_oude_dag = p_dag then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  if extract(dow from p_nieuwe_start)::smallint <> p_dag then
    return jsonb_build_object('ok', false, 'reason', 'periode_valt_niet_op_huddledag');
  end if;

  if extract(dow from p_oude_start)::smallint <> v_oude_dag then
    return jsonb_build_object('ok', false, 'reason', 'oude_periode_valt_niet_op_huddledag');
  end if;

  v_vandaag := groepsdatum(p_group_id);

  if v_vandaag is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_vandaag <  p_oude_start   or v_vandaag >= p_oude_start   + 7
     or v_vandaag <  p_nieuwe_start or v_vandaag >= p_nieuwe_start + 7 then
    return jsonb_build_object('ok', false, 'reason', 'periode_bevat_vandaag_niet');
  end if;

  -- ⚠️⚠️ **Bevestiging en rem, en die zijn er niet voor de netheid.** Dit kwam
  --    uit de security-review op deze branch en het is zelf nagemeten: de
  --    venstertoets hierboven laat élke periodestart in
  --    `[groepsdatum - 6, groepsdatum]` toe, dus een beheerder kan de lopende
  --    week van de anderen **tot vandaag inkorten**.
  --
  -- 📏 Gemeten op een verse groep met huddledag = vandaag:
  --
  --      lopende periode   2026-09-08 .. 2026-09-14
  --      zet_huddledag(g, dow(vandaag - 6), '2026-09-08', '2026-09-02') -> ok
  --      nieuwe periode    2026-09-02 .. 2026-09-08
  --
  --    Wie nog niet had afgesloten, houdt dan de rest van vandaag over in plaats
  --    van zes dagen. Dat is niet meer het gat van dit issue — afsluiten kán nog
  --    — maar het is wél nog steeds "één persoon bepaalt of jouw week telt".
  --
  -- ⚠️ **Verbieden kan niet en hoort ook niet.** Elke verzetting maakt de
  --    lopende week korter of langer; dat is wat een huddledag verzetten ís. Wat
  --    er ontbrak is dat het een bewuste handeling is: domeinregel 5 vraagt
  --    expliciete bevestiging, auditeerbaar en nooit stilzwijgend. Dezelfde twee
  --    remmen als `zet_groepszichtbaarheid()` (0076), en om dezelfde reden.
  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ De rem leest de auditrij die deze functie zelf schrijft — er is geen
  --    tweede plek waar dit geteld wordt. 📏 Zonder rem gaven elf wisselingen
  --    achter elkaar elf systeemberichten in de groepschat.
  select count(*) into v_recent
  from group_events e
  where e.group_id = p_group_id
    and e.event_type = 'huddle_day_changed'
    and e.created_at > now() - interval '1 day';

  if v_recent > 0 then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;

  -- ⚠️ **De dag eerst, de rijen daarna, en die volgorde is dwingend.**
  --    `bewaak_week_review_periode()` toetst een `week_reviews`-rij tegen de
  --    huddledag die op dát moment in `groups` staat. Andersom weigert hij de
  --    verhuizing met 22023 — dezelfde fout die dit issue beschrijft, nu van
  --    binnenuit.
  update groups set huddle_day = p_dag where id = p_group_id;

  -- ⚠️ **`not exists` en geen kale update.** `chain_links_one_per_period` staat
  --    op `(group_id, user_id, group_period_start)`. Draagt een lid al een rij
  --    op de nieuwe start, dan botst de verhuizing; dan blijft zijn oude rij
  --    staan in plaats van dat de hele handeling omvalt. Vandaag onbereikbaar —
  --    de nieuwe start was tot deze regel geen geldige periodestart — maar een
  --    unieke index is geen plek om op te gokken.
  update chain_links c
     set group_period_start = p_nieuwe_start
   where c.group_id = p_group_id
     and c.group_period_start = p_oude_start
     and not exists (
       select 1 from chain_links x
       where x.group_id = c.group_id
         -- ⚠️ `is not distinct from` en niet `=`, gelijk aan de clausule
         --    hieronder. `chain_links.user_id` is vandaag `not null`, dus de twee
         --    kunnen hier niet verschillen — maar `week_reviews.user_id` wordt
         --    door `on delete set null` wél genuld, en twee clausules die
         --    hetzelfde bedoelen en verschillend geschreven zijn, zijn een
         --    uitnodiging om de verkeerde te kopiëren.
         and x.user_id  is not distinct from c.user_id
         and x.group_period_start = p_nieuwe_start
     );
  get diagnostics v_schakels = row_count;

  -- ⚠️⚠️ **De benoemde uitzondering, en die is er pas bij de merge bij gekomen.**
  --    Terwijl deze branch gebouwd werd landde 0206 (QS8-362): een pin op
  --    `week_reviews` die `group_id`, `user_id` én `group_period_start`
  --    vastzet, omdat één PATCH van `group_id` de reacties van andere leden
  --    meenam naar een groep waar de schrijvers ervan nooit in zaten.
  --
  --    Die pin heeft gelijk en blijft staan. Wat hier gebeurt is smaller: de
  --    groep blijft dezelfde, het lid blijft hetzelfde, en de periodestart gaat
  --    van de oude naar de níeuwe start van dezelfde lopende week. Vandaar één
  --    genoemde sleutel voor één genoemde overgang, in de vorm die 0153 en 0199
  --    al gebruiken — en niet een gat in de pin.
  --
  -- ⚠️ `set_config(..., true)` is `set local`: de instelling valt weg aan het
  --    eind van deze transactie en lekt niet naar een volgend verzoek op
  --    dezelfde verbinding uit de pool.
  perform set_config('app.huddledag_verzet', p_group_id::text, true);

  update week_reviews w
     set group_period_start = p_nieuwe_start
   where w.group_id = p_group_id
     and w.group_period_start = p_oude_start
     and not exists (
       select 1 from week_reviews x
       where x.group_id = w.group_id
         and x.user_id  is not distinct from w.user_id
         and x.group_period_start = p_nieuwe_start
     );
  get diagnostics v_afsluitingen = row_count;

  -- ⚠️ Weer uit, meteen na de enige `update` die hem nodig heeft. `set local`
  --    zou hem aan het eind van de transactie sowieso laten vallen, maar dan
  --    staat hij nog aan tijdens het systeembericht en de auditrij eronder — en
  --    een sleutel die langer openstaat dan zijn ene statement, is een sleutel
  --    waarvan de reikwijdte niet meer uit de code te lezen is.
  perform set_config('app.huddledag_verzet', '', true);

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    (select auth.uid()),
    'huddle_day_changed',
    jsonb_build_object('huddle_day', v_oude_dag, 'periode', p_oude_start),
    jsonb_build_object('huddle_day', p_dag,      'periode', p_nieuwe_start)
  );

  -- ⚠️ **Een systeembericht noemt de persoon en de gebeurtenis, nooit meer.**
  --    Hier is dat extra nauw: wie er nog niet afgesloten had, mag er niet uit
  --    af te leiden zijn. Vandaar geen aantallen in het bericht — `v_schakels`
  --    en `v_afsluitingen` gaan alleen terug naar de beheerder die de handeling
  --    deed, en die wist het al.
  perform plaats_systeembericht(
    p_group_id,
    'huddle_day_changed',
    'De huddledag van deze groep is verzet. De week die nu loopt is meeverhuisd; '
    'wat je al had afgesloten blijft staan.',
    null,
    (select auth.uid()),
    jsonb_build_object('huddle_day', p_dag)
  );

  return jsonb_build_object(
    'ok', true,
    'huddle_day', p_dag,
    'verzette_schakels', v_schakels,
    'verzette_afsluitingen', v_afsluitingen
  );
end;
$$;

comment on function public.zet_huddledag(uuid, smallint, date, date, boolean) is
  'Verzet de huddledag van een groep en neemt de lopende periode mee: '
  'chain_links en week_reviews verhuizen van de oude naar de nieuwe '
  'periodestart, zodat een openstaande weekafsluiting afgerond kan worden en '
  'een afgesloten week niet twee keer geteld wordt. De twee periodestarts komen '
  'van de client, want de groepsklok hoort in shared/time (correctheidsregel 7); '
  'beide worden getoetst op hun eigen huddledag en op vandaag. Enige weg naar '
  'groups.huddle_day sinds 0208 — QS8-360. Vraagt een bevestiging en remt op '
  'een wisseling per dag: de verzetting kort de lopende week van de anderen in '
  'of verlengt hem, en dat is een gevolg dat bij hén landt (domeinregel 5).';

revoke all on function public.zet_huddledag(uuid, smallint, date, date, boolean) from public, anon, authenticated;
grant execute on function public.zet_huddledag(uuid, smallint, date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. group_overview() geeft geen antwoord op een periode die er niet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de tweede helft van dezelfde reparatie, en zonder hem is de
--    eerste niet af.** `zet_huddledag()` verhuist de lopende periode, maar wie
--    de oude start alsnog opvraagt — een client die nog niet ververst heeft, of
--    een open groep waar de datumgrens wegvalt — kreeg daar `false`. Voor een
--    week die niemand meer kán afsluiten leest dat als een gemiste week van een
--    ander.
--
-- Woordelijk de functie van 0161, op de derde conjunct in de venstertoets na.
create or replace function public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_na_joined_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_na_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with leden as materialized (
    select
      m.user_id                                          as user_id,
      p.display_name                                     as display_name,
      p.avatar_url                                       as avatar_url,
      m.role                                             as role,
      m.status                                           as member_status,
      m.joined_at                                        as joined_at,
      d.id                                               as goal_id,
      d.title                                            as goal_title,
      d.target_date                                      as goal_target_date,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status <> 'dropped'
      ), 0)                                              as milestones_total,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status = 'done'
      ), 0)                                              as milestones_done,
      s.current_streak                                   as current_streak,
      s.best_streak                                      as best_streak,
      s.last_cycle_start                                 as last_cycle_start,
      -- ⚠️ `coalesce(..., false)` om de venstertoets heen: valt hij ooit op `null`
      --    uit, dan is dat een weigering en geen antwoord. Zonder die coalesce
      --    zou `not null` weer `null` geven en viel het geval door naar de `else`.
      case
        when not coalesce(
          p_period_start <= groepsdatum(m.group_id) + 1
          and (
            p_period_start >= groepsdatum(m.group_id) - 6
            or lid_van_open_groep(m.group_id)
          )
          -- ⚠️ **Derde eis, nieuw in 0208 (QS8-360): binnen de lopende
          --    periode moet de gevraagde datum een échte periodestart zijn.**
          --    Verzet een beheerder de huddledag, dan is de oude start dat niet
          --    meer, en gaf deze functie daar `false` terug — "niet afgesloten",
          --    voor een week die niemand nog kán afsluiten. Dat is een gemiste
          --    week van iemand anders, zichtbaar voor de groep, veroorzaakt door
          --    een derde (domeinregel 7). 📏 Gemeten: `f/f` onder de oude start,
          --    permanent, en in een open groep zonder de datumgrens erboven.
          --
          -- ⚠️ `null` en niet `false`: dat is hier al de vorm voor "hier geef ik
          --    geen antwoord op", en het onderscheid dat de vensters erboven ook
          --    maken.
          --
          -- ⚠️⚠️ **Alleen binnen de band `groepsdatum - 6 .. + 1`, en die grens
          --    is geen voorzichtigheid maar een naad.** `chain_links_select` en
          --    deze berekening dragen hetzelfde venster op twee plekken, en
          --    `tests/rls/epic13.test.ts` toetst juist hun gelijkheid: in een
          --    **open** groep is een oudere periode leesbaar in de tabel, dus
          --    moet het overzicht daar ook antwoord geven. 📏 Zonder deze
          --    uitzondering ging die naadtest om — het overzicht zweeg over een
          --    historische periode die de tabel wél toonde.
          --
          --    Dat is bovendien de goede grens inhoudelijk: buiten de band is
          --    `false` de geschiedenis zoals hij is opgeschreven, en in een open
          --    groep mág die zichtbaar zijn (A41). Het geval dat dit issue
          --    beschrijft zit per definitie ín de band — het gaat over de week
          --    die nu loopt.
          and (
            p_period_start < groepsdatum(m.group_id) - 6
            or extract(dow from p_period_start)::smallint = (
                 select g.huddle_day from groups g where g.id = m.group_id
               )
          ),
          false
        ) then null
        else exists (
          select 1 from chain_links c
          where c.group_id = m.group_id
            and c.user_id = m.user_id
            and c.group_period_start = p_period_start
        )
      end                                                as closed_this_period
    from group_members m
    join profiles p on p.id = m.user_id
    left join lateral (
      select gg.id, gg.title, gg.target_date
      from goals gg
      join goal_group_links l on l.goal_id = gg.id
      where l.group_id = m.group_id
        and gg.owner_id = m.user_id
        and gg.status = 'active'
      order by gg.target_date asc
      limit 1
    ) d on true
    left join zichtbare_reeksen_van_groep(p_group_id) s
      on s.user_id = m.user_id and s.goal_id = d.id
    where m.group_id = p_group_id
      -- ⚠️ **Deze regel stond hier niet, en sinds 0160 is dat zichtbaar.** Zie
      --    de kop: de inner join op `profiles` besliste het antwoord, en die
      --    loopt langs `profiles_select`.
      and m.status <> 'inactive'
  )
  select
    q.user_id,
    q.display_name,
    q.avatar_url,
    q.role,
    q.member_status,
    q.joined_at,
    q.goal_id,
    q.goal_title,
    q.goal_target_date,
    q.milestones_total,
    q.milestones_done,
    q.current_streak,
    q.best_streak,
    q.last_cycle_start,
    q.closed_this_period,
    (select count(*) from leden) as total_members
  from leden q
  where
    -- ⚠️ **De cursor moet compleet zijn of hij telt niet.** Eén van de twee NULL
    --    betekent "geen cursor" en dus de eerste pagina, net als in 0121 en 0125.
    --    Een half ingevulde cursor stil als grens gebruiken levert `(x, null)` op,
    --    en dat is in SQL geen vergelijking maar NULL: de hele pagina valt dan weg
    --    zonder foutmelding.
    p_na_joined_at is null
    or p_na_user_id is null
    or (q.joined_at, q.user_id) > (p_na_joined_at, p_na_user_id)
  order by q.joined_at asc, q.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$function$;



-- ⚠️ `create or replace` behoudt de ACL, maar de vorm van onwrikbare regel 4
--    hoort er te staan: `revoke ... from public, anon` laat `authenticated`
--    precies staan.
revoke all on function public.group_overview(uuid, date, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.group_overview(uuid, date, integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. De pin van 0206 krijgt één genoemde uitzondering
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Woordelijk 0206, op de uitzondering na.** Zie de uitleg in het lichaam:
--    `group_id` en `user_id` blijven onvoorwaardelijk gepind, dus het lek dat
--    0206 dichtte kan hier niet langs.
create or replace function public.pin_week_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- ⚠️⚠️ **Eén genoemde uitzondering, toegevoegd in 0208 (QS8-360).** De
  --    huddledag verzetten verschuift de start van de lópende periode, en dan
  --    hoort de weekafsluiting die erbij hoort mee te gaan — anders kan het lid
  --    dat al afgesloten had een tweede afsluiting maken voor materieel dezelfde
  --    week, en telt De Ketting hem twee keer.
  --
  --    Wat deze uitzondering **niet** doet: `group_id` en `user_id` blijven
  --    onvoorwaardelijk gepind, ook mét de sleutel. Het lek dat 0206 dichtte —
  --    een weekafsluiting die naar een ándere groep verhuist en de reacties van
  --    anderen meeneemt — kan hier dus niet langs. Alleen de periodestart
  --    beweegt, binnen dezelfde groep en hetzelfde lid.
  --
  --    `zet_huddledag()` zet `app.huddledag_verzet` op het groeps-id; niemand
  --    anders doet dat, en `sleutelzetters()` telt dat. De instelling geldt
  --    alleen binnen die transactie (`set local`).
  --
  -- ⚠️ Deze uitdrukking staat aan de *toelaat*-kant, dus een ongezette sleutel
  --    (`null`) betekent "niet toegelaten" en er is geen `coalesce` nodig. Aan de
  --    weiger-kant zou dat precies andersom liggen — zie 0199.
  if new.group_id is distinct from old.group_id
     or (
       new.group_period_start is distinct from old.group_period_start
       and nullif(current_setting('app.huddledag_verzet', true), '') is distinct from old.group_id::text
     )
     or (new.user_id is distinct from old.user_id and new.user_id is not null)
  then
    raise exception 'Een weekafsluiting hoort bij één groep, één lid en één periode'
      using errcode = 'check_violation',
            hint = 'group_id, user_id en group_period_start liggen vast zodra de weekafsluiting er staat; de tekstvelden zijn wel te wijzigen.';
  end if;

  new.group_id := old.group_id;

  -- ⚠️ De pin op de periodestart geldt overal behalve op de doorgelaten
  --    overgang hierboven; anders zou de `raise` hem toestaan en deze regel hem
  --    alsnog terugzetten — de stille terugzet van QS8-314.
  if nullif(current_setting('app.huddledag_verzet', true), '') is distinct from old.group_id::text then
    new.group_period_start := old.group_period_start;
  end if;

  -- ⚠️ **Deze vorm is de vorm die `onveranderlijkheid_bewaking()` herkent, en dat
  --    is geen toeval maar een gemeten reparatie.** Mijn eerste versie stond er
  --    als `if new.user_id is not null then …` — semantisch hetzelfde voor dit
  --    geval, en tóch rood: die bewaking eist letterlijk
  --    `old.<kolom> is null or new.<kolom> is not null`, precies zodat er één
  --    herkenbare vorm is voor de val die 0031, 0033 en 0059 alle drie maakten.
  --    Een eigen variant is hier dus een variant te veel.
  if old.user_id is null or new.user_id is not null then
    new.user_id := old.user_id;
  end if;

  return new;
end $function$

;

-- ---------------------------------------------------------------------------
-- 8. Het sleutelregister kent de nieuwe sleutel
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het register draagt zichzelf in zijn lichaam, dus een `replace` vervangt
--    het geheel** — dat is de val die 0199 in zijn eigen commentaar beschrijft en
--    die bij het samenvoegen van 0204 opnieuw langskwam. Hieronder staat het
--    register zoals het op dit moment gedeployd is, mét de regel van 0208 erbij.
--
-- 📏 En de teller heeft zichzelf hier bewezen: hij meldde `zet_huddledag` en
--    `pin_week_review` als ongeregistreerd zodra de sleutel er was, vóór deze
--    sectie bestond.
create or replace function public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc like '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt een app.-sessiesleutel die in geen enkel register van deze '
         'teller staat; een nieuwe sleutel hoort er met zijn eigen regel in '
         'te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and p.prosrc ~ 'app\.[a-z_]+'
     and not exists (
       select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
     )

   order by 1;
$function$

;
