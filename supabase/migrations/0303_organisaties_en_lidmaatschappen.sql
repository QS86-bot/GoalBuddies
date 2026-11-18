-- 0303_organisaties_en_lidmaatschappen.sql — de eerste organisatie-migratie:
-- `organizations` en `organization_members`, met RLS, kolomgrants en de RPC's
-- om aan te maken, lid te worden, te verlaten, uit te zetten en de leden te lezen
-- (QS8-652, epic QS8-650).
--
-- ROLLBACK-PAD (de tabellen zijn bij het landen leeg; met rijen erin is dit
-- grens 2 en vraagt het eerst een `pg_dump`):
--   drop function if exists public.vernieuw_organisatiecode(uuid, boolean);
--   drop function if exists public.organisatie_uitnodigcode(uuid);
--   drop function if exists public.organisatieleden(uuid, integer, uuid);
--   drop function if exists public.zet_organisatielid_uit(uuid, uuid);
--   drop function if exists public.verlaat_organisatie(uuid);
--   drop function if exists public.word_organisatielid(text);
--   drop function if exists public.maak_organisatie(text);
--   drop table if exists public.organization_members;
--   drop function if exists public.is_organisatiebeheerder(uuid);
--   drop function if exists public.is_organisatielid(uuid);
--   drop table if exists public.organizations;
--   delete from public.dagtellers
--    where domein in ('organisaties', 'organisatiecodes', 'organisatiepogingen');
--   alter table public.dagtellers drop constraint if exists dagtellers_soort_check;
--   alter table public.dagtellers add constraint dagtellers_soort_check
--     check (soort in ('uploader', 'groep', 'gebruiker'));
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 4, 6, 13, 15 en 19 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- tabel 1 en 2 van `docs/decisions/2026-11-03-spec-organisaties-en-teamdoelen.md`,
-- en de keuzes van deze migratie in
-- `docs/decisions/2026-11-17-organisaties-en-lidmaatschappen.md`.
--
-- 📏 Vóór deze migratie bestond er geen tabel, kolom of functie voor een
--    organisatie (gemeten door de spec-planner op 03-11 en opnieuw op 17-11).
--
-- ⚠️ **Wat hier níet in zit:** `groups.organization_id`, de uitgebreide
--    `is_group_admin()` en de vertrek-cascade naar teamgroepen (QS8-653), teams
--    en teamdoelen (QS8-654 e.v.), archiveren, en een beheerder benoemen.
--
-- ---------------------------------------------------------------------------
-- De drie eigenschappen die dit ontwerp draagt
-- ---------------------------------------------------------------------------
--
-- 1. **Wie niets mag, krijgt hetzelfde antwoord als bij een verzonnen id**
--    (criterium 4). Tabel: nul rijen. Ledenlijst: nul rijen. Code: `null`.
--    Schrijf-RPC's: één reden, `niet_toegestaan`. Er is geen route die
--    "bestaat, maar niet voor jou" van "bestaat niet" onderscheidt.
--
-- 2. **Een beheerder ziet niet meer dan een lid** (besluit 6, criterium 5).
--    `is_organisatiebeheerder()` heeft géén grant voor `authenticated`: een
--    SELECT-policy die hem ooit aanroept, valt om met 42501 in plaats van stil
--    te verruimen. De catalogustest in `tests/rls/organisatierol-catalogus.test.ts`
--    bewaakt de rest.
--
-- 3. **Inactief is voor anderen onleesbaar** (002 rij 42). Vertrokken en
--    uitgezet zijn allebei `inactive` en laten geen leesbaar onderscheid
--    achter: wie niet meer actief lid is, staat in geen enkel antwoord. De
--    persoon zelf leert alleen dát hij niet terug kan — `word_organisatielid()`
--    geeft hem `removed`, zoals bij groepen — en niet waarom.
--
-- ⚠️ **De uitnodigcode is een kolomgrant en geen policy** (criterium 10).
--    RLS kan geen kolommen beperken. `invite_code` en `invite_revoked` staan
--    niet in de `grant select (...)`, dus `select=*` en `select=invite_code`
--    geven allebei 42501. De client moet zijn kolommen dus altijd opsommen.

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  -- ⚠️ `set null` en niet `cascade` of `restrict`: een organisatie wordt nooit
  --    gewist (status, besluit 13), en een `restrict` zou het wisrecht van de
  --    aanmaker blokkeren. Wat er met een organisatie zónder beheerder gebeurt
  --    is QS8-659.
  created_by     uuid references public.profiles(id) on delete set null,
  status         text not null default 'active',
  invite_code    text not null default public.generate_invite_code(),
  invite_revoked boolean not null default false,
  created_at     timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_invite_code_key') then
    alter table public.organizations add constraint organizations_invite_code_key unique (invite_code);
  end if;
end $$;

-- De naam krijgt dezelfde zeven CHECKs als `groups.name` (0270, 0283, 0284,
-- 0287), op de lengte na: 1 tot 80 codepunten, zoals het issue vraagt.
alter table public.organizations drop constraint if exists organizations_name_len;
alter table public.organizations add constraint organizations_name_len
  check (char_length(name) between 1 and 80);
alter table public.organizations drop constraint if exists organizations_name_geen_bidi;
alter table public.organizations add constraint organizations_name_geen_bidi
  check (name = public.zonder_bidi(name));
alter table public.organizations drop constraint if exists organizations_name_geen_nul_pixels;
alter table public.organizations add constraint organizations_name_geen_nul_pixels
  check (name = public.zonder_onzichtbaar_middenin(name));
alter table public.organizations drop constraint if exists organizations_name_geen_onzichtbaar_tussen_letters;
alter table public.organizations add constraint organizations_name_geen_onzichtbaar_tussen_letters
  check (name = public.zonder_onzichtbaar_tussen_letters(name));
alter table public.organizations drop constraint if exists organizations_name_geen_losse_tag;
alter table public.organizations add constraint organizations_name_geen_losse_tag
  check (name = public.zonder_losse_tags(name));
alter table public.organizations drop constraint if exists organizations_name_een_regel;
alter table public.organizations add constraint organizations_name_een_regel
  check (name = public.zonder_regelovergang(name));
alter table public.organizations drop constraint if exists organizations_name_schoon;
alter table public.organizations add constraint organizations_name_schoon
  check (name = public.schone_naam(name));
alter table public.organizations drop constraint if exists organizations_status_geldig;
alter table public.organizations add constraint organizations_status_geldig
  check (status in ('active', 'archived'));
alter table public.organizations drop constraint if exists organizations_invite_code_len;
alter table public.organizations add constraint organizations_invite_code_len
  check (char_length(invite_code) between 1 and 64);

create index if not exists organizations_created_by_idx on public.organizations (created_by);

-- ---------------------------------------------------------------------------
-- 2. organization_members
-- ---------------------------------------------------------------------------

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member',
  status          text not null default 'active',
  joined_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.organization_members drop constraint if exists organization_members_role_geldig;
alter table public.organization_members add constraint organization_members_role_geldig
  check (role in ('admin', 'member'));
alter table public.organization_members drop constraint if exists organization_members_status_geldig;
alter table public.organization_members add constraint organization_members_status_geldig
  check (status in ('active', 'inactive'));

create index if not exists organization_members_user_idx on public.organization_members (user_id);
-- De ledenlijst bladert op (organization_id, user_id) over actieve rijen.
create index if not exists organization_members_actief_idx
  on public.organization_members (organization_id, user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
--
-- ⚠️ Eén argument en geen tweede: een helper die (organisatie, gebruiker)
--    aanneemt, laat een lid aftasten wie er nog meer in welke organisatie zit.

create or replace function public.is_organisatielid(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from organization_members m
      join organizations o on o.id = m.organization_id
     where m.organization_id = p_organization_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and o.status = 'active'
  );
$$;
comment on function public.is_organisatielid(uuid) is
  'Waar als de aanroeper actief lid is van een actieve organisatie. Een '
  'verzonnen id, een vreemde organisatie, een gearchiveerde organisatie en een '
  'inactief lidmaatschap geven allemaal false — QS8-652.';
revoke all on function public.is_organisatielid(uuid) from public, anon, authenticated;
grant execute on function public.is_organisatielid(uuid) to authenticated;

create or replace function public.is_organisatiebeheerder(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from organization_members m
      join organizations o on o.id = m.organization_id
     where m.organization_id = p_organization_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and m.role = 'admin'
       and o.status = 'active'
  );
$$;
comment on function public.is_organisatiebeheerder(uuid) is
  'Alleen voor schrijf-RPC''s. Bewust zonder grant voor authenticated: een '
  'SELECT-policy die hem aanroept valt om met 42501 in plaats van een beheerder '
  'stil meer te laten lezen dan een lid (besluit 6) — QS8-652.';
revoke all on function public.is_organisatiebeheerder(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Grants en policies
-- ---------------------------------------------------------------------------

revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.organization_members from public, anon, authenticated;
-- ⚠️ `invite_code` en `invite_revoked` staan hier met opzet niet tussen.
-- ⚠️ `created_by` staat er sinds de security-ronde ook niet in (L3): rij 42
--    belooft naam en rol, en de aanmaker bleef anders leesbaar nadat hij uit de
--    ledenlijst verdwenen is.
grant select (id, name, status, created_at) on public.organizations to authenticated;
grant select (organization_id, user_id, role, status, joined_at) on public.organization_members to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists organizations_select on public.organizations;
-- ⚠️ **Via de lidmaatschapsindex en niet met de helper per rij** (security-ronde,
--    M1). 📏 Met `using (is_organisatielid(id))` kostte een ongefilterde
--    `select id from organizations` met 20.000 organisaties **174 ms**: elke rij
--    een definer-aanroep. Zo is het **2 ms**, en de uitkomst is dezelfde — de
--    subquery ziet onder RLS alleen je eigen actieve lidmaatschap.
create policy organizations_select on public.organizations
  for select to authenticated
  using (status = 'active'
         and id in (select m.organization_id
                      from public.organization_members m
                     where m.user_id = (select auth.uid())
                       and m.status = 'active'));

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert to authenticated with check (false);
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated using (false) with check (false);
drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated using (false);

-- ⚠️ **Alleen je eigen actieve rij.** De ledenlijst loopt via
--    `organisatieleden()`, die pagineert (regel 10) en alleen naam en rol geeft.
--    Een tabelbrede leesregel zou een ongepagineerde ledenlijst via PostgREST zijn.
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) and status = 'active'
         and public.is_organisatielid(organization_id));

drop policy if exists organization_members_insert on public.organization_members;
create policy organization_members_insert on public.organization_members
  for insert to authenticated with check (false);
drop policy if exists organization_members_update on public.organization_members;
create policy organization_members_update on public.organization_members
  for update to authenticated using (false) with check (false);
drop policy if exists organization_members_delete on public.organization_members;
create policy organization_members_delete on public.organization_members
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- 4b. De dagteller kent een organisatie als sleutelsoort
-- ---------------------------------------------------------------------------
--
-- ⚠️ `dagtellers_soort_check` (0234) is een allowlist van `uploader`, `groep`
--    en `gebruiker`. De codeteller telt per organisatie, en die als `groep`
--    boeken zou een sleutel een naam geven die hij niet is. Dit verruimt de
--    lijst met één waarde; er verandert niets aan bestaande rijen.
alter table public.dagtellers drop constraint if exists dagtellers_soort_check;
alter table public.dagtellers add constraint dagtellers_soort_check
  check (soort in ('uploader', 'groep', 'gebruiker', 'organisatie'));

-- ---------------------------------------------------------------------------
-- 5. Aanmaken
-- ---------------------------------------------------------------------------

create or replace function public.maak_organisatie(p_naam text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_naam  text;
  v_vorig text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eén aanroep per gebruiker tegelijk (security-ronde, L1): anders tellen
  --    N gelijktijdige aanroepen allemaal dezelfde stand onder het plafond.
  perform pg_advisory_xact_lock(hashtext('organisatielidmaatschap:' || v_uid::text));

  -- Grove bovengrens vóór de dure normalisatie (zelfde reden als 0287).
  if char_length(coalesce(p_naam, '')) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
  end if;

  -- Tot een vast punt, want `schone_naam()` is niet idempotent (0287).
  v_naam := coalesce(p_naam, '');
  for i in 1..5 loop
    v_vorig := v_naam;
    v_naam  := public.schone_naam(v_vorig);
    exit when v_naam = v_vorig;
  end loop;
  if char_length(v_naam) < 1 or char_length(v_naam) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
  end if;

  -- Dagteller (regel 5): drie nieuwe organisaties per persoon per etmaal.
  if public.dagteller_stand('organisaties', 'gebruiker', v_uid::text, interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if (select count(*) from organization_members m
        join organizations o on o.id = m.organization_id
       where m.user_id = v_uid and m.status = 'active' and o.status = 'active') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_organisaties');
  end if;

  for poging in 1..5 loop
    begin
      insert into organizations (name, created_by) values (v_naam, v_uid)
      returning id into v_id;
      exit;
    exception
      when unique_violation then null;  -- codebotsing: nieuwe default, opnieuw
      when check_violation then
        return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
    end;
  end loop;
  if v_id is null then
    raise exception 'Geen vrije uitnodigcode na vijf pogingen';
  end if;

  insert into organization_members (organization_id, user_id, role, status)
  values (v_id, v_uid, 'admin', 'active');

  perform public.tel_dagteller('organisaties', 'gebruiker', v_uid::text, 3,
                               interval '1 day', 'nieuwe organisaties');

  return jsonb_build_object('ok', true, 'organization_id', v_id);
end;
$$;
comment on function public.maak_organisatie(text) is
  'Maakt een organisatie met de aanroeper als beheerder. Geeft geen code terug; '
  'die komt uit organisatie_uitnodigcode(). Dagteller: 3 per etmaal — QS8-652.';
revoke all on function public.maak_organisatie(text) from public, anon, authenticated;
grant execute on function public.maak_organisatie(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Lid worden met een code
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Elke poging telt, ook een foute.** Een statement-trigger zoals in 0203
--    telt alleen rijen die landen en doet dus niets tegen het raden van codes.
--    `dagtellers` (0234) telt de handeling en overleeft bovendien een `delete`.
--    De voorcontrole leest de stand eerst: een `raise` in `tel_dagteller()` zou
--    de telling zelf terugrollen.

create or replace function public.word_organisatielid(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_org     organizations%rowtype;
  v_bestaat text;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eén aanroep per gebruiker tegelijk (security-ronde, L1): anders tellen
  --    N gelijktijdige aanroepen allemaal dezelfde stand onder het plafond.
  perform pg_advisory_xact_lock(hashtext('organisatielidmaatschap:' || v_uid::text));

  if public.dagteller_stand('organisatiepogingen', 'gebruiker', v_uid::text, interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  perform public.tel_dagteller('organisatiepogingen', 'gebruiker', v_uid::text, 20,
                               interval '1 day', 'pogingen om lid te worden');

  -- Onbekend, ingetrokken en gearchiveerd geven allemaal `invalid`: geen orakel.
  select * into v_org
    from organizations
   where invite_code = p_code and invite_revoked = false and status = 'active';
  if v_org.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select status into v_bestaat
    from organization_members
   where organization_id = v_org.id and user_id = v_uid;
  if v_bestaat = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'removed');
  end if;
  if v_bestaat = 'active' then
    return jsonb_build_object('ok', true, 'organization_id', v_org.id);
  end if;

  if (select count(*) from organization_members m
        join organizations o on o.id = m.organization_id
       where m.user_id = v_uid and m.status = 'active' and o.status = 'active') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_organisaties');
  end if;

  insert into organization_members (organization_id, user_id, role, status)
  values (v_org.id, v_uid, 'member', 'active')
  on conflict (organization_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'organization_id', v_org.id);
end;
$$;
comment on function public.word_organisatielid(text) is
  'Lid worden met een uitnodigcode. Elke poging telt in de dagteller (20 per '
  'etmaal), ook een foute. Onbekend, ingetrokken en gearchiveerd geven '
  'allemaal reason = invalid; een inactief lid krijgt removed — QS8-652.';
revoke all on function public.word_organisatielid(text) from public, anon, authenticated;
grant execute on function public.word_organisatielid(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Verlaten en uitzetten
-- ---------------------------------------------------------------------------
--
-- ⚠️ Beide sluiten de organisatierij met `for update`, zodat twee beheerders die
--    tegelijk vertrekken niet allebei een ander zien staan.

create or replace function public.verlaat_organisatie(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_rol  text;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eerst de toets en dan pas de lock (security-ronde, L2): anders kan een
  --    buitenstaander met een id de rij van elke organisatie vergrendelen.
  if not exists (select 1 from organization_members
                  where organization_id = p_organization_id and user_id = v_uid
                    and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'geen_lid');
  end if;

  perform 1 from organizations where id = p_organization_id for update;

  select role into v_rol
    from organization_members
   where organization_id = p_organization_id and user_id = v_uid and status = 'active';
  if v_rol is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_lid');
  end if;

  if v_rol = 'admin' and not exists (
       select 1 from organization_members
        where organization_id = p_organization_id and role = 'admin'
          and status = 'active' and user_id <> v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'laatste_beheerder');
  end if;

  update organization_members
     set status = 'inactive'
   where organization_id = p_organization_id and user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.verlaat_organisatie(uuid) is
  'Zet het eigen lidmaatschap op inactive. De laatste actieve beheerder kan niet '
  'vertrekken (laatste_beheerder). Een niet-lid en een verzonnen id geven '
  'allebei geen_lid — QS8-652.';
revoke all on function public.verlaat_organisatie(uuid) from public, anon, authenticated;
grant execute on function public.verlaat_organisatie(uuid) to authenticated;

create or replace function public.zet_organisatielid_uit(p_organization_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eén reden voor elke weigering: geen beheerder, onbekende organisatie,
  --    onbekende gebruiker, jezelf, een andere beheerder of een al inactief lid.
  --    En de toets vóór de lock (security-ronde, L2).
  if p_user_id is null or p_user_id = v_uid
     or not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  perform 1 from organizations where id = p_organization_id for update;

  update organization_members
     set status = 'inactive'
   where organization_id = p_organization_id and user_id = p_user_id
     and role = 'member' and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  -- ⚠️⚠️ **Uitzetten roteert de code** (security-ronde, M2). Anders komt wie
  --    uitgezet is met een tweede account en de oude code gewoon terug, en ziet
  --    hij de ledenlijst weer. Een ingetrokken code blijft ingetrokken. Dit telt
  --    niet in de codeteller: het is geen uitnodiging, en een beheerder mag
  --    nooit een uitzetting overhouden die de deur niet sluit.
  for poging in 1..5 loop
    begin
      update organizations set invite_code = public.generate_invite_code()
       where id = p_organization_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.zet_organisatielid_uit(uuid, uuid) is
  'Een beheerder zet een actief lid (rol member) op inactive en roteert de '
  'uitnodigcode. Elke weigering geeft niet_toegestaan, zodat de RPC geen '
  'orakel is — QS8-652.';
revoke all on function public.zet_organisatielid_uit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zet_organisatielid_uit(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. De ledenlijst (002 rij 42)
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Naam en rol, en verder niets** — precies wat rij 42 belooft. Geen
--    avatar en geen toetredingsdatum: wie die wil, besluit dat als verruiming.
--    De cursor loopt daarom op `user_id` alleen: stabiel, en er verschuift
--    niets als iemand tussen twee pagina's vertrekt (de les van 0152).

create or replace function public.organisatieleden(
  p_organization_id uuid,
  p_limit           integer default 20,
  -- ⚠️ De nul-uuid en geen `DEFAULT NULL`: hij sorteert vóór elke echte id, dus
  --    weglaten geeft de eerste pagina, en `defaultnull:controle` hoeft geen
  --    type te corrigeren dat in het afschrift van productie nog niet bestaat.
  --    Een meegestuurde `null` betekent hetzelfde (de `coalesce` hieronder) in
  --    plaats van stil een lege lijst te geven.
  p_na_user_id      uuid default '00000000-0000-0000-0000-000000000000'
)
returns table (user_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.user_id, p.display_name, m.role
    from organization_members m
    join profiles p on p.id = m.user_id
   where m.organization_id = p_organization_id
     and m.status = 'active'
     and public.is_organisatielid(p_organization_id)
     and m.user_id > coalesce(p_na_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
   order by m.user_id
   limit greatest(0, least(coalesce(p_limit, 20), 50));
$$;
comment on function public.organisatieleden(uuid, integer, uuid) is
  'De actieve leden van je eigen organisatie: naam en rol, gepagineerd op '
  'user_id (max 50). Een niet-lid en een verzonnen id krijgen nul rijen. Een '
  'beheerder krijgt exact wat een lid krijgt (besluit 6) — QS8-652.';
revoke all on function public.organisatieleden(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.organisatieleden(uuid, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. De uitnodigcode (criterium 10 en 12)
-- ---------------------------------------------------------------------------

create or replace function public.organisatie_uitnodigcode(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('code', o.invite_code, 'ingetrokken', o.invite_revoked)
    from organizations o
   where o.id = p_organization_id
     and public.is_organisatiebeheerder(p_organization_id);
$$;
comment on function public.organisatie_uitnodigcode(uuid) is
  'De uitnodigcode, alleen voor een beheerder. Een lid, een niet-lid en een '
  'verzonnen id krijgen allemaal null — QS8-652.';
revoke all on function public.organisatie_uitnodigcode(uuid) from public, anon, authenticated;
grant execute on function public.organisatie_uitnodigcode(uuid) to authenticated;

-- ⚠️ Dit is het "uitnodigen" van criterium 12: zonder deze functie had
--    `invite_revoked` geen schrijver, en een uitgelekte code geen uitweg.
create or replace function public.vernieuw_organisatiecode(
  p_organization_id uuid,
  p_intrekken       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  if not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  if public.dagteller_stand('organisatiecodes', 'organisatie', p_organization_id::text,
                            interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if coalesce(p_intrekken, false) then
    update organizations set invite_revoked = true where id = p_organization_id;
  else
    for poging in 1..5 loop
      begin
        update organizations
           set invite_code = public.generate_invite_code(), invite_revoked = false
         where id = p_organization_id
        returning invite_code into v_code;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    if v_code is null then
      raise exception 'Geen vrije uitnodigcode na vijf pogingen';
    end if;
  end if;

  perform public.tel_dagteller('organisatiecodes', 'organisatie', p_organization_id::text,
                               10, interval '1 day', 'nieuwe organisatiecodes');

  return jsonb_build_object('ok', true, 'code', v_code,
                            'ingetrokken', coalesce(p_intrekken, false));
end;
$$;
comment on function public.vernieuw_organisatiecode(uuid, boolean) is
  'Een beheerder maakt een nieuwe uitnodigcode of trekt de huidige in. '
  'Dagteller: 10 per organisatie per etmaal. Elke weigering geeft '
  'niet_toegestaan — QS8-652.';
revoke all on function public.vernieuw_organisatiecode(uuid, boolean) from public, anon, authenticated;
grant execute on function public.vernieuw_organisatiecode(uuid, boolean) to authenticated;
