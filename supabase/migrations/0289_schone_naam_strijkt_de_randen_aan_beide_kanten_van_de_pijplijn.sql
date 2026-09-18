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
--   | vorm                                   | niet-idempotent (paren) |
--   |----------------------------------------|-------------------------|
--   | A  huidig: pijplijn → rand             |                     256 |
--   | B  rand → pijplijn                     |                    3840 |
--   | C  rand → pijplijn → rand              |                       0 |
--   | D  tot een vast punt         (deze)    |                       0 |
--
-- ⚠️⚠️ **Die twee nullen betekenen niet hetzelfde, en dat is de duurste les van
--    dit issue.** De ruimte hierboven bestaat uit tekenpáren. Vorm C scoort daar
--    nul omdat hij de tweetekenklassen dekt — maar hij tilt de ariteit van het
--    defect op in plaats van het weg te nemen. 📏 De security-review vond met
--    **vier** tekens een tegenvoorbeeld dat C alsnog breekt:
--
--      `a` + `U+180F` + `U+1680` + `U+1BCA0`
--        1. `U+1BCA0` is géén randteken, dus de voorste trim komt niet bij `U+1680`
--        2. de pijplijn haalt `U+1BCA0` weg
--        3. `U+180F` overleeft: zijn rechterbuur `U+1680` is niet-ASCII
--        4. de áchterste trim haalt `U+1680` weg en legt `U+180F` bloot
--        5. pas een vólgende aanroep strijkt hem  ->  `a`
--
--    Dat is faalvorm A opnieuw, met één teken ervoor als schild tegen de nieuwe
--    voorste trim. 📏 Werkende schilden: `U+1BCA0`, `U+FFF3`, `U+E0020`,
--    `U+E0067`, `U+E007F`. **De veeg die de nul opleverde zocht op twee tekens
--    terwijl de reparatie de klasse naar vier tilde** — en het beslisdocument
--    schreef die aanname zelfs letterlijk op (*"er zijn er twee nodig"*), waar
--    hij vóór de reparatie waar was en erna niet meer.
--
-- ⚠️ **Vandaar D en niet C.** Elke eindige keten van strijkers heeft dit
--    probleem opnieuw, één laag dieper: wat de laatste stap weghaalt kan een
--    positie blootleggen die een eerdere stap al gehad heeft. Een derde randstap
--    erbij plakken verschuift de grens naar zes tekens. Een vast punt is de enige
--    vorm waarin de eigenschap uit de constructie volgt in plaats van uit een
--    steekproef: de uitvoer is per definitie een vast punt van de pas, dus een
--    tweede aanroep verandert niets.
--
-- ⚠️ **En de pas binnenin blijft C.** Dat is geen restant: hij dekt de
--    tweetekenklassen in één ronde, zodat de lus er zelden een tweede nodig
--    heeft, en hij gooit een lange reeks randtekens weg vóór de vijf regexen.
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
--    Vandaar dat de randstap aan **beide** kanten hoort en niet verhuist.
--
--    ⚠️⚠️ **Hier stond "elke kant dekt precies de blootlegging die de andere
--    veroorzaakt", en dat was de fout.** Niets dekt de blootlegging die de
--    áchterste randstap zélf maakt — die staat nog steeds als laatste. Zie de
--    viertekenvondst hieronder; dat is de reden dat deze migratie tot een vast
--    punt herhaalt in plaats van de keten te verlengen.
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
-- miljoen tekens weg vóórdat de vijf regexen eroverheen gaan.
--
-- ⚠️⚠️ **Hier stond dat een bovengrens op `handle_new_user()` daarmee niet nodig
--    is. Dat is te breed, en de security-review heeft het weerlegd.** De
--    versnelling geldt alléén voor tekens in de **randklasse** — die gooit de
--    voorste trim weg. Voor alles daarbuiten is deze vorm juist iets trager,
--    want er staan twee regexen bij. 📏 Gemeten op 5M codepunten: `U+1BCA0`
--    (middenin, géén randteken) 1795 → 1917 ms, en `U+E0020` (losse tag)
--    4372 → 4549 ms. Dat schaalt lineair; op 8M is het ruim zeven seconden in een
--    `security definer`-trigger die bij élke aanmelding draait, op een tier met
--    `max_connections = 60`.
--
--    De grens is in deze migratie **niet** toegevoegd — dat is een eigen
--    wijziging aan `handle_new_user()` met een eigen afweging (hoeveel ruwe
--    codepunten mag een naam hebben voordat we hem afkappen), en hij hoort niet
--    als bijvangst in een migratie over idempotentie. Hij staat als eigen issue
--    met deze meting erbij.
--
-- ⚠️ D is als plpgsql-lus geschreven en zou de functie uit `language sql` halen.
--    Dat weegt mee maar was niet doorslaggevend: C wint al op alle drie de
--    metingen.

-- ---------------------------------------------------------------------------
-- 1. De functie
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De randklasse staat als lokale constante en niet als eigen functie, en
--    dat is een grendel en geen smaak.** De eerste versie van deze migratie zette
--    hem in een eigen functie `public.randtekens()`. 📏 `volatiliteit:controle`
--    werd daar rood op:
--    een `immutable` functie zónder argumenten kan Postgres wegvouwen uit het
--    plan, en PostgREST hergebruikt dat plan per poolverbinding — dan komt de
--    EXECUTE-toets er nooit meer aan te pas. Zie QS8-433 en migratie `0254`.
--
--    Hem `stable` maken zou dat oplossen, maar `schone_naam()` moet `immutable`
--    blijven (hij staat in CHECKs), en een `immutable` functie die een `stable`
--    aanroept is een belofte die niet klopt. Een lokale constante heeft het
--    probleem niet: geen plan, geen grant, geen tweede plek om te vergeten.


create or replace function public.schone_naam(p_ruw text)
returns text language plpgsql immutable
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
declare
  -- Dezelfde klasse als vóór deze migratie, woordelijk overgenomen uit 0286.
  c_rand  constant text := U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E001F';
  v_vorig text;
  v_nu    text := coalesce(p_ruw, '');
  i       int;
begin
  -- ⚠️⚠️ **Een vast punt en niet een vaste keten, en dat is de hele les van dit
  --    issue.** Elke eindige keten van strijkers heeft het probleem opnieuw, één
  --    laag dieper: wat de láátste stap weghaalt, kan een positie blootleggen die
  --    een éérdere stap al gehad heeft. De randstap aan beide kanten zetten
  --    verschuift die grens van twee tekens naar vier — het lost hem niet op.
  --
  -- ⚠️ Het plafond is een veiligheidsrem en geen verwachting. 📏 Gemeten diepte:
  --    1 voor de tweetekengevallen, 2 voor het viertekengeval, en **stapelen
  --    maakt hem niet dieper** — `a` + (`U+180F U+1680 U+1BCA0`) × n geeft voor
  --    n = 1..6 de dieptes 2, 1, 1, 1, 1, 1. Elke pas haalt álles weg wat op dat
  --    niveau weg kan, dus een cascade groeit niet mee met de lengte.
  --
  --    Wordt het plafond tóch gehaald, dan is de uitvoer geen vast punt en
  --    weigert de CHECK de rij. Dat faalt dicht, net als de lus in `create_group()`
  --    (0287) — een naam die niet convergeert wordt niet opgeslagen in plaats van
  --    half genormaliseerd.
  for i in 1..8 loop
    v_vorig := v_nu;

    -- Eén pas: de randstap vóór én na de pijplijn. Die twee dekken de
    -- tweetekenklassen in één keer, zodat de lus er zelden een tweede nodig heeft
    -- en vijf miljoen randtekens niet door vijf regexen hoeven.
    v_nu := regexp_replace(
      regexp_replace(
        public.zonder_onzichtbaar_tussen_letters(
          public.zonder_losse_tags(
            public.zonder_regelovergang(
              public.zonder_onzichtbaar_middenin(
                public.zonder_bidi(
                  regexp_replace(
                    regexp_replace(v_nu, '^[' || c_rand || ']+', ''),
                    '[' || c_rand || ']+$', ''
                  )
                )
              )
            )
          )
        ),
        '^[' || c_rand || ']+', ''
      ),
      '[' || c_rand || ']+$', ''
    );

    exit when v_nu = v_vorig;
  end loop;

  return v_nu;
end;
$fn$;

revoke all on function public.schone_naam(text) from public, anon, authenticated;
grant execute on function public.schone_naam(text) to authenticated, service_role;

comment on function public.schone_naam(text) is
  'Normaliseert een weergavenaam. Idempotent sinds 0289 (QS8-526): de randstap '
  'loopt vóór én na de pijplijn, want de contextstap leest de rand en de '
  'middenin-stap maakt er een.';
