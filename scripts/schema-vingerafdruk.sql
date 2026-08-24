-- De vingerafdruk van het `public`-schema — QS8-122.
--
-- ⚠️ Draai deze query op twee databases en vergelijk de uitkomst. Zijn alle
--    negen regels gelijk, dan is het schema gelijk: kolommen, constraints,
--    indexen, policies, functies, triggers, rechten, publicatie en RLS-stand.
--
-- ⚠️ **De functies worden vergeleken zónder commentaar en zónder witruimte, en
--    dat is geen slordigheid maar een gemeten noodzaak.** De MCP-tool die
--    migraties toepast, strippt commentaar en herschikt witruimte in een
--    functiebody. Op 24-08-2026 leverde dat 27 "verschillen" op die alle 27
--    dezelfde logica waren. Zou je ze wél meenemen, dan meldt deze vergelijking
--    elke keer verschil en leert hij je om hem te negeren.
--
-- ⚠️ **De rechten worden beperkt tot `anon`, `authenticated` en `service_role`.**
--    Een Supabase-project heeft daarnaast rollen die een lege Postgres niet kent
--    (`supabase_admin`, `dashboard_user`, `authenticator`). Die horen bij het
--    platform en niet bij dit schema.
with kolommen as (
  select 'kolom|' || table_name || '|' || column_name || '|' || data_type
         || '|' || is_nullable || '|' || coalesce(column_default, '-') as regel
  from information_schema.columns where table_schema = 'public'
), constraints as (
  select 'constraint|' || rel.relname || '|' || con.conname || '|'
         || pg_get_constraintdef(con.oid) as regel
  from pg_constraint con join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace where n.nspname = 'public'
), indexen as (
  select 'index|' || indexname || '|' || indexdef as regel
  from pg_indexes where schemaname = 'public'
), policies as (
  select 'policy|' || tablename || '|' || policyname || '|' || cmd
         || '|' || array_to_string(roles, ',')
         || '|' || coalesce(qual, '-') || '|' || coalesce(with_check, '-') as regel
  from pg_policies where schemaname = 'public'
), functies as (
  select 'functie|' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|'
         || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '-') || '|'
         || md5(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
                               '\s', '', 'g')) as regel
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    -- ⚠️ De steiger telt niet mee. `shim_maak_gebruiker()` en
    --    `shim_verwijder_gebruiker()` bestaan alléén lokaal — ze nemen over wat
    --    GoTrue op productie doet (QS8-119). Zonder deze regel meldt de
    --    vergelijking voortaan altijd twee functies verschil, en een
    --    vergelijking die altijd verschil meldt leert je hem te negeren.
    --
    --    Dát ze niet in een migratie staan, bewaakt `tests/scripts/steiger.test.ts`.
    and p.proname not like 'shim\_%'
), triggers as (
  select 'trigger|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid) as regel
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
), rechten as (
  select 'recht|' || table_name || '|' || coalesce(column_name, '*') || '|'
         || grantee || '|' || privilege_type as regel
  from (
    select table_name, null::text as column_name, grantee, privilege_type
    from information_schema.role_table_grants where table_schema = 'public'
    union all
    select table_name, column_name, grantee, privilege_type
    from information_schema.column_privileges where table_schema = 'public'
  ) g
  where grantee in ('anon', 'authenticated', 'service_role')
), publicatie as (
  select 'publicatie|' || pubname || '|' || tablename as regel
  from pg_publication_tables where schemaname = 'public'
), rls as (
  select 'rls|' || c.relname || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity as regel
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
), alles as (
  select regel from kolommen union all select regel from constraints
  union all select regel from indexen union all select regel from policies
  union all select regel from functies union all select regel from triggers
  union all select regel from rechten union all select regel from publicatie
  union all select regel from rls
)
select split_part(regel, '|', 1) as soort, count(*) as aantal,
       md5(string_agg(regel, E'\n' order by regel)) as vingerafdruk
from alles group by 1 order by 1;
