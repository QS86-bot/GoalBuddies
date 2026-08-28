-- 0000_supabase_shim.sql — QS8-122
--
-- ROLLBACK-PAD: dit bestand hoort niet op productie thuis en wordt daar nooit
--   toegepast. Weggooien is de rollback.
--
-- ⚠️ **Dit is geen migratie en het staat daarom niet in `supabase/migrations/`.**
--    Het is de steiger eromheen: alles wat een Supabase-project meebrengt vóór
--    de eerste migratie draait. Zou het wél in de migratiemap staan, dan zou het
--    op productie langskomen en daar bestaande rollen en schema's overschrijven.
--
-- ⚠️ **Bewust minimaal.** Dit is geen namaak-Supabase maar precies de
--    oppervlakte die de 74 migraties aanraken, geteld en niet geraden:
--
--      * `auth.uid()`        — 293 keer
--      * `auth.users`        —   8 keer (foreign key, trigger, verwijderen)
--      * `extensions.gen_random_bytes()` — 2 keer
--      * de rollen `anon`, `authenticated`, `service_role`
--      * de publicatie `supabase_realtime`
--      * `storage.buckets`, `storage.objects` en `storage.foldername()` — sinds
--        0126, de eerste migratie die een bucket aanmaakt
--
--    Komt er iets bij in een migratie, dan valt de opbouw hier om met een
--    duidelijke fout. Dat is de bedoeling: de steiger hoort achter de migraties
--    aan te lopen en niet vooruit.

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

/*
 * ⚠️ `authenticator` is de rol waarmee PostgREST verbindt, en die daarna naar
 *    `anon`, `authenticated` of `service_role` schakelt op grond van het JWT.
 *    Zonder deze rol kan er wel een schema staan, maar praat er niets mee.
 *
 *    Hij heeft bewust `nobypassrls` en geen enkel recht van zichzelf: alles wat
 *    een verzoek mag, komt uit de rol waar hij naartoe schakelt. Zou hij zelf
 *    rechten hebben, dan lekken die naar élk verzoek.
 */
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit nobypassrls password 'postgrest';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Standaardrechten op `public`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de belangrijkste regel van dit bestand en hij is bijna vergeten.**
--    Supabase zet `alter default privileges in schema public grant all` voor
--    `anon`, `authenticated` en `service_role`. Elke tabel die een migratie
--    aanmaakt, krijgt daar dus meteen álle rechten voor alle drie de rollen; het
--    enige dat tussen een gebruiker en de data staat is RLS.
--
--    Zonder deze regels bouwt een lege database een schema op met 69 rechten
--    waar productie er 3395 heeft — nagemeten op 24-08-2026. En dat verschil
--    gaat de gevaarlijke kant op: lokaal is dan *strenger* dan productie, dus
--    een RLS-test die "dit mag je niet lezen" bevestigt, bewijst hier iets wat
--    op productie niet waar is. Groen zonder iets te bewijzen, precies het
--    faalbeeld dat QS8-122 komt opruimen.
--
-- ⚠️ Hetzelfde geldt voor functies. `execute` gaat standaard naar alle drie, en
--    dat is de reden dat de migraties zoveel `revoke all on function … from
--    public, anon, authenticated` bevatten. Zonder de standaardrechten zijn die
--    revokes hier lege handelingen en ziet de opbouw er onterecht netjes uit.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Het auth-schema
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

/*
 * ⚠️ Alleen de kolommen die de migraties aanraken. `auth.users` heeft er in
 *    Supabase tientallen; overtypen zou een kopie zijn die stilletjes achterloopt
 *    en niets extra's bewijst.
 */
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/*
 * ⚠️ **`auth.uid()` leest hier hetzelfde als op Supabase: een claim uit de
 *    request-context, en NULL als die er niet is.** Dat NULL-gedrag is geen
 *    detail — het is de val uit CLAUDE.md regel 19 die veertig regels kostte.
 *    Een steiger die hier een vaste gebruiker teruggaf, zou elke policy laten
 *    slagen en de opbouw groen maken zonder iets te bewijzen.
 */
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

-- ---------------------------------------------------------------------------
-- Het extensions-schema
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- `gen_random_bytes` komt uit pgcrypto; op Supabase staat die in `extensions`.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- De realtime-publicatie
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Wat GoTrue zou doen — QS8-119
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Deze twee functies horen nooit op productie te staan, en dat is een
--    eigenschap van waar ze staan.** Ze zitten in `supabase/shim/` en niet in
--    `supabase/migrations/`, dus `supabase db push` neemt ze niet mee en
--    `register:controle` kent ze niet. Er staat bovendien een test op die rood
--    wordt zodra een migratiebestand `shim_` bevat.
--
-- ⚠️ **Waarom ze bestaan.** De lokale opstelling heeft PostgREST maar geen
--    GoTrue: dat is een tweede Docker-image en de RLS-suite heeft er niets aan.
--    Wat de suite wél nodig heeft is een rij in `auth.users`, zodat de trigger
--    `handle_new_user` een profiel aanmaakt — precies wat `admin.createUser()`
--    op productie doet.
--
--    Wat de suite daarmee opgeeft is het bewijs dat GoTrue zélf correcte claims
--    uitgeeft. Dat was nooit de vraag van een RLS-suite, en het gat wordt op
--    dezelfde manier gedicht als bij QS8-116: één controletest tegen het echte
--    project.
create or replace function public.shim_maak_gebruiker(p_email text, p_naam text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('full_name', p_naam));

  return v_id;
end;
$$;

create or replace function public.shim_verwijder_gebruiker(p_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  delete from auth.users where id = p_id;
$$;

revoke all on function public.shim_maak_gebruiker(text, text) from public, anon, authenticated;
revoke all on function public.shim_verwijder_gebruiker(uuid) from public, anon, authenticated;
grant execute on function public.shim_maak_gebruiker(text, text) to service_role;
grant execute on function public.shim_verwijder_gebruiker(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Het migratieregister
-- ---------------------------------------------------------------------------
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Toegevoegd voor 0126 en niet vooruitlopend.** Dit project had tot 28-08
--    geen enkele bucket; de steiger hoort achter de migraties aan te lopen, dus
--    dit staat er pas nu.
--
-- ⚠️ **Wat er níet in zit: de storage-API.** Uploaden gaat op het echte project
--    via een HTTP-dienst die de rij in `storage.objects` schrijft. Hier is alleen
--    de tabel met zijn RLS, want dát is wat de policies van 0126 aanraken. Een
--    test die een upload nábootst schrijft dus rechtstreeks in de tabel — precies
--    zoals de storage-dienst het zou doen, en dus onder dezelfde policies.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

-- Supabase' eigen `foldername()`: de padsegmenten zónder de bestandsnaam.
-- `avatars/<uuid>/foto.png` geeft `{<uuid>}` als je hem op `name` toepast, want
-- `name` is daar het pad bínnen de bucket.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;
