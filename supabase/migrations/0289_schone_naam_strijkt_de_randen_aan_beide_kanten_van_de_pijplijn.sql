-- 0289_schone_naam_strijkt_de_randen_aan_beide_kanten_van_de_pijplijn.sql — schone_naam() is idempotent (QS8-526)
--
-- ROLLBACK-PAD:
--   De vorige definitie staat in migratie 0286 en is daar ongewijzigd terug te
--   halen met `create or replace`; de handtekening verandert niet. ⚠️ Terugzetten
--   brengt het defect hieronder terug, inclusief de aanmelding die hard faalt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `schone_naam()` was niet idempotent: `schone_naam(schone_naam(x))` verschilde
-- van `schone_naam(x)`. De randstap liep als láátste, haalde het buitenste teken
-- weg, en schoof daarmee het volgende teken naar een positie waar
-- `zonder_onzichtbaar_tussen_letters()` er wél iets van vindt — maar die stap was
-- in diezelfde aanroep al geweest.
--
--   ruw              U&'\2001\+00FE05ab'   -- EM QUAD, variatieselector-6, 'ab'
--   schone_naam 1x   U&'\+00FE05ab'        -- de EM QUAD is een randteken en gaat weg
--   schone_naam 2x   'ab'                  -- nú pas gaat de variatieselector weg
--
-- ⚠️ **Het mechanisme zit in een lookbehind die de rand als ASCII telt.** Stap B
--    van `zonder_onzichtbaar_tussen_letters()` gebruikt `(?<![^<ascii>])`, en die
--    slaagt óók aan het begin van de tekst. Zolang de EM QUAD ervoor staat faalt
--    hij — een EM QUAD is niet-ASCII. Haal je hem weg, dan stáát de
--    variatieselector aan het begin en is hij ineens wél strijkbaar.
--
-- ---------------------------------------------------------------------------
-- Waarom dit een aanmelding kon laten falen
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten tegen een echte `insert` in `auth.users`, niet beredeneerd.**
--    `handle_new_user()` roept `schone_naam()` twee keer aan — binnen en buiten
--    een `left(…, 80)` — en dat dékt het geval hierboven: een aanmelding met
--    `full_name` = `U&'\2001\+00FE05ab'` slaagt gewoon en geeft `display_name`
--    = `'ab'`. De maximale diepte tot een vast punt is twee, en er zijn twee
--    aanroepen.
--
-- ⚠️⚠️ **Maar de truncatie zit ertússen, en die maakt een nieuwe rand.** De
--    binnenste aanroep levert schone tekst; `left(…, 80)` knipt er een stuk af en
--    kan precies op een randteken eindigen; de buitenste aanroep is dan de
--    eerste die dát ziet, en één aanroep is niet genoeg.
--
--    📏 Gemeten, met `full_name` = 78 × `'a'` + variatieselector-6 + EM QUAD +
--    `'zzz'`:
--
--      ERROR: new row for relation "profiles" violates check constraint
--             "profiles_display_name_geen_onzichtbaar_tussen_letters"
--
--    De trigger valt om en **de registratie faalt hard**. Dat is een gebruiker
--    die zich niet kan aanmelden, en het hangt aan een naam die een
--    OAuth-provider zo aanlevert.
--
-- ---------------------------------------------------------------------------
-- Welke vorm, en waarom niet de voor de hand liggende
-- ---------------------------------------------------------------------------
--
-- QS8-526 noemde twee richtingen: de randstap vóór de contextstap zetten, of de
-- compositie herhalen tot een vast punt. 📏 **Alle vier de vormen zijn gemeten op
-- dezelfde ruimte** — de 4.261 codepunten waar `schone_naam()` iets aan doet,
-- elk achtste daarvan, alle paren in vier vormen, 1.136.356 gevallen:
--
--   | vorm                                   | niet-idempotent |
--   |----------------------------------------|-----------------|
--   | A  huidig: pijplijn → rand             |             256 |
--   | B  rand → pijplijn                     |            3840 |
--   | C  rand → pijplijn → rand  (deze)      |               0 |
--   | D  huidige vorm tot een vast punt      |               0 |
--
-- ⚠️⚠️ **De voor de hand liggende reparatie is vijftien keer erger, en de twee
--    fouten zijn elkaars spiegelbeeld.** Beide vormen laten één van de twee
--    stappen een positie blootleggen die de ándere stap al gehad heeft:
--
--      A  de randstap legt een nieuwe CONTEXT bloot
--         📏 `ab` + `U+FE05` + `U+2001`  ->  `ab` + `U+FE05`  ->  `ab`
--            De trailing trim haalt `U+2001` weg; daardoor staat `U+FE05` ineens
--            aan het eind, waar `zonder_onzichtbaar_tussen_letters()` hem wél
--            pakt — maar die stap is in diezelfde aanroep al geweest.
--
--      B  de pijplijn legt een nieuwe RAND bloot
--         📏 `U+FFF3` + `U+2001` + `ab`  ->  `U+2001` + `ab`  ->  `ab`
--            📏 `U+FFF3` zit wél in `zonder_onzichtbaar_middenin()` en **niet** in
--            de randklasse — nagemeten, `true / false`. De pijplijn haalt hem dus
--            weg, en dan staat `U+2001` vooraan zonder dat er nog een randstap
--            komt.
--
--    Vandaar dat de randstap aan **beide** kanten moet en niet verhuizen: elke
--    kant dekt precies de blootlegging die de andere veroorzaakt.
--
-- ⚠️ **Geen enkele stap voegt tekens toe** — 📏 alle vijf vervangen door `''` of
--    door hun eigen capture (`zonder_losse_tags` houdt een wélgevormde vlagreeks
--    heel). De uitvoer is dus altijd een deelrij van de invoer, en daarom
--    termineert herhalen sowieso. Dat is níet waarom C werkt; C werkt omdat één
--    extra randstap alle blootleggingen dekt die er zijn, en dat is gemeten en
--    niet afgeleid.
--
-- ⚠️⚠️ **Eén waarschuwing bij het narekenen hiervan: lees deze tekens in hex.**
--    `U+2028` is LINE SEPARATOR en een terminal toont hem als witruimte, dus
--    `schone_naam(U&'a\2028b')` ziet er in `psql` uit als `'a b'` terwijl er
--    `61 e280a8 62` staat — het teken is onaangeraakt. Op die vergissing is
--    tijdens dit issue eerst een verkeerde verklaring gebouwd, en
--    `tests/rls/naamnormalisatie.test.ts` draagt dezelfde les al in de kop van
--    `alsHex()`.
--
-- 📏 **Op een onafhankelijke ruimte hergemeten** — 17.044 drietallen uit de volle
--    4.261, in vier vormen, dus niet de ruimte die het defect voortbracht:
--    A 15 niet-idempotent, C 0, D 0. **En C en D geven op élk van die gevallen
--    hetzelfde antwoord**, dus C rekent het vaste punt in één pas uit.
--
-- ---------------------------------------------------------------------------
-- C is bovendien eenentwintig keer sneller op de vorm die pijn doet
-- ---------------------------------------------------------------------------
--
-- 📏 `schone_naam()` op vijf miljoen zero-width spaties:
--
--   | vorm        | tijd    |
--   |-------------|---------|
--   | A  huidig   | 1932 ms |
--   | C  deze     |   89 ms |
--   | D  vastpunt | 1915 ms |
--   | `btrim()`   |   85 ms |
--
-- De reden is dezelfde als de reparatie: de eerste randstap gooit die vijf
-- miljoen tekens weg vóórdat de vijf regexen eroverheen gaan. `handle_new_user()`
-- draait `schone_naam()` op ongefilterde `raw_user_meta_data` en heeft geen
-- bovengrens — met deze vorm is dat geen bezwaar meer, en een aparte grens is
-- daarmee niet nodig. Dat is met opzet gemeten en niet gekopieerd van
-- `create_group()`, die zijn grens van duizend codepunten om een andere reden
-- heeft (0287).
--
-- ⚠️ D is als plpgsql-lus geschreven en zou de functie uit `language sql` halen.
--    Dat weegt mee maar was niet doorslaggevend: C wint al op alle drie de
--    metingen.

-- ---------------------------------------------------------------------------
-- 1. De functie
-- ---------------------------------------------------------------------------

create or replace function public.schone_naam(p_ruw text)
returns text language sql immutable
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
  -- ⚠️ De randstap staat er twee keer, en allebei de keren dragen ze werk:
  --      vooraf  — zodat de contextstap de échte rand van de naam ziet, en
  --                zodat vijf miljoen onzichtbare tekens niet door vijf regexen
  --                heen hoeven;
  --      achteraf — omdat de pijplijn tekens weghaalt die géén randteken zijn
  --                (`U+FFF3` bijvoorbeeld) en daarmee een nieuw randteken aan de
  --                buitenkant kan blootleggen.
  --    Eén van de twee weglaten geeft een niet-idempotente functie; welke je
  --    weglaat bepaalt alleen of het de 256 of de 3840 gevallen worden.
  select regexp_replace(
    regexp_replace(
      public.zonder_onzichtbaar_tussen_letters(
        public.zonder_losse_tags(
          public.zonder_regelovergang(
            public.zonder_onzichtbaar_middenin(
              public.zonder_bidi(
                -- de randstap vooraf
                regexp_replace(
                  regexp_replace(coalesce(p_ruw, ''), '^[' || rand || ']+', ''),
                  '[' || rand || ']+$', ''
                )
              )
            )
          )
        )
      ),
      '^[' || rand || ']+', ''
    ),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E001F' as rand
  ) s;
$fn$;

revoke all on function public.schone_naam(text) from public, anon, authenticated;
grant execute on function public.schone_naam(text) to authenticated, service_role;

comment on function public.schone_naam(text) is
  'Normaliseert een weergavenaam. Idempotent sinds 0289 (QS8-526): de randstap '
  'loopt vóór én na de pijplijn, want de contextstap leest de rand en de '
  'middenin-stap maakt er een.';
