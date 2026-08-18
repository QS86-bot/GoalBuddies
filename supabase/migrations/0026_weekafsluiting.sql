-- 0026_weekafsluiting.sql — QS8-73, het ritueel van de huddledag
--
-- ROLLBACK-PAD:
--   drop function if exists weekafsluiting(uuid, date),
--     weekafsluiting_reacties(uuid, date, integer, integer);
--   drop table if exists week_review_replies;
--   alter table week_reviews drop constraint if exists week_reviews_iets_ingevuld;
--   alter table week_reviews drop constraint if exists week_reviews_tekstlengte;
--
-- Wat hier bijkomt: reacties op elkaars antwoorden, twee leesfuncties die de
-- kaart in twee vaste ronden ophalen, en twee grenzen op `week_reviews` zelf.
--
-- ⚠️ `week_reviews.blocked_text` is de enige plek in het hele model waar
--    tegenslag staat die een ander mag lezen, en dat is toegestaan om precies één
--    reden: de gebruiker schrijft hem zelf en verstuurt hem zelf. Dat staat als
--    commentaar op de kolom sinds 0001 en het is de eerste van de twee routes uit
--    domeinregel 7 (de tweede is de hulpknop van de Risico-radar, EPIC 12).
--
--    Daar hangt een eis aan die geen enkele policy kan afdwingen: overslaan moet
--    écht overslaan zijn. Wie niets invult heeft geen rij, en zonder rij staat
--    hij niet op de kaart. Er is daarom nergens een lijst van leden die naast de
--    antwoorden gelegd wordt — dat is het verschil tussen "drie mensen hebben
--    geantwoord" en "twee van de vijf hebben niet gereageerd".
--
-- ⚠️ `group_period_start` komt van de client en dat is met opzet. De groepsklok
--    hoort in `shared/time` (CLAUDE.md, correctheidsregel 7) en de database mag
--    er niet mee rekenen — dezelfde afspraak als bij `group_overview()`.

-- ---------------------------------------------------------------------------
-- 1. Grenzen op de antwoorden zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een rij met drie lege antwoorden is een lid dat op de kaart verschijnt met
--    niets erin. Dat is precies wat "wie niets invult verschijnt gewoon niet"
--    verbiedt, en het is niet met een policy te regelen: het is een eigenschap
--    van de rij.
alter table week_reviews drop constraint if exists week_reviews_iets_ingevuld;
alter table week_reviews add constraint week_reviews_iets_ingevuld check (
  btrim(coalesce(did_text, '')) <> ''
  or btrim(coalesce(blocked_text, '')) <> ''
  or btrim(coalesce(next_text, '')) <> ''
);

alter table week_reviews drop constraint if exists week_reviews_tekstlengte;
alter table week_reviews add constraint week_reviews_tekstlengte check (
  coalesce(char_length(did_text), 0) <= 2000
  and coalesce(char_length(blocked_text), 0) <= 2000
  and coalesce(char_length(next_text), 0) <= 2000
);

-- ---------------------------------------------------------------------------
-- 2. Reageren op elkaars antwoorden
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een eigen tabel en geen extra kolom op `chat_messages`. Een reactie hoort
--    bij één antwoord van één persoon in één periode; hing hij in de chat, dan is
--    de weekafsluiting weer een reeks losse berichten en dat is letterlijk wat
--    het acceptatiecriterium uitsluit.
create table if not exists week_review_replies (
  id             uuid        primary key default gen_random_uuid(),
  week_review_id uuid        not null references week_reviews (id) on delete cascade,
  author_id      uuid        not null references profiles (id)     on delete cascade,
  body           text        not null,
  created_at     timestamptz not null default now(),

  constraint week_review_replies_body_len check (char_length(btrim(body)) between 1 and 1000)
);

comment on table week_review_replies is
  'Reacties op één antwoord van de weekafsluiting (7.5). Zichtbaar voor de groep '
  'van het antwoord waar ze onder hangen, en voor niemand anders.';

-- CLAUDE.md, schaalbaarheidsregel 11: index op elke foreign key en op elke kolom
-- in WHERE of ORDER BY.
create index if not exists week_review_replies_review_idx
  on week_review_replies (week_review_id, created_at);
create index if not exists week_review_replies_author_idx
  on week_review_replies (author_id);

alter table week_review_replies enable row level security;

-- ⚠️ De groep van het ántwoord bepaalt wie meeleest, niet de groep van de
--    schrijver. Zonder de join naar `week_reviews` zou een reactie leesbaar zijn
--    voor iedereen die ergens groepsgenoot van de schrijver is.
drop policy if exists week_review_replies_select on week_review_replies;
create policy week_review_replies_select on week_review_replies for select to authenticated
  using (
    exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id and is_group_member(r.group_id)
    )
  );

drop policy if exists week_review_replies_insert on week_review_replies;
create policy week_review_replies_insert on week_review_replies for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id and is_group_member(r.group_id)
    )
  );

-- ⚠️ Bewust dicht, en niet vergeten. Een reactie is een gebeurtenis en geen
--    toestand — dezelfde keuze als bij `completion_approvals` (0003). Zou hij te
--    bewerken zijn, dan is "wat zat in de weg" een gesprek waarvan de helft
--    achteraf herschreven kan worden, en dat is de veiligheid weg die vraag 2
--    juist moet hebben. Weghalen mag wél: spijt is geen geschiedenis.
--
--    Een expliciete policy en geen ontbrekende: RLS weigert zonder policy ook,
--    maar dan is het niet te zien dat het een keuze was (CLAUDE.md,
--    beveiligingsregel 1).
drop policy if exists week_review_replies_update on week_review_replies;
create policy week_review_replies_update on week_review_replies for update to authenticated
  using (false) with check (false);

drop policy if exists week_review_replies_delete on week_review_replies;
create policy week_review_replies_delete on week_review_replies for delete to authenticated
  using (author_id = auth.uid());

-- ⚠️ `created_at` en `author_id` liggen vast bij het schrijven. Zelfde les als
--    migratie 0010: een client-instelbare tijd maakt van elk venster een
--    suggestie, en een client-instelbare auteur maakt van een reactie een
--    ondertekening met iemand anders zijn naam. De policy vangt `author_id` al af
--    bij INSERT; dit is het slot eronder.
create or replace function stamp_week_review_reply()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end;
$$;

revoke all on function stamp_week_review_reply() from public, anon, authenticated;

drop trigger if exists week_review_replies_stamp on week_review_replies;
create trigger week_review_replies_stamp
  before insert on week_review_replies
  for each row execute function stamp_week_review_reply();

-- ⚠️ Elke echte activiteit wekt de groep (0016). Een reactie op de
--    weekafsluiting is dat — `week_reviews` had de trigger al, de reacties
--    erop nog niet, en dan houdt een levendig gesprek een groep toch in slaap.
--
--    `wek_groep()` leest `new.group_id` en die kolom heeft deze tabel niet, dus
--    hij kan hier niet hangen. Een eigen functie met dezelfde opdracht.
create or replace function wek_groep_via_review()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  update groups g
  set status = 'active', last_activity_at = now()
  where g.id = (select r.group_id from week_reviews r where r.id = new.week_review_id);

  return new;
end;
$$;

revoke all on function wek_groep_via_review() from public, anon, authenticated;

drop trigger if exists week_review_replies_wake on week_review_replies;
create trigger week_review_replies_wake
  after insert on week_review_replies
  for each row execute function wek_groep_via_review();

-- ---------------------------------------------------------------------------
-- 3. De kaart lezen
-- ---------------------------------------------------------------------------
--
-- ⚠️ SECURITY INVOKER. `week_reviews_select` eist lidmaatschap en
--    `profiles_select` een gedeelde groep; deze functie voegt geen recht toe en
--    een niet-lid krijgt nul rijen.
--
-- ⚠️ Eén periode per aanroep, en de app vraagt alleen de lopende. Dat is dezelfde
--    grens als op het groepsoverzicht: binnen de lopende periode betekent
--    "nog geen antwoord" niets anders dan "nog niet". Over een reeks oude
--    perioden zou afwezigheid een verslag worden, en dan is overslaan niet meer
--    gratis.
create or replace function weekafsluiting(
  p_group_id     uuid,
  p_period_start date
)
  returns table (
    review_id     uuid,
    user_id       uuid,
    display_name  text,
    avatar_url    text,
    did_text      text,
    blocked_text  text,
    next_text     text,
    created_at    timestamptz
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select
    r.id,
    r.user_id,
    p.display_name,
    p.avatar_url,
    r.did_text,
    r.blocked_text,
    r.next_text,
    r.created_at
  from week_reviews r
  left join profiles p on p.id = r.user_id
  where r.group_id = p_group_id
    and r.group_period_start = p_period_start
  order by r.created_at asc, r.id asc
  limit 25;
$$;

comment on function weekafsluiting(uuid, date) is
  'De antwoorden van één groepsperiode, in één ronde en met de naam erbij. Wie '
  'niets invulde heeft geen rij en staat er dus niet op (7.5).';

revoke all on function weekafsluiting(uuid, date) from public, anon;
grant execute on function weekafsluiting(uuid, date) to authenticated;

-- ⚠️ De reacties in een tweede vaste ronde en niet per antwoord. Twaalf leden
--    keer één verzoek is de N+1 die het beslisdocument met naam noemt; twee
--    ronden voor een heel scherm is een constante.
create or replace function weekafsluiting_reacties(
  p_group_id     uuid,
  p_period_start date,
  p_limit        integer default 100,
  p_offset       integer default 0
)
  returns table (
    id             uuid,
    week_review_id uuid,
    author_id      uuid,
    author_name    text,
    author_avatar  text,
    body           text,
    created_at     timestamptz,
    total_replies  bigint
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  with zichtbaar as (
    select w.id
    from week_reviews w
    where w.group_id = p_group_id and w.group_period_start = p_period_start
  )
  select
    a.id,
    a.week_review_id,
    a.author_id,
    p.display_name,
    p.avatar_url,
    a.body,
    a.created_at,
    count(*) over () as total_replies
  from week_review_replies a
  join zichtbaar z on z.id = a.week_review_id
  left join profiles p on p.id = a.author_id
  order by a.created_at asc, a.id asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function weekafsluiting_reacties(uuid, date, integer, integer) is
  'De reacties op de antwoorden van één groepsperiode, gepagineerd, met '
  'total_replies voor de teller.';

revoke all on function weekafsluiting_reacties(uuid, date, integer, integer)
  from public, anon;
grant execute on function weekafsluiting_reacties(uuid, date, integer, integer)
  to authenticated;
