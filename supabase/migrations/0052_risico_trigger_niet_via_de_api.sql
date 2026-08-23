-- 0052_risico_trigger_niet_via_de_api.sql — nazorg op 0051
--
-- ROLLBACK-PAD:
--   grant execute on function public.risico_na_goedkeuring() to anon, authenticated;
--   (Doe dit niet. Zie hieronder.)
--
-- ⚠️ `risico_na_goedkeuring()` is een **triggerfunctie** en stond na 0051 als
--    `/rest/v1/rpc/risico_na_goedkeuring` in de API, aanroepbaar door `anon` én
--    `authenticated`, als SECURITY DEFINER. Gevonden door de Supabase-advisor
--    direct na het bouwen van EPIC 12.
--
-- ⚠️ **Alle 22 andere triggerfuncties in `public` stonden al op ingetrokken**;
--    deze was de enige uitzondering. Migratie 0011 heeft dat destijds voor het
--    hele schema gedaan, en 0051 heeft die gewoonte simpelweg niet meegenomen.
--
--    Dat is de omkering van een valkuil die in `CLAUDE.md` staat: daar gaat het
--    erover dat fóuten gekopieerd worden van de ene definer-functie naar de
--    volgende. Hier is het omgekeerde gebeurd — de goede gewoonte werd níét
--    gekopieerd. **Een nieuwe SECURITY DEFINER-functie erft niets; het recht
--    intrekken hoort in dezelfde migratie te staan als het aanmaken.**
--
-- ⚠️ Wat het praktisch waard was: weinig, en dat is geen reden om het te laten
--    staan. Een triggerfunctie rechtstreeks aanroepen levert
--    "trigger functions can only be called as triggers" op, want er is geen
--    `TG_OP` en geen `NEW`. Het is dus geen open deur maar een deur die niet in
--    de muur hoort. Bij de volgende functie die per ongeluk wél iets doet zonder
--    trigger-context, is het dat wel — en dan is het te laat om de gewoonte
--    alsnog aan te leren.

begin;

revoke all on function public.risico_na_goedkeuring() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- En de controle die 0051 had moeten hebben
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde vorm als `realtime_bewaking()` uit migratie 0027: een afspraak in
--    een comment is geen afspraak. Deze functie geeft elke triggerfunctie terug
--    die via de API aanroepbaar is; de test in `tests/rls/risicoradar.test.ts`
--    eist dat de lijst leeg is. Dekt álle triggerfuncties en niet alleen degene
--    die deze keer misging — de volgende keer is het een andere.

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

commit;
