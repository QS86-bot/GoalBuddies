-- 0024_groepschat.sql — QS8-69, de groepschat aan de praat
--
-- ROLLBACK-PAD:
--   alter publication supabase_realtime drop table chat_messages;
--   drop function if exists groepschat(uuid, timestamptz, uuid, integer);
--   drop index if exists chat_messages_group_cursor_idx;
--   alter table chat_messages drop constraint if exists chat_messages_inhoud_vereist;
--
-- Wat hier gebeurt: `chat_messages` gaat in de realtime-publicatie, er komt een
-- leesfunctie met cursorpaginering en sendersnaam in één ronde, en een leeg
-- bericht kan niet meer.
--
-- ⚠️ NOOIT `alter table chat_messages replica identity full`. Precies dezelfde
--    afspraak als voor `completions` en `weekly_goals` (Q-TODO A20), en om
--    dezelfde reden: Supabase past RLS toe op INSERT- en UPDATE-gebeurtenissen,
--    maar **niet op DELETE**. Met de standaard replica identity gaat er bij het
--    wissen van een bericht alleen een uuid over de lijn. Met `FULL` gaat de
--    volledige oude rij mee — de tekst van een privégesprek — naar iedereen die
--    zich op `public:chat_messages` abonneert, lid of niet.
--
--    De app abonneert zich daarom uitsluitend op INSERT (zie
--    `modules/buddies/chat.ts`). Dat is de tweede helft van dezelfde afspraak:
--    er valt niets te winnen met DELETE-gebeurtenissen en er valt wel iets te
--    verliezen.

-- ---------------------------------------------------------------------------
-- 1. Een bericht heeft inhoud
-- ---------------------------------------------------------------------------
--
-- ⚠️ `body` is nullable omdat een foto-bericht (7.3, phase:v2) alleen een
--    bijlage heeft. Zonder deze CHECK is een bericht zonder tekst én zonder
--    bijlage ook geldig: een lege regel in het gesprek van drie mensen, die je
--    niet kunt onderscheiden van een storing.
--
--    `body` heeft al een bovengrens (`chat_messages_body_len`, 4000 tekens).
--    Dit is de ondergrens, en hij staat in de database en niet alleen in Zod
--    omdat de tabel rechtstreeks beschrijfbaar is via PostgREST.
alter table chat_messages drop constraint if exists chat_messages_inhoud_vereist;
alter table chat_messages add constraint chat_messages_inhoud_vereist check (
  btrim(coalesce(body, '')) <> '' or attachment_url is not null
);

-- ---------------------------------------------------------------------------
-- 2. Realtime
-- ---------------------------------------------------------------------------
--
-- ⚠️ Idempotent via de catalogus. `alter publication ... add table` gooit
--    "table is already member of publication" bij een tweede run, en een
--    migratie die de tweede keer stukloopt is geen migratie.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. De geschiedenis lezen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Cursorpaginering en geen offset. Een chat groeit aan de kop: met
--    `limit/offset` schuift elk nieuw bericht de hele lijst één plek op, en dan
--    krijgt "ouder laden" een regel te zien die je al had — of slaat er één over.
--    De cursor is `(created_at, id)` en niet `created_at` alleen, want
--    `stamp_chat_message()` zet `created_at` op `now()` en dat is de tijd van de
--    transactie: twee berichten uit dezelfde transactie (een systeembericht naast
--    de gebeurtenis die het aankondigt) dragen exact dezelfde tijd. Op een
--    paginagrens verdwijnt er dan stil één.
--
-- ⚠️ SECURITY INVOKER, net als `group_overview` en `openstaande_beoordelingen`.
--    Deze functie voegt geen recht toe: `chat_messages_select` eist
--    lidmaatschap en `profiles_select` eist een gedeelde groep. Een niet-lid
--    krijgt nul rijen, en dat ziet er hetzelfde uit als een groep die niet
--    bestaat.
--
-- ⚠️ `left join` op profiles en geen inner join. Een oud-lid staat niet meer in
--    `profiles_select`, dus zijn naam komt leeg terug — maar zijn bericht hoort
--    in het gesprek te blijven staan. Met een inner join valt het uit de
--    geschiedenis en gaat een antwoord erop over lucht.
create or replace function groepschat(
  p_group_id  uuid,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 30
)
  returns table (
    id            uuid,
    sender_id     uuid,
    sender_name   text,
    sender_avatar text,
    body          text,
    type          text,
    system_event  text,
    created_at    timestamptz
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select
    m.id,
    m.sender_id,
    p.display_name,
    p.avatar_url,
    m.body,
    m.type,
    m.system_event,
    m.created_at
  from chat_messages m
  left join profiles p on p.id = m.sender_id
  where m.group_id = p_group_id
    and (
      p_before_at is null
      or p_before_id is null
      or (m.created_at, m.id) < (p_before_at, p_before_id)
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

comment on function groepschat(uuid, timestamptz, uuid, integer) is
  'De chatgeschiedenis van één groep, nieuwste eerst, met de naam van de '
  'afzender erbij. Cursorpaginering op (created_at, id). SECURITY INVOKER: de '
  'policies blijven de bescherming.';

revoke all on function groepschat(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function groepschat(uuid, timestamptz, uuid, integer) to authenticated;

-- ⚠️ De bestaande index is `(group_id, created_at desc)`. Die dekt de cursor niet
--    helemaal: de rij-vergelijking op `(created_at, id)` moet dan nog filteren
--    binnen gelijke tijdstempels. Met `id` erbij is het één index-scan.
create index if not exists chat_messages_group_cursor_idx
  on chat_messages (group_id, created_at desc, id desc);
