-- 0030_goedkeuring_intrekken.sql — Q-TODO A19
--
-- ROLLBACK-PAD:
--   drop function if exists trek_goedkeuring_in(uuid);
--   drop table if exists approval_withdrawals;
--   -- daarna openstaande_beoordelingen(integer, integer) uit 0021 opnieuw
--   -- uitvoeren (de versie met `m.status <> 'inactive'` uit 0029)
--
-- Besluit van Quinten (Q-TODO A19, 18-08-2026): "Ja, dat mag."
--
-- ⚠️ Gekozen vorm: een intrekvenster van vijftien minuten, niet een
--    bevestigingsstap vooraf. Het beoordeelscherm heeft met opzet twee
--    gelijkwaardige knoppen zonder tussenstap — dat is een acceptatiecriterium
--    van 6.1 en de reden dat de goedkeuringssnelheid haalbaar is. Een
--    bevestiging kost precies die vlotheid, en wel bij élke goedkeuring in plaats
--    van bij de zeldzame verkeerde.
--
--    Vijftien minuten is dezelfde grens die `chat_messages_update` al hanteert.
--    Eén venster in dit project en niet twee.
--
-- ⚠️ Append-only (domeinregel 6). De goedkeuring blijft staan; er komt een
--    correctie-record naast. Ook de punten worden niet weggehaald maar
--    tegengeboekt met `reason = 'correction'` — die reden bestond al, dus het
--    puntenmodel uit CLAUDE.md domeinregel 10 verandert niet.
--
-- ⚠️ Er wordt géén systeembericht geplaatst bij het intrekken. Een intrekking
--    zegt "de week van X is toch niet bevestigd", en dat is een tegenslagsignaal
--    over iemand anders — precies wat domeinregel 7 verbiedt. De aankondiging
--    van de goedkeuring wordt in plaats daarvan weggehaald; zie sectie 3.

-- ---------------------------------------------------------------------------
-- 1. Het correctie-record
-- ---------------------------------------------------------------------------

create table if not exists approval_withdrawals (
  id            uuid        primary key default gen_random_uuid(),
  approval_id   uuid        not null references completion_approvals (id) on delete cascade,
  completion_id uuid        not null references completions (id)          on delete cascade,
  approver_id   uuid        not null references profiles (id),
  created_at    timestamptz not null default now(),

  -- Eén keer intrekken. Twee keer is geen correctie maar een fout in de client.
  constraint approval_withdrawals_een_per_goedkeuring unique (approval_id)
);

comment on table approval_withdrawals is
  'Correctie-record bij een ingetrokken goedkeuring (Q-TODO A19). De goedkeuring '
  'zelf blijft staan: geschiedenis wordt aangevuld, niet overschreven '
  '(domeinregel 6).';

create index if not exists approval_withdrawals_completion_idx
  on approval_withdrawals (completion_id);

alter table approval_withdrawals enable row level security;

-- ⚠️ Lezen mag wie de goedkeuring ook mag zien: de intrekker zelf en de
--    eigenaar van de week. Niet de hele groep — dat maakt van een correctie een
--    gebeurtenis.
drop policy if exists approval_withdrawals_select on approval_withdrawals;
create policy approval_withdrawals_select on approval_withdrawals for select to authenticated
  using (
    approver_id = auth.uid()
    or exists (
      select 1
      from completions c
      join weekly_goals w on w.id = c.weekly_goal_id
      join goals g on g.id = w.goal_id
      where c.id = approval_withdrawals.completion_id
        and g.owner_id = auth.uid()
    )
  );

-- ⚠️ Schrijven kan uitsluitend via de RPC. Een open INSERT zou een correctie
--    zijn zonder de bijbehorende tegenboeking, en dan staat het weekdoel op
--    `approved` terwijl de goedkeuring als ingetrokken geldt.
drop policy if exists approval_withdrawals_insert on approval_withdrawals;
create policy approval_withdrawals_insert on approval_withdrawals for insert to authenticated
  with check (false);

drop policy if exists approval_withdrawals_update on approval_withdrawals;
create policy approval_withdrawals_update on approval_withdrawals for update to authenticated
  using (false) with check (false);

drop policy if exists approval_withdrawals_delete on approval_withdrawals;
create policy approval_withdrawals_delete on approval_withdrawals for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- 2. De wachtrij ziet een ingetrokken oordeel niet meer als oordeel
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zonder deze wijziging is intrekken een doodlopende weg: het weekdoel gaat
--    terug naar `pending`, maar de rij komt niet terug in jouw wachtrij omdat er
--    nog steeds een goedkeuring van jou naast ligt. Je zou hem dus wel kunnen
--    intrekken en daarna nooit meer kunnen beoordelen.

create or replace function openstaande_beoordelingen(
  p_limit integer default 20,
  p_offset integer default 0
)
  returns table (
    completion_id   uuid,
    weekly_goal_id  uuid,
    group_id        uuid,
    owner_id        uuid,
    owner_name      text,
    owner_avatar    text,
    goal_title      text,
    weekly_title    text,
    floor_text      text,
    ceiling_text    text,
    achieved_level  text,
    note            text,
    submitted_at    timestamptz,
    total_open      bigint
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select
    c.id,
    w.id,
    k.group_id,
    g.owner_id,
    p.display_name,
    p.avatar_url,
    g.title,
    w.title,
    w.floor_text,
    w.ceiling_text,
    c.achieved_level,
    c.note,
    c.submitted_at,
    count(*) over ()
  from completions c
  join weekly_goals w on w.id = c.weekly_goal_id
  join goals g on g.id = w.goal_id
  join profiles p on p.id = g.owner_id
  join lateral (
    select l.group_id
    from goal_group_links l
    join group_members m on m.group_id = l.group_id
    where l.goal_id = g.id
      and m.user_id = auth.uid()
      and m.status <> 'inactive'
    order by l.linked_at asc
    limit 1
  ) k on true
  where c.superseded_by is null
    and w.status = 'pending'
    and c.user_id <> auth.uid()
    and not exists (
      select 1 from completion_approvals a
      where a.completion_id = c.id
        and a.approver_id = auth.uid()
        -- Een ingetrokken oordeel telt niet als oordeel (Q-TODO A19).
        and not exists (
          select 1 from approval_withdrawals x where x.approval_id = a.id
        )
    )
  order by c.submitted_at asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------------------
-- 3. Intrekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geeft `{ok, reason}` terug en gooit niet. In een SECURITY DEFINER-RPC
--    overleeft niets een `raise exception`: PostgREST draait elke RPC in zijn
--    eigen transactie, dus gooien rolt ook het correctie-record terug. Dat is de
--    les van migratie 0017 en hij geldt hier onverkort.
--
-- ⚠️ De volgorde is niet vrij. Eerst het correctie-record, dan pas de
--    tegenboekingen — zou het andersom staan en viel er halverwege iets om, dan
--    waren de punten terug zonder dat er iets vastlag dat verklaart waarom.

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

  -- ⚠️ Alleen je eigen oordeel. Dit is geen moderatiemiddel: een beheerder mag
  --    de goedkeuring van een ander niet ongedaan maken.
  if a.approver_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if a.created_at <= now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'window_closed');
  end if;

  if exists (select 1 from approval_withdrawals x where x.approval_id = a.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_withdrawn');
  end if;

  insert into approval_withdrawals (approval_id, completion_id, approver_id)
  values (a.id, a.completion_id, a.approver_id);

  -- Het reviewpunt gaat altijd terug: ook "vertel me meer" leverde er een op, en
  -- anders is goedkeuren-en-intrekken een manier om punten te maken.
  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (a.approver_id, null, a.group_id, -1, 'correction', 'completion', a.completion_id);

  -- Was het geen goedkeuring, dan is hier verder niets te herstellen.
  if a.status <> 'approved' then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  select * into c from completions   where id = a.completion_id;
  select * into w from weekly_goals  where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ Een tweede buddy kan dezelfde week ook goedgekeurd hebben. Dan blijft de
  --    week terecht goedgekeurd en wordt er niets teruggedraaid behalve het
  --    reviewpunt van deze intrekker.
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

  -- ⚠️ De aankondiging in de chat moet weg. Blijft hij staan, dan meldt het
  --    kanaal dat de groep vertrouwt een bevestiging die er niet is — precies wat
  --    0006 en 0010 met twee migraties hebben dichtgetimmerd.
  --
  -- ⚠️ Gezocht op de tekst en niet op een verwijzing, want `chat_messages` heeft
  --    geen `ref_id`. Die kolom toevoegen is een wijziging aan het datamodel van
  --    een bestaande tabel en dat vraagt volgens CLAUDE.md eerst toestemming;
  --    staat als A27 in Q-TODO. De tekst is deterministisch, dus binnen dit
  --    venster is de match exact — en bij twijfel (nul of meer dan één treffer)
  --    blijft het bericht liever staan dan dat het verkeerde verdwijnt.
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

comment on function trek_goedkeuring_in(uuid) is
  'Trekt je eigen goedkeuring binnen vijftien minuten in (Q-TODO A19). Legt een '
  'correctie-record vast, boekt punten tegen met reason=correction, zet de week '
  'terug op pending tenzij een andere buddy hem ook goedkeurde, en haalt de '
  'aankondiging uit de chat. Plaatst zelf nooit een bericht: een intrekking is '
  'een tegenslagsignaal over een ander (domeinregel 7).';

revoke all on function trek_goedkeuring_in(uuid) from public, anon;
grant execute on function trek_goedkeuring_in(uuid) to authenticated;
