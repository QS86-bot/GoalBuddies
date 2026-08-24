-- 0076_groepszichtbaarheid.sql — QS8-132, EPIC 13, de fundering van besluit A41
--
-- ROLLBACK-PAD:
--   drop function if exists zet_groepszichtbaarheid(uuid, text, text, boolean);
--   drop table    if exists group_events;
--   drop function if exists create_group(text, smallint, text, text);
--   -- create_group(text, smallint, text) terug uit migratie 0019 §5;
--   -- guard_group_update() terug uit migratie 0016 §3 (zonder zichtbaarheid).
--   alter table groups drop constraint if exists groups_zichtbaarheid_geldig;
--   alter table groups drop column if exists zichtbaarheid;
--   alter table chat_messages drop constraint if exists chat_messages_system_event_bekend;
--   alter table chat_messages add constraint chat_messages_system_event_bekend
--     check (system_event is null or system_event = any (array[
--       'group_sleeping', 'member_joined', 'completion_pending', 'completion_approved',
--       'milestone_done', 'goal_completed', 'commitment_unlocked', 'commitment_due',
--       'deadline_requested', 'chain_milestone'
--     ]));
--   -- Reeds geplaatste group_opened/group_protected-berichten moeten dan eerst
--   -- weg, anders weigert de CHECK. Ze zijn geschiedenis: geen terloopse stap.
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Op 24-08-2026 stonden er 0 rijen in
-- `groups`, `group_members` en `chat_messages`, dus dit draait op een lege tabel.
--
-- ---------------------------------------------------------------------------
-- Wat dit is, en vooral: wat dit niet is
-- ---------------------------------------------------------------------------
--
-- Besluit **A41** (24-08-2026, QS8-128 variant 2): een groep kiest bij het
-- aanmaken tussen **beschermd** (zoals nu, en de standaard) en **open** (de
-- groep ziet ook tegenslag). Domeinregel 7 wordt daarmee een eigenschap per
-- groep in plaats van een eigenschap van het product.
--
-- ⚠️ **Deze migratie opent niets.** Hij legt de keuze vast, maakt het omzetten
--    mogelijk en zorgt dat het omzetten niet stilzwijgend kan. Geen enkele
--    policy varieert er na deze migratie op — dat begint in 0077 met
--    `weekly_goals_select`, oppervlak voor oppervlak. Grens 4 van het besluit
--    zegt het letterlijk: bouw niets vooruitlopend "vast open", want zo
--    verschuift een standaard zonder dat iemand het besloten heeft.
--
--    Praktisch gevolg: na 0076 is de kolom te lezen en te zetten, en verandert
--    er voor élk lid van élke groep exact niets aan wat hij ziet. Dat is met
--    opzet de tussenstand — de RLS-suite toetst hem.
--
-- ⚠️ **Punten blijven privé, ook in een open groep** (besluit A42, apart genomen
--    op dezelfde dag). `points_ledger` staat niet in deze migratie en hoort ook
--    niet in 0077 of verder. Wie het puntentotaal deelt, deelt het missen via
--    een omweg; de vorm voor competitie is een teller die alleen optelt.

begin;

-- ---------------------------------------------------------------------------
-- 1. De keuze zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`not null default 'beschermd'` en niet `null` = onbekend.** Een derde
--    toestand zou betekenen dat elke policy straks moet weten wat "nog niet
--    gekozen" betekent, en het antwoord daarop is altijd "beschermd" — dus dan
--    kan het net zo goed er staan. Bestaande rijen krijgen de default: grens 1
--    van het besluit ("bestaande groepen zijn beschermd") is hiermee een
--    schema-eigenschap en geen belofte.
--
-- ⚠️ Een CHECK en geen enum. Een enum uitbreiden vraagt in Postgres een eigen
--    migratie met een commit ertussen; een CHECK is één `alter`. Dat is dezelfde
--    keuze als bij `weekly_goals_status_valid` en `commitment_events_type_valid`.

alter table groups
  add column if not exists zichtbaarheid text not null default 'beschermd';

alter table groups drop constraint if exists groups_zichtbaarheid_geldig;
alter table groups
  add constraint groups_zichtbaarheid_geldig
  check (zichtbaarheid in ('beschermd', 'open'));

comment on column public.groups.zichtbaarheid is
  'Besluit A41 (QS8-132). "beschermd" = domeinregel 7 onverkort: de groep ziet '
  'geen tegenslag van een ander. "open" = de groep ziet die wél. De standaard '
  'is beschermd en dat is geen toeval; zie CLAUDE.md domeinregel 7.';

-- ---------------------------------------------------------------------------
-- 2. Twee sloten op het schrijven, want de UI is er geen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het eerste slot kreeg de kolom gratis, en dat is precies waarom 0019 het
--    zo heeft opgezet.** Die migratie deed `revoke update on groups from
--    authenticated, anon` en gaf daarna zeven kolommen terug. Een nieuwe kolom
--    valt dus buiten de lijst en is vanaf het eerste moment niet te schrijven
--    door een client — zonder dat iemand eraan hoeft te denken. Dat is het
--    verschil tussen een slot dat werkt en een slot dat je moet onthouden.
--
--    De `revoke` hieronder is daarmee formeel overbodig. Hij staat er omdat een
--    lezer van déze migratie moet kunnen zien dat de kolom niet schrijfbaar is,
--    zonder 0019 erbij te pakken — en omdat hij rood wordt als iemand ooit
--    `grant update on groups` uitvoert en dit daarna opnieuw afspeelt.

revoke update (zichtbaarheid) on groups from authenticated, anon;

-- ⚠️ Het tweede slot: de trigger. Zie 0019 §4 voor waarom er twee zijn — de
--    trigger beslist op `current_user` en faalt open bij een rol die anders
--    heet; de kolomgrant faalt dicht. Samen dekken ze elkaars gat.
--
-- ⚠️ **Lichaam overgenomen uit `pg_get_functiondef()` en niet uit 0016.** Dat is
--    de les van 0075: `create or replace` herschrijft de hele functie, en wat er
--    tussendoor bij is gekomen verdwijnt geruisloos mee.

create or replace function guard_group_update()
  returns trigger
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_by       := old.created_by;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;

  return new;
end;
$$;

comment on function guard_group_update() is
  'RLS kan geen kolommen beperken. De uitnodigingscode, de oprichter, de '
  'slaapstand en de zichtbaarheidskeuze liggen hiermee vast; een beheerder '
  'verandert naam, huddledag en de groepsinstellingen. Zichtbaarheid omzetten '
  'gaat uitsluitend via zet_groepszichtbaarheid() — besluit A41, grens 3.';

-- ---------------------------------------------------------------------------
-- 3. Het auditspoor van de groep
-- ---------------------------------------------------------------------------
--
-- Grens 3 van het besluit: omzetten raakt ánderen, dus het moet auditeerbaar
-- zijn. Er was nog geen `group_events`; `goal_events`, `commitment_events`,
-- `invite_events` en `week_pass_events` bestaan wel en dit volgt hun vorm.
--
-- ⚠️ **`on delete set null` op `actor_id`, en er staat géén trigger op deze
--    tabel.** Dat is de vijfde regel uit beslisdocument 002 §5: een
--    onveranderlijkheidstrigger en een referentiële actie op dezelfde kolom
--    sluiten elkaar uit, en Postgres waarschuwt daar niet voor. De rij blijft,
--    de persoon niet — dezelfde afspraak als bij `chat_messages.sender_id`.
--
-- ⚠️ **Leesbaar voor élk lid van de groep, niet alleen voor beheerders.** Wie
--    zichtbaar wordt gemaakt, hoort te kunnen nazien wanneer dat gebeurd is en
--    door wie. Dit spoor gaat over de groep en niet over iemands gemiste week,
--    dus domeinregel 7 heeft er geen bezwaar tegen — de twee vragen uit
--    CLAUDE.md staan hieronder expliciet beantwoord.
--
--      Kan hieruit iemands gemiste week worden afgeleid?  Nee. De rij bevat een
--      groep, een beheerder, een oude en een nieuwe zichtbaarheid, en een tijd.
--      Er staat geen doel, geen week en geen status in.
--
--      Kan iemand dat met één API-verzoek uitlezen buiten de UI om?  De policy
--      hieronder eist lidmaatschap, en schrijven kan alleen via de definer
--      hieronder — er is geen INSERT-, UPDATE- of DELETE-policy, dus RLS weigert
--      dat categorisch (zelfde vorm als `commitment_events`).

create table if not exists group_events (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references groups (id)   on delete cascade,
  actor_id   uuid                 references profiles (id) on delete set null,
  event_type text        not null,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now(),

  constraint group_events_type_valid check (event_type in ('visibility_changed'))
);

comment on table public.group_events is
  'Auditspoor van beslissingen over de groep als geheel — QS8-132. Vandaag één '
  'gebeurtenis: het omzetten van de zichtbaarheid (besluit A41, grens 3). Bevat '
  'nooit een doel, een week of een status.';

create index if not exists group_events_group_idx
  on group_events (group_id, created_at desc);

alter table group_events enable row level security;

drop policy if exists group_events_select on group_events;
create policy group_events_select on group_events for select to authenticated
  using (is_group_member(group_id));

revoke all on table group_events from anon, authenticated;
grant select on table group_events to authenticated;

-- ---------------------------------------------------------------------------
-- 4. De keuze bij het aanmaken
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`drop` en dan `create`, niet `create or replace`.** Een extra parameter
--    maakt een ándere functie; naast elkaar zou `create_group('naam')`
--    dubbelzinnig zijn en met een foutmelding stranden die naar niets wijst.
--    PostgREST kiest een overload op parameternáám, dus de app hoeft niets te
--    weten van deze verhuizing zolang hij benoemd aanroept.
--
-- ⚠️ **Een onbekende waarde valt terug op beschermd en gooit niet.** Precies
--    zoals `tz` in 0019: dit veld komt van een client, en de conservatiefste
--    uitkomst is hier ook de veilige. Een groep die per ongeluk beschermd is,
--    kan alsnog open; een groep die per ongeluk open is, heeft de gemiste weken
--    van zijn leden al laten zien.

drop function if exists public.create_group(text, smallint, text);

-- ⚠️ `create or replace` op de vierkoloms-versie en niet `create`. Bij een
--    tweede afspeling van deze migratie is de driekoloms-versie al weg en
--    bestaat de nieuwe al; `create` zou dan afbreken met "already exists with
--    same argument types" — en onwrikbare regel 20 eist idempotentie. Eén keer
--    gevangen bij het naspelen op de lokale opstelling.
create or replace function public.create_group(
  group_name    text,
  huddle_day    smallint default 0,
  tz            text default 'Europe/Amsterdam',
  zichtbaarheid text default 'beschermd'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw          groups;
  vandaag        integer;
  lidmaatschap   integer;
  schone_naam    text;
  schone_tz      text;
  schone_zicht   text;
  pogingen       integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  schone_naam := btrim(coalesce(group_name, ''));
  if length(schone_naam) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_short');
  end if;
  if length(schone_naam) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  if huddle_day is null or huddle_day < 0 or huddle_day > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_huddle_day');
  end if;

  -- Onbekende zone? Dan de standaard, en geen fout: de tijdzone komt van het
  -- apparaat en niet uit een formulier, dus dit is geen invoerfout van de
  -- gebruiker maar een apparaat dat iets anders zegt dan Postgres kent.
  schone_tz := coalesce(tz, 'Europe/Amsterdam');
  if not exists (select 1 from pg_timezone_names where name = schone_tz) then
    schone_tz := 'Europe/Amsterdam';
  end if;

  schone_zicht := coalesce(zichtbaarheid, 'beschermd');
  if schone_zicht not in ('beschermd', 'open') then
    schone_zicht := 'beschermd';
  end if;

  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  select count(*) into lidmaatschap
  from group_members
  where user_id = auth.uid() and status <> 'inactive';

  if lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  loop
    pogingen := pogingen + 1;
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz, zichtbaarheid)
      values (schone_naam, auth.uid(), generate_invite_code(), huddle_day, schone_tz,
              schone_zicht)
      returning * into nieuw;
      exit;
    exception when unique_violation then
      if pogingen >= 3 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return jsonb_build_object('ok', true, 'group', to_jsonb(nieuw));
end;
$$;

comment on function public.create_group(text, smallint, text, text) is
  'Groep en oprichterslidmaatschap in een transactie (5.1). Geeft een kenmerk '
  'terug in plaats van een exception, valideert de tijdzone tegen '
  'pg_timezone_names, en kiest de zichtbaarheid (besluit A41) — onbekend wordt '
  'beschermd, want dat is de kant waar een vergissing niets kost.';

revoke all on function public.create_group(text, smallint, text, text) from public, anon;
grant execute on function public.create_group(text, smallint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. De allowlist krijgt zijn elfde en twaalfde naam
-- ---------------------------------------------------------------------------
--
-- ⚠️ `SYSTEEM_GEBEURTENISSEN` in `src/modules/buddies/chat-schemas.ts` gaat in
--    dezelfde wijziging mee, plus een zin in élke taalcatalogus. Er staat sinds
--    0034 een test op die de app-lijst gelijkstelt aan wat de database toestaat
--    (`systeembericht_allowlist()`), en sinds 0075 een die weigert dat een
--    gebeurtenis zonder zin de kale catalogussleutel toont. Eén kant veranderen
--    is dus twee rode tests, en dat is de bedoeling.
--
-- ⚠️ **Twee namen en niet één met een richting in `payload`.** Een groep die
--    opengaat en een groep die weer dichtgaat zijn voor de lezer twee
--    verschillende berichten, en de zin verschilt volledig. Eén naam met een
--    parameter zou betekenen dat de app uit `payload` moet afleiden welke zin er
--    hoort — en dan staat de regel op twee plekken.
--
-- ⚠️ **Mag dit van domeinregel 7?** Ja, en het is zelfs een eis. De twee vragen:
--
--      Kan hieruit iemands gemiste week worden afgeleid?  Nee. Het bericht noemt
--      de beheerder en de nieuwe stand van de groep — geen persoon over wie iets
--      tegenvalt, geen doel, geen week.
--
--      Kan iemand dat met één API-verzoek uitlezen buiten de UI om?  Het staat
--      in `chat_messages` onder de bestaande policy voor groepsleden, en
--      `chat_messages_insert` laat sinds 0071 geen `system_event` van een client
--      toe.
--
--    Sterker: zónder dit bericht zou het omzetten stilzwijgend zijn, en dat is
--    exact wat grens 3 van het besluit verbiedt. Een lid dat het niet wil, moet
--    kunnen zien dát het gebeurd is — dan kan hij zijn doel ontkoppelen.

alter table chat_messages
  drop constraint if exists chat_messages_system_event_bekend;
alter table chat_messages
  add constraint chat_messages_system_event_bekend
  check (system_event is null or system_event = any (array[
    'group_sleeping', 'member_joined', 'completion_pending', 'completion_approved',
    'milestone_done', 'goal_completed', 'commitment_unlocked', 'commitment_due',
    'deadline_requested', 'chain_milestone', 'group_opened', 'group_protected'
  ]));

-- ---------------------------------------------------------------------------
-- 6. Omzetten: expliciet, auditeerbaar, aangekondigd
-- ---------------------------------------------------------------------------
--
-- Grens 3 van besluit A41, letterlijk: *een groep die van beschermd naar open
-- gaat, verandert met terugwerkende kracht wat er over de andere leden zichtbaar
-- wordt. Dezelfde zorgvuldigheid als een commitment device (domeinregel 5):
-- expliciet bevestigd, auditeerbaar, nooit stilzwijgend.*
--
-- Dat is hier drie dingen, en alle drie in de database:
--
--   1. **Expliciet** — `p_bevestigd` moet `true` zijn. Een handeling die je per
--      ongeluk doet, is geen bevestiging; de default is `false` zodat een
--      aanroep zónder het argument niets doet.
--   2. **Auditeerbaar** — een rij in `group_events` met wie, wanneer, van wat
--      naar wat. Die rij is er vóór het bericht, want een bericht mag mislukken
--      (`plaats_systeembericht()` slikt een fout in) en het spoor niet.
--   3. **Aangekondigd** — een systeembericht in de groepschat.
--
-- ⚠️ **De rem staat alleen op de onveilige richting.** Naar `open` kan hooguit
--    één keer per etmaal; naar `beschermd` altijd. Een beheerder die zich
--    vergist heeft, moet dat onmiddellijk kunnen terugdraaien — een wachttijd op
--    díé richting zou de gemiste weken van zijn leden een dag lang zichtbaar
--    houden als straf voor zijn fout. De rem bestaat om heen-en-weer-schakelen
--    te voorkomen, en dat is een eigenschap van de open-kant.
--
-- ⚠️ **SECURITY DEFINER, dus hij draagt zijn eigen autorisatie.** De kolom is
--    voor geen enkele client schrijfbaar (§2), dus er ís geen policy die
--    meekijkt. `is_group_admin()` toetst rol én `status <> 'inactive'`; een
--    oud-beheerder zet hier niets meer om.
--
-- ⚠️ **Geen `raise exception` bij een geweigerde handeling.** Zelfde vorm als
--    `create_group()`: een kenmerk terug, zodat de app een zin kan tonen in de
--    taal van de gebruiker. Een exception zou een Nederlandse serverzin de app
--    in duwen, en dat is precies wat QS8-113 heeft opgeruimd.

create or replace function zet_groepszichtbaarheid(
  p_group_id  uuid,
  p_naar      text,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
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
$$;

comment on function zet_groepszichtbaarheid(uuid, text, boolean) is
  'Zet de zichtbaarheid van een groep om — besluit A41, grens 3 (QS8-132). '
  'Alleen een actieve beheerder, alleen met p_bevestigd, altijd met een rij in '
  'group_events en een systeembericht. Naar open hooguit één keer per etmaal; '
  'naar beschermd altijd, want de veilige richting mag nooit wachten.';

revoke all on function zet_groepszichtbaarheid(uuid, text, boolean) from public, anon;
grant execute on function zet_groepszichtbaarheid(uuid, text, boolean) to authenticated;

commit;
