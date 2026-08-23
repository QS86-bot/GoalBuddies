-- 0052a_triggerfuncties_bewaking.sql — de controle die 0051 had moeten hebben
--
-- ⚠️ HERSTELD OP 23-08-2026 UIT DE DATABASE (QS8-122). Dit bestand ontbrak in
--    de repo terwijl de migratie wél was toegepast. De SQL hieronder komt
--    letterlijk uit `supabase_migrations.schema_migrations.statements`;
--    geverifieerd op het echte project dat de functie bestaat en dat `anon` én
--    `authenticated` er geen EXECUTE op hebben.
--
--    Echte versie in `schema_migrations`: **20260820203416**
--    Bestandsnaam `0052a_` houdt de map in toepassingsvolgorde: deze migratie
--    is de tweede helft van 0052 en ging vooraf aan 0053.
--
-- ROLLBACK-PAD:
--   drop function if exists public.triggerfuncties_in_de_api();
--   (Kost je de controle, niets anders. Er hangt geen gedrag aan.)
--
-- ⚠️ Zelfde vorm als `realtime_bewaking()` uit migratie 0027: **testbaar maken
--    wat anders een afspraak in een comment blijft.** 0052 dichtte één
--    triggerfunctie die als RPC in de API stond; deze functie maakt dat je kunt
--    tóetsen dat er geen tweede bijkomt.
--
-- ⚠️ Dit is de valkuil uit `CLAUDE.md` in zijn omgekeerde vorm. Daar gaat het
--    erover dat fóuten van de ene definer-functie naar de volgende gekopieerd
--    worden; hier werd de góede gewoonte niet gekopieerd — 0011 had het recht
--    voor het hele schema ingetrokken en 0051 nam die gewoonte niet mee.
--    **Een nieuwe SECURITY DEFINER-functie erft niets.**
--
-- ⚠️ De functie is zelf SECURITY DEFINER en wordt daarom meteen voor iedereen
--    ingetrokken — ook voor `authenticated`. Hij is bedoeld voor de testsuite
--    met de service-role-key, niet voor de app.
--
-- Idempotent: `create or replace` en `revoke` zijn herhaalbaar.

create or replace function public.triggerfuncties_in_de_api()
returns table(functie text, anon boolean, geauthenticeerd boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.proname::text,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'trigger'::regtype
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  order by p.proname;
$$;

revoke all on function public.triggerfuncties_in_de_api() from public, anon, authenticated;
