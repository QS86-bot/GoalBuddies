-- 0115 — `seizoensrecap_cijfers()` is service_role-only, en was dat niet
--
-- ROLLBACK-PAD:
--   grant execute on function public.seizoensrecap_cijfers(uuid, date, date)
--     to authenticated;
--   Meer is er niet: deze migratie verandert alleen een grant en raakt geen
--   enkel object, geen enkele rij en geen enkele definitie.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- 0112 zette de bedoeling er onmiskenbaar neer:
--
--     revoke all on function public.seizoensrecap_cijfers(uuid, date, date)
--       from public, anon;
--     grant execute on function public.seizoensrecap_cijfers(uuid, date, date)
--       to service_role;
--
-- ⚠️ **En dat werkt niet, want `revoke ... from public` betekent in Supabase
--    niet "van iedereen".** `alter default privileges` geeft elke nieuwe functie
--    in `public` een `execute` aan `anon`, `authenticated` én `service_role`.
--    Wie er `public` en `anon` afhaalt, houdt `authenticated` over — precies de
--    rol waar iedere ingelogde gebruiker onder draait.
--
-- Honderdtwintig regels verderop in datzelfde bestand staat het wél goed:
--
--     revoke all on function public.maak_seizoensrecaps(timestamptz)
--       from public, anon, authenticated;
--
-- Eén regel met en één zonder `authenticated`, in dezelfde migratie. Dat maakt
-- het een omissie en geen keuze.
--
-- ---------------------------------------------------------------------------
-- Wat er lekte
-- ---------------------------------------------------------------------------
--
-- De functie is `SECURITY DEFINER` en draagt geen enkele lidmaatschapstoets —
-- anders dan zijn zusje `ketting_stand()`, dat `where is_group_member(...)`
-- heeft. De grant was dus het énige slot.
--
-- Wie ooit lid was en het groeps-id nog in zijn client heeft staan, kon per
-- willekeurig venster opvragen hoeveel weekdoelen en hoeveel kettingschakels
-- een groep in die periode haalde. Met de ledenlijst die hij al had is dat een
-- aanwezigheidsteller per week van een groep waar hij uit gezet is — domeinregel
-- 7 langs een omweg, en zonder houdbaarheidsdatum.
--
-- ⚠️ **Er komt géén `is_group_member()` bij, en dat is een besluit.**
--    `maak_seizoensrecaps()` roept deze functie aan als `service_role`, en daar
--    is `auth.uid()` NULL. Een lidmaatschapstoets zou de recap dus stilzwijgend
--    op nul zetten voor elke groep — een tweede slot dat de feature sloopt is
--    geen tweede slot. De grant ís hier de grendel; het tweede slot is de test
--    die hem vastpint (`tests/rls/functiegrants.test.ts`).
--
-- Zie docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md.

revoke all on function public.seizoensrecap_cijfers(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.seizoensrecap_cijfers(uuid, date, date)
  to service_role;

comment on function public.seizoensrecap_cijfers(uuid, date, date) is
  'De cijfers onder een seizoensrecap. ⚠️ Uitsluitend voor service_role: de '
  'functie is SECURITY DEFINER en toetst het lidmaatschap niet, want '
  'maak_seizoensrecaps() roept hem aan zonder auth.uid(). De grant is daarmee '
  'het enige slot — zie 0115 en tests/rls/functiegrants.test.ts.';

-- ---------------------------------------------------------------------------
-- De grendel: welke functies mag `authenticated` uitvoeren?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de generieke vorm, en die is het punt.** Eén grant repareren lost
--    één geval op; de klasse is "een recht dat niemand besloten heeft, geërfd
--    van de Supabase-standaard". Deze functie levert de lijst, en
--    `tests/rls/functiegrants.test.ts` legt hem naast de `grant`-regels in
--    `supabase/migrations/`. Staat een functie in de lijst zonder dat enige
--    migratie hem gunt, dan is het recht geërfd en niet gekozen.
--
-- ⚠️ De vergelijking staat in de test en niet hier: de database kent de
--    migratiebestanden niet, en dát is precies de naad die bewaakt moet worden.

create or replace function public.functies_voor_authenticated()
  returns table (naam text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select p.proname::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
  order by p.proname;
$$;

revoke all on function public.functies_voor_authenticated() from public, anon, authenticated;
grant execute on function public.functies_voor_authenticated() to service_role;

comment on function public.functies_voor_authenticated() is
  'Elke functie in public die authenticated mag uitvoeren. Gelezen door '
  'tests/rls/functiegrants.test.ts, dat hem naast de grant-regels in de '
  'migraties legt: staat er een functie in zonder grant-regel, dan is het recht '
  'geërfd van de Supabase-standaard en heeft niemand het besloten.';
