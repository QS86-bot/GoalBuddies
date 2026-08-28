---
description: Wekelijkse gezondheidscheck van de codebase — draai dit elke vrijdag
---

Voer een wekelijkse audit uit. Schrijf zelf geen code; lever een rapport.

> ⚠️ **Sinds 27-08-2026 draaien negentien van de tweeëntwintig controles in CI, bij
> elke push.** Deze audit hoeft ze niet over te doen; ga er langs als een
> uitkomst je verbaast, en besteed de tijd aan de drie die CI **niet** kan
> draaien omdat ze een productieverbinding of een privésleutel vragen:
> `functies:controle` (stap 20), `register:controle` (stap 13) en
> `vapid:controle` (stap 23b).
>
> Waarom ze eerst alleen hier stonden: acht van die zeventien lezen niets dan de
> repo en hadden nooit een reden om te wachten op een wekelijkse handeling. CI
> toetste met de ijkingstests wél dát ze werkten, en liet ze vervolgens niets
> bewaken.

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

11b. **Dubbele sleutels in JSON** — draai `npm run json:controle`. Hij leest de
    zes JSON-bestanden die git bijhoudt en meldt elke sleutel die twee keer in
    hetzelfde object staat, plus een bestand waarvan de haakjes niet sluiten.

    ⚠️ **Hij is het enige vangnet dat JSON hier heeft, en dat is nagemeten en
    niet aangenomen.** ESLint leest `**/*.ts` en `**/*.tsx` (zie
    `eslint.config.mjs`), `tsc` leest geen JSON, en `JSON.parse` houdt bij een
    dubbele sleutel stilzwijgend de láátste — geen fout, geen waarschuwing,
    geen spoor.

    ⚠️ **En `pwa:controle` (stap 15) erfde die blindheid.** Met een dubbele
    `start_url` in `public/manifest.json` beoordeelt hij de tweede en meldt
    groen; met de hand gebroken op 28-08. Draait deze stap rood, kijk dan of een
    ándere controle over hetzelfde bestand ten onrechte groen staat.

11c. **Injectiepunten die nergens aangesloten zijn** — draai
    `npm run aansluiting:controle`. Hij zoekt synchrone `zet*`/`set*`-exports en
    eist dat elk ervan buiten zijn eigen bestand én buiten `tests/` wordt
    aangeroepen.

    ⚠️ **Dit is de klasse waar niets van rood wordt.** De vier gevallen van
    26-08 — `profiles.locale`, `verwijderPushToken()`, `setErrorSink()` en de
    deploy vanuit een werkmap — hadden allemaal groene tests. Wat ontbrak was
    een aanroep.

    ⚠️ **Waarom smal en niet algemeen.** De algemene vorm ("elke export uit een
    module-barrel wordt buiten die module gebruikt") meldt er **174 van de
    493** — vrijwel allemaal types en schema's. Gemeten op 28-08; een controle
    die 174 dingen meldt bewaakt niets.

    ⚠️ De synchroon-eis is nodig: zonder haar meldt hij dertien namen waarvan er
    tien gewone schrijfacties zijn (`zetStreefdatum`, `zetDagzet`, …).

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

17b. **Lopen de gedeelde kopieën gelijk?** — draai `npm run edge:sync:controle`.
    Die rekent uit wat `edge:sync` zóu wegschrijven en vergelijkt dat met wat er
    in `supabase/functions/_shared/` staat. Dezelfde generatorcode, dus de
    controle kan per definitie niet uit de pas lopen met de sync.

    ⚠️ **Dit is de andere helft van 17a.** Die vergelijkt de gedéployde bundel
    met de repo; deze vergelijkt de gegenereerde kopie met zijn origineel in
    `src/`. Een kopie die achterloopt is groen bij 17a en rood bij deze — en dat
    is precies het gat waardoor de app en de jobs met verschillende regels gaan
    werken.

    ⚠️ Hij heet niet `edge:controle`; die naam is van de tijdmodule-vergelijking
    hierboven. Het oorspronkelijke voorstel gebruikte hem wél, en dat zou stap 17
    stilzwijgend hebben vervangen.

17a. **Draait er wat er in de repo staat?** — draai `npm run edge:gedeployd`.
    Die haalt de gedeployde bundel van elke Edge Function op en legt de
    modulelijst naast wat de repo er transitief in zou stoppen. Twee soorten
    rood: een module die de deploy mist, en een module die de repo niet kent.

    ⚠️ **Die tweede is waarom deze controle bestaat.** Op 26-08-2026 draaiden
    alle drie de functies vanuit een lokale werkmap, en de gedeployde
    `notificaties` importeerde `_shared/sentry/index.ts` — een module die op
    `main` niet bestond en op geen enkele remote branch stond. Er draaide dus
    productiecode die niemand kon uitchecken, en die bovendien de schoonmaaklaag
    miste waar QS8-24 criterium 3 om draait: `fout.message` en `fout.stack`
    gingen ongeschoond de deur uit. Gevonden door de bundel met de hand op te
    vragen; niets werd rood.

    ⚠️ **Vraagt `SUPABASE_ACCESS_TOKEN` in `.env`** — de personal access token
    van de Management API, niet de service-role-key. Zelfde als `auth:urls`.
    Zonder token stopt hij met uitleg en meldt hij niets; noteer dat dan in de
    audit in plaats van het over te slaan.

    ⚠️ **Wat hij níét ziet: dezelfde bestandsnamen met andere inhoud.** De
    bundel is een ESZip en de inhoud is er niet betrouwbaar uit te lezen zonder
    een parser die zelf onder test zou moeten staan. Deze controle vindt een
    andere bóóm, niet een andere regel. Wil je dat laatste ook, dan is een
    herkomststempel in de deploy de volgende stap.

    ⚠️ Kan hij geen enkele bundel lezen, dan zegt hij "formaat onbekend" en niet
    "alles wijkt af". Dat onderscheid is met opzet: een controle die bij het
    eerste onbekende formaat alles rood maakt, staat binnen een maand uit.

    ⚠️ **Lees de regel over de werkboom vóór je de uitkomst gelooft.** Hij
    vergelijkt de deploy met de bestanden op schijf, niet met een commit. Is de
    werkboom niet schoon, dan zegt hij dat, en betekent groen alleen "gelijk aan
    wat er bij jou op schijf staat". Bij de eerste echte run op 26-08 stond er
    groen bij twee functies die code draaiden die op `main` niet bestond — de
    werkboom was toen nog niet gecommit.

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
    — daar is geen productieverbinding.

    ```bash
    npm run rls:stack        # de tweede database, zonder die valt er niets te vergelijken
    npm run functies:controle
    ```

    ⚠️ **Sinds 27-08-2026 een commando in plaats van twee met de hand ingetypte
    queries.** Hij meldt een logicaverschil als fout en een commentaarverschil
    als melding — die tweede stond er vandaag 36 keer, en als dat de deploy zou
    tegenhouden leer je de controle binnen een week te negeren.

    ⚠️ **De ruwe vergelijking gaat over `prosrc` en niet over
    `pg_get_functiondef()`.** De lokale stack draait Postgres 16 en productie 17,
    en die formatteren een definitie anders — de eerste versie meldde daardoor 17
    van de 23 letterbuckets als drift. De body wordt letterlijk opgeslagen en is
    wél versie-onafhankelijk.

    De query eronder staat er nog voor het geval je met de hand wilt kijken:

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

23. **De uitzondering op de pin** — draai `npm run pin:controle` tegen de lokale
    stack. `guard_group_update()` pint vijf kolommen van `groups` vast en stapt
    opzij zodra `current_user` geen clientrol is. Een `SECURITY DEFINER`-functie
    draait als zijn eigenaar, dus die komt daar langs. Vijf functies gebruiken dat
    met opzet; deze controle houdt de lijst opgesomd, met per functie de reden.

    ⚠️ **Er gaat niets kapot als er een zesde bij komt**, en dat is het hele punt.
    Geen test wordt rood, geen policy weigert iets — de nieuwe functie erft
    gewoon het recht om de uitnodigingscode, de oprichter, de status, de
    slaapstand en de zichtbaarheid te wijzigen.

23a. **Wat gaat er in een open groep open?** — draai
    `npm run zichtbaarheid:controle` tegen de lokale stack. Vier oppervlakken
    variëren op `groups.zichtbaarheid`, en zes plekken noemen die kolom zonder er
    een te zijn (de twee hulpfuncties, de setter, de pin, het aanmaken en de
    uitnodigingspreview). Alle tien staan met hun reden in het register.

    ⚠️ **De zin die de gebruiker leest sómt die vier op.** Komt er een vijfde
    bij, dan wordt deze controle rood — en dán is de vraag of
    `zichtbaarheid.open_uitleg` en `bevestiging.groep_openzetten.uitleg` nog
    kloppen, niet nadat iemand toestemming heeft gegeven voor iets anders dan hij
    dacht.

23b. **Horen de drie VAPID-waarden bij elkaar?** — draai `npm run vapid:controle`
    op de machine waar `.env` staat. De publieke sleutel zit in de webbundel, de
    privésleutel in de omgeving van de Edge Function en het subject in beide;
    gekruist ziet elk van de drie er perfect uit.

    ⚠️ **Zonder deze controle merkt WebCrypto het pas bij het ondertekenen**, in
    de meldingenjob die eens per uur draait, en dan komt het terug als een 403
    van de pushdienst en niet als een rode test.

    ⚠️ Hij hoort **niet** in CI: `VAPID_PRIVATE_KEY` is een privésleutel. Zonder
    de drie waarden slaat hij zichtbaar over; met `--streng` valt hij om.

24. **De statuscache** — draai tegen productie:

    ```sql
    select * from weekdoelstatus_afwijkingen();
    ```

    `weekly_goals.status` is een bewuste denormalisatie van `completions` plus
    `completion_approvals` (migratie 0096). Deze lijst hoort leeg te zijn. Staat
    er iets in, dan toont een scherm iets anders dan er gebeurd is — en dat
    weigert geen policy en maakt geen test rood. `select herstel_weekdoelstatus();`
    zet ze terug en geeft het aantal.

    ⚠️ **Alleen `todo`, `pending` en `approved` worden beoordeeld.** De andere
    vier statussen komen van de rollover, een weekpas, doorschuiven of de
    gebruiker zelf en zijn nergens uit te herleiden. Meld je die ook, dan is
    elke gemiste week drift.

    ⚠️ **Deze stap staat hier en niet in de RLS-suite**, en dat is met opzet: de
    functie leest de héle database, en meerdere testsuites zetten
    `weekly_goals.status` rechtstreeks met de admin-client zonder voltooiing. Een
    globale assertie in een test hangt daarmee af van de volgorde waarin vitest
    draait. `tests/rls/statuscache.test.ts` toetst dus zijn eigen weekdoel; de
    globale nul is een auditvraag.

    ⚠️ `herstel_weekdoelstatus()` boekt géén punten. Wie na een herstel punten
    mist, heeft een tweede probleem dat een correctie-record verdient
    (domeinregel 6) en geen stille bijboeking.

25. **Indexdekking op foreign keys** — `RLS_DOEL=lokaal npx vitest run
    tests/rls/indexdekking.test.ts`, of tegen productie:

    ```sql
    select * from indexdekking_bewaking();
    ```

    Hoort leeg te zijn — onwrikbare regel 11. Postgres indexeert de kindkant van
    een foreign key nooit vanzelf, en een ontbrekende index breekt niets: geen
    fout, geen trage query zolang de tabel leeg is. Op 25-08 stonden er vijftien
    open terwijl ENGINEER-REVIEW er één noemde (migratie 0097).

    ⚠️ Toetst op de vóórste kolommen van een index. Een kolom die wél in een
    samengestelde index zit maar niet vooraan, telt niet mee — een btree kan daar
    niets mee. Drie van die vijftien zagen er zo gedekt uit.

    ⚠️ De duurste plek is een cascade, geen query: dertien tabellen hangen met
    `on delete cascade` aan `profiles`.

26. **De twee sloten van domeinregel 3** — draai tegen productie:

    ```sql
    select * from domeinregel3_bewaking();
    ```

    Hoort leeg te zijn. Peer-goedkeuring moet in RLS **én** met een
    database-constraint dicht zitten (domeinregel 3), en de RLS-helft is vanuit
    een client niet los te toetsen: `before insert`-triggers draaien vóór de
    `with check`, dus de trigger en de CHECK gooien altijd als eerste.

    ⚠️ Op 27-08 gemeten: met die clausule uit de policy bleven alle 428
    RLS-tests groen. Het gedrag klopte nog — de constraint vangt de gebruiker —
    maar de dubbele beveiliging was een enkele geworden. Zie migratie 0098.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
