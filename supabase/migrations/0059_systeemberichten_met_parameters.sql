-- 0059_systeemberichten_met_parameters.sql — QS8-107 stap 2
--
-- ROLLBACK-PAD:
--   drop function if exists plaats_systeembericht(uuid, text, text, uuid, uuid, jsonb);
--   drop function if exists plaats_systeembericht_in_doelgroepen(uuid, text, text, uuid, uuid, jsonb);
--   create function plaats_systeembericht(uuid, text, text) ... (versie uit 0025)
--   create function plaats_systeembericht_in_doelgroepen(uuid, text, text) ... (0025)
--   de zeven meld_*-functies en vraag_deadline_verschuiving terug naar hun
--     driearguments-aanroep;
--   drop index if exists chat_messages_subject_idx, chat_messages_actor_idx;
--   alter table chat_messages drop column subject_id, drop column actor_id,
--     drop column payload;
--   grant insert on public.chat_messages to authenticated;
--   groepschat() terug naar de achtkoloms-versie.
--
-- ---------------------------------------------------------------------------
-- Waarom dit nu moet en niet later
-- ---------------------------------------------------------------------------
--
-- QS8-107 zegt het zelf: dit is het deel dat straks niet meer kan. Een
-- systeembericht wordt opgeslagen met een `system_event` én een uitgeschreven
-- Nederlandse zin in `body`, en een chatbericht is een onveranderlijke kopie
-- (beslisdocument 002 §3). Die zin is er later niet meer uit te krijgen. Wie dan
-- Duits aanzet, krijgt een Duitse app met Nederlandse regels in de geschiedenis.
--
-- ⚠️ **Dit is voor de vierde keer dezelfde valkuil**: een redenering die klopt
--    zolang een tabel leeg is. `chain_links` (0037), `week_pass_events` (0039),
--    `commitments` (0057) en nu `chat_messages`. Het verschil is dat we deze keer
--    op tijd zijn: er staan 52 rijen, allemaal `member_joined` uit een test van
--    18-08, en géén enkel bericht van een mens.
--
-- ---------------------------------------------------------------------------
-- Waarom er twee persoonskolommen zijn en niet één
-- ---------------------------------------------------------------------------
--
-- Het besluit was "`subject_id` plus `payload`". Bij het uitwerken bleek één
-- persoonskolom niet genoeg: `completion_approved` noemt er twee — "Tim
-- bevestigde de week van Sanne".
--
-- ⚠️ **Die tweede persoon mág niet in `payload`.** Een uuid in jsonb heeft geen
--    foreign key, dus hij overleeft het verwijderen van een account. Dat breekt
--    precies de belofte die 0031 en 0033 hebben ingebouwd: `on delete set null`
--    plus een `stamp_chat_message()` die die ene overgang doorlaat, zodat er
--    "Verwijderd lid" komt te staan in plaats van een naam. Een naam die in een
--    jsonb-veld blijft hangen is een AVG-lek met een omweg.
--
--    Vandaar `actor_id` als volwaardige kolom, met dezelfde `on delete set null`.
--    `payload` blijft over voor alles wat géén persoon is — vandaag niets, straks
--    bijvoorbeeld het aantal bij een ketting-mijlpaal (QS8-70).
--
-- ---------------------------------------------------------------------------
-- Wat er met `body` gebeurt
-- ---------------------------------------------------------------------------
--
-- `body` blijft gevuld en blijft de noodterugval, precies zoals QS8-107 het
-- voorschrijft. Twee redenen: de 52 bestaande rijen hebben geen `subject_id` en
-- moeten leesbaar blijven, en een gebeurtenis die de app níét kent (een nieuwere
-- server, een oudere app) hoort geen lege regel te worden.
--
-- ⚠️ De app rendert vanaf nu uit `system_event`; `body` wordt alleen gebruikt als
--    de gebeurtenis onbekend is. Dat staat in
--    `src/modules/buddies/systeemberichten.ts` en er staat een test op.

begin;

-- ---------------------------------------------------------------------------
-- 1. De kolommen
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column if not exists subject_id uuid references public.profiles(id) on delete set null,
  add column if not exists actor_id   uuid references public.profiles(id) on delete set null,
  add column if not exists payload    jsonb;

comment on column public.chat_messages.subject_id is
  'Over wie dit systeembericht gaat. NULL bij een mensbericht en bij group_sleeping. '
  'on delete set null, zodat een verwijderd account "Verwijderd lid" wordt (0031/0033).';

comment on column public.chat_messages.actor_id is
  'Wie de gebeurtenis veroorzaakte, als dat iemand anders is dan subject_id. '
  'Vandaag alleen bij completion_approved: de buddy die bevestigde.';

comment on column public.chat_messages.payload is
  'Parameters die géén persoon zijn. Een persoon hoort hier nooit in: een uuid in '
  'jsonb heeft geen foreign key en overleeft dus het verwijderen van een account.';

-- Onwrikbare regel 11: index op elke foreign key.
create index if not exists chat_messages_subject_idx on public.chat_messages (subject_id);
create index if not exists chat_messages_actor_idx   on public.chat_messages (actor_id);

-- ---------------------------------------------------------------------------
-- 2. De nieuwe kolommen op slot voor de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een kolomgrant en geen policy — RLS kan geen kolommen beperken, de vaste les
--    van dit project. Zonder dit kan een lid bij zijn eigen tekstbericht een
--    `subject_id` meesturen; dat plaatst geen systeembericht (de policy verbiedt
--    `type = 'system'`), maar het zet wel een verwijzing naar een ander in een rij
--    die hij zelf beheert, en dat is precies het soort halve deur dat later een
--    hele blijkt.
--
-- ⚠️ Valkuil 17: een ingetrokken kolomrecht breekt de app stil. Nagelopen vóór
--    het intrekken — `stuurBericht()` in `src/modules/buddies/chat.ts` zet
--    group_id, sender_id, body en type, en verder niets. In `tests/` schrijven
--    `besluiten.test.ts`, `epic7.test.ts` en `policies.test.ts` als cliënt naar
--    deze tabel; die zetten group_id, sender_id, body, type en (om afgewezen te
--    worden) system_event. Alle vijf staan hieronder in de grant, dus er breekt
--    niets — en de test die een vals systeembericht probeert te plaatsen, moet
--    afgaan op de policy zoals hij altijd deed, niet op deze grant.

revoke insert on public.chat_messages from authenticated, anon;
grant insert (group_id, sender_id, body, type, system_event, attachment_url)
  on public.chat_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De stempel dekt de nieuwe kolommen ook
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zonder dit kan de eigenaar van een bericht binnen zijn bewerkvenster alsnog
--    `subject_id` of `payload` verzetten. De kolomgrant hierboven dekt INSERT,
--    niet UPDATE; `chat_messages_update` bestaat voor het bewerkvenster.
--    Onveranderlijk betekent onveranderlijk (beslisdocument 002 §3).

create or replace function public.stamp_chat_message()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;

  new.group_id     := old.group_id;
  new.type         := old.type;
  new.system_event := old.system_event;
  new.created_at   := old.created_at;

  -- Nieuw in 0059. Zelfde reden als `system_event`: dit is de inhoud van het
  -- bericht, niet een veld dat de schrijver later nog mag bijstellen.
  new.subject_id   := old.subject_id;
  new.payload      := old.payload;

  -- ⚠️ `actor_id` volgt hetzelfde patroon als `sender_id` en niet dat van
  --    `subject_id`: hij mag van gevuld naar NULL, want dat is wat
  --    `on delete set null` doet bij het verwijderen van een account. Zou hij
  --    hier hard teruggezet worden, dan draait deze trigger die referentiële
  --    actie in dezelfde bewerking terug — geen fout, geen waarschuwing, wél een
  --    verwijzing naar een profiel dat niet meer bestaat. Dat is letterlijk de
  --    bug die 0031 zijn AVG-belofte kostte en die 0033 heeft gerepareerd.
  if old.actor_id is null or new.actor_id is not null then
    new.actor_id := old.actor_id;
  end if;

  if old.sender_id is null or new.sender_id is not null then
    new.sender_id := old.sender_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. De schrijvers krijgen parameters mee
-- ---------------------------------------------------------------------------
--
-- ⚠️ De nieuwe argumenten hebben een standaardwaarde, dus een bestaande
--    driearguments-aanroep blijft geldig. Dat is bewust: raakt er straks een
--    aanroeper over het hoofd gezien, dan valt hij terug op `body` in plaats van
--    om te vallen. Alle zeven zijn hieronder wél omgezet.

drop function if exists public.plaats_systeembericht(uuid, text, text);
drop function if exists public.plaats_systeembericht_in_doelgroepen(uuid, text, text);

create function public.plaats_systeembericht(
  p_group_id   uuid,
  p_event      text,
  p_body       text,
  p_subject_id uuid  default null,
  p_actor_id   uuid  default null,
  p_payload    jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    insert into chat_messages
      (group_id, sender_id, type, system_event, body, subject_id, actor_id, payload)
    values
      (p_group_id, null, 'system', p_event, p_body, p_subject_id, p_actor_id, p_payload);
  exception
    when others then
      raise warning 'Systeembericht % voor groep % is niet geplaatst: %',
        p_event, p_group_id, sqlerrm;
  end;
end;
$$;

create function public.plaats_systeembericht_in_doelgroepen(
  p_goal_id    uuid,
  p_event      text,
  p_body       text,
  p_subject_id uuid  default null,
  p_actor_id   uuid  default null,
  p_payload    jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  for r in select l.group_id from goal_group_links l where l.goal_id = p_goal_id loop
    perform plaats_systeembericht(r.group_id, p_event, p_body, p_subject_id, p_actor_id, p_payload);
  end loop;
end;
$$;

revoke all on function public.plaats_systeembericht(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.plaats_systeembericht_in_doelgroepen(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.plaats_systeembericht(uuid, text, text, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.plaats_systeembericht_in_doelgroepen(uuid, text, text, uuid, uuid, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. De zeven aanroepers
-- ---------------------------------------------------------------------------
--
-- De Nederlandse zinnen blijven ongewijzigd — ze zijn vanaf nu de terugval en
-- niet meer wat de app toont. Ze noemen nog steeds de persoon en de gebeurtenis
-- en verder niets: geen titel, geen notitie, geen niveau (beslisdocument 002 §3).

create or replace function public.meld_nieuw_lid()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    if exists (
      select 1 from groups g where g.id = new.group_id and g.created_by = new.user_id
    ) then
      return new;
    end if;

    perform plaats_systeembericht(
      new.group_id,
      'member_joined',
      weergavenaam(new.user_id) || ' doet mee.',
      new.user_id
    );
  exception
    when others then
      raise warning 'Systeembericht member_joined is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.meld_voltooiing()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_goal_id uuid;
begin
  begin
    if exists (
      select 1 from completions c
      where c.weekly_goal_id = new.weekly_goal_id and c.id <> new.id
    ) then
      return new;
    end if;

    select w.goal_id into v_goal_id from weekly_goals w where w.id = new.weekly_goal_id;
    if v_goal_id is null then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      v_goal_id,
      'completion_pending',
      weergavenaam(new.user_id) || ' heeft een week afgerond en wacht op bevestiging.',
      new.user_id
    );
  exception
    when others then
      raise warning 'Systeembericht completion_pending is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.meld_goedkeuring()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    if new.status <> 'approved' then return new; end if;

    -- De enige gebeurtenis met twee personen: `subject_id` is degene wiens week
    -- bevestigd is, `actor_id` de buddy die het deed.
    perform plaats_systeembericht(
      new.group_id,
      'completion_approved',
      weergavenaam(new.approver_id) || ' bevestigde de week van '
        || weergavenaam(new.subject_id) || '.',
      new.subject_id,
      new.approver_id
    );
  exception
    when others then
      raise warning 'Systeembericht completion_approved is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.meld_mijlpaal()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner_id uuid;
begin
  begin
    if new.status <> 'done' or old.status = 'done' then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.goal_id,
      'milestone_done',
      weergavenaam(v_owner_id) || ' heeft een mijlpaal gehaald.',
      v_owner_id
    );
  exception
    when others then
      raise warning 'Systeembericht milestone_done is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.meld_doel_af()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    if new.status <> 'completed' or old.status = 'completed' then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.id,
      'goal_completed',
      weergavenaam(new.owner_id) || ' heeft een doel afgerond.',
      new.owner_id
    );
  exception
    when others then
      raise warning 'Systeembericht goal_completed is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.meld_commitment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner_id uuid;
begin
  begin
    if old.status = new.status then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    if new.type = 'reward' and new.status = 'unlocked' then
      perform plaats_systeembericht_in_doelgroepen(
        new.goal_id,
        'commitment_unlocked',
        weergavenaam(v_owner_id) || ' heeft een beloning vrijgespeeld.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_unlocked', 'bereik', 'doelgroepen'));

    elsif new.type = 'penalty'
      and new.status = 'due'
      and new.beneficiary_group_id is not null
    then
      perform plaats_systeembericht(
        new.beneficiary_group_id,
        'commitment_due',
        'De inzet die ' || weergavenaam(v_owner_id)
          || ' zelf heeft ingesteld, is verschuldigd geworden.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_due',
                                 'bereik', 'begunstigde_groep',
                                 'group_id', new.beneficiary_group_id));
    end if;
  exception
    when others then
      raise warning 'Systeembericht voor commitment % is niet geplaatst: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.meld_nieuw_lid() from public, anon, authenticated;
revoke all on function public.meld_voltooiing() from public, anon, authenticated;
revoke all on function public.meld_goedkeuring() from public, anon, authenticated;
revoke all on function public.meld_mijlpaal() from public, anon, authenticated;
revoke all on function public.meld_doel_af() from public, anon, authenticated;
revoke all on function public.meld_commitment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. De chat geeft de namen mee
-- ---------------------------------------------------------------------------
--
-- ⚠️ De namen worden hier opgehaald en niet bij het schrijven vastgelegd. Dat is
--    het hele punt van `subject_id`: hernoemt iemand zich, dan klopt de
--    geschiedenis mee, en verwijdert iemand zijn account, dan valt de join leeg
--    en toont de app "Verwijderd lid" — zonder dat er één rij herschreven wordt.
--
-- ⚠️ `left join` en niet `join`: een leeg profiel mag een regel niet laten
--    verdwijnen. En de functie blijft INVOKER, dus `profiles_select` bepaalt wat
--    er te zien is — precies zoals bij `sender_name`.

drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);

create function public.groepschat(
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
  subject_id    uuid,
  subject_name  text,
  actor_id      uuid,
  actor_name    text,
  payload       jsonb,
  created_at    timestamptz
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select
    m.id,
    m.sender_id,
    p.display_name,
    p.avatar_url,
    m.body,
    m.type,
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

revoke all on function public.groepschat(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.groepschat(uuid, timestamptz, uuid, integer) to authenticated;

commit;
