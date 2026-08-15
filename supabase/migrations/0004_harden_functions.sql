-- 0004_harden_functions.sql — bevindingen van de Supabase security advisor
--
-- Gevonden direct na 0003, op een nog lege database. Drie echte problemen:
--
--   1. `touch_updated_at` had een muteerbaar search_path. Elke SECURITY DEFINER-
--      of trigger-functie zonder vast search_path is een injectiepad: wie rechten
--      heeft op een ander schema kan een eigen `now()` of tabel voorschuiven.
--
--   2. De drie trigger-functies stonden als RPC in de PostgREST-API. Een
--      trigger-functie hoort nooit rechtstreeks aanroepbaar te zijn — zeker
--      `fill_approval_subject` niet, want dat is de functie die zelfgoedkeuring
--      blokkeert.
--
--   3. De drie RLS-hulpfuncties waren ook voor `anon` aanroepbaar. Ze geven met
--      een anonieme sessie alleen `false` terug, maar het is onnodig oppervlak.
--
-- ROLLBACK-PAD: niet nodig — dit voegt alleen beperkingen toe. Terugdraaien
-- gebeurt door de grants uit 0002 opnieuw te zetten.

-- ---------------------------------------------------------------------------
-- 1. Vast search_path op de laatste trigger-functie
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger-functies uit de API halen
-- ---------------------------------------------------------------------------
--
-- Dit breekt de triggers niet: een trigger draait in de context van de tabel,
-- niet via het EXECUTE-recht van de aanroeper.

revoke all on function handle_new_user()          from public, anon, authenticated;
revoke all on function touch_updated_at()         from public, anon, authenticated;
revoke all on function fill_approval_subject()    from public, anon, authenticated;
revoke all on function recalc_goal_max_points()   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Hulpfuncties alleen voor ingelogde gebruikers
-- ---------------------------------------------------------------------------

revoke all on function is_group_member(uuid)        from public, anon;
revoke all on function shares_group_with_goal(uuid) from public, anon;
revoke all on function shares_group_with_user(uuid) from public, anon;
revoke all on function join_group_with_code(text)   from public, anon;

grant execute on function is_group_member(uuid)        to authenticated;
grant execute on function shares_group_with_goal(uuid) to authenticated;
grant execute on function shares_group_with_user(uuid) to authenticated;
grant execute on function join_group_with_code(text)   to authenticated;

-- ---------------------------------------------------------------------------
-- 4. invite_events blijft bewust zonder policy
-- ---------------------------------------------------------------------------
--
-- De advisor meldt dit als INFO ("RLS enabled, no policy"). Dat is hier de
-- bedoeling: rate-limiting-gegevens zijn uitsluitend voor `service_role`.
-- Een policy toevoegen zou informatie lekken over andermans uitnodigingen.

comment on table invite_events is
  'Bewust zonder RLS-policy: alleen service_role leest en schrijft. '
  'De advisor-melding rls_enabled_no_policy is hier verwacht gedrag.';
