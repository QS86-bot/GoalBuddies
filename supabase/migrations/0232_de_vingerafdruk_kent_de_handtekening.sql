-- 0232_de_vingerafdruk_kent_de_handtekening.sql — een overload werd nooit
-- vergeleken, want twee functies met dezelfde naam kregen dezelfde sleutel (QS8-398)
--
-- ROLLBACK-PAD:
--   Zet `functie_vingerafdrukken()` terug naar de vorm van 0105: `p.proname::text`
--   in plaats van naam + identiteitsargumenten. Het is een `create or replace`,
--   dus de grants en `comment on function` blijven staan en er valt verder niets
--   terug te draaien.
--
--   ⚠️ Terugdraaien zet de blinde vlek terug: van elk paar overloads wordt er
--      dan weer precies één vergeleken en de andere nooit.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden bij het afronden van QS8-220, door vraag 6 van onwrikbare regel 18 aan
-- de controle zélf te stellen: tilt dit een aanname van "er is er altijd precies
-- één" naar "er kunnen er meer zijn"?
--
-- 📏 Gemeten op de lokale stack uit alle 231 migratiebestanden, 09-09-2026:
--
--   overloads in public:
--     activeer_weekplanstap  2
--
--   handtekeningen:
--     activeer_weekplanstap(p_goal_id uuid, p_cycle_start_date date)
--     activeer_weekplanstap(p_goal_id uuid, p_cycle_start_date date, p_cycle_index integer)
--
--   functie_vingerafdrukken() geeft voor die naam 2 rijen, met 2 vérschillende
--   `kaal`-waarden — en `vergelijkFuncties()` legt ze in een Map met de naam als
--   sleutel:
--
--     rijen uit de database : 2
--     na de Map             : 1   -> er verdwijnt er 1
--
-- De verdwenen overload zit noch in `logica`, noch in `commentaar`, noch in
-- `alleenProductie` of `alleenLokaal`. Hij is onzichtbaar, niet gemeld.
--
-- ⚠️ **En wélke van de twee overblijft, is niet vastgelegd.** `order by p.proname`
--    laat de volgorde binnen één naam aan de planner. Twee databases kunnen een
--    verschillende overload overhouden, en dan meldt de controle een
--    logicaverschil dat er niet is — of houdt hij twee verschillende functies
--    voor elkaars evenknie en zwijgt over allebei.
--
-- ⚠️ CLAUDE.md schrijft deze les al op, één laag lager, bij de drop-uitzondering
--    van onwrikbare regel 20: *"Een drop van `f(uuid, text, text)` dekt geen
--    nieuwe `f` met zes argumenten — dat is een andere functie. Een controle die
--    op naam vergelijkt, laat precies die bug door."* Dat is woordelijk wat hier
--    gebeurt, alleen in de controle die moet vaststellen of productie nog draait
--    wat de migraties bouwen.
--
-- ⚠️ Dit is een gat in de grendel en geen openstaande schade: 📏 de twee overloads
--    lopen op dit moment op productie en lokaal gelijk. Het is nu goedkoop omdat
--    er één overload is; de aanname wordt duurder bij elke overload die erbij
--    komt, en die komen er juist bij als een functie een argument krijgt zonder
--    zijn aanroepers te breken.
--
-- ---------------------------------------------------------------------------
-- De reparatie
-- ---------------------------------------------------------------------------
--
-- `naam` draagt voortaan de **identiteit** in plaats van de naam:
--
--   activeer_weekplanstap(p_goal_id uuid, p_cycle_start_date date)
--
-- ⚠️ `pg_get_function_identity_arguments()` en niet `pg_get_function_arguments()`.
--    De eerste geeft wat een functie uniek maakt — de argumenttypes zoals
--    `DROP FUNCTION` ze wil — en laat standaardwaarden en `OUT`-parameters weg.
--    De tweede zet die er wél in, en dan verandert de sleutel zodra iemand een
--    default toevoegt zonder dat de functie een andere functie wordt.
--
-- ⚠️ **Geen drop nodig en dus geen drop gedaan.** De `returns table (naam text,
--    kaal text, ruw text)` verandert niet; alleen wat er ín `naam` staat. Een
--    `create or replace` kan dat, en een drop zou de grants weggooien die 0105
--    er expliciet op zet.
--
-- ⚠️ **`order by` volgt de nieuwe sleutel.** Bleef hij op `p.proname`, dan is de
--    volgorde binnen één naam nog steeds aan de planner — en dat is de helft van
--    het probleem hierboven. Nu is de uitvoer bij gelijke inhoud woordelijk
--    gelijk aan beide kanten, wat de vergelijking pas herhaalbaar maakt.

-- ---------------------------------------------------------------------------
-- IJKING — met de hand, 09-09-2026
-- ---------------------------------------------------------------------------
--
-- Mutatie per grendel, en elke keer eerst met een grep bevestigd dat de mutatie
-- er écht in stond vóór de uitslag geloofd werd. Nulmeting groen, na afloop
-- opnieuw groen (14 + 3).
--
--   A  de oude `proname`-vorm terugzetten in de dráaiende functie
--      → 2 rood in `tests/rls/vingerafdruk-handtekening.test.ts`: de telling
--        (*evenveel sleutels als rijen*) én de must-find. De shim-regel blijft
--        groen, want die namen zijn niet overladen — terecht
--   B  één overload uit het resultaat filteren, sleutels blijven uniek
--      → **1** rood: alleen de must-find. De telling blijft groen, en dát is
--        het bewijs dat het twee grendels zijn: een unieke-sleutelteller ziet
--        een wéggevallen overload per constructie niet
--   C  `vergelijkFuncties()` weer op de kale naam laten sleutelen
--      (`f.naam.split('(')[0]`)
--      → 2 rood in `tests/scripts/functies-vergelijk.test.ts`, de twee nieuwe
--        overloadgevallen; de twaalf andere blijven groen
--
-- ⚠️ **A en C bewaken niet hetzelfde, en dat is de reden dat ze allebei bestaan.**
--    De unittest voert de sleutels met de hand aan: draai je deze migratie terug,
--    dan blijft hij groen terwijl de grendel weg is. Dat is regel 18 vraag 3 —
--    *kan deze test groen blijven terwijl de belofte breekt?* — en het antwoord
--    voor de unittest is ja. Vandaar dat de belofte zélf aan de database gevraagd
--    wordt, in `tests/rls/vingerafdruk-handtekening.test.ts`.
--
-- 📏 Nagemeten dat `create or replace` de grants behoudt, want deze migratie
--    leunt daarop in plaats van te droppen:
--
--      anon=f  authenticated=f  service_role=t
--      proacl: postgres=X/postgres service_role=X/postgres
--
--    Geen PUBLIC, en de `revoke`/`grant` uit 0105 staan er nog — precies zoals
--    onwrikbare regel 4 het vraagt.

create or replace function public.functie_vingerafdrukken()
returns table (naam text, kaal text, ruw text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
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
  order by 1;
$$;

comment on function public.functie_vingerafdrukken() is
  'Twee vingerafdrukken per functie in public: `kaal` (genormaliseerd over '
  'pg_get_functiondef — verschil is een logicaverschil) en `ruw` (de body uit '
  'prosrc — verschil is commentaar). ⚠️ `naam` draagt sinds 0232 de hele '
  'identiteit — naam plus pg_get_function_identity_arguments — en niet alleen '
  'proname: bij een overload kregen twee functies anders dezelfde sleutel en werd '
  'er precies één van de twee vergeleken (QS8-398). ⚠️ `ruw` staat bewust niet op '
  'pg_get_functiondef: dat formatteert per Postgres-major anders, en lokaal is 16 '
  'terwijl productie 17 draait. Voor '
  '`npm run functies:controle`, dat productie naast de lokale stack legt. Zie '
  'stap 20 van /audit.';
