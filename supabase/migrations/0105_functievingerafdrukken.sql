-- 0105_functievingerafdrukken.sql — stap 20 van /audit wordt een commando
--
-- ROLLBACK-PAD:
--   drop function if exists public.functie_vingerafdrukken();
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Stap 20 van `/audit` is de enige controle die productie en
--    `supabase/migrations/` naast elkaar legt, en het is met de hand ingetypte
--    SQL.** Twee databases, twee keer dezelfde query, en dan de twee uitkomsten
--    met het oog vergelijken. Dat werkt zolang iemand het doet, en het is precies
--    het soort stap dat je overslaat op de dag dat het ertoe doet — dezelfde
--    reden waarom `db-dump.mjs` een script is en geen regel in de handleiding.
--
-- ⚠️ **En hij meet het commentaar met opzet níét.** Dat stond zo in de kop van
--    die stap, en het is op 27-08-2026 duur gebleken: bij het toepassen van 0102
--    en 0103 zijn vier functies met een ingekorte body in productie beland, en de
--    genormaliseerde vergelijking bleef daar gerust onder. Wie `pg_get_functiondef()`
--    daarna leest — en `CLAUDE.md` zegt dat dát de waarheid is — mist juist de
--    redenering die zegt waaróm er iets staat. Bij `verlaat_groep()` is dat de
--    uitleg waarom de gróép vergrendeld wordt en niet je eigen rij, en die heeft
--    een security-review gekost.
--
-- ⚠️ Deze functie geeft daarom **twee** vingerafdrukken per functie:
--
--      `kaal` — genormaliseerd over `pg_get_functiondef()`: commentaar en
--               witruimte eruit, spaties rond haakjes weg. Verschilt dit, dan
--               lopen de lógica's uiteen en is dat een fout.
--      `ruw`  — de **body** (`prosrc`), letterlijk. Verschilt alleen dit, dan is
--               het commentaar: geen fout, wel iets dat je wilt weten.
--
-- ⚠️ **`ruw` gaat over `prosrc` en niet over `pg_get_functiondef()`, en dat is
--    op 27-08-2026 duur geleerd.** De eerste versie vergeleek de volledige
--    definitie, en toen meldde 17 van de 23 letterbuckets een verschil. De
--    oorzaak was niet commentaar maar de Postgres-versie: de lokale stack draait
--    **16.13** en productie **17.6**, en `pg_get_functiondef()` formatteert per
--    major-versie anders. Een controle die dat als drift meldt, meldt bijna alles
--    — en dan leer je hem te negeren.
--
--    `prosrc` is de body zoals hij is opgeslagen en verandert niet met de
--    serverversie. De genormaliseerde vergelijking mág wél op `functiondef`,
--    want die absorbeert de opmaak: beide kanten gaven daar exact dezelfde hash.
--
-- ⚠️ **De normalisatie haalt spaties rónd haakjes weg en vouwt niet alleen
--    witruimte samen.** Zonder die stap leest hij `f(\n a,\n b\n)` als iets
--    anders dan `f(a, b)` en meldt hij verschillen die alleen opmaak zijn. Dat is
--    op 25-08-2026 een keer gebeurd en kostte een halfuur; het staat daarom in de
--    functie en niet in een script dat iemand opnieuw kan afleiden.
--
-- ⚠️ `service_role` en verder niemand, net als `migratieregister()` (0072). Dit
--    leest de volledige broncode van elke functie in `public`; dat is niets voor
--    een ingelogde gebruiker.
--
-- ⚠️ **De steigerfuncties worden hier níét gefilterd, en dat is een gerepareerde
--    fout.** De eerste versie deed dat wel — één plek in plaats van twee, dacht
--    ik. Maar `tests/scripts/steiger.test.ts` eist dat géén enkel migratiebestand
--    de naam van die functies noemt, en dat is geen vormkwestie: die test bestaat
--    omdat een gekopieerd blok een deur naar `auth.users` op het échte project
--    zet, en niets daar rood van wordt. Een filter is onschuldig, maar de test kan
--    dat onderscheid niet maken en hóórt dat ook niet te kunnen.
--
--    Het filteren gebeurt daarom in `scripts/functies-vergelijk.mjs`, waar het
--    hoort: het is een eigenschap van de vergelijking en niet van de database.

create or replace function public.functie_vingerafdrukken()
returns table (naam text, kaal text, ruw text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    p.proname::text,
    md5(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(pg_get_functiondef(p.oid)), '--[^' || chr(10) || ']*', '', 'g'),
          '\s+', ' ', 'g'),
        '\s*([(),;])\s*', '\1', 'g')
    ),
    md5(p.prosrc)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
  order by p.proname;
$$;

comment on function public.functie_vingerafdrukken() is
  'Twee vingerafdrukken per functie in public: `kaal` (genormaliseerd over '
  'pg_get_functiondef — verschil is een logicaverschil) en `ruw` (de body uit '
  'prosrc — verschil is commentaar). ⚠️ `ruw` staat bewust niet op '
  'pg_get_functiondef: dat formatteert per Postgres-major anders, en lokaal is 16 '
  'terwijl productie 17 draait. Voor '
  '`npm run functies:controle`, dat productie naast de lokale stack legt. Zie '
  'stap 20 van /audit.';

revoke all on function public.functie_vingerafdrukken() from public, anon, authenticated;
grant execute on function public.functie_vingerafdrukken() to service_role;
