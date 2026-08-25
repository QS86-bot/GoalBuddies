-- 0088_de_uitnodigingscode_houdt_zijn_entropie.sql — de vorm was getest, de sterkte niet
--
-- ROLLBACK-PAD:
--   drop function if exists uitnodigingscode_bewaking();
--
-- ---------------------------------------------------------------------------
-- Wat er nagemeten is
-- ---------------------------------------------------------------------------
--
-- De rij van 16-08-2026 in `docs/ENGINEER-REVIEW.md` vroeg niet om een reparatie
-- maar om een controle: *"de bescherming is de entropie van de code … laten
-- nakijken of dat genoeg is."* Op 25-08 gedaan, en het antwoord is ja.
--
--   alfabet   30 tekens (`23456789ABCDEFGHJKMNPQRSTVWXYZ` — geen 0/O, 1/I/L, U)
--   lengte    12
--   ruimte    30^12 = 531.441.000.000.000.000  ≈ **58,9 bits**
--
-- Bij duizend verzoeken per seconde kost de hele ruimte 16,8 miljoen jaar. En de
-- vraag die er werkelijk toe doet — hoe lang tot je één bestáánde groep raadt —
-- schaalt met het aantal groepen: bij het schaaldoel van dit project (100k+
-- gebruikers, zeg een miljoen groepen) is dat nog altijd zeventien jaar
-- onafgebroken hameren voor één treffer.
--
-- ⚠️ **Een rate limit zou daar niets aan toevoegen**, en dat is de eigenlijke
--    uitkomst. Er ís geen gebruiker om per gebruiker te tellen, en tegen raden
--    beschermt de entropie al met een marge van vele ordes. Wat een limiet wél
--    zou doen is bronnen sparen, en dat is een platformtaak — niet iets om een
--    definer-functie voor te verbouwen.
--
-- ⚠️ **De tweede helft van die rij is óók al dicht**, en dat stond er niet bij:
--    `invite_preview()` heeft een `ingelogd`-tak. Zonder sessie krijg je alleen
--    de vóórnaam, geen avatar en geen doeltitel. De zorg "wie de link heeft ziet
--    de namen van de leden en de titels van hun doelen" geldt dus alleen voor wie
--    al een account heeft — en dat is 5.3, waar koppelen de toestemming ís.
--
-- ---------------------------------------------------------------------------
-- Waarom hier dan tóch een functie bij komt
-- ---------------------------------------------------------------------------
--
-- Omdat de sterkte nergens onder test staat. `policies.test.ts` toetst dat een
-- code **twaalf tekens uit het alfabet** is en knoopt daarmee de SQL aan
-- `isCodeVorm()` — goed, en nodig. Maar dat is de vórm.
--
-- ⚠️ **Twee wijzigingen halen die test moeiteloos en slopen de sterkte.**
--
--   1. `extensions.gen_random_bytes(32)` vervangen door `random()`. De codes
--      blijven twaalf tekens uit hetzelfde alfabet en elke bestaande test blijft
--      groen — maar `random()` is een gezaaide PRNG, geen CSPRNG. Wie één code
--      ziet en de zaadwaarde kan afleiden, kent de volgende.
--
--   2. Het alfabet uitbreiden of inkorten zónder `drempel` mee te veranderen.
--      Die staat nu op **240 = 8 × 30**: elke byte ≥ 240 wordt verworpen, zodat
--      `b % 30` geen enkele letter vaker oplevert dan een andere. Wordt het
--      alfabet 32 tekens en blijft de drempel 240, dan is 240 geen veelvoud meer
--      en zijn de eerste zestien letters stelselmatig waarschijnlijker. De codes
--      zien er nog steeds prima uit; de entropie zakt stil.
--
-- Dat tweede is de klassieke modulo-bias, en het is precies het soort detail dat
-- een refactor meeneemt zonder het te weten. Vandaar een functie die de drie
-- getallen uitleesbaar maakt, zoals `realtime_bewaking()` (0027) dat doet voor de
-- replica identity: een test die via PostgREST praat, kan niet bij `pg_proc`.

create or replace function uitnodigingscode_bewaking()
  returns table (
    alfabet_lengte  integer,
    code_lengte     integer,
    drempel         integer,
    gebruikt_csprng boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bron as (
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generate_invite_code'
  )
  select
    length((regexp_match(def, 'alfabet\s+constant\s+text\s*:=\s*''([^'']+)'''))[1]),
    ((regexp_match(def, 'lengte\s+constant\s+integer\s*:=\s*(\d+)'))[1])::integer,
    ((regexp_match(def, 'drempel\s+constant\s+integer\s*:=\s*(\d+)'))[1])::integer,
    def ~ 'gen_random_bytes' and def !~ '\mrandom\s*\(\s*\)'
  from bron;
$$;

comment on function uitnodigingscode_bewaking() is
  'De drie getallen die de uitnodigingscode zijn sterkte geven: de alfabetlengte, '
  'de codelengte en de verwerpingsdrempel, plus of de bron een CSPRNG is. Zodat '
  'een test kan bewijzen dat de drempel een exact veelvoud van het alfabet blijft '
  '(anders keert de modulo-bias stil terug) en dat random() de gen_random_bytes '
  'niet heeft vervangen. De vorm van de code stond al onder test; de sterkte niet.';

revoke all on function uitnodigingscode_bewaking() from public, anon;
grant execute on function uitnodigingscode_bewaking() to authenticated, service_role;
