---
description: Wekelijkse gezondheidscheck van de codebase — draai dit elke vrijdag
---

Voer een wekelijkse audit uit. Schrijf zelf geen code; lever een rapport.

1. **Nieuwe code deze week** — bekijk de commits sinds vorige week.
   Delegeer aan `code-critic` en `security-reviewer` voor een overzichtsreview
   van wat er nieuw bij is gekomen.

   ⚠️ Kijk daarbij apart naar **verhuizingen**: code die deze week naar een ander
   bestand ging. Tests verhuizen mee en blijven groen, want ze toetsen wat er in
   het bestand staat en niet wat het bestand beloofde. Twee van de drie lekken
   van de week van 24-08 kwamen zo. Zie `CLAUDE.md`, regel 18 uitgeschreven.

2. **RLS-dekking** — controleer of elke tabel in `supabase/migrations/` een
   RLS-policy heeft voor SELECT, INSERT, UPDATE én DELETE. Lijst ontbrekende op.
   Dit is de belangrijkste check van de week.

3. **Schaalrisico's** — zoek naar ongepagineerde queries, ontbrekende indexen op
   foreign keys, en N+1-patronen die er sinds vorige week bij zijn gekomen.

4. **Kostenrisico's** — zijn er nieuwe externe/AI-calls zonder cache, quotum of
   rate limiting?

5. **Tier-afhankelijkheden** — verzamel alle `TODO(paid-tier)` markeringen.

6. **Testgezondheid** — draai de suite. Welke tests zijn geskipt of uitgezet?

7. **ENGINEER-REVIEW.md** — is dit bestand bijgewerkt met wat er deze week
   is blijven liggen? Zo niet, vul het aan.

8. **Overdrachtsdocumenten** — draai `npm run docs:controle`. Die toetst of
   `CLAUDE.md`, `docs/WERKVOORRAAD.md` en `docs/VOLGENDE-SESSIE.md` elkaar niet
   tegenspreken: getallen die uiteenlopen, en feiten die in twee documenten
   tegelijk staan. Rood betekent dat een volgende sessie verouderde informatie
   krijgt. Zie QS8-125 en "Wie bezit welk feit" in `CLAUDE.md`.

   ⚠️ Het script vangt alleen wat een patroon heeft. Controleer met de hand of
   issues die in Linear op Done staan, in de documenten ook als af beschreven
   worden — dat is vijf keer misgegaan en geen script ziet het.

9. **Emoji** — draai `npm run emoji:controle`. De app gebruikt zelf geen emoji
   in tekst die de gebruiker leest (CLAUDE.md, QS8-111). Commentaar en
   testbestanden tellen niet mee; die gebruiken ze juist met opzet.

10. **Laag-bevindingen** — draai `npm run review:controle`. Elke open
    Laag-rij in `ENGINEER-REVIEW.md` hoort te zeggen wanneer hij zwaarder wordt
    (QS8-123).

    ⚠️ En lees die voorwaarden deze week één keer door tegen wat er gebouwd is.
    Dát is de eigenlijke controle; het script bewaakt alleen dat ze er staan.
    Een rij waarvan de aanname inmiddels vervallen is, is geen Laag meer en
    hoort deze week op tafel.

    ⚠️ **Sinds 25-08 toetst hij er twee dingen bij**, en allebei omdat het document
    ze nodig had gehad. Een rij waarvan de beschrijving zegt dat hij gerepareerd
    is terwijl de risicokolom openstaat, is nu rood — er stonden er zes, waarvan
    twee als **Hoog**. En een risiconiveau dat geen bekend woord is (er stond
    twee keer letterlijk `Gedicht`) ook, want zo'n waarde glipt langs elk filter.

    ⚠️ **Wat de controle níét ziet: een rij die inhoudelijk achterhaald is.**
    `join_group_with_code` noemde drie dingen "nog open" die alle drie gebouwd
    waren. Kom je zo'n rij tegen, meet dan de gedeployde stand
    (`pg_get_functiondef()`, `pg_policy`) en niet het migratiebestand.

11. **De migratiemap** — draai `npm run migraties:controle`. Die toetst dat de
    nummering aaneengesloten is, dat er geen twee migraties hetzelfde nummer
    dragen, en dat elke migratie een rollback-pad in zijn kop heeft (onwrikbare
    regel 20).

    ⚠️ Hij is één dag rood geweest en dat was de bedoeling: `0057` t/m `0061`
    stonden op een branch die niet geland was. PR #9 heeft dat op 24-08 gedicht
    en hij meldt nu 74 migraties, aaneengesloten. Wordt hij weer rood, dan
    ontbreekt er echt iets — zet hem niet uit.

    ⚠️ Wat hij niet ziet: of de repo gelijkloopt met `schema_migrations` op het
    échte project. Dat is stap 13.

12. **Hardgecodeerde UI-tekst** — draai `npm run tekst:controle`. Die toetst
    criterium 1 van QS8-115: er staat nergens in `src/` of `app/` nog Nederlandse
    schermtekst hard in de code. Alles loopt via `t()` en de catalogus.

    ⚠️ Hij heeft de hele omzetting rood gestaan, met opzet — een controle die je
    aanzet terwijl hij rood staat, leert je om rood te negeren. Sinds 24-08 is
    hij groen en draait hij hier mee.

    ⚠️ **Hij is vier keer geijkt en de laatste keer pas nadat hij groen stond.**
    Die vierde ronde vond zeventien zinnen in mappen die al "af" heetten: ze
    stonden achter een openingstag op dezelfde regel, en dát patroon zag hij nog
    niet. Wordt er een nieuwe vorm zichtbaar, scherp hem dan aan in plaats van
    de treffer weg te schrijven. Een controle die nul meldt terwijl er tekst
    staat, geeft toestemming om te stoppen met kijken.

13. **Repo naast project** — draai `npm run register:controle`. Die legt
    `supabase/migrations/` naast `schema_migrations` op het echte project en
    wordt rood bij een migratie die maar aan één kant bestaat, bij twee namen op
    hetzelfde nummer, en bij een tijdstempel in plaats van een nummer.

    ⚠️ **Zonder credentials slaat hij zichzelf over en dat is geen probleem** —
    zelfde afspraak als de RLS-suite. Maar draai hem dan wél een keer met `.env`
    erbij vóór je de audit afsluit: dit is de enige controle die het gat ziet dat
    twee keer bij toeval gevonden is (`0036`/`0037` en `0057` t/m `0061` stonden
    op het project zonder bestand in de repo).

    ⚠️ Een tijdstempel betekent dat er een migratie is toegepast buiten de
    werkwijze uit `docs/DEPLOY.md` §2.2 om. De MCP-tool doet dat uit zichzelf;
    uitlijnen is één UPDATE en staat daar beschreven.

14. **Bouwt de map het schema nog op?** — `npm run schema:opbouwen`, en daarna
    `scripts/schema-vingerafdruk.sql` op beide databases. Niet elke week nodig,
    wél na een reeks migraties of vóór je iets doet dat een tweede omgeving
    vraagt. Zie `docs/decisions/004-migratieregister.md`.

15. **Verbindingen en pooling** — draai `npm run verbindingen:controle`. Die
    toetst dat niemand zelf een verbinding met Postgres opent: geen
    Postgres-driver in `package.json`, geen verbindingsstring in `src/`, `app/`
    of `supabase/functions/`. Alles loopt via PostgREST.

    ⚠️ **Deze staat groen zonder dat iemand iets heeft ingesteld, en dat is
    precies waarom hij bestaat.** Het klopt vandaag bij toeval van de
    architectuur. `max_connections` is 60 voor de héle database; één
    langdraaiend Node-proces met een pool van tien op de directe poort neemt daar
    een zesde van. Wordt hij rood, lees dan `docs/DEPLOY.md` §2.7 vóór je iets
    verandert — het antwoord is de transactiepooler op 6543 met `prepare: false`,
    en niet "de controle uitzetten".

16. **Personen in jsonb** — draai `npm run persoon:controle`. Die toetst dat er
    geen verwijzing naar een persoon in een jsonb-veld wordt weggeschreven: een
    uuid in jsonb heeft geen foreign key, dus `on delete set null` raakt hem niet
    en de naam van een verwijderd account blijft afleidbaar uit een rij die
    geanonimiseerd hoort te zijn.

    ⚠️ **De regel stond sinds 21-08 in `docs/ENGINEER-REVIEW.md` en werd vier
    dagen later alsnog een tweede keer overtreden** — in `goal_events.new_value`,
    waar de goedkeurder van een deadline-verschuiving belandde omdat `actor_id`
    al door de aanvrager bezet was. Niemand zag het, want de regel stond in een
    document en niet in een script. 0085 haalde hem eruit.

    ⚠️ Wordt hij rood, maak er dan een echte kolom van zoals 0059 en 0085 deden.
    De lijst `RECHTGEZET` in het script is **geen** uitweg: een regel daarin moet
    de migratie noemen die de vondst rechtzette, en daar staat een test op.

17. **De Edge-tijdmodule** — draai `npm run edge:controle`. Die legt de twee
    exemplaren van `shared/time` naast elkaar: één in `src/` voor de app, één in
    `supabase/functions/_shared/` voor de rollover en de notificatiejob. Elke
    functie die in béide staat, moet er hetzelfde uitzien.

    ⚠️ **Weglaten mag, afwijken niet.** De Edge-kopie laat bewust de helpers weg
    die `Intl` en de browser nodig hebben. Wordt hij rood, dan rekenen de app en
    de nachtjob verschillende weekgrenzen uit — en correctheidsregel 7 noemt
    precies dat als de fout die je een gebruiker kost.

    ⚠️ Sinds 25-08 draaien `deno check` en `deno lint` bovendien in CI over
    `supabase/functions/`. Die map viel daarvoor buiten typecheck, lint én CI, en
    dat heeft twee keer iets verborgen: de `excused`-bevinding van 20-08 werd
    gemist omdat de schrijver een Edge Function was, en de Doelcoach draaide
    maandenlang op een `db` die daar niet bestaat — élke job mislukte, met HTTP
    200 terug.

18. **Dode ketens** — draai `npm run keten:controle`. Die zoekt twee dingen: een
    functie of trigger die door niets wordt aangeroepen, en een CHECK-waarde die
    door niets ooit geschreven wordt. Tests en scripts tellen daarbij níét als
    aanroeper — dat is de hele truc, want bij EPIC 9 stonden er tests omheen die
    het losse gedrag bewezen terwijl geen enkele knop erheen liep.

    ⚠️ **Dit is de variant zonder kapot onderdeel.** Er is niets stuk, dus geen
    enkele test wordt er rood van, en de vijf gevallen die dit project al gehad
    heeft zijn alle vijf met de hand of bij toeval gevonden.

    ⚠️ De lijst `BEWUST_ONGESCHREVEN` in het script is **geen** uitweg. Een regel
    daarin noemt de reden én de voorwaarde die de waarde weer interessant maakt —
    dezelfde vorm als `Wordt zwaarder als:` in `docs/ENGINEER-REVIEW.md`. Een
    uitzondering zonder die tweede helft verloopt zonder dat iemand het merkt.

19. **Storage** — draai `npm run storage:controle`. Twee vragen: heeft elke
    bucket die een migratie aanmaakt ook een policy op `storage.objects`, en
    bestaat elke bucket waar productiecode naar schrijft in een migratie?

    ⚠️ **Deze staat vandaag groen omdat er niets is** — nul buckets, nul uploads.
    Dat is het soort groen dat niets bewijst; hij is er voor de dag dat de eerste
    upload gebouwd wordt. Wordt hij rood, lees dan eerst de bevinding van 16-08
    in `docs/ENGINEER-REVIEW.md`: `public = true` op een bucket zet RLS voor het
    lezen volledig buitenspel, en dat botst met domeinregel 7.

    ⚠️ Wat hij niet ziet: een bucket die met de hand in het dashboard is gemaakt
    en waar nog geen code naar verwijst. Kijk daarvoor één keer per ronde in het
    Supabase-dashboard onder Storage.

20. **Bouwen de migraties nog wat er draait?** Dit is de enige controle die
    productie en `supabase/migrations/` naast elkaar legt, en hij kan niet in CI
    — daar is geen productieverbinding. Bouw de lokale stack op
    (`npm run rls:stack`) en draai op **beide** databases dezelfde query:

    ```sql
    with genormaliseerd as (
      select p.proname,
             regexp_replace(
               regexp_replace(
                 regexp_replace(lower(pg_get_functiondef(p.oid)), '--[^\n]*', '', 'g'),
                 '\s+', ' ', 'g'),
               '\s*([(),;])\s*', '\1', 'g') as kaal
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f','p')
        and p.proname not like 'shim!_%' escape '!'
    )
    select count(*), md5(string_agg(proname || '|' || md5(kaal), E'\n' order by proname, kaal))
    from genormaliseerd;
    ```

    Twee keer hetzelfde getal en dezelfde hash: de bestanden bouwen wat er
    draait. Verschilt het, vergelijk dan per functie (`proname || ' ' || md5(kaal)`)
    en zoek de afwijkers op.

    ⚠️ **De normalisatie moet spaties rónd haakjes weghalen**, niet alleen
    witruimte samenvouwen. Zonder die stap leest hij `f(\n  a,\n  b\n)` als iets
    anders dan `f(a, b)` en meldt hij vier "verschillen" die alleen opmaak zijn.
    Dat is één keer gebeurd, op 25-08-2026, en het kostte een halfuur.

    ⚠️ De twee `shim_*`-functies staan alleen lokaal (de GoTrue-vervangers uit
    `lokale-stack.sh`) en horen er dus uit gefilterd te worden.

    ⚠️ **Wat deze controle níét meet, en met opzet:** het commentaar ín de
    functies. Dat verdwijnt in productie zodra iemand een migratie via
    `apply_migration` toepast met een ingekorte body, en dat is op 25-08 drie keer
    gebeurd. Zie de rij daarover in `docs/ENGINEER-REVIEW.md`.

21. **Klokgrenzen** — draai `npm run klokgrens:controle` tegen de lokale stack
    (of tegen productie met `DB=postgres` en de juiste `PG*`). Hij legt elk
    voorkomen van `current_date` in `pg_get_functiondef()` naast een register met
    de reden waarom het daar mag staan, en is tweezijdig: een voorkomen zonder
    reden is rood, en een reden zonder voorkomen ook.

    ⚠️ **De maat is niet "staat er `+ 1`" maar "welke kant valt de fout op".** Een
    lokale datum ligt altijd in `[current_date - 1, current_date + 1]` — geen zone
    loopt meer dan een dag voor of achter op UTC. Een bovengrens op een datum die
    de client aanlevert heeft die dag dus nodig; een ondergrens met vijf weken
    speling niet. Dat onderscheid maakt het script niet voor je: het dwingt alleen
    af dat iemand het opgeschreven heeft.

    ⚠️ Het gedrág van de drie van buitenaf bereikbare grenzen staat in
    `tests/rls/klokgrens.test.ts` en draait mee in `npm run rls:lokaal`. Deze stap
    is de vorm, die suite is de werking; je hebt ze allebei nodig.

22. **Kolomrechten** — draai `npm run kolomrechten:controle` tegen de lokale
    stack. Hij legt elke `.from(…).select(…)` in `src/` en `app/` naast de échte
    SELECT-grants van `authenticated`, en meldt elke kolom die de app terugvraagt
    maar niet mag lezen.

    ⚠️ **Waarom dit geen luxe is.** Migratie 0089 versmalde de grant op `profiles`
    om een lek te dichten — correct, en de leeskant is uitgebreid getest. Maar
    `updateProfiel()` vroeg zijn rij terug met `select('*')`, en dat is 42501.
    Vanaf die migratie faalde élke profielopslag én de onboarding, vier maanden
    lang, zonder één rode test. De policy klopte, de grant klopte, de app klopte;
    alleen de combinatie was van niemand.

    ⚠️ **Let bij een migratie die rechten intrekt altijd op de schrijfkant.** Een
    `returning *` na een `update` vraagt leesrecht op élke kolom. PostgREST laat
    die kolommen niet stilzwijgend weg — die aanname stond in een test en was
    fout.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
