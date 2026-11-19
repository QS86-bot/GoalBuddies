-- 0302_de_review_vond_twee_lekken_en_drie_naden_in_de_wachtrij.sql — de
-- bevindingen van de security-ronde op QS8-233, elk zelf nagemeten voordat hij
-- verwerkt is.
--
-- ROLLBACK-PAD:
--   -- In deze volgorde, en die is bindend:
--   -- 1. vorm_een_buddygroep(uuid[])   woordelijk terug uit 0300 §6
--   -- 2. vorm_buddygroepen(date, integer) woordelijk terug uit 0300 §7
--   -- 3. zoek_buddies_aan(uuid, boolean) woordelijk terug uit 0301
--   -- 4. zet_groepszichtbaarheid / zet_groepsontdekbaarheid terug uit 0300 §3
--   alter table public.goal_match_queue drop constraint goal_match_queue_group_id_fkey;
--   alter table public.goal_match_queue
--     add constraint goal_match_queue_group_id_fkey
--     foreign key (group_id) references public.groups(id) on delete set null;
--
--   ⚠️ Die laatste zet het defect van B8 terug. Doe dat alleen als je ook de
--      CHECK `goal_match_queue_groep_alleen_gekoppeld` meeneemt, want samen
--      maken ze `delete from groups` onmogelijk.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De `security-reviewer` van onwrikbare regel 19, gedraaid op QS8-233 omdat dit
-- werk groepslidmaatschap, RLS en een nieuw groepszichtbaar oppervlak raakt. Zijn
-- oordeel was blokkerend.
--
-- ⚠️ **Elke bevinding hieronder is zelf gereproduceerd vóór hij verwerkt is**, en
--    dat is geen formaliteit: CLAUDE.md zegt dat reviewagents het ook mis hebben.
--    📏 Eén bevinding was inderdaad deels onjuist — hij stelde dat de ijking van
--    de derde pin in `guard_group_update()` de kolomgrant gemeten had in plaats
--    van de pin. De pin vuurde wél: ik had de grant eerst expliciet gegeven en
--    zag `guard_group_update() line 104 at RAISE`. Maar dát die grant erbij ging
--    stond niet in het beslisdocument, en dan is de meting niet na te lopen —
--    dus de bevinding raakt een echt gebrek, alleen niet het gebrek dat hij
--    noemt. Rechtgezet in het document.

-- ---------------------------------------------------------------------------
-- B8. De referentiële actie botste met de tweezijdige CHECK
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten: `delete from groups` na een gevormde automatische groep gaf
--    `new row for relation "goal_match_queue" violates check constraint
--     goal_match_queue_groep_alleen_gekoppeld` — met een foutmelding die naar
--    de verkeerde tabel wijst. `on delete set null` zette `group_id` leeg terwijl
--    `status` `gekoppeld` bleef, en die combinatie weigert de CHECK.
--
-- ⚠️ Vandaag is er geen client die een groep verwijdert (`groups_delete` staat op
--    `false` en elke route archiveert), maar **twintig bestanden in `tests/rls/`
--    ruimen op met `delete from groups`**. Elke toekomstige test die een
--    automatische groep vormt en netjes opruimt, loopt hierop stuk.
--
-- ⚠️⚠️ **`cascade` en niet een eenzijdige CHECK**, en dat is een afweging. De
--    CHECK draagt twee beloftes: `gekoppeld` heeft een groep, en wie niet
--    gekoppeld is draagt er geen. Eenzijdig maken laat een `vertrokken` rij naar
--    een groep wijzen waar die persoon niet in zit — precies wat 0299 wilde
--    uitsluiten. De betekenis van deze rij hángt aan de groep, dus hij hoort hem
--    niet te overleven. De prijs: het spoor "deze persoon is gekoppeld geweest"
--    gaat mee met de groep. Dat is de kleinste van de twee verliezen, en
--    `goal_id` cascadeert al om dezelfde reden.

alter table public.goal_match_queue
  drop constraint if exists goal_match_queue_group_id_fkey;
alter table public.goal_match_queue
  add  constraint goal_match_queue_group_id_fkey
  foreign key (group_id) references public.groups(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- B2. De dagrem en het gelijktijdigheidsplafond waren met een burst te omzeilen
-- ---------------------------------------------------------------------------

create or replace function public.zoek_buddies_aan(p_goal_id uuid, p_bevestigd boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status  text;
  v_target  date;
  v_wacht   integer;
  v_groepen integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  -- ⚠️⚠️ **Eén slot per gebruiker, vóór élke telling.** De drie plafonds eronder
  --    zijn lees-dan-schrijf, en PostgREST geeft elk verzoek zijn eigen
  --    transactie: gelijktijdige aanroepen lezen alle hetzelfde oude getal. De
  --    partiële unieke index remt alleen een tweede rij op hetzelfde dóel, dus
  --    twaalf verschillende doelen komen er langs.
  --
  --    📏 Gemeten vóór dit slot, twaalf aanroepen op twaalf doelen van één
  --    gebruiker met een gedeeld startsignaal (werkelijke spreiding 9 ms):
  --    **10** rijen `wachtend`, waar het plafond 3 gelijktijdig en 5 per dag is.
  --    Beide grenzen doorbroken met één burst; mét het slot 3 rijen en negen
  --    keer `too_many_queued`.
  --
  --    ⚠️ Een eerdere meting gaf 8, en een derde gaf 3 — die laatste zónder het
  --    slot, en dus een uitslag die niets bewees. Daar startten de twaalf
  --    psql-processen niet samen: elk moest nog verbinden, dus ze liepen achter
  --    elkaar en de race trad niet op. **Een uitslag die zonder de reparatie
  --    hetzelfde is, meet de reparatie niet** — zelfde klasse als de rode die
  --    niet jouw rode is.
  --
  --    Dit is woordelijk de klasse die QS8-296 in `vraag_ai_job()` sloot (0182),
  --    en dezelfde vorm: `hashtextextended(auth.uid()::text, 0)`. CLAUDE.md bij
  --    regel 19: *fouten worden gekopieerd*.
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));

  if buddyzoekopdrachten_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select g.status, g.target_date into v_status, v_target
  from goals g
  where g.id = p_goal_id and g.owner_id = (select auth.uid());

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  -- ⚠️⚠️ **De klok van de eigenaar en niet die van de server** — en hier stond
  --    `current_date`. Dat is de dag van de database (📏 `show timezone` geeft
  --    `Etc/UTC` op dit project), en deze tak **weigert** een aanmelding met
  --    `datum_verstreken`. Iemand in een tijdzone vóór of achter UTC kreeg rond
  --    middernacht dus te horen dat zijn streefdatum voorbij was terwijl dat bij
  --    hém niet zo was — domeinregel 2 zegt dat "vandaag" in de tijdzone van de
  --    gebruiker hoort, en een weigering is precies de plek waar dat telt.
  --
  --    `eigenaarsdatum()` is de bestaande helper daarvoor en geen nieuwe
  --    berekening: `(now() at time zone profiles.tz)::date`. `authenticated` mag
  --    hem niet aanroepen; deze functie is definer en komt er wel langs.
  if v_target is null or v_target < public.eigenaarsdatum((select auth.uid())) then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Idempotent: geen fout, maar ook geen tweede rij. De partiële unieke index
  -- is de tweede grendel, voor het geval twee verzoeken elkaar kruisen.
  if exists (
    select 1 from goal_match_queue q
    where q.goal_id = p_goal_id and q.status = 'wachtend'
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_queued');
  end if;

  select count(*)::integer into v_wacht
  from goal_match_queue q
  where q.user_id = (select auth.uid()) and q.status = 'wachtend';

  if v_wacht >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_queued');
  end if;

  -- ⚠️ Hetzelfde plafond als `create_group()` en `join_group_with_code()`. Drie
  --    tellingen van één limiet die verschillend rekenen, is een limiet die van
  --    je route afhangt — 0287 waarschuwt daar zelf voor.
  select count(*)::integer into v_groepen
  from group_members m
  where m.user_id = (select auth.uid()) and m.status <> 'inactive';

  if v_groepen >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  insert into goal_match_queue (goal_id, user_id, expires_at)
  values (p_goal_id, (select auth.uid()), now() + interval '14 days');

  return jsonb_build_object('ok', true);
end;
$function$

;

revoke all on function public.zoek_buddies_aan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.zoek_buddies_aan(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- B6. De `automatisch`-tak stond ná de beheerderstoets en was onbereikbaar
-- ---------------------------------------------------------------------------

create or replace function public.zet_groepszichtbaarheid(p_group_id uuid, p_naar text, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud    text;
  v_recent integer;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null or p_naar not in ('beschermd', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_visibility');
  end if;

  -- ⚠️⚠️ **Vóór de beheerderstoets, en dat was de bug.** Deze tak stond eronder,
  --    en een automatisch gevormde groep heeft per constructie géén beheerder:
  --    `is_group_admin()` is er altijd onwaar. 📏 Gemeten: een lid kreeg
  --    `not_admin` en nooit `automatisch`, dus de tak was onbereikbaar voor
  --    precies de groepen waarvoor hij geschreven is. Een grendel die zijn eigen
  --    geval niet haalt bewaakt niets — en de kop van 0300 beweerde dat de
  --    gebruiker hier een zin leest die niemand ooit gezien heeft.
  --
  --    ⚠️ Dit verruimt niets: het antwoord was al "nee". Wat verandert is wélke
  --    reden de gebruiker leest, en of de i18n-sleutel ervoor bereikbaar is.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ `for update` en niet een kale select. Twee beheerders die tegelijk
  --    omzetten, zouden anders allebei "was beschermd" lezen en allebei een
  --    bericht plaatsen — en het auditspoor zou twee keer dezelfde overgang
  --    tonen terwijl er één was.
  select g.zichtbaarheid into v_oud
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  if p_naar = 'open' then
    select count(*) into v_recent
    from group_events e
    where e.group_id   = p_group_id
      and e.event_type = 'visibility_changed'
      and e.new_value ->> 'zichtbaarheid' = 'open'
      and e.created_at > now() - interval '1 day';

    if v_recent > 0 then
      return jsonb_build_object('ok', false, 'reason', 'too_soon');
    end if;
  end if;

  -- ⚠️ `current_user` is hier de eigenaar van deze functie en niet
  --    `authenticated`, dus `guard_group_update()` laat de kolom staan. Dat is
  --    geen omweg om het slot heen maar precies waar het slot voor bedoeld is:
  --    één route naar deze kolom, en die route toetst zelf.
  update groups set zichtbaarheid = p_naar where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'visibility_changed',
    jsonb_build_object('zichtbaarheid', v_oud),
    jsonb_build_object('zichtbaarheid', p_naar)
  );

  perform plaats_systeembericht(
    p_group_id,
    case when p_naar = 'open' then 'group_opened' else 'group_protected' end,
    case
      when p_naar = 'open'
      then 'Deze groep staat vanaf nu open: leden zien ook elkaars tegenslag.'
      else 'Deze groep is weer beschermd: tegenslag van een ander is niet zichtbaar.'
    end,
    p_subject_id => auth.uid()
  );

  return jsonb_build_object('ok', true, 'van', v_oud, 'naar', p_naar);
end;
$function$

;

create or replace function public.zet_groepsontdekbaarheid(p_group_id uuid, p_naar boolean, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud   boolean;
  v_zicht text;
  v_cat   text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_state');
  end if;

  -- ⚠️⚠️ **Vóór de beheerderstoets, en dat was de bug.** Deze tak stond eronder,
  --    en een automatisch gevormde groep heeft per constructie géén beheerder:
  --    `is_group_admin()` is er altijd onwaar. 📏 Gemeten: een lid kreeg
  --    `not_admin` en nooit `automatisch`, dus de tak was onbereikbaar voor
  --    precies de groepen waarvoor hij geschreven is. Een grendel die zijn eigen
  --    geval niet haalt bewaakt niets — en de kop van 0300 beweerde dat de
  --    gebruiker hier een zin leest die niemand ooit gezien heeft.
  --
  --    ⚠️ Dit verruimt niets: het antwoord was al "nee". Wat verandert is wélke
  --    reden de gebruiker leest, en of de i18n-sleutel ervoor bereikbaar is.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.ontdekbaar, g.zichtbaarheid, g.categorie
    into v_oud, v_zicht, v_cat
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- ⚠️ De twee voorwaarden geven een eigen reden terug en geen `23514`. De
  --    CHECK is de grendel; dit is de uitleg, en een scherm kan er iets mee.
  if p_naar and v_zicht <> 'beschermd' then
    return jsonb_build_object('ok', false, 'reason', 'not_protected');
  end if;

  if p_naar and v_cat is null then
    return jsonb_build_object('ok', false, 'reason', 'no_category');
  end if;

  update groups set ontdekbaar = p_naar where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    (select auth.uid()),
    'discoverable_changed',
    jsonb_build_object('ontdekbaar', v_oud),
    jsonb_build_object('ontdekbaar', p_naar)
  );

  if p_naar then
    perform plaats_systeembericht(
      p_group_id,
      'group_discoverable',
      'Deze groep is vanaf nu te vinden voor mensen die je nog niet kent. Zij zien de naam, het onderwerp, de omschrijving en het aantal leden — verder niets.',
      null,
      (select auth.uid()),
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'ontdekbaar', p_naar);
end;
$function$

;

-- ---------------------------------------------------------------------------
-- B5. De matcher koppelde verlopen wachtopdrachten
-- ---------------------------------------------------------------------------

create or replace function public.vorm_buddygroepen(p_vandaag date, p_max_groepen integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_bak      record;
  v_rijen    uuid[];
  v_groep    uuid;
  v_bakken   integer := 0;
  v_gevormd  integer := 0;
  v_leden    integer := 0;
begin
  -- ⚠️ `hashtextextended(…, 0)` en niet `hashtext(…)`: de rest van dit project
  --    gebruikt de 64-bits variant, en twee sleutelruimtes door elkaar is een
  --    botsing die je nooit terugvindt.
  perform pg_advisory_xact_lock(hashtextextended('vorm_buddygroepen', 0));

  for v_bak in
    select g.category, public.doelperiode(g.target_date, p_vandaag) as band, p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.status = 'wachtend'
      -- ⚠️⚠️ **Een verlopen wachtopdracht hoort in geen enkele bak.** Dit stond
      --    er niet, en de veertiendagenbelofte leunde volledig op de
      --    aanroepvolgorde in de Edge Function — twee aparte HTTP-rondes, dus een
      --    echt venster, en een losse aanroep van deze functie sloeg de
      --    verloopstap over. 📏 Gemeten: drie rijen met `expires_at` zestien
      --    dagen in het verleden gaven `{"gevormd": 1}`. Regel 18 vraag 1: beide
      --    onderdelen klopten, de belofte zat op de naad.
      and q.expires_at > now()
      and g.status = 'active'
      and g.target_date >= p_vandaag
    group by g.category, public.doelperiode(g.target_date, p_vandaag), p.week_start_day
    having count(distinct q.user_id) >= 3
    order by count(distinct q.user_id) desc
    limit p_max_groepen
  loop
    v_bakken := v_bakken + 1;

    -- ⚠️ Hoogstens één rij per gebruiker: iemand met drie wachtende doelen in
    --    dezelfde bak mag die bak niet in zijn eentje vullen.
    -- ⚠️ Vergrendelen en ontdubbelen zijn twee stappen, en dat moet ook:
    --    Postgres staat `for update` niet toe naast `distinct on`. De CTE neemt
    --    het slot op de wachtrijrijen, de laag erboven houdt er één per persoon
    --    over. Andersom — eerst ontdubbelen, dan vergrendelen — zou het slot
    --    leggen op rijen die je daarna alsnog weggooit.
    with vergrendeld as (
      select q.id, q.user_id, q.created_at
      from goal_match_queue q
      join goals    g on g.id = q.goal_id
      join profiles p on p.id = q.user_id
      where q.status = 'wachtend'
        and q.expires_at > now()
        and g.status = 'active'
        and g.category = v_bak.category
        and public.doelperiode(g.target_date, p_vandaag) = v_bak.band
        and p.week_start_day = v_bak.week_start_day
        and (
          select count(*) from group_members m
          where m.user_id = q.user_id and m.status <> 'inactive'
        ) < 10
      order by q.created_at
      limit 50
      for update of q skip locked
    )
    select array_agg(k.id order by k.created_at) into v_rijen
    from (
      select distinct on (v.user_id) v.id, v.created_at
      from vergrendeld v
      order by v.user_id, v.created_at
    ) k;

    continue when coalesce(array_length(v_rijen, 1), 0) < 3;

    v_groep := public.vorm_een_buddygroep(v_rijen);
    continue when v_groep is null;

    v_gevormd := v_gevormd + 1;
    select v_leden + count(*) into v_leden from group_members where group_id = v_groep;
  end loop;

  return jsonb_build_object(
    'bakken', v_bakken, 'gevormd', v_gevormd, 'leden', coalesce(v_leden, 0)
  );
end;
$function$

;

revoke all on function public.vorm_buddygroepen(date, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B9. De binnenfunctie verdedigde de harde eisen niet zelf
-- ---------------------------------------------------------------------------

create or replace function public.vorm_een_buddygroep(p_rijen uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rij     record;
  v_gekozen uuid[] := '{}';
  v_leden   uuid[] := '{}';
  v_cat     text;
  v_dag     smallint;
  v_tz      text;
  v_groep   uuid;
begin
  for v_rij in
    select q.id, q.user_id, g.category, p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.id = any(p_rijen)
      and q.status = 'wachtend'
      and q.expires_at > now()
    order by q.created_at
  loop
    exit when coalesce(array_length(v_leden, 1), 0) >= 5;

    -- ⚠️⚠️ **Deze drie takken stonden er niet, en dat was de naad.** De harde
    --    eisen zaten uitsluitend in de bakquery van `vorm_buddygroepen()`; deze
    --    functie nam élke lijst aan en vormde er een groep van. 📏 Gemeten:
    --    drie rijen met drie verschillende week-startdagen gaven één groep met
    --    `huddle_day` van de eerste rij; twee rijen van dezelfde gebruiker gaven
    --    een `group_members_pkey`-botsing die de héle ronde omver haalde; en
    --    twee keer dezelfde lijst gaf twee groepen.
    --
    --    Alleen `service_role` komt hier bij, dus het was niet te misbruiken —
    --    maar de Edge Function belooft idempotentie en 0300 noemt de
    --    week-startdag een harde eis. Een belofte die alleen in de aanroeper
    --    staat, is de vorm die dit project zeven keer betaald heeft.
    continue when v_rij.user_id = any(v_leden);
    continue when v_cat is not null and v_rij.category is distinct from v_cat;
    continue when v_dag is not null and v_rij.week_start_day is distinct from v_dag;

    continue when exists (
      select 1 from unnest(v_leden) as gekozen(u)
      where public.blokkade_tussen(gekozen.u, v_rij.user_id)
    );
    v_gekozen := v_gekozen || v_rij.id;
    v_leden   := v_leden   || v_rij.user_id;
    v_cat     := coalesce(v_cat, v_rij.category);
    v_dag     := coalesce(v_dag, v_rij.week_start_day);
  end loop;

  if coalesce(array_length(v_leden, 1), 0) < 3 then
    return null;
  end if;

  -- ⚠️ De tijdzone die de meeste leden delen; bij gelijkspel alfabetisch, zodat
  --    de uitkomst niet van rijvolgorde afhangt en een herhaalde run hetzelfde
  --    doet.
  select p.tz into v_tz
  from profiles p
  where p.id = any(v_leden) and p.tz is not null
  group by p.tz
  order by count(*) desc, p.tz
  limit 1;

  -- ⚠️ De naam komt uit een vaste catalogus en nooit uit gebruikerstekst: hij
  --    moet door alle zeven naam-CHECKs van `groups` en een vast punt van
  --    `schone_naam()` zijn. `create_group()` doet die normalisatie, en dit pad
  --    komt daar niet langs.
  insert into groups (name, created_by, invite_code, invite_revoked,
                      huddle_day, tz, zichtbaarheid, ontdekbaar, automatisch)
  values ('Buddygroep ' || initcap(replace(coalesce(v_cat, 'other'), '_', ' ')),
          null, generate_invite_code(), true,
          coalesce(v_dag, 0), coalesce(v_tz, 'Europe/Amsterdam'),
          'beschermd', false, true)
  returning id into v_groep;

  insert into group_members (group_id, user_id, role, status)
  select v_groep, u, 'member', 'active' from unnest(v_leden) as l(u);

  insert into goal_group_links (goal_id, group_id)
  select q.goal_id, v_groep from goal_match_queue q where q.id = any(v_gekozen);

  update goal_match_queue
  set status = 'gekoppeld', group_id = v_groep, decided_at = now()
  where id = any(v_gekozen);

  return v_groep;
end;
$function$

;

revoke all on function public.vorm_een_buddygroep(uuid[]) from public, anon, authenticated;
