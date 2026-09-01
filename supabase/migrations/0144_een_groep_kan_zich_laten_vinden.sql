-- 0144_een_groep_kan_zich_laten_vinden.sql — ontdekbaarheid en lidmaatschapsaanvragen (QS8-231)
--
-- ROLLBACK-PAD:
--   drop function if exists public.beslis_lidmaatschapsverzoek(uuid, text);
--   drop function if exists public.vraag_lidmaatschap_aan(uuid, text);
--   drop function if exists public.ontdek_groepen(text, text, integer, integer);
--   drop function if exists public.zet_groepsontdekbaarheid(uuid, boolean, boolean);
--   drop function if exists public.lidmaatschapsverzoeken_over();
--   drop table if exists public.group_join_requests;
--   alter table public.groups drop constraint if exists groups_ontdekbaar_is_beschermd;
--   alter table public.groups drop constraint if exists groups_ontdekbaar_heeft_categorie;
--   alter table public.groups drop constraint if exists groups_categorie_geldig;
--   alter table public.groups drop constraint if exists groups_voertaal_geldig;
--   alter table public.groups drop constraint if exists groups_omschrijving_len;
--   alter table public.groups drop column if exists ontdekbaar;
--   alter table public.groups drop column if exists categorie;
--   alter table public.groups drop column if exists omschrijving;
--   alter table public.groups drop column if exists voertaal;
--   -- guard_group_update() terug uit 0086 §? (zonder de ontdekbaar-regel), en
--   -- de twee allowlists terug naar hun vorige inhoud. Zie sectie 3 en 4.
--
--   ⚠️ `group_join_requests` gaat in zijn geheel weg en dat kost geschiedenis:
--      wie wanneer heeft aangevraagd en wie dat besloot. Op een gevulde database
--      is dat dus geen rollback maar een besluit.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 30-08-2026: een groep kan zichzelf openstellen voor
-- onbekenden. Wie zoekt, bladert per categorie, ziet naam, categorie,
-- omschrijving, ledental en huddledag, en vraagt lidmaatschap aan.
--
-- Op 31-08 kwamen er twee assen bij, en die zijn níét even zwaar:
--
--   * **Taal is bijna gratis** — er staat al een `locale` op het profiel en een
--     voertaal is precies zo gevoelig als een groepsnaam: niet. Zit in deze
--     migratie.
--   * **Buurt is een ánder soort gegeven.** Een locatie is een persoonsgegeven
--     en zodra hij fijnmazig is, is hij herleidbaar — bij deze app aan een doel
--     dat over je gezondheid, je geld of je studie kan gaan. **Die zit hier
--     bewust níét in**; hij hoort een eigen issue te zijn met een eigen
--     afweging, en die staat in QS8-231 uitgeschreven: grofmazig, opt-in,
--     standaard leeg, nooit uit GPS of IP, en nooit een afstand tot jou.
--
-- ---------------------------------------------------------------------------
-- Wat een buitenstaander mag lezen, en waarom dat geen policy kan zijn
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de gevoeligste vraag van dit issue.** Een niet-lid mag zien: naam,
--    categorie, omschrijving, ledental, huddledag en voertaal. Een niet-lid mag
--    níét zien: wie erin zitten, welke doelen erin staan, de chat, De Ketting,
--    reeksen, of wat dan ook per persoon.
--
-- ⚠️ **RLS kan geen kolommen beperken.** Zou `groups_select` een tak krijgen
--    voor "iedereen mag een ontdekbare groep lezen", dan leest een vreemde de
--    héle rij — inclusief `invite_code`, en daarmee kan hij zonder aanvraag
--    binnenlopen. Dat is dezelfde fout die 0089 op `profiles` heeft moeten
--    repareren en die 0050 met `goal_risk` heeft moeten terugdraaien.
--
--    Vandaar `ontdek_groepen()`: SECURITY DEFINER met een expliciete kolomlijst,
--    en `groups_select` blijft onaangeraakt. Wat er niet in de `returns table`
--    staat, bestaat voor een buitenstaander niet.
--
-- ---------------------------------------------------------------------------
-- Een ontdekbare groep is altijd beschermd
-- ---------------------------------------------------------------------------
--
-- ⚠️ Als CHECK en niet als regel in het scherm. Een **open** groep (A41) deelt
--    de gemiste weken van zijn leden; die openstellen voor vreemden zou
--    betekenen dat onbekenden elkaars tegenslag zien, en dat is domeinregel 7
--    die via een omweg wordt afgeschaft. De constraint werkt in beide
--    richtingen: je kunt een open groep niet ontdekbaar maken, en een
--    ontdekbare groep niet openzetten.

begin;

-- ---------------------------------------------------------------------------
-- 1. De vier kolommen
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists ontdekbaar boolean not null default false;

alter table public.groups add column if not exists categorie text;
alter table public.groups add column if not exists omschrijving text;
alter table public.groups add column if not exists voertaal text;

-- ⚠️ Dezelfde woordenlijst als `goals_category_valid` (0142) en
--    `profiles_focus_areas_geldig` (0143). Derde kopie, en dus derde naad:
--    `tests/rls/ontdekken.test.ts` legt hem via `check_waarden()` naast de
--    andere twee.
alter table public.groups drop constraint if exists groups_categorie_geldig;
alter table public.groups add constraint groups_categorie_geldig check (
  categorie is null
  or categorie in (
    'fitness', 'nutrition', 'self_care', 'mindfulness',
    'connection', 'helping', 'creativity',
    'productivity', 'organization', 'learning', 'skills', 'resilience',
    'business', 'study', 'other'
  )
);

-- ⚠️ Dezelfde lijst als `profiles_locale_bekend`. Een taal erbij is dus altijd
--    een migratie, net als bij een nieuw type systeembericht.
alter table public.groups drop constraint if exists groups_voertaal_geldig;
alter table public.groups add constraint groups_voertaal_geldig
  check (voertaal is null or voertaal in ('nl', 'en'));

-- ⚠️ Een grens, want dit is vrije tekst die een vreemde te zien krijgt. Zonder
--    grens is het opslag van een ander (0123).
alter table public.groups drop constraint if exists groups_omschrijving_len;
alter table public.groups add constraint groups_omschrijving_len
  check (omschrijving is null or char_length(omschrijving) between 1 and 280);

-- ⚠️ **De kern van dit issue in twee regels.**
alter table public.groups drop constraint if exists groups_ontdekbaar_is_beschermd;
alter table public.groups add constraint groups_ontdekbaar_is_beschermd
  check (not ontdekbaar or zichtbaarheid = 'beschermd');

-- Zonder categorie is een groep niet te vinden, dus dan is `ontdekbaar` een
-- belofte die niets doet.
alter table public.groups drop constraint if exists groups_ontdekbaar_heeft_categorie;
alter table public.groups add constraint groups_ontdekbaar_heeft_categorie
  check (not ontdekbaar or categorie is not null);

comment on column public.groups.ontdekbaar is
  'Of onbekenden deze groep kunnen vinden en lidmaatschap kunnen aanvragen '
  '(QS8-231). ⚠️ Voor geen enkele client schrijfbaar; omzetten gaat via '
  'zet_groepsontdekbaarheid(). Altijd samen met zichtbaarheid = beschermd.';

comment on column public.groups.voertaal is
  'De taal waarin deze groep met elkaar praat (QS8-231). Een zoekingang, geen '
  'instelling: hij verandert niets aan de taal van de app.';

-- ⚠️ **Drie van de vier kolommen moeten hier met zoveel woorden schrijfbaar
--    gemaakt worden, en dat was in de eerste versie van deze migratie vergeten.**
--    `groups` heeft géén tabelbrede UPDATE voor `authenticated` maar een
--    kolomlijst (0111 zette daar `approval_quorum` bij). Een nieuwe kolom staat
--    daarmee stil dicht: `wijzigGroep()` typecheckt, valideert, stuurt hem mee en
--    krijgt `42501` terug — pas op het moment dat een beheerder hem invult.
--
--    Dat is precies de fout die op 01-09-2026 bij QS8-224 élk doel aanmaken brak,
--    en hij is hier gevonden door de grants van de tabel op te vragen en niet
--    door de migratie te lezen. QS8-258 moet er een controle van maken; tot die
--    er is, is dit blok de handmatige versie.
--
-- ⚠️ **`ontdekbaar` staat er met opzet níét bij.** Twee grendels achter elkaar:
--    geen grant, en `guard_group_update()` zet hem sowieso terug. De enige route
--    is `zet_groepsontdekbaarheid()`, en die toetst zelf.

grant update (categorie, omschrijving, voertaal) on public.groups to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De kolom is voor geen enkele client schrijfbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde grendel en zelfde reden als `zichtbaarheid` in 0076: één route naar
--    deze kolom, en die route toetst zelf. `categorie`, `omschrijving` en
--    `voertaal` blijven wél door een beheerder te wijzigen — dat zijn gegevens
--    over de groep, zoals de naam, en geen toestemming.

create or replace function public.guard_group_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;
  -- QS8-231: ontdekbaarheid is een toestemming en geen instelling.
  new.ontdekbaar       := old.ontdekbaar;

  -- ⚠️ De grendel van 0060, en niet de kale regel die hier stond. `created_by`
  --    heeft `on delete set null`: leeglopen moet erdoor, alles anders niet.
  if old.created_by is null or new.created_by is not null then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Twee nieuwe gebeurtenissen in het auditspoor
-- ---------------------------------------------------------------------------

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid check (
  event_type in (
    'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
    -- QS8-231
    'discoverable_changed', 'join_request_decided'
  )
);

-- ---------------------------------------------------------------------------
-- 4. Eén nieuw systeembericht, en met opzet maar één
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`group_discoverable` wel, "niet meer vindbaar" niet.** Dat tweede is geen
--    tegenslag maar het is ook geen nieuws: de groep sluit zich af en er
--    verandert niets aan wat iemand ziet. De regel uit 0070 geldt hier ook —
--    voeg een bericht alleen toe als de afwezigheid ervan géén signaal wordt, en
--    hier wordt hij dat niet.
--
-- ⚠️ **Wél een bericht bij het openstellen, en dat is niet onderhandelbaar.**
--    Niemand mag er achteraf achter komen dat zijn groep vindbaar is geworden
--    voor onbekenden. Dat is dezelfde zorgvuldigheid als bij een commitment
--    device (domeinregel 5), en het is letterlijk wat QS8-231 punt 2 vraagt.
--
-- ⚠️ Een aangevraagd of afgewezen lidmaatschap krijgt **geen** systeembericht.
--    "X wilde erbij en mocht niet" is een uitspraak over een ander die niets
--    positiefs draagt, en de aanvrager staat niet eens in de groep. Het spoor
--    staat in `group_events`, leesbaar voor de leden.

alter table public.chat_messages drop constraint if exists chat_messages_system_event_bekend;
alter table public.chat_messages add constraint chat_messages_system_event_bekend check (
  system_event is null
  or system_event in (
    'chain_milestone', 'commitment_due', 'commitment_unlocked',
    'completion_approved', 'completion_pending', 'deadline_requested',
    'goal_completed', 'group_opened', 'group_protected', 'group_sleeping',
    'member_joined', 'milestone_done', 'season_recap',
    -- QS8-231
    'group_discoverable'
  )
);

-- ---------------------------------------------------------------------------
-- 5. Openstellen is een handeling, geen instelling
-- ---------------------------------------------------------------------------
--
-- ⚠️ Vorm letterlijk overgenomen van `zet_groepszichtbaarheid()` (0076), en dat
--    is wat QS8-231 punt 2 vraagt: "volg die functie als model en bedenk er geen
--    nieuwe vorm bij". Actieve beheerder, expliciet bevestigd, `for update`
--    tegen twee beheerders tegelijk, een rij in `group_events`, en bij het
--    ópenstellen een systeembericht.

create or replace function public.zet_groepsontdekbaarheid(
  p_group_id  uuid,
  p_naar      boolean,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_oud   boolean;
  v_zicht text;
  v_cat   text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_state');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.ontdekbaar, g.zichtbaarheid, g.categorie
    into v_oud, v_zicht, v_cat
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- ⚠️ De twee voorwaarden geven een eigen reden terug en geen `23514`. De
  --    CHECK is de grendel; dit is de uitleg, en een scherm kan er iets mee.
  if p_naar and v_zicht <> 'beschermd' then
    return jsonb_build_object('ok', false, 'reason', 'not_protected');
  end if;

  if p_naar and v_cat is null then
    return jsonb_build_object('ok', false, 'reason', 'no_category');
  end if;

  update groups set ontdekbaar = p_naar where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    (select auth.uid()),
    'discoverable_changed',
    jsonb_build_object('ontdekbaar', v_oud),
    jsonb_build_object('ontdekbaar', p_naar)
  );

  if p_naar then
    perform plaats_systeembericht(
      p_group_id,
      'group_discoverable',
      'Deze groep is vanaf nu te vinden voor mensen die je nog niet kent. Zij zien de naam, het onderwerp, de omschrijving en het aantal leden — verder niets.',
      null,
      (select auth.uid()),
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'ontdekbaar', p_naar);
end;
$$;

revoke all on function public.zet_groepsontdekbaarheid(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.zet_groepsontdekbaarheid(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. De aanvragen
-- ---------------------------------------------------------------------------

create table if not exists public.group_join_requests (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id)   on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  -- ⚠️ Vrije tekst die een beheerder leest. Optioneel, en begrensd.
  bericht    text,
  status     text        not null default 'pending',
  decided_by uuid        references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint group_join_requests_status_valid check (status in ('pending', 'accepted', 'declined')),
  constraint group_join_requests_bericht_len
    check (bericht is null or char_length(bericht) between 1 and 280)
);

-- ⚠️ Eén openstaande aanvraag per groep per persoon. Een unieke partiële index
--    en geen afspraak: zonder hem is de knop een spamkanaal richting één
--    beheerder, en dat is de vector die beveiligingsregel 5 bij uitnodigingen
--    noemt — hier van de andere kant.
create unique index if not exists group_join_requests_een_openstaand
  on public.group_join_requests (group_id, user_id)
  where status = 'pending';

create index if not exists group_join_requests_groep_idx
  on public.group_join_requests (group_id, status);
create index if not exists group_join_requests_gebruiker_idx
  on public.group_join_requests (user_id);

-- ⚠️ Onwrikbare regel 11: een index op élke foreign key, ook op eentje waar
--    nooit op gezocht wordt. `decided_by` heeft `on delete set null`, en zonder
--    index scant die opruiming bij het verwijderen van een account de hele
--    tabel. `tests/rls/indexdekking.test.ts` vond hem — deze regel stond er niet.
create index if not exists group_join_requests_beslisser_idx
  on public.group_join_requests (decided_by);

alter table public.group_join_requests enable row level security;

-- ⚠️ **De aanvrager ziet zijn eigen aanvragen, de beheerders die van hun groep,
--    en niemand anders iets.** Met name: een gewoon lid ziet niet wie er heeft
--    aangeklopt. Dat is geen tegenslag maar het is wel een uitspraak over
--    iemand die er (nog) niet bij hoort, en die gaat de groep niet aan.
drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select on public.group_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or is_group_admin(group_id));

-- ⚠️ Schrijven kan alleen via de RPC's hieronder: die toetsen de dagrem, of de
--    groep ontdekbaar is, en of je er niet al in zit. Een kale insert zou al die
--    toetsen overslaan.
drop policy if exists group_join_requests_insert on public.group_join_requests;
create policy group_join_requests_insert on public.group_join_requests
  for insert to authenticated
  with check (false);

drop policy if exists group_join_requests_update on public.group_join_requests;
create policy group_join_requests_update on public.group_join_requests
  for update to authenticated
  using (false);

-- ⚠️ `using (false)` en niet "geen policy": onwrikbare regel 1 wil op elke tabel
--    een policy voor alle vier de werkwoorden, zodat er staat dát erover
--    nagedacht is. Een aanvraag is geschiedenis en verdwijnt niet.
drop policy if exists group_join_requests_delete on public.group_join_requests;
create policy group_join_requests_delete on public.group_join_requests
  for delete to authenticated
  using (false);

revoke all on public.group_join_requests from anon;
grant select on public.group_join_requests to authenticated;

comment on table public.group_join_requests is
  'Aanvragen om lid te worden van een ontdekbare groep (QS8-231). Schrijven '
  'gaat uitsluitend via vraag_lidmaatschap_aan() en '
  'beslis_lidmaatschapsverzoek(); de policies staan op false.';

-- ---------------------------------------------------------------------------
-- 7. De dagrem
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde vorm en zelfde reden als `weekdoelen_over()` (0091),
--    `weekplanstappen_over()` (0138) en `dagafvinkingen_over()` (0140) —
--    beveiligingsregel 5. Aanvragen zijn dezelfde spam-vector als uitnodigingen,
--    van de andere kant: één iemand kan honderd beheerders bereiken.
--
-- ⚠️ Faalt dicht bij een lege `auth.uid()`: nul, en niet de hele limiet.

create or replace function public.lidmaatschapsverzoeken_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when (select auth.uid()) is null then 0
    else greatest(
      0,
      10 - (
        select count(*)::integer
        from group_join_requests r
        where r.user_id = (select auth.uid())
          and r.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.lidmaatschapsverzoeken_over() is
  'Hoeveel lidmaatschapsaanvragen de ingelogde gebruiker vandaag nog mag doen '
  '(beveiligingsregel 5, vorm uit 0091). Geeft zonder sessie nul terug.';

revoke all on function public.lidmaatschapsverzoeken_over() from public, anon, authenticated;
grant execute on function public.lidmaatschapsverzoeken_over() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Zoeken — met een expliciete kolomlijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de plek waar dit issue het makkelijkst mis had kunnen gaan.** Wat
--    hier niet in de `returns table` staat, bestaat voor een buitenstaander
--    niet: geen `invite_code`, geen `id` van een lid, geen `zichtbaarheid`, geen
--    `created_by`. Alleen het groeps-id, want zonder dat kan niemand een
--    aanvraag doen — en dat id is op zichzelf geen sleutel: `groups_select`
--    blijft dicht, dus ermee in de hand lees je nog steeds niets.
--
-- ⚠️ **Alleen `status <> 'archived'`.** Een gearchiveerde groep is niet meer
--    actief; wie daar aanklopt, klopt op een deur die niemand meer opendoet.
--
-- ⚠️ Paginering met een harde bovengrens (onwrikbare regel 10). Dit is bij
--    uitstek de lijst die groot wordt.

create or replace function public.ontdek_groepen(
  p_categorie text default null,
  p_taal      text default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
  returns table (
    group_id     uuid,
    naam         text,
    categorie    text,
    omschrijving text,
    voertaal     text,
    huddle_day   smallint,
    leden        bigint,
    totaal       bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with vindbaar as (
    select
      g.id,
      g.name,
      g.categorie,
      g.omschrijving,
      g.voertaal,
      g.huddle_day,
      (
        select count(*)
        from group_members m
        where m.group_id = g.id
          and m.status <> 'inactive'
      ) as leden
    from groups g
    where g.ontdekbaar
      and g.status <> 'archived'
      and (p_categorie is null or g.categorie = p_categorie)
      and (p_taal is null or g.voertaal = p_taal)
  )
  select
    v.id,
    v.name,
    v.categorie,
    v.omschrijving,
    v.voertaal,
    v.huddle_day,
    v.leden,
    count(*) over ()
  from vindbaar v
  -- ⚠️ Op ledental en dan op naam: een deterministische volgorde, anders staat
  --    dezelfde groep op twee pagina's en een andere op geen enkele.
  order by v.leden desc, v.name asc, v.id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.ontdek_groepen(text, text, integer, integer) is
  'Ontdekbare groepen, met een expliciete kolomlijst (QS8-231). ⚠️ Een niet-lid '
  'krijgt hier naam, onderwerp, omschrijving, voertaal, huddledag en ledental — '
  'en niets per persoon. groups_select blijft onaangeraakt; wat hier niet in '
  'staat, bestaat voor een buitenstaander niet.';

revoke all on function public.ontdek_groepen(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ontdek_groepen(text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Aanvragen en beslissen
-- ---------------------------------------------------------------------------

create or replace function public.vraag_lidmaatschap_aan(
  p_group_id uuid,
  p_bericht  text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_ontdekbaar boolean;
  v_status     text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if lidmaatschapsverzoeken_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select g.ontdekbaar, g.status into v_ontdekbaar, v_status
  from groups g where g.id = p_group_id;

  -- ⚠️ Eén antwoord voor "bestaat niet" en "is niet ontdekbaar". Twee antwoorden
  --    zouden van deze functie een manier maken om te toetsen of een groeps-id
  --    bestaat.
  if v_ontdekbaar is not true or v_status = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  if exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;

  insert into group_join_requests (group_id, user_id, bericht)
  values (p_group_id, (select auth.uid()), nullif(btrim(coalesce(p_bericht, '')), ''))
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.vraag_lidmaatschap_aan(uuid, text)
  from public, anon, authenticated;
grant execute on function public.vraag_lidmaatschap_aan(uuid, text) to authenticated;

-- ⚠️ Een beheerder beslist, en de aanvrager komt er pas in bij `accepted`. Er
--    gaat géén systeembericht uit over een afwijzing — zie sectie 4.
create or replace function public.beslis_lidmaatschapsverzoek(
  p_request_id uuid,
  p_naar       text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r group_join_requests;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null or p_naar not in ('accepted', 'declined') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_decision');
  end if;

  select * into r from group_join_requests where id = p_request_id for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not is_group_admin(r.group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  update group_join_requests
     set status = p_naar, decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;

  if p_naar = 'accepted' then
    -- ⚠️ `on conflict do nothing`: iemand kan intussen via een uitnodigingscode
    --    binnen zijn gekomen. Dan is de gewenste toestand al bereikt.
    insert into group_members (group_id, user_id, role, status)
    values (r.group_id, r.user_id, 'member', 'active')
    on conflict do nothing;
  end if;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    r.group_id,
    (select auth.uid()),
    'join_request_decided',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', p_naar)
  );

  return jsonb_build_object('ok', true, 'status', p_naar);
end;
$$;

revoke all on function public.beslis_lidmaatschapsverzoek(uuid, text)
  from public, anon, authenticated;
grant execute on function public.beslis_lidmaatschapsverzoek(uuid, text) to authenticated;

commit;
