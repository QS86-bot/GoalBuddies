-- 0034_deadline_verzoek_intrekken.sql — bevindingen van de reviewronde op A7
--
-- ROLLBACK-PAD:
--   drop function if exists trek_deadline_verzoek_in(uuid), systeembericht_allowlist();
--   drop index if exists approval_withdrawals_approver_idx,
--     deadline_requests_requester_idx, deadline_requests_decided_by_idx;
--   -- join_group_with_code(text) uit 0017_join_group_result.sql opnieuw uitvoeren
--
-- Twee doodlopende wegen uit de gebruikersreview, plus het slot dat de
-- code-critic zag doorschieten.

-- ---------------------------------------------------------------------------
-- 1. Je eigen verzoek intrekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ `deadline_requests` kende de status `withdrawn` vanaf 0032 en er was geen
--    enkele manier om hem te bereiken. Reageert je buddy niet, dan blijft je
--    verzoek open, blijft de unieke index een tweede verzoek weigeren, en is je
--    streefdatum voor onbepaalde tijd bevroren. Er is geen omweg: de policy op
--    UPDATE en DELETE staat op `false`.
--
--    Dat is precies het soort blokkade dat een gebruiker de app laat verwijderen,
--    en het is één functie werk.
--
-- ⚠️ Geen systeembericht bij intrekken. Dat je iets vraagt is jouw mededeling
--    (domeinregel 7, route 1); dat je het weer terugneemt hoeft de groep niet als
--    gebeurtenis te zien. De aankondiging van het verzoek blijft wél staan — hij
--    is waar: je hébt het gevraagd.

create or replace function trek_deadline_verzoek_in(p_request_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r deadline_requests%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into r from deadline_requests where id = p_request_id;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Alleen je eigen verzoek. Een ander lid dat het weg wil hebben, wijst het af.
  if r.requester_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  -- ⚠️ `decided_by` blijft leeg: er is niets besloten. De CHECK
  --    `deadline_requests_beslissing_compleet` staat dat toe voor elke status
  --    behalve 'open'.
  update deadline_requests
  set status     = 'withdrawn',
      decided_at = now()
  where id = r.id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function trek_deadline_verzoek_in(uuid) is
  'Trekt je eigen openstaande deadline-verzoek in (Q-TODO A7). Zonder deze route '
  'blijft een verzoek waar niemand op reageert je streefdatum bevriezen.';

revoke all on function trek_deadline_verzoek_in(uuid) from public, anon;
grant execute on function trek_deadline_verzoek_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Toetreden als uitgezet lid meldt niet langer "gelukt"
-- ---------------------------------------------------------------------------
--
-- ⚠️ Gevonden door de gebruikersreview, en het is de vervelendste van de twee.
--    `join_group_with_code` sloeg alle controles over zodra je rij al bestond
--    (`al_lid = true`) en gaf `{ok: true, group_id: ...}` terug. Voor een lid dat
--    op `inactive` stond klopte dat niet: de `on conflict`-clausule heractiveert
--    alleen `paused`, dus je bleef uitgezet — maar de app stuurde je wél door naar
--    de groepspagina, waar stond dat je geen lid bent en om een nieuwe link moet
--    vragen. Je had die link net gebruikt.
--
--    Sinds 0029 is dat erger geworden en niet beter: toen las een uitgezet lid de
--    groep nog, nu ziet hij een leeg scherm. Een lus die zichzelf tegenspreekt.
--
-- ⚠️ De reden is bewust vaag naar buiten toe (`removed`), en de app maakt er één
--    zin van. Niet "je bent eruit gezet door Sanne": wie het gedaan heeft en
--    waarom, is niet aan een foutmelding.

create or replace function join_group_with_code(code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target       groups%rowtype;
  pogingen     integer;
  leden        integer;
  lidmaatschap integer;
  bestaand     text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  if pogingen >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select status into bestaand
  from group_members
  where group_id = target.id and user_id = auth.uid();

  -- ⚠️ Een uitgezet lid komt er niet in en krijgt dat ook te horen. Hiervóór gaf
  --    deze functie 'ok' terug en liep de gebruiker tegen een lege groepspagina
  --    aan met de melding dat hij een nieuwe link moest vragen.
  if bestaand = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'removed');
  end if;

  if bestaand is null then
    select count(*) into leden
    from group_members
    where group_id = target.id and status <> 'inactive';

    if leden >= 12 then
      return jsonb_build_object('ok', false, 'reason', 'group_full');
    end if;

    select count(*) into lidmaatschap
    from group_members
    where user_id = auth.uid() and status <> 'inactive';

    if lidmaatschap >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
    end if;
  end if;

  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update
    set status = case
      when group_members.status = 'paused' then 'active'
      else group_members.status
    end;

  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return jsonb_build_object('ok', true, 'group_id', target.id);
end;
$$;

comment on function join_group_with_code(text) is
  'Toetreden met een uitnodigingscode. Telt elke póging voor de dagelijkse '
  'limiet, weigert een uitgezet lid met reason=removed, en heractiveert alleen '
  'een zelfgekozen pauze.';

revoke all on function join_group_with_code(text) from public, anon;
grant execute on function join_group_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Het slot van domeinregel 7 sloot maar één kant af
-- ---------------------------------------------------------------------------
--
-- ⚠️ Bevinding van de code-critic, en het is de belangrijkste van de ronde: het
--    slot dat CLAUDE.md met naam noemt, is deze keer níét dichtgevallen.
--
--    Migratie 0032 zette `deadline_requested` op de CHECK in de database. De
--    kopie in `src/modules/buddies/chat-schemas.ts` bleef op acht namen staan, en
--    de test daar ("bevat uitsluitend de acht gebeurtenissen") bleef gewoon
--    groen — want die vergeleek de oude lijst met zichzelf. De test in
--    `tests/rls/epic7.test.ts` controleerde alleen dat de app niets kent dat de
--    database verbiedt; de andere richting was nergens afgedekt.
--
--    Gevolg: de database stond negen gebeurtenissen toe en de app kende er acht,
--    zonder één rode test. Vandaag onschadelijk, maar het slot moest juist
--    voorkomen dat een nieuw groepsoppervlak ongemerkt langskomt.
--
-- ⚠️ Deze functie maakt de allowlist leesbaar vanuit een test, net zoals
--    `realtime_bewaking()` (0027) dat doet voor de replica identity. Zonder zo'n
--    functie kan een test die via PostgREST praat niet bij `pg_constraint`.

create or replace function systeembericht_allowlist()
  returns text[]
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m[1] order by m[1]), '{}'::text[])
  from pg_constraint c,
       lateral regexp_matches(
         pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g'
       ) as m
  where c.conrelid = 'public.chat_messages'::regclass
    and c.conname  = 'chat_messages_system_event_bekend';
$$;

comment on function systeembericht_allowlist() is
  'De namen uit de CHECK chat_messages_system_event_bekend, zodat een test kan '
  'bewijzen dat de database en SYSTEEM_GEBEURTENISSEN in de app exact hetzelfde '
  'toestaan — in beide richtingen.';

revoke all on function systeembericht_allowlist() from public, anon;
grant execute on function systeembericht_allowlist() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Indexen op de foreign keys van 0030 en 0032
-- ---------------------------------------------------------------------------
--
-- ⚠️ CLAUDE.md schaalbaarheidsregel 11 is categorisch: een index op elke foreign
--    key. Bij de huidige rijaantallen doet dit niets; de regel is onvoorwaardelijk
--    geformuleerd juist omdat dat altijd zo lijkt tot het niet meer zo is.
--    `approval_withdrawals_select` filtert rechtstreeks op `approver_id`.

create index if not exists approval_withdrawals_approver_idx
  on approval_withdrawals (approver_id);

create index if not exists deadline_requests_requester_idx
  on deadline_requests (requester_id, created_at desc);

create index if not exists deadline_requests_decided_by_idx
  on deadline_requests (decided_by) where decided_by is not null;
