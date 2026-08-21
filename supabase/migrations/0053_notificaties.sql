-- 0053_notificaties.sql — EPIC 11 (QS8-91, QS8-77)
--
-- ROLLBACK-PAD:
--   drop table if exists public.notifications_sent;
--   drop table if exists public.push_tokens;
--
-- ⚠️ Twee tabellen, en de tweede is de belangrijkste. `push_tokens` is waar we
--    heen sturen; `notifications_sent` is waarom we niet twee keer sturen.
--
--    Drie acceptatiecriteria hangen aan die tweede tabel — "geen dubbele
--    notificaties bij meerdere groepen of doelen" (QS8-91) en "maximaal één per
--    dag, ook bij meerdere doelen" (QS8-77) — en die kun je niet in de
--    verzendcode oplossen. Een job die twee keer draait, of twee keer tegelijk,
--    stuurt dan alsnog dubbel. De unieke index is de enige plek waar dit écht
--    dichtzit; de code eromheen is optimalisatie.
--
-- ⚠️ **Domeinregel 7 geldt hier onverkort** (QS8-91, laatste criterium: nooit een
--    notificatie over de gemiste week van iemand anders). De vier toegestane
--    soorten staan als CHECK in de database en niet alleen in de code, om
--    dezelfde reden als `chat_messages_system_event_bekend`: een vijfde soort
--    toevoegen hoort een migratie te vragen, zodat er een moment is waarop
--    iemand zich afvraagt of hij domeinregel 7 breekt.
--
--    Let op wat er níét in de lijst staat: niets over een ander. `nudge` en
--    `cycle_summary` gaan over jezelf; `approval_request` is een verzoek van
--    iemand die jóú om een oordeel vraagt; `approval_received` is goed nieuws
--    over jezelf. Er is geen soort die zegt dat een ander iets gemist heeft, en
--    die mag er ook niet komen.

begin;

-- ---------------------------------------------------------------------------
-- 1. Waar we heen sturen
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token        text not null,
  platform     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint push_tokens_platform_valid check (platform in ('ios', 'android', 'web')),
  -- ⚠️ Uniek op de token en niet op (gebruiker, token). Een token hoort bij een
  --    apparaat, en een apparaat hoort op enig moment bij één account. Zonder
  --    deze grens kan ik jouw token op mijn user_id zetten en krijgt jouw
  --    telefoon mijn meldingen — geen datalek, wel een manier om iemand lastig
  --    te vallen. Nu wint wie zich het laatst registreert, en dat is per
  --    definitie het apparaat zelf: de app registreert bij elke start opnieuw.
  constraint push_tokens_token_uniek unique (token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using (user_id = auth.uid());

-- De client móét zijn eigen token kunnen registreren; dat is de hele functie
-- van deze tabel. `with check` op `auth.uid()` maakt claimen voor een ander
-- onmogelijk.
drop policy if exists push_tokens_insert on public.push_tokens;
create policy push_tokens_insert on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_tokens_update on public.push_tokens;
create policy push_tokens_update on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Uitloggen hoort je token weg te halen, anders blijft een gedeeld apparaat
-- meldingen krijgen voor iemand die er niet meer op zit.
drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Waarom we niet twee keer sturen
-- ---------------------------------------------------------------------------

create table if not exists public.notifications_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  -- ⚠️ De kalenderdatum in de tijdzone van de **ontvanger**, niet van de server.
  --    "Maximaal één per dag" is een uitspraak over de dag van de gebruiker; met
  --    een UTC-datum krijgt iemand in Tokio er twee op zijn dinsdag.
  local_date date not null,
  ref_type   text,
  ref_id     uuid,
  sent_at    timestamptz not null default now(),

  constraint notifications_sent_kind_bekend check (
    kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary')
  )
);

-- ⚠️ Twee partiële indexen en niet één gewone. In een unieke index zijn twee
--    NULL's níét gelijk aan elkaar, dus een index over (user_id, kind,
--    local_date, ref_id) laat bij een lege `ref_id` gewoon tien nudges per dag
--    door. Dat is dezelfde val als "een vergelijking met een mogelijk lege
--    waarde is in SQL geen controle", nu aan de indexkant.
create unique index if not exists notifications_sent_per_dag
  on public.notifications_sent (user_id, kind, local_date)
  where ref_id is null;

create unique index if not exists notifications_sent_per_onderwerp
  on public.notifications_sent (user_id, kind, ref_id)
  where ref_id is not null;

alter table public.notifications_sent enable row level security;

-- Lezen mag: je eigen meldingsgeschiedenis terugzien is redelijk, en het is de
-- basis voor "waarom kreeg ik dit". Schrijven niet — dat doet de job als
-- `service_role`. Een client die zelf een rij mag schrijven, kan zijn eigen
-- nudge onderdrukken door hem vooraf als verstuurd te melden.
drop policy if exists notifications_sent_select on public.notifications_sent;
create policy notifications_sent_select on public.notifications_sent
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.notifications_sent from authenticated;
revoke all on public.notifications_sent from anon;
revoke all on public.push_tokens from anon;

commit;
