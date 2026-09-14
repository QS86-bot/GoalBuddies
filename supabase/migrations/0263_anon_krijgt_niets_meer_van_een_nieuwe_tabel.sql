-- 0263_anon_krijgt_niets_meer_van_een_nieuwe_tabel.sql — 0261 trok de rechten
-- van `anon` in op de tabellen die er stónden; dit haalt ze uit de standaard.
--
-- ROLLBACK-PAD:
--   alter default privileges in schema public
--     grant select, insert, update, delete, references on tables to anon;
--   drop function if exists public.standaardrechten_bewaking();
--   (dat is de stand die 0073 achterliet)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 14-09-2026 (QS8-485) tegen de lokale stack op 0262**, in een
--    teruggedraaide transactie:
--
--      create table public.zzz_proef(id int);
--      -- anon op een verse tabel:
--      --   select=true  insert=true  update=true  delete=true  references=true
--
--    Migratie 0261 trok de `anon`-SELECT in op de **24 tabellen die er stonden**.
--    De standaardrechten bleven onveranderd: `pg_default_acl` draagt voor
--    `postgres` in `public` de regel `anon=arwdx/postgres` op tabellen. Élke
--    tabel die er morgen bij komt, deelt zichzelf dus opnieuw uit — en niet
--    alleen SELECT.
--
-- ⚠️ **Dat is de vorm waar CLAUDE.md bij de CI-rij van 27-08 voor waarschuwt:**
--    *"Een reparatie die de instanties opruimt en het mechanisme laat staan,
--    groeit terug — en hij doet dat onder een rij die 'opgelost' zegt."* 0261 is
--    zo'n reparatie geweest, en deze migratie is de andere helft.
--
-- ---------------------------------------------------------------------------
-- Het precedent is van dit project zelf
-- ---------------------------------------------------------------------------
--
-- 0073 deed deze ingreep al, voor TRUNCATE en TRIGGER:
--
--      alter default privileges in schema public
--        revoke all on tables from anon, authenticated;
--      alter default privileges in schema public
--        grant select, insert, update, delete, references on tables
--        to anon, authenticated;
--
-- Die tweede regel is precies wat hieronder verandert: `anon` komt eruit.
--
-- ⚠️ **En 0073 schreef ook de goede les op:** hij bouwde een grendel die
--    **beide helften** toetst — wat er nu op de tabellen staat én wat de
--    volgende tabel zou krijgen — met in de kop de reden erbij: *"Alleen de
--    eerste toetsen zou precies de fout maken die deze migratie repareert."*
--    `tests/rls/anonleesrecht.test.ts` toetste tot vandaag alleen de eerste.
--    Die tweede helft komt er in dezelfde branch bij; zonder haar is dit
--    bestand een afspraak in een comment.
--
-- ⚠️⚠️ **En de eerste versie van die tweede helft was gemodelleerd op het
--    verkeerde voorbeeld — gevonden door de security-ronde, en het is de les die
--    CLAUDE.md bij regel 19 met zoveel woorden geeft: `pg_get_functiondef()` is
--    de waarheid, niet het migratiebestand.** Ik las 0073 van schijf. Migratie
--    **0191** heeft `ddl_rechten_in_de_api()` daarna vervangen, juist omdat de
--    oude vorm op een rolnáám filterde en een `grant … to public` daarmee niet
--    zag (QS8-337). 📏 Zelf nagemeten met de eerste versie van de toets:
--
--      alter default privileges in schema public grant select on tables to public;
--        anon SELECT op een verse tabel   -> true
--        de toets                         -> vindt niets, 6 groen
--
--      alter default privileges grant select on tables to anon;   -- zónder schema
--        anon SELECT op een verse tabel   -> true
--        de toets                         -> vindt niets, 6 groen
--
--    Twee manieren om het gat opnieuw open te zetten waarbij de grendel die er
--    precies voor gebouwd is, zwijgt. De tweede is bovendien een klasse die
--    **0191 ook niet dekt** — de gedeployde `ddl_rechten_in_de_api()` draagt
--    hetzelfde namespace-filter. Die staat als eigen dossierrij.
--
-- ⚠️⚠️ **Daarom is de bewaking een dátabasefunctie geworden en geen query in het
--    testbestand.** `tests/rls/publieke-grant.test.ts` legt de belofte als
--    klasse vast — *"Elke bewaking die een recht van een client bewaakt, ziet
--    dat recht ook wanneer het via `PUBLIC` is uitgedeeld"* — en zijn register
--    `GEVALLEN` voert elke bewaking langs een échte grant aan `PUBLIC`. Een
--    bewaking die in een testbestand woont, valt buiten dat register, en dan is
--    de klasse niet gedekt op precies de plek waar hij net gefaald heeft.
--
-- ⚠️ **Het productieverschil dat 0073 vond, geldt hier onverkort.**
--    `pg_default_acl` draagt op productie een regel van `postgres` **én** een
--    van `supabase_admin`, en `alter default privileges` raakt alleen die van de
--    rol die hem uitvoert. `postgres` is geen lid van `supabase_admin`, dus die
--    tweede is buiten bereik. Hij is onschadelijk zolang alle objecten in
--    `public` van `postgres` zijn — 📏 op de lokale stack vandaag nagemeten:
--    élk object in `public` is van `postgres`, en `postgres` is er de enige rol
--    met standaardrechten. Op productie is dat **niet** hermeten (geen sleutel
--    in deze omgeving); de toets hieronder koppelt daarom aan eigenaarschap en
--    wordt vanzelf rood zodra die tweede regel levend wordt.
--
-- ---------------------------------------------------------------------------
-- Wat dit niet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`authenticated` blijft ongemoeid, en dat is dezelfde grens die 0261
--    trok.** Die rol krijgt zijn rechten op nieuwe tabellen juist via deze
--    standaard, en de kolomgrants van 0236 versmallen ze daarna. Er ook maar
--    iets van afhalen zou het schema op een plek breken die niets met `anon` te
--    maken heeft. De positieve toets in `anonleesrecht.test.ts` bewaakt dat.
--
-- ⚠️ **Sequences en functies blijven zoals ze zijn**, en dat is een keuze.
--    📏 Nagemeten: `pg_default_acl` geeft `anon` ook `rwU` op sequences en `X`
--    op functies. Functies hebben hun eigen discipline — élke `revoke` noemt
--    `authenticated` (beveiligingsregel 4) en `tests/rls/functiegrants.test.ts`
--    legt sinds 0115/0253 elk uitvoerrecht naast zijn grant-regel. Sequences
--    staan als eigen dossierrij met hun meting. Ze hier meenemen zou deze
--    migratie over drie dingen laten gaan.
--
-- ⚠️ **Geen verruiming, ook niet stilzwijgend.** Komt er ooit een tabel die
--    `anon` wél mag lezen, dan staat die grant er voortaan met zoveel woorden en
--    met een regel in `REGISTER` — beschermd is het antwoord tot iemand het
--    tegendeel besluit.

begin;

-- ⚠️ `revoke all` en niet `revoke select`. De meting hierboven laat zien dat het
--    er vijf zijn en niet één; een revoke die alleen SELECT noemt, laat een
--    verse tabel nog steeds beschrijfbaar achter voor een niet-ingelogde
--    bezoeker. Dat zou een reparatie zijn die de gemeten helft weghaalt.
--
-- ⚠️ Dit raakt geen enkele bestáánde tabel — standaardrechten gelden alleen bij
--    het aanmaken. 0261 heeft die kant al gedaan; samen dekken ze het geheel.
alter default privileges in schema public
  revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- De bewaking op de tweede helft
-- ---------------------------------------------------------------------------
--
-- Leeg antwoord is goed nieuws.
--
-- ⚠️ **`a.grantee = 0` is `PUBLIC`** en niet een rol die zo heet. Dit is de
--    reparatie van 0191, hier overgenomen van de **gedeployde** definitie.
--
-- ⚠️ **`defaclnamespace = 0` is "alle schema's"**, en dat is de tweede vorm:
--    `alter default privileges` zónder `in schema` geldt ook voor `public`. De
--    gedeployde `ddl_rechten_in_de_api()` mist die; hier staat hij er wél in.
--
-- ⚠️ **De koppeling aan eigenaarschap is van 0073 en is geen filter maar een
--    vangnet.** Standaardrechten gelden per eigenaar van het níeuwe object. Op
--    productie draagt `pg_default_acl` een regel van `postgres` én een van
--    `supabase_admin`, en `alter default privileges` raakt alleen die van de rol
--    die hem uitvoert. Door aan eigenaarschap te koppelen wordt die tweede rij
--    hier **rood op het moment dat hij levend wordt**, in plaats van
--    weggefilterd te blijven.
--
-- ⚠️ **`relkind in ('r','v','p','m')`** — met de `p` van een gepartitioneerde
--    tabel, zoals de gedeployde `ddl_rechten_in_de_api()` hem heeft. De eerste
--    versie nam de kortere lijst uit het bestand over.

create or replace function public.standaardrechten_bewaking()
returns table (bereik text, eigenaar text, rol text, recht text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  select case when d.defaclnamespace = 0 then '(alle schema''s)' else 'public' end,
         d.defaclrole::regrole::text,
         case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
         a.privilege_type::text
  from pg_default_acl d,
       lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace in (0, 'public'::regnamespace)
    and d.defaclobjtype = 'r'
    and (a.grantee = 0 or a.grantee::regrole::text = 'anon')
    and exists (
      select 1 from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'v', 'p', 'm')
        and c.relowner = d.defaclrole
    )
  order by 1, 2, 3, 4;
$$;

comment on function public.standaardrechten_bewaking() is
  'Wat de vólgende tabel in public aan een niet-ingelogde bezoeker zou geven. '
  'Ziet zowel een grant aan anon als een grant aan PUBLIC (0191/QS8-337), en '
  'zowel een standaardregel voor public als een globale zonder in schema. '
  'Gekoppeld aan een eigenaar die in public ook echt iets bezit, zodat de '
  'supabase_admin-regel van productie rood wordt zodra hij levend is. QS8-485.';

revoke all on function public.standaardrechten_bewaking() from public, anon, authenticated;
grant execute on function public.standaardrechten_bewaking() to service_role;

commit;
