-- 0072_migratieregister_uitleesbaar.sql — QS8-122
--
-- ROLLBACK-PAD:
--   drop function if exists public.migratieregister();
--   (Kost je de controle, niets anders. Er hangt geen gedrag aan.)
--
-- ⚠️ **Waarom hier een functie voor nodig is.** Acceptatiecriterium 3 van
--    QS8-122 vraagt een controle die de repo naast het project legt en rood
--    wordt bij verschil. Die controle moet `supabase_migrations.schema_migrations`
--    kunnen lezen, en dat schema staat niet in de PostgREST-API — terecht, want
--    het hoort niet bij de app.
--
--    De alternatieven waren slechter. Een directe Postgres-verbinding vraagt het
--    databasewachtwoord, en dat staat niet in `.env` en hoort er ook niet bij te
--    komen alleen voor een controle. Deze functie draait op sleutels die er al
--    zijn.
--
-- ⚠️ **Alleen voor `service_role`, en dat is geen formaliteit.** De functie is
--    SECURITY DEFINER en leest een systeemtabel; zonder de revoke hieronder
--    staat hij als RPC in de API en kan iedere ingelogde gebruiker de volledige
--    migratiegeschiedenis van dit project uitlezen. Dat is precies de klasse
--    fout die 0011, 0052 en 0069 kwamen dichten — zie CLAUDE.md regel 19:
--    **een nieuwe SECURITY DEFINER-functie erft niets.**
--
-- ⚠️ Geeft bewust géén `statements` terug. Die kolom bevat de volledige SQL van
--    elke migratie; de controle heeft aan versie en naam genoeg, en wat je niet
--    over de lijn stuurt kan ook niet in een log belanden.
--
-- Idempotent: `create or replace` en `revoke`/`grant` zijn herhaalbaar.

create or replace function public.migratieregister()
returns table(versie text, naam text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select m.version::text, m.name::text
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;

revoke all on function public.migratieregister() from public, anon, authenticated;
grant execute on function public.migratieregister() to service_role;
