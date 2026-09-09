-- 0223_een_bijlage_wijst_naar_deze_groep.sql — een CHECK die afdwingt dat
-- `attachment_url` naar de eigen groep en de eigen afzender wijst, en
-- `groepschat()` die de bijlage meegeeft.
--
-- ROLLBACK-PAD:
--   alter table chat_messages drop constraint if exists chat_messages_attachment_eigen_pad;
--   drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);
--   -- daarna `groepschat()` terugzetten in de vorm van vóór deze migratie
--   -- (zónder `attachment_url` in de returntable), mét:
--   --   revoke all on function public.groepschat(uuid, timestamptz, uuid, integer)
--   --     from public, anon, authenticated;
--   --   grant execute on function public.groepschat(uuid, timestamptz, uuid, integer)
--   --     to authenticated;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 `authenticated` heeft sinds migratie 0059 een INSERT-kolomgrant op
--    `chat_messages.attachment_url`. Zonder een CHECK kan een lid met één
--    PostgREST-verzoek het pad van een ándere groep — of een extern adres — in
--    dat veld zetten, en dan laadt elk groepslid dat adres uit zijn eigen
--    `<Image>`.
--
-- ⚠️ **Dit is de derde keer dat dit project deze fout tegenkomt.** 0127 zette
--    dezelfde grendel op `profiles.avatar_url`, en 0129 moest er bovenop omdat
--    een `like '<mij>/%'`-toets `<mij>/../<ander>/a.png` doorliet. De vormtoets
--    hieronder is uit 0129 overgenomen en niet opnieuw bedacht.
--
-- ⚠️ **Een CHECK en geen policy.** De eis is *"wat mag er in deze kolom staan"*,
--    en RLS beslist over rijen en niet over kolommen. Een policy alleen is hier
--    per definitie te weinig — dezelfde regel die CLAUDE.md bij domeinregel 7
--    opschrijft.
--
-- ---------------------------------------------------------------------------
-- 1. De kolomgrens
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een vormtoets en geen prefixtoets.** `like '<groep>/%'` laat
--    `<groep>/../<andere groep>/x.png` door, en ook een regeleinde met een
--    externe URL erachter. Het patroon is verankerd aan beide kanten (`^` en
--    `$`) en de tekenklasse laat geen `/` toe na het tweede segment.
--
-- ⚠️ **De extensie staat in de toets**, zodat een pad nooit `.svg` of `.html`
--    kan claimen ook al accepteert de bucket dat MIME-type niet. Twee
--    onafhankelijke sloten op hetzelfde.
--
-- ⚠️ **Systeemberichten hebben `sender_id is null`, en die tak staat er met
--    zoveel woorden.** `null::text` in een patroon maakt de hele vergelijking
--    `null` en dus slaagt de CHECK — het goede antwoord, maar bij toeval. Een
--    constraint die per ongeluk het juiste doet, zegt iets anders dan hij
--    bedoelt, en de volgende schrijver leest de bedoeling.

alter table chat_messages drop constraint if exists chat_messages_attachment_eigen_pad;

alter table chat_messages add constraint chat_messages_attachment_eigen_pad check (
  attachment_url is null
  or (
    type <> 'system'
    and sender_id is not null
    and attachment_url ~ (
      '^' || group_id::text || '/' || sender_id::text
          || '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'
    )
  )
);

-- ---------------------------------------------------------------------------
-- 2. groepschat() geeft de bijlage mee
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een returntype-wijziging, dus `create or replace` kán niet** — die mag
--    geen returntype veranderen. Er moet een `drop` vóór, met de handtekening
--    die op de database staat.
--
--    📏 Die is hier opgehaald met `pg_get_functiondef()` en niet overgetypt uit
--    0024: `(uuid, timestamptz, uuid, integer)`. CLAUDE.md waarschuwt bij
--    onwrikbare regel 20 dat een drop van `f(uuid, text, text)` geen nieuwe `f`
--    met zes argumenten dekt.
--
-- ⚠️ **Een gedropte functie neemt zijn grants mee**, en de nieuwe erft van
--    `alter default privileges` — dus `anon` en `service_role` erbij. De
--    `revoke`/`grant` onderaan is daarom geen opsmuk;
--    `tests/rls/functiegrants.test.ts` (0115) wordt rood op een recht zonder
--    grant-regel.
--
-- ⚠️ `security invoker` blijft: deze functie voegt geen recht toe,
--    `chat_messages_select` is de bescherming.

drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);

create or replace function public.groepschat(
  p_group_id  uuid,
  p_before_at timestamptz default null,
  p_before_id uuid        default null,
  p_limit     integer     default 30
)
returns table (
  id             uuid,
  sender_id      uuid,
  sender_name    text,
  sender_avatar  text,
  body           text,
  type           text,
  attachment_url text,
  system_event   text,
  subject_id     uuid,
  subject_name   text,
  actor_id       uuid,
  actor_name     text,
  payload        jsonb,
  created_at     timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.sender_id,
    p.display_name,
    p.avatar_url,
    m.body,
    m.type,
    m.attachment_url,
    m.system_event,
    m.subject_id,
    s.display_name,
    m.actor_id,
    a.display_name,
    m.payload,
    m.created_at
  from chat_messages m
  left join profiles p on p.id = m.sender_id
  left join profiles s on s.id = m.subject_id
  left join profiles a on a.id = m.actor_id
  where m.group_id = p_group_id
    and (
      p_before_at is null
      or p_before_id is null
      or (m.created_at, m.id) < (p_before_at, p_before_id)
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.groepschat(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.groepschat(uuid, timestamptz, uuid, integer)
  to authenticated;
