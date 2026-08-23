-- 0039a_weekpas_maximum_niet_voor_anon.sql — nazorg op 0039 (QS8-81, EPIC 8)
--
-- ⚠️ HERSTELD OP 23-08-2026 UIT DE DATABASE (QS8-122). Dit bestand ontbrak in
--    de repo terwijl de migratie wél was toegepast. De SQL hieronder komt
--    letterlijk uit `supabase_migrations.schema_migrations.statements`; hij is
--    niet nagebouwd of gereconstrueerd.
--
--    Echte versie in `schema_migrations`: **20260819121542**
--    Bestandsnaam `0039a_` is gekozen zodat de map in toepassingsvolgorde
--    blijft sorteren — deze migratie zit tussen 0039 en 0040. Zolang QS8-122
--    de nummering niet heeft rechtgetrokken is de bestandsnaam een hulpmiddel
--    en de versie hierboven de waarheid.
--
-- ROLLBACK-PAD:
--   grant execute on function public.weekpas_maximum() to anon;
--   (Doe dit niet. Zie hieronder.)
--
-- ⚠️ `weekpas_maximum()` stond na 0039 open voor `anon`. Hij geeft alleen een
--    constante terug, dus er lekt niets, maar een uitgelogde bezoeker heeft
--    niets te zoeken in de RPC-lijst van dit product. `weekpas_stand()` is
--    SECURITY DEFINER en blijft hem gewoon aanroepen.
--
-- Idempotent: `revoke` en `grant` zijn herhaalbaar.

revoke all on function public.weekpas_maximum() from public, anon;
grant execute on function public.weekpas_maximum() to authenticated;
