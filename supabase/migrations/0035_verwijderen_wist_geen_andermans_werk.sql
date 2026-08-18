-- 0035_verwijderen_wist_geen_andermans_werk.sql — bevindingen van de security-review
--
-- ROLLBACK-PAD:
--   drop function if exists zet_doelstatus(uuid, boolean);
--   grant update (status) on goals to authenticated;
--   alter table week_reviews         alter column user_id   set not null;
--   alter table week_review_replies  alter column author_id set not null;
--   alter table chain_links          alter column user_id   set not null;
--   -- en die drie foreign keys terug op `on delete cascade`
--   -- trek_goedkeuring_in(uuid) uit 0030 en vraag_deadline_verschuiving(...) uit
--   -- 0032 opnieuw uitvoeren
--
-- Vier bevindingen, en de eerste is de zwaarste van de hele ronde.

-- ---------------------------------------------------------------------------
-- 1. Je account verwijderen wiste het werk van je buddy's
-- ---------------------------------------------------------------------------
--
-- ⚠️ Migratie 0031 redeneerde zorgvuldig door voor goedkeuringen en
--    chatberichten — "wat bewijs is voor iemand anders, blijft staan zonder jouw
--    naam" — en paste diezelfde eis níét toe op de weekafsluiting, terwijl die
--    structureel identiek is: een groepsritueel waar ánderen iets bij schrijven.
--
--    Het gevolg was echt dataverlies, zonder misbruik en zonder omweg. Jij vult
--    de weekafsluiting in, twee buddy's reageren eronder, jij zegt je account op.
--    De cascade wist jouw `week_reviews`-rij, en via
--    `week_review_replies.week_review_id` (ook cascade) verdwenen daarmee de
--    reacties van je buddy's — inhoud die niet van jou is en die je niet mocht
--    wissen.
--
-- ⚠️ `chain_links` gaat om dezelfde reden mee, vóórdat EPIC 8 die tabel gaat
--    vullen. Beslisdocument 001 zegt met zoveel woorden dat het vertrek van een
--    lid de historische ketting niet mag wijzigen; met een cascade doet het dat
--    wel, met terugwerkende kracht en voor de hele groep.
--
-- ⚠️ De unieke constraints blijven werken: Postgres staat meerdere NULL-waarden
--    toe in een unieke index, dus twee vertrokken leden botsen niet met elkaar.

alter table week_reviews alter column user_id drop not null;
alter table week_reviews drop constraint if exists week_reviews_user_id_fkey;
alter table week_reviews add constraint week_reviews_user_id_fkey
  foreign key (user_id) references profiles (id) on delete set null;

comment on column week_reviews.user_id is
  'NULL betekent: deze persoon heeft zijn account verwijderd. De weekafsluiting '
  'blijft staan zonder naam, want de reacties van de groep hangen eraan (A3).';

alter table week_review_replies alter column author_id drop not null;
alter table week_review_replies drop constraint if exists week_review_replies_author_id_fkey;
alter table week_review_replies add constraint week_review_replies_author_id_fkey
  foreign key (author_id) references profiles (id) on delete set null;

alter table chain_links alter column user_id drop not null;
alter table chain_links drop constraint if exists chain_links_user_id_fkey;
alter table chain_links add constraint chain_links_user_id_fkey
  foreign key (user_id) references profiles (id) on delete set null;

comment on column chain_links.user_id is
  'NULL na accountverwijdering. Het vertrek van een lid mag de historische '
  'ketting van de groep niet wijzigen (beslisdocument 001, domeinregel 6).';

-- ---------------------------------------------------------------------------
-- 2. `goals.status` stond wagenwijd open
-- ---------------------------------------------------------------------------
--
-- ⚠️ Migratie 0032 sloot `target_date`, `max_points`, `risk_status` en
--    `risk_reason` af en liet `status` staan. Alle vier de CHECK-waarden waren
--    daarmee met één PATCH te zetten, en twee ervan doen iets:
--
--      * `completed` laat `meld_doel_af()` afgaan en plaatst "X heeft een doel
--        afgerond" in élke gekoppelde groep — zonder dat er één weekdoel is
--        afgerond. Een verzonnen mijlpaal in het kanaal dat de groep vertrouwt.
--      * `missed` is via `goals_select` leesbaar voor groepsgenoten. Dat is
--        exact het patroon dat `weekly_goals.status` in EPIC 5 tot de zwaarste
--        bevinding tot dan toe maakte.
--
-- ⚠️ Een RPC en geen trigger, om dezelfde reden als bij `target_date`: hier is de
--    eis "welke wáárden mag je zetten", en dat kan een kolomgrant niet. Een
--    trigger die op een rolnaam beslist faalt open (WERKVOORRAAD §7).

revoke update (status) on goals from authenticated, anon;

create or replace function zet_doelstatus(p_goal_id uuid, p_gearchiveerd boolean)
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

  update goals
  set status = case when p_gearchiveerd then 'archived' else 'active' end
  where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function zet_doelstatus(uuid, boolean) is
  'Archiveert een doel of haalt het terug. De enige statuswaarden die een client '
  'mag zetten. completed en missed horen bij het systeem: completed plaatst een '
  'systeembericht in elke gekoppelde groep, en missed is een tegenslagsignaal '
  'dat groepsgenoten via goals_select zouden lezen.';

revoke all on function zet_doelstatus(uuid, boolean) from public, anon;
grant execute on function zet_doelstatus(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Een uitgezet lid kon nog een goedkeuring intrekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ `trek_goedkeuring_in` toetste alleen of je de beoordelaar was, niet of je nog
--    lid bent. Een beheerder zet iemand op `inactive` na een conflict; binnen het
--    kwartier na zijn laatste goedkeuring kan die persoon de week van een ander
--    alsnog terugklappen naar `pending` en diens punten laten terugboeken. Reële
--    schade aan een derde, door iemand die net verwijderd is — en inconsistent
--    met 0029, dat elke andere schrijfweg voor een inactief lid dichtzette.
--
-- De rest van de functie is ongewijzigd; alleen de lidmaatschapstoets is nieuw.

create or replace function trek_goedkeuring_in(p_approval_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  a          completion_approvals%rowtype;
  c          completions%rowtype;
  w          weekly_goals%rowtype;
  g_owner    uuid;
  punten     integer;
  nog_geldig integer;
  tekst      text;
  treffers   integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into a from completion_approvals where id = p_approval_id;

  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if a.approver_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = a.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if a.created_at <= now() - interval '15 minutes' then
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

  select count(*) into nog_geldig
  from completion_approvals b
  where b.completion_id = a.completion_id
    and b.id <> a.id
    and b.status = 'approved'
    and not exists (select 1 from approval_withdrawals x where x.approval_id = b.id);

  if nog_geldig > 0 then
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

  tekst := weergavenaam(a.approver_id) || ' bevestigde de week van '
        || weergavenaam(a.subject_id) || '.';

  select count(*) into treffers
  from chat_messages m
  where m.group_id     = a.group_id
    and m.type         = 'system'
    and m.system_event = 'completion_approved'
    and m.body         = tekst
    and m.created_at  >= a.created_at;

  if treffers = 1 then
    delete from chat_messages m
    where m.group_id     = a.group_id
      and m.type         = 'system'
      and m.system_event = 'completion_approved'
      and m.body         = tekst
      and m.created_at  >= a.created_at;
  end if;

  return jsonb_build_object('ok', true, 'reverted', true);
end;
$$;

revoke all on function trek_goedkeuring_in(uuid) from public, anon;
grant execute on function trek_goedkeuring_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Een daglimiet op deadline-verzoeken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elk verzoek plaatst een systeembericht in de groepschat, en er stond alleen
--    "één open verzoek per doel" op. Zodra er beslist is, kan er meteen een
--    nieuw verzoek in — dus een aanvrager met een medeplichtige die steeds
--    afwijst, kan het kanaal vullen. CLAUDE.md beveiligingsregel 5 eist een
--    limiet op precies dit soort gebruikersgestuurde uitzendingen.
--
-- ⚠️ Vijf per dag per gebruiker, over alle doelen heen. Ruim genoeg dat niemand
--    die het eerlijk gebruikt hem ooit ziet.
--
-- ⚠️ De telling staat ná de goedkope controles en vóór de insert, en geeft een
--    reden terug in plaats van te gooien — anders rolt de transactie terug
--    inclusief wat je net wilde onthouden (de les van migratie 0017).
--
-- De rest van de functie is ongewijzigd; alleen de telling is nieuw.

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
$$;

revoke all on function vraag_deadline_verschuiving(uuid, uuid, date, text) from public, anon;
grant execute on function vraag_deadline_verschuiving(uuid, uuid, date, text) to authenticated;
