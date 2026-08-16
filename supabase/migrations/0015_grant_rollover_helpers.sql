-- 0015_grant_rollover_helpers.sql — service_role mag herbereken_reeks aanroepen
--
-- ROLLBACK-PAD:
--   revoke execute on function herbereken_reeks(uuid, uuid) from service_role;
--
-- ⚠️ Dit bestand is een reconstructie. De migratie stond wél op het echte
--    project (`grant_rollover_helpers_to_service_role`, 16-08-2026) maar niet in
--    de repo; gevonden bij het schrijven van 0016, doordat `list_migrations`
--    vijftien regels gaf en `supabase/migrations/` veertien bestanden. De
--    inhoud hieronder is letterlijk wat er toen is uitgevoerd.
--
-- De les erachter is de moeite waard, want ze komt terug bij elke `revoke`:
-- `service_role` haalde zijn rechten uit de standaardtoekenning aan `public`.
-- `revoke ... from public, anon, authenticated` in 0014 haalde daarmee óók de
-- rollover-job onderuit, zonder dat die rol ergens genoemd werd. Wie `execute`
-- intrekt van een functie die het systeem nodig heeft, moet `service_role`
-- daarna expliciet terugzetten.

grant execute on function herbereken_reeks(uuid, uuid) to service_role;
