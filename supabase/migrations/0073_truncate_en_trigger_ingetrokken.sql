-- 0073_truncate_en_trigger_ingetrokken.sql — QS8-130 (Q-TODO A46)
--
-- ROLLBACK-PAD:
--   grant truncate, trigger on all tables in schema public to anon, authenticated, service_role;
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--   drop function if exists public.ddl_rechten_in_de_api();
--   drop function if exists public.ddl_rechten_van_service_role();
--
-- Besluit van Quinten, 24-08-2026: intrekken.
--
-- ⚠️ **TRUNCATE is niet onderworpen aan RLS.** Een rol die het heeft, leegt de
--    tabel ongeacht welke policy erop staat. `authenticated` had het op alle 29
--    tabellen — dus ook op `points_ledger`, `completions` en `chat_messages`.
--
--    Vandaag is het niet bereikbaar: PostgREST doet SELECT, INSERT, UPDATE,
--    DELETE en RPC, en geen DDL. Het is een deur zonder slot in een muur waar nu
--    geen gang achter zit. **Het wordt zwaarder zodra iemand met de rol
--    `authenticated` een directe databaseverbinding krijgt, of er een
--    `SECURITY INVOKER`-functie komt die dynamische SQL uitvoert.**
--
-- ⚠️ **Een `revoke` alléén is niet genoeg, en dat is de kern van deze migratie.**
--    Het recht komt niet uit een migratie maar uit het platform: Supabase zet
--    `alter default privileges in schema public grant all on tables` voor `anon`,
--    `authenticated` en `service_role`. Elke tabel die een migratie aanmaakt,
--    krijgt het daardoor automatisch. Trek je alleen de bestaande rechten in, dan
--    heeft de volgende tabel TRUNCATE gewoon weer — en dan staat dit issue over
--    een maand opnieuw op het bord.
--
--    Aangetoond bij QS8-122: zonder die standaardrechten bouwt een lege database
--    69 rechten op waar productie er 3395 heeft.
--
-- ⚠️ **`service_role` houdt allebei de rechten.** Die rol draait de Edge
--    Functions en de testharnas; die moet een tabel kunnen leegmaken en een
--    trigger kunnen zetten. Hij heeft bovendien `bypassrls`, dus daar wint dit
--    recht niets extra's.
--
-- ⚠️ TRIGGER gaat mee, om dezelfde reden en met minder gevolgen: het recht laat
--    een rol een trigger op een tabel zetten. Dat is DDL en hoort niet bij een
--    ingelogde gebruiker.
--
-- Idempotent: `revoke` en `alter default privileges` zijn herhaalbaar.

begin;

-- 1. Wat er nu staat.
revoke truncate, trigger on all tables in schema public from anon, authenticated;

-- 2. Wat er straks bij komt. Zonder deze twee regels is stap 1 tijdelijk.
--
-- ⚠️ De volgorde `revoke ... grant ...` is bewust: eerst het brede recht van het
--    platform terugbrengen tot wat we wél willen, daarna niets meer toevoegen.
--    `alter default privileges` kent geen "alles behalve", dus het gaat in twee
--    stappen: alles intrekken, dan opnieuw geven wat blijft.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete, references on tables to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. De controle, want anders is dit een afspraak in een comment
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde vorm als `realtime_bewaking()` (0027) en `triggerfuncties_in_de_api()`
--    (0052a): **maak toetsbaar wat anders alleen in een kop staat.** Die twee
--    bestaan omdat de góede gewoonte niet vanzelf gekopieerd wordt naar de
--    volgende migratie. Hier is dat risico concreet: het recht komt uit de
--    standaardrechten van het platform, dus het komt terug zodra iemand die
--    aanpast of het project opnieuw opzet.
--
-- ⚠️ Toetst **beide helften**. De eerste is wat er nu op de tabellen staat; de
--    tweede is wat de vólgende tabel krijgt. Alleen de eerste toetsen zou precies
--    de fout maken die deze migratie repareert.
--
-- ⚠️ **Productie heeft twee eigenaren van standaardrechten en een lege database
--    maar één.** Dat is bij het toepassen van deze migratie gevonden, en het is
--    precies het soort verschil dat lokaal niet te zien is: `pg_default_acl`
--    draagt hier een regel van `postgres` én een van `supabase_admin`, en
--    `alter default privileges` raakt alleen die van de rol die hem uitvoert.
--    `postgres` is geen lid van `supabase_admin`, dus die tweede is buiten bereik.
--
--    Hij is ook onschadelijk, en dat is gemeten en niet aangenomen:
--    standaardrechten gelden per **eigenaar van het nieuwe object**, en alle 31
--    objecten in `public` zijn van `postgres`. De regel van `supabase_admin` vuurt
--    dus nooit voor een tabel van dit project.
--
--    Vandaar de koppeling hieronder: er wordt alleen geklaagd over een
--    standaardrecht van een rol die **daadwerkelijk iets bezit in** `public`.
--    Gaat `supabase_admin` daar ooit een tabel aanmaken, dan wordt zijn regel
--    levend en deze controle rood. Dat is beter dan hem wegfilteren, want dan
--    verdwijnt het gat uit beeld op het moment dat het ontstaat.
--
-- Leeg antwoord is goed nieuws.
--
-- ⚠️ `drop` vóór `create`, want `create or replace` weigert een gewijzigde
--    returnrij. Zonder deze regel is deze migratie niet opnieuw af te spelen op
--    een database waar een oudere vorm van de functie op staat.
drop function if exists public.ddl_rechten_in_de_api();

create or replace function public.ddl_rechten_in_de_api()
returns table(waar text, eigenaar text, rol text, recht text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- Wat er nu op de tabellen staat.
  select g.table_name::text, '-', g.grantee::text, g.privilege_type::text
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('TRUNCATE', 'TRIGGER')

  union all

  -- Wat de volgende tabel zou krijgen, van een eigenaar die hier ook echt iets
  -- aanmaakt.
  select '(standaardrechten)', d.defaclrole::regrole::text,
         a.grantee::regrole::text,
         case a.privilege_type when 'TRUNCATE' then 'TRUNCATE' else 'TRIGGER' end
  from pg_default_acl d,
       lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and a.grantee::regrole::text in ('anon', 'authenticated')
    and a.privilege_type in ('TRUNCATE', 'TRIGGER')
    and exists (
      select 1 from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'v')
        and c.relowner = d.defaclrole
    )

  order by 1, 2, 3, 4;
$$;

revoke all on function public.ddl_rechten_in_de_api() from public, anon, authenticated;
grant execute on function public.ddl_rechten_in_de_api() to service_role;

-- ⚠️ **De toelating naast de weigering**, en dat is geen symmetrie om de
--    symmetrie. Zonder deze tweede functie wordt de test op de eerste groen
--    zodra iemand `revoke ... from service_role` erbij zet: nul overtredingen,
--    en een Edge Function die geen tabel meer kan leegmaken. De weigering alleen
--    toetsen is precies de fout die CLAUDE.md beschrijft — een suite van alleen
--    negatieve tests wordt groen zodra de database stukgaat.
create or replace function public.ddl_rechten_van_service_role()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select not exists (
    select 1
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not (
        has_table_privilege('service_role', c.oid, 'TRUNCATE')
        and has_table_privilege('service_role', c.oid, 'TRIGGER')
      )
  );
$$;

revoke all on function public.ddl_rechten_van_service_role() from public, anon, authenticated;
grant execute on function public.ddl_rechten_van_service_role() to service_role;

commit;
