-- 0011_revoke_definer_functions.sql — triggerfuncties zijn geen API
--
-- ROLLBACK-PAD:
--   grant execute on function create_group(text, text, smallint, text) to anon;
--   grant execute on function guard_group_member_update() to anon, authenticated;
--   grant execute on function pin_completion_cycle() to anon, authenticated;
--
-- ⚠️ Deze migratie repareert iets dat ík heb geïntroduceerd. 0006 en 0009 zijn
--    in delen toegepast, en daarbij zijn de `revoke`-regels weggevallen. De
--    Supabase-adviseur zag het meteen: drie SECURITY DEFINER-functies stonden
--    open voor de `anon`-rol via /rest/v1/rpc/.
--
-- Postgres geeft `execute` op een nieuwe functie standaard aan `public`. In
-- Supabase betekent dat: aanroepbaar via de REST-API, ook zonder in te loggen.
-- Bij een SECURITY DEFINER-functie is dat precies wat je niet wilt.
--
-- `guard_group_member_update` en `pin_completion_cycle` zijn triggerfuncties.
-- Rechtstreeks aanroepen levert een fout op (er is geen triggercontext), maar
-- "het werkt toch niet" is geen beveiliging — het is een aanname over de
-- implementatie van vandaag.

revoke all on function guard_group_member_update() from public, anon, authenticated;
revoke all on function pin_completion_cycle()      from public, anon, authenticated;
revoke all on function stamp_chat_message()        from public, anon, authenticated;

-- create_group is wél bedoeld als API, maar alleen voor wie ingelogd is. De
-- functie gooit zelf al bij `auth.uid() is null`; dit haalt de deur er ook uit.
revoke all on function create_group(text, text, smallint, text) from public, anon;
grant execute on function create_group(text, text, smallint, text) to authenticated;

-- Zelfde behandeling voor de functie uit 0008, die bij het splitsen zijn revoke
-- ook kwijtraakte.
revoke all on function join_group_with_code(text) from public, anon;
grant execute on function join_group_with_code(text) to authenticated;
