-- 0299_de_wachtrij_voor_buddys_met_een_gelijkend_doel.sql — de wachtrij waarin je
-- je doel aanmeldt voor koppeling aan onbekenden met een gelijkend doel, plus de
-- stand die je erover te zien krijgt.
--
-- ROLLBACK-PAD:
--   drop function if exists public.buddyzoek_stand(uuid, date);
--   drop function if exists public.zoek_buddies_uit(uuid);
--   drop function if exists public.zoek_buddies_aan(uuid, boolean);
--   drop function if exists public.buddyzoekopdrachten_over();
--   drop trigger  if exists goal_match_queue_eigenaar on public.goal_match_queue;
--   drop function if exists public.pin_wachtrij_eigenaar();
--   drop table    if exists public.goal_match_queue;
--   drop function if exists public.doelperiode(date, date);
--
--   ⚠️ Op een gevúlde tabel is dat laatste geen rollback maar een besluit: het
--      wist wie wanneer buddy's zocht en wat daaruit kwam. Vandaag is de tabel
--      nieuw en dus leeg.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-233, het laatste open deelissue van epic QS8-230. Besluit van Quinten,
-- 30-08-2026: "allebei, ontdekken eerst" — ontdekken (0144) is geland, dit is
-- de tweede helft.
--
-- 📏 De aanleiding is een gemeten leegte: tot 0144 was er precies één weg een
--    groep in, een uitnodigingscode, en daarmee rustte onder het hele model de
--    aanname dat elke groep uit mensen bestaat die elkaar gekozen hebben. Die
--    aanname is weg, en CLAUDE.md zegt bij domeinregel 7 met zoveel woorden dat
--    dat de regel **zwaarder** maakt en niet lichter.
--
-- ---------------------------------------------------------------------------
-- Wat hier NIET in zit, en waarom dat opzet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Er wordt nergens op de tékst van een doel gematcht.** Dat lijkt de
--    voor de hand liggende as en het is een lek: `goals.title` is persoonlijk, en
--    een matcher die erop zoekt moet titels ergens vergelijkbaar maken. De drie
--    assen zijn categorie, periodeband en week-startdag — grof genoeg om te
--    vullen, en ze verraden niets over wat iemand wil bereiken.
--
-- ⚠️ **`category` en `week_start_day` worden niet gekopieerd naar de wachtrij.**
--    Ze zouden verouderen: wie zijn week-startdag verzet terwijl hij wacht, zou
--    op een **harde** eis gematcht worden met een stale waarde. De matcher joint
--    live. `user_id` staat er wél gedenormaliseerd — zie de trigger hieronder.

-- ---------------------------------------------------------------------------
-- 1. De periodeband — één definitie, en hij kent de tijd niet
-- ---------------------------------------------------------------------------
--
-- ⚠️ `immutable`, en hij leest `now()` noch `current_date`: het peilmoment komt
--    als argument binnen. Daarmee is dit geen tweede klok naast `shared/time`
--    (correctheidsregel 7) maar een zuivere indeling van een afstand in dagen,
--    en `klokgrens:controle` heeft er geen registerrij voor nodig.
--
-- ⚠️ De spiegel in TypeScript is `doelperiodeBand()` in `src/shared/time`. Twee
--    implementaties van één belofte vragen een naadtest die beide kanten over
--    hetzelfde datumraster legt — die staat in `tests/beloftes/`.

create or replace function public.doelperiode(p_target date, p_vandaag date)
  returns smallint
  language sql
  immutable
  set search_path = public, pg_temp
as $$
  select case
    when p_target is null or p_vandaag is null then null
    when p_target < p_vandaag                  then null
    when p_target - p_vandaag <=  90           then 0::smallint
    when p_target - p_vandaag <= 180           then 1::smallint
    when p_target - p_vandaag <= 365           then 2::smallint
    else                                            3::smallint
  end;
$$;

revoke all on function public.doelperiode(date, date) from public, anon, authenticated;
grant execute on function public.doelperiode(date, date) to authenticated;

comment on function public.doelperiode(date, date) is
  'De periodeband van een streefdatum ten opzichte van een peildatum: 0 = tot 90 '
  'dagen, 1 = tot 180, 2 = tot een jaar, 3 = verder, null = verstreken. Immutable '
  'en zonder eigen klok; het peilmoment komt als argument. Spiegel van '
  'doelperiodeBand() in src/shared/time.';

-- ---------------------------------------------------------------------------
-- 2. De wachtrij
-- ---------------------------------------------------------------------------

create table if not exists public.goal_match_queue (
  id         uuid        primary key default gen_random_uuid(),
  goal_id    uuid        not null references public.goals(id)    on delete cascade,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  status     text        not null default 'wachtend',
  group_id   uuid                 references public.groups(id)   on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

alter table public.goal_match_queue
  drop constraint if exists goal_match_queue_status_geldig;
alter table public.goal_match_queue
  add  constraint goal_match_queue_status_geldig
  check (status in ('wachtend', 'gekoppeld', 'vertrokken', 'verlopen'));

-- ⚠️ Een `group_id` hóórt bij precies één stand, en beide kanten op. Zonder de
--    rechterhelft blijft een verwijzing staan nadat de stand teruggezet is, en
--    dan wijst een `vertrokken` rij naar een groep waar die persoon niet in zit.
alter table public.goal_match_queue
  drop constraint if exists goal_match_queue_groep_alleen_gekoppeld;
alter table public.goal_match_queue
  add  constraint goal_match_queue_groep_alleen_gekoppeld
  check ((status = 'gekoppeld') = (group_id is not null));

alter table public.goal_match_queue
  drop constraint if exists goal_match_queue_venster;
alter table public.goal_match_queue
  add  constraint goal_match_queue_venster
  check (expires_at > created_at);

-- ⚠️⚠️ **Deze partiële unieke index is twee dingen tegelijk.** Hij houdt een doel
--    op hoogstens één openstaande rij — en hij is de garantie waar `eenrij:controle`
--    (QS8-605) om vraagt voor de `.maybeSingle()` in de datalaag. Een `.maybeSingle()`
--    zonder zo'n garantie is de aanname "er is er precies één" zonder dat iets
--    hem waarmaakt.
create unique index if not exists goal_match_queue_een_wachtende_per_doel
  on public.goal_match_queue (goal_id) where status = 'wachtend';

create index if not exists goal_match_queue_wachtend_op_volgorde
  on public.goal_match_queue (created_at) where status = 'wachtend';
create index if not exists goal_match_queue_van_gebruiker
  on public.goal_match_queue (user_id, created_at desc);
create index if not exists goal_match_queue_groep
  on public.goal_match_queue (group_id);
create index if not exists goal_match_queue_doel
  on public.goal_match_queue (goal_id);

-- ---------------------------------------------------------------------------
-- 3. De eigenaarskolom is een kopie, en een kopie heeft een grendel nodig
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ `user_id` staat hier gedenormaliseerd naast `goal_id`, en dat is dezelfde
--    keuze als `completion_approvals.subject_id` in 001-datamodel §2.3. De reden
--    is de leespolicy: zonder deze kolom moet `goal_match_queue_select` een
--    subquery op `goals` doen, en dán erft de policy de RLS van `goals` zonder
--    dat iemand dat besloten heeft. 📏 Dat is precies rij 33 in
--    `docs/decisions/002-domeinregel7-oppervlakken.md` — `bewijsfotos_select`
--    erfde `deelt_open_groep_met_doel()` als bijvangst.
--
--    Een kopie die niemand bewaakt is een tweede waarheid; deze trigger is de
--    grendel die hem waar houdt, ook voor `service_role`.

create or replace function public.pin_wachtrij_eigenaar()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_eigenaar uuid;
begin
  select g.owner_id into v_eigenaar from goals g where g.id = new.goal_id;

  if v_eigenaar is null then
    raise exception 'Een wachtrijrij hoort bij een bestaand doel'
      using errcode = 'foreign_key_violation';
  end if;

  new.user_id := v_eigenaar;
  return new;
end;
$$;

revoke all on function public.pin_wachtrij_eigenaar() from public, anon, authenticated;

drop trigger if exists goal_match_queue_eigenaar on public.goal_match_queue;
create trigger goal_match_queue_eigenaar
  before insert or update on public.goal_match_queue
  for each row execute function public.pin_wachtrij_eigenaar();

-- ---------------------------------------------------------------------------
-- 4. RLS — de rij is van de eigenaar en van niemand anders
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een wachtrijrij is op zichzelf al informatie.** Hij zegt dat deze
--    persoon een doel in deze categorie met deze streefdatum heeft en actief
--    buddy's zoekt. Niemand anders leest hem ooit — ook een toekomstige
--    groepsgenoot niet. De matcher draait als `service_role` en komt langs RLS
--    heen; elke client leest uitsluitend zijn eigen rijen.
--
--    De twee vragen van domeinregel 7: (1) is hieruit iemands gemiste week af te
--    leiden — nee, de rij draagt geen status, geen cyclus en geen punt; (2) is
--    dit buiten de UI om uit te lezen — ja, maar alleen je eigen rijen, en de
--    gedenormaliseerde `user_id` staat er juist om die policy niet op `goals` te
--    laten leunen.

alter table public.goal_match_queue enable row level security;
alter table public.goal_match_queue force row level security;

drop policy if exists goal_match_queue_select on public.goal_match_queue;
create policy goal_match_queue_select on public.goal_match_queue
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️ Zelfde vorm en zelfde reden als `reports_insert` (0145 §4): de enige
--    schrijver is `zoek_buddies_aan()`, en die toetst het eigendom van het doel,
--    de dagrem én de bevestiging. Een kale insert slaat alle drie over.
drop policy if exists goal_match_queue_insert on public.goal_match_queue;
create policy goal_match_queue_insert on public.goal_match_queue
  for insert to authenticated
  with check (false);

-- ⚠️ Uit de rij stappen loopt over `zoek_buddies_uit()`, zodat het geen race met
--    de matcher kan zijn (`for update`) en er een `decided_at` komt te staan.
drop policy if exists goal_match_queue_update on public.goal_match_queue;
create policy goal_match_queue_update on public.goal_match_queue
  for update to authenticated
  using (false);

-- ⚠️⚠️ **DELETE staat dicht en dat is een keuze, geen omissie.** De rij blijft
--    staan met `vertrokken` of `verlopen`. Kon hij weg, dan is de partiële unieke
--    index geen rem meer op eindeloos in- en uitstappen, en is er geen spoor van
--    wat er gebeurd is. `deleterecht:controle` krijgt hiervoor een registerrij.
drop policy if exists goal_match_queue_delete on public.goal_match_queue;
create policy goal_match_queue_delete on public.goal_match_queue
  for delete to authenticated
  using (false);

revoke all on public.goal_match_queue from public, anon, authenticated;
grant select on public.goal_match_queue to authenticated;

comment on table public.goal_match_queue is
  'De wachtrij voor koppeling aan onbekenden met een gelijkend doel. Alleen de '
  'eigenaar leest zijn eigen rijen; schrijven loopt uitsluitend over '
  'zoek_buddies_aan() en zoek_buddies_uit(). QS8-233.';

-- ---------------------------------------------------------------------------
-- 5. De dagrem
-- ---------------------------------------------------------------------------
--
-- Woordelijk de vorm van `meldingen_over()` (0145 §5) en
-- `lidmaatschapsverzoeken_over()`: `stable`, definer, en hij faalt **dicht** op
-- nul zodra er geen `auth.uid()` is. Beveiligingsregel 5 — een wachtopdracht is
-- goedkoop voor de aanvrager en niet voor de matcher.

create or replace function public.buddyzoekopdrachten_over()
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
      5 - (
        select count(*)::integer
        from goal_match_queue q
        where q.user_id = (select auth.uid())
          and q.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

revoke all on function public.buddyzoekopdrachten_over() from public, anon, authenticated;
grant execute on function public.buddyzoekopdrachten_over() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. In de rij stappen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`p_bevestigd` is geen formaliteit en de tak erop is de kern van deze
--    functie.** In de rij stappen koppelt je doel straks aan een groep, en een
--    koppeling zet de beoordeelbaarheidsgrendel om
--    (`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`): je lópende
--    weekdoelen worden beoordeelbaar en kunnen vanaf dat moment een **minpunt**
--    opleveren. Dat is "wat een gebruiker als consequentie beloofd is" — grens 1
--    van de Beslisbevoegdheid — en dus leest de gebruiker het vóór de knop in
--    plaats van erna. Zelfde zwaarte en zelfde vorm als
--    `zet_groepsontdekbaarheid()`.
--
-- ⚠️ "Bestaat niet" en "is niet van jou" geven één antwoord. Twee antwoorden
--    maken van deze functie een aftastinstrument op doel-id's — dezelfde reden
--    waarom `vraag_lidmaatschap_aan()` `not_open` teruggeeft voor drie gevallen.

create or replace function public.zoek_buddies_aan(p_goal_id uuid, p_bevestigd boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_status  text;
  v_target  date;
  v_wacht   integer;
  v_groepen integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if buddyzoekopdrachten_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select g.status, g.target_date into v_status, v_target
  from goals g
  where g.id = p_goal_id and g.owner_id = (select auth.uid());

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  if v_target is null or v_target < current_date then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Idempotent: geen fout, maar ook geen tweede rij. De partiële unieke index
  -- is de tweede grendel, voor het geval twee verzoeken elkaar kruisen.
  if exists (
    select 1 from goal_match_queue q
    where q.goal_id = p_goal_id and q.status = 'wachtend'
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_queued');
  end if;

  select count(*)::integer into v_wacht
  from goal_match_queue q
  where q.user_id = (select auth.uid()) and q.status = 'wachtend';

  if v_wacht >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_queued');
  end if;

  -- ⚠️ Hetzelfde plafond als `create_group()` en `join_group_with_code()`. Drie
  --    tellingen van één limiet die verschillend rekenen, is een limiet die van
  --    je route afhangt — 0287 waarschuwt daar zelf voor.
  select count(*)::integer into v_groepen
  from group_members m
  where m.user_id = (select auth.uid()) and m.status <> 'inactive';

  if v_groepen >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  insert into goal_match_queue (goal_id, user_id, expires_at)
  values (p_goal_id, (select auth.uid()), now() + interval '14 days');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.zoek_buddies_aan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.zoek_buddies_aan(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Uit de rij stappen — altijd, en het kost niets
-- ---------------------------------------------------------------------------
--
-- ⚠️ `for update` en niet alleen een `update ... where`: de matcher leest
--    kandidaten met `for update skip locked` en zet ze in dezelfde transactie op
--    `gekoppeld`. Zonder de lock hier kan iemand uitstappen terwijl hij al in een
--    groep gezet wordt, en dan bestaat er een groep met een lid dat dacht te zijn
--    weggelopen.
--
-- ⚠️ Is de rij al `gekoppeld`, dan bestaat de groep en is uitstappen een ándere
--    handeling met een andere afhandeling: `verlaat_groep()` (0102). Deze functie
--    doet daar niets aan en zegt dat.

create or replace function public.zoek_buddies_uit(p_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  select q.id, q.status into v_id, v_status
  from goal_match_queue q
  where q.goal_id = p_goal_id
    and q.user_id = (select auth.uid())
    and q.status in ('wachtend', 'gekoppeld')
  order by q.created_at desc
  limit 1
  for update;

  if v_id is null then
    return jsonb_build_object('ok', true);
  end if;

  if v_status = 'gekoppeld' then
    return jsonb_build_object('ok', false, 'reason', 'already_matched');
  end if;

  update goal_match_queue
  set status = 'vertrokken', decided_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.zoek_buddies_uit(uuid) from public, anon, authenticated;
grant execute on function public.zoek_buddies_uit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. De stand — een RPC met een expliciete kolomlijst, en een afgekapt getal
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Waarom dit een RPC is en geen policy: RLS kan geen kolommen beperken.**
--    Zelfde vorm en zelfde reden als `getuigenissen()` (0169) en
--    `straffen_bij_uitstelverzoek()` (0218). De functie geeft precies vijf
--    kolommen terug en geen ervan gaat over een ánder mens: geen namen, geen
--    id's van anderen, geen datums van anderen.
--
-- ⚠️⚠️ **`nog_nodig` is afgekapt op 0, 1 of 2, en dat afkappen ís het ontwerp.**
--    Een exacte telling van je bak is met één API-verzoek te herhalen terwijl je
--    je categorie, streefdatum of week-startdag varieert — en dan is dit geen
--    standmelding meer maar een demografisch meetinstrument op de
--    gebruikersbasis. Nul, één of twee is precies genoeg voor de zin "er zijn nog
--    twee mensen nodig" en verder niets. Dat is de tweede vraag van domeinregel 7
--    in zijn zuiverste vorm: kan iemand dit buiten de UI om uitlezen, en wat
--    krijgt hij dan.
--
-- ⚠️ Een ander krijgt **nul rijen** en geen fout. Een fout zou verklappen dat dit
--    doel-id bestaat.

create or replace function public.buddyzoek_stand(p_goal_id uuid, p_vandaag date)
  returns table (
    status    text,
    nog_nodig smallint,
    sinds     timestamptz,
    verloopt  timestamptz,
    group_id  uuid
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with mijn as (
    select q.id, q.status, q.created_at, q.expires_at, q.group_id,
           g.category, public.doelperiode(g.target_date, p_vandaag) as band,
           p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.goal_id = p_goal_id
      and g.owner_id = (select auth.uid())
      and q.status in ('wachtend', 'gekoppeld')
    order by q.created_at desc
    limit 1
  )
  select
    m.status,
    least(2, greatest(0, 3 - (
      select count(distinct q2.user_id)::integer
      from goal_match_queue q2
      join goals    g2 on g2.id = q2.goal_id
      join profiles p2 on p2.id = q2.user_id
      where q2.status = 'wachtend'
        and g2.status = 'active'
        and g2.category = m.category
        and public.doelperiode(g2.target_date, p_vandaag) = m.band
        and p2.week_start_day = m.week_start_day
    )))::smallint as nog_nodig,
    m.created_at as sinds,
    m.expires_at as verloopt,
    m.group_id
  from mijn m;
$$;

revoke all on function public.buddyzoek_stand(uuid, date) from public, anon, authenticated;
grant execute on function public.buddyzoek_stand(uuid, date) to authenticated;

comment on function public.buddyzoek_stand(uuid, date) is
  'De stand van je eigen wachtopdracht. Expliciete kolomlijst omdat RLS geen '
  'kolommen kan beperken (vorm van getuigenissen(), 0169). nog_nodig is afgekapt '
  'op 0/1/2 zodat het geen populatiemeter wordt. Een ander krijgt nul rijen.';
