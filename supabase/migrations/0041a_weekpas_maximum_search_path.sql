-- 0041a_weekpas_maximum_search_path.sql — nazorg op 0039 (QS8-81, EPIC 8)
--
-- ⚠️ HERSTELD OP 23-08-2026 UIT DE DATABASE (QS8-122). Dit bestand ontbrak in
--    de repo terwijl de migratie wél was toegepast. De SQL hieronder komt
--    letterlijk uit `supabase_migrations.schema_migrations.statements` en is
--    geverifieerd tegen `pg_get_functiondef()` op het echte project.
--
--    Echte versie in `schema_migrations`: **20260819124506**
--    Bestandsnaam `0041a_` houdt de map in toepassingsvolgorde: deze migratie
--    zit tussen 0041 en 0042.
--
-- ROLLBACK-PAD:
--   create or replace function public.weekpas_maximum()
--     returns integer language sql immutable
--   as $$ select 2 $$;
--   revoke all on function public.weekpas_maximum() from public, anon;
--   grant execute on function public.weekpas_maximum() to authenticated;
--   (Dat zet alleen de search_path terug. De adviseurwaarschuwing komt dan
--   ook terug — zie hieronder waarom dat de moeite van het vermijden waard is.)
--
-- ⚠️ `weekpas_maximum()` had geen vaste `search_path` en de adviseur
--    waarschuwde daarover. De functie raakt geen enkele tabel, dus er is niets
--    te kapen — maar elke andere functie in dit schema zet hem wél, en **een
--    terechte waarschuwing tussen de verwachte waarschuwingen laten staan maakt
--    de hele lijst waardeloos.** Dat is dezelfde redenering als bij een
--    testsuite die soms rood is.
--
-- ⚠️ De functie-inhoud is ongewijzigd (`select 2`); alleen `search_path` komt
--    erbij. De twee rechtenregels staan er opnieuw omdat `create or replace`
--    ze niet bewaart.
--
-- Idempotent: `create or replace`, `revoke` en `grant` zijn alle drie herhaalbaar.

create or replace function public.weekpas_maximum()
  returns integer
  language sql
  immutable
  set search_path to 'public', 'pg_temp'
as $$ select 2 $$;

revoke all on function public.weekpas_maximum() from public, anon;
grant execute on function public.weekpas_maximum() to authenticated;
