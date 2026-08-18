-- 0032_deadline_verschuiven_met_akkoord.sql — Q-TODO A7
--
-- ROLLBACK-PAD:
--   drop function if exists vraag_deadline_verschuiving(uuid, uuid, date, text),
--     beslis_deadline_verzoek(uuid, boolean, text), zet_streefdatum(uuid, date);
--   drop table if exists deadline_requests;
--   grant update on goals to authenticated;
--   alter table chat_messages drop constraint chat_messages_system_event_bekend;
--   alter table chat_messages add constraint chat_messages_system_event_bekend
--     check (system_event is null or system_event = any (array[
--       'group_sleeping','member_joined','completion_pending','completion_approved',
--       'milestone_done','goal_completed','commitment_unlocked','commitment_due']));
--
-- Besluit van Quinten (Q-TODO A7, 18-08-2026):
--   "Ja dat moet de groep zien. Je moet een goed argument indienen om de
--    deadline te mogen verschuiven. Wanneer de groep akkoord is, dan kost het je
--    geen punten."
--
-- ⚠️ Van de drie mogelijke lezingen is hier de variant gebouwd die het
--    puntenmodel niet aanraakt: verschuiven kán uitsluitend mét akkoord, en
--    daarom is er geen straf nodig voor verschuiven zónder akkoord. CLAUDE.md
--    domeinregel 10 legt de punten vast op +2/+1/−1/0 en zegt dat wijzigen
--    daarvan een vraag is, geen keuze van de sessie. De vraag is gesteld en
--    stond bij het bouwen nog open; dit is de kant die niets onomkeerbaars doet.
--
--    Wil je alsnog de variant "verschuiven mag altijd, maar kost een punt", dan
--    is dat een nieuwe reden in `points_ledger` plus een regel in CLAUDE.md, en
--    deze migratie hoeft er niet voor terug.
--
-- ⚠️ Dit is een uitzondering op domeinregel 7 die je zelf hebt gemaakt, en hij
--    past in het patroon: net als vraag 2 van de weekafsluiting loopt de
--    tegenslag via de gebruiker zélf. Jij vraagt het, jij schrijft het argument,
--    jij drukt op verzenden. Wat de groep te zien krijgt is dus geen afgeleide
--    van jouw falen maar jouw eigen mededeling.
--
-- ⚠️ Een doel zonder groep houdt zijn vrijheid. Er is dan niemand om iets aan te
--    vragen, en een eis die niemand kan inwilligen is een blokkade. Daarvoor is
--    `zet_streefdatum()`.

-- ---------------------------------------------------------------------------
-- 1. De streefdatum is geen kolom meer die de client zelf zet
-- ---------------------------------------------------------------------------
--
-- ⚠️ Kolomrechten en geen trigger, om dezelfde reden als 0019 en 0023: een
--    trigger die op een rolnaam of een sessievlag beslist, faalt open. `revoke
--    update (target_date)` laat Postgres het afdwingen, ongeacht wie er belt.
--
-- ⚠️ Er gingen er vier tegelijk mee, en die drie andere waren een groter gat dan
--    A7 zelf. `authenticated` had UPDATE op élke kolom van `goals`:
--
--      * `max_points` — het puntenplafond van je doel, dat volgens domeinregel 10
--        een afgeleide is van je weekdoelen en door een trigger onderhouden
--        wordt. Met één PATCH zet je hem op wat je wilt.
--      * `risk_status` en `risk_reason` — de Risico-radar van EPIC 12, die nog
--        niet bestaat. Vanaf de dag dat hij bestaat is hij met één verzoek te
--        overschrijven, en sinds jouw antwoord op A17 leest de groep die kolom
--        mee.
--      * `owner_id` — afgevangen door de `with check` van `goals_update`, dus
--        niet misbruikbaar, maar er is geen reden om hem te kunnen schrijven.

revoke update on goals from authenticated, anon;

grant update (title, description, category, identity_statement,
              available_hours_per_week, status)
  on goals to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Het verzoek
-- ---------------------------------------------------------------------------

create table if not exists deadline_requests (
  id           uuid        primary key default gen_random_uuid(),
  goal_id      uuid        not null references goals (id)    on delete cascade,
  group_id     uuid        not null references groups (id)   on delete cascade,
  requester_id uuid        not null references profiles (id) on delete cascade,
  old_date     date        not null,
  new_date     date        not null,
  reason       text        not null,
  status       text        not null default 'open',
  decided_by   uuid        references profiles (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz not null default now(),

  constraint deadline_requests_status_valid
    check (status in ('open', 'approved', 'rejected', 'withdrawn')),
  -- "Een goed argument" is niet af te dwingen, maar een leeg argument wel te
  -- weigeren. Twintig tekens is ongeveer één zin.
  constraint deadline_requests_reason_len
    check (char_length(btrim(reason)) between 20 and 1000),
  constraint deadline_requests_note_len
    check (decision_note is null or char_length(decision_note) <= 1000),
  constraint deadline_requests_beslissing_compleet
    check (
      (status = 'open' and decided_by is null and decided_at is null)
      or (status <> 'open')
    )
);

comment on table deadline_requests is
  'Verzoek om de streefdatum van een gekoppeld doel te verschuiven (Q-TODO A7). '
  'De groep ziet het verzoek; verschuiven kan alleen met akkoord van een ander '
  'lid dan de aanvrager.';

-- ⚠️ Eén open verzoek per doel. Zonder deze index kun je tien verzoeken openzetten
--    en wachten tot er eentje langskomt die ja zegt — en dat is precies het
--    tegenovergestelde van "een goed argument indienen".
create unique index if not exists deadline_requests_een_open_per_doel
  on deadline_requests (goal_id) where status = 'open';

create index if not exists deadline_requests_group_idx
  on deadline_requests (group_id, created_at desc);

alter table deadline_requests enable row level security;

-- ⚠️ De hele groep leest mee. Dat is het besluit: "Ja dat moet de groep zien."
drop policy if exists deadline_requests_select on deadline_requests;
create policy deadline_requests_select on deadline_requests for select to authenticated
  using (requester_id = auth.uid() or is_group_member(group_id));

-- Schrijven loopt uitsluitend via de RPC's: een verzoek zonder toets op
-- eigenaarschap en koppeling is geen verzoek maar een aankondiging.
drop policy if exists deadline_requests_insert on deadline_requests;
create policy deadline_requests_insert on deadline_requests for insert to authenticated
  with check (false);

drop policy if exists deadline_requests_update on deadline_requests;
create policy deadline_requests_update on deadline_requests for update to authenticated
  using (false) with check (false);

drop policy if exists deadline_requests_delete on deadline_requests;
create policy deadline_requests_delete on deadline_requests for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- 3. Een nieuw type systeembericht — en dus een migratie, zoals afgesproken
-- ---------------------------------------------------------------------------
--
-- ⚠️ De allowlist is een CHECK en geldt daarmee ook voor `service_role`. Een
--    nieuw type toevoegen kán niet buiten een migratie om, en dat is precies de
--    bedoeling: elk nieuw ding dat de groep te zien krijgt, komt langs de vraag
--    of het mag. Zie `docs/decisions/002-domeinregel7-oppervlakken.md`.
--
-- ⚠️ Alleen het vrágen wordt aangekondigd, niet de uitkomst. Een afgewezen
--    verzoek in de chat is een tegenslagsignaal over iemand anders; de aanvrager
--    ziet de beslissing op zijn eigen doel. Het bericht noemt de persoon en de
--    gebeurtenis, nooit de doeltitel of het argument (dezelfde regel als A22).

alter table chat_messages
  drop constraint if exists chat_messages_system_event_bekend;
alter table chat_messages
  add constraint chat_messages_system_event_bekend
  check (system_event is null or system_event = any (array[
    'group_sleeping', 'member_joined', 'completion_pending', 'completion_approved',
    'milestone_done', 'goal_completed', 'commitment_unlocked', 'commitment_due',
    'deadline_requested'
  ]));

-- ---------------------------------------------------------------------------
-- 4. Een doel zonder groep: gewoon zetten
-- ---------------------------------------------------------------------------

create or replace function zet_streefdatum(p_goal_id uuid, p_date date)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
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

  -- ⚠️ Gekoppeld aan een groep? Dan loopt het via een verzoek. Dit is het punt
  --    waar het besluit van A7 wordt afgedwongen, en het is geen UI-regel.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_group_approval');
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
$$;

comment on function zet_streefdatum(uuid, date) is
  'Zet de streefdatum van een doel dat aan geen enkele groep gekoppeld is. Is er '
  'wel een groep, dan hoort het via vraag_deadline_verschuiving() (Q-TODO A7).';

revoke all on function zet_streefdatum(uuid, date) from public, anon;
grant execute on function zet_streefdatum(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Het verzoek indienen
-- ---------------------------------------------------------------------------

create or replace function vraag_deadline_verschuiving(
  p_goal_id  uuid,
  p_group_id uuid,
  p_new_date date,
  p_reason   text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  g       goals%rowtype;
  schoon  text := btrim(coalesce(p_reason, ''));
  nieuw   uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ⚠️ Lid van de doelgroep én het doel moet er echt aan hangen. Zonder de
  --    tweede toets kun je je doel laten beoordelen door een groep die het niet
  --    kan zien — dat is een akkoord vragen aan mensen die niet weten waarover.
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

  if char_length(schoon) < 20 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_short');
  end if;

  if char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;

  -- ⚠️ Geen exception maar een reden, ook hier. De unieke index vangt de race,
  --    maar een nette voorloper scheelt de gebruiker een foutmelding uit
  --    Postgres.
  if exists (
    select 1 from deadline_requests r where r.goal_id = p_goal_id and r.status = 'open'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_open');
  end if;

  insert into deadline_requests
    (goal_id, group_id, requester_id, old_date, new_date, reason)
  values
    (p_goal_id, p_group_id, auth.uid(), g.target_date, p_new_date, schoon)
  returning id into nieuw;

  -- ⚠️ In een eigen blok. Valt de aankondiging om, dan verliest de gebruiker zijn
  --    bericht en niet zijn verzoek — dezelfde vorm als migratie 0028.
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
$$;

comment on function vraag_deadline_verschuiving(uuid, uuid, date, text) is
  'Dient een verzoek in om de streefdatum te verschuiven, met argument (Q-TODO '
  'A7). Kondigt het verzoek aan in de groep zonder doeltitel of argument.';

revoke all on function vraag_deadline_verschuiving(uuid, uuid, date, text) from public, anon;
grant execute on function vraag_deadline_verschuiving(uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Beslissen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Eén ander lid volstaat, en nooit de aanvrager zelf. Dat is dezelfde vorm
--    als peer-goedkeuring (domeinregel 3) en om dezelfde reden: unanimiteit
--    klinkt zwaarder maar betekent dat één lid op vakantie je deadline voor
--    onbepaalde tijd vastzet, zonder route eruit.

create or replace function beslis_deadline_verzoek(
  p_request_id uuid,
  p_akkoord    boolean,
  p_note       text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r      deadline_requests%rowtype;
  g      goals%rowtype;
  schoon text := nullif(btrim(coalesce(p_note, '')), '');
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

  -- ⚠️ Niet jezelf. Dit is de autorisatiegrens van deze functie en hij staat hier
  --    vóór de lidmaatschapstoets, want een aanvrager ís lid.
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

  -- ⚠️ De datum uit het verzoek en niet uit de aanroep. De beoordelaar zegt ja
  --    tegen wat er stond; kon hij hier een datum meegeven, dan keurt hij iets
  --    anders goed dan hij gelezen heeft.
  update goals set target_date = r.new_date where id = r.goal_id;

  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value)
  values (r.goal_id, r.requester_id, 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', r.new_date,
                             'approved_by', auth.uid(),
                             'request_id',  r.id));

  return jsonb_build_object('ok', true, 'moved', true);
end;
$$;

comment on function beslis_deadline_verzoek(uuid, boolean, text) is
  'Een ander lid van de groep beslist over een deadline-verzoek (Q-TODO A7). Bij '
  'akkoord verschuift de streefdatum en komt er een goal_events-regel; bij een '
  'afwijzing blijft de datum staan. Plaatst geen systeembericht: een afwijzing '
  'is een tegenslagsignaal over een ander (domeinregel 7).';

revoke all on function beslis_deadline_verzoek(uuid, boolean, text) from public, anon;
grant execute on function beslis_deadline_verzoek(uuid, boolean, text) to authenticated;
