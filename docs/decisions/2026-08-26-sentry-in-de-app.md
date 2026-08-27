# Sentry in de app — dezelfde envelope, geen SDK

*26-08-2026 — QS8-24, criterium 1*

## Wat er ontbrak

`reportError()` bestond sinds 24-08, **34 bestanden riepen hem aan**, en de
schoonmaaklaag eronder was uitgebreid getoetst. Alleen: `setErrorSink()` werd
door niets in de productiecode aangeroepen — alleen in tests. Elke gemelde fout
eindigde in `console.error`, op een apparaat dat niemand leest.

⚠️ Dat is de variant uit CLAUDE.md regel 18, vraag 5: **elk schakeltje af en de
keten nergens aangesloten.** Er was niets kapot, dus geen enkele test kon rood
worden. Vandaag is dat de vierde keer in dit project — na `profiles.locale`, na
`verwijderPushToken()`, en na de deploy die vanuit een werkmap kwam.

## De beslissingen

### 1. Geen `@sentry/react-native`

CLAUDE.md rekent een dependency toevoegen sinds 22-08 tot een afweging die je
zelf maakt maar verantwoordt. Dit is die verantwoording.

**Wat de SDK zou geven en dit niet:**

| | |
|---|---|
| Native crashes | het enige dat je hier écht niet zelf kunt bouwen |
| Breadcrumbs | een spoor van wat de gebruiker deed vóór de fout |
| Automatische instrumentatie | navigatie, netwerkverzoeken, render-fouten |
| Release- en source-map-integratie | via hun eigen build-plugin |

**Waarom het toch niet meegaat.** De app draait vandaag alleen op het web. Er is
geen `eas.json` en geen EAS-project, en een native build vraagt een
Apple-developeraccount — dat is grens 1 uit CLAUDE.md, en het is niet aan mij.
De native helft van die SDK zou dus in de repo staan zonder ooit uitgevoerd te
zijn.

En de helft die vandaag wél te gebruiken is, brengt een **tweede
envelope-bouwer** mee naast de bouwer die op 26-08 met een echte ingest gemeten
is (HTTP 200, event `4dff8230…`). Een tweede implementatie van iets dat al werkt
is precies wat dit project die dag vier keer gekost heeft.

⚠️ **Dit is omkeerbaar en dat is de kern van de afweging.** De SDK inruilen is
één `setErrorSink()`; geen scherm en geen aanroepplek verandert mee. Daar is
`ErrorSink` op ontworpen. Zodra er een EAS-project is en native crashes echt
gemeld kunnen worden, is dat het moment om deze keuze te herzien.

### 2. Eén envelope-bouwer voor de app én de jobs

`maakVerzending()` in `edge-rapport.ts` bouwde de envelope al, en die vorm is
gemeten. De app gebruikt dezelfde functie.

Daarvoor moesten `runtime` en `server_name` van vaste waarden naar parameters.
Ze zijn **verplicht en zonder standaardwaarde**: een standaard zou betekenen dat
een fout uit de browser zich als Edge Function voordoet, en dat merk je pas als
je in Sentry naar de verkeerde logs zit te kijken.

| | `runtime` | `server_name` |
|---|---|---|
| Edge Functions | `deno` | `edge` |
| De app | `web` / `ios` / `android` | `app` |

### 3. De sink schoont niet

`reportError()` doet dat al; `ErrorEvent` draagt uitsluitend geschoonde velden.
Nog een keer door `scrubMessage()` halen zou een tweede plek zijn die uit elkaar
kan lopen met de eerste, en het zou `[weggelaten]` opnieuw kunnen verminken.

⚠️ **Gevolg voor de tests.** Een test die de sink rechtstreeks voedt, bewijst
daarom niets over wat er verstuurd wordt. De lektest gaat met opzet door
`reportError()` heen. Dat is exact het onderscheid dat op 24-08 gemist werd:
`scrubMessage()` stond groen terwijl het geheel lekte.

### 4. Geen DSN betekent `undefined`, geen stille sink

Zonder bruikbare DSN geeft `maakSentrySink()` `undefined` terug en valt
`reportError()` terug op `console.error` — in ontwikkeling precies wat je wilt
zien. Een sink die niets doet zou de melding laten verdwijnen zónder dat er iets
aankomt: het slechtste van twee werelden.

Staat er wél een DSN die niet deugt, dan komt er één regel in het log. Stilletjes
niet werken is erger dan niet werken.

### 5. Onafgevangen fouten, alleen op web

`reportError()` vangt wat de code zélf afvangt. Wat er niet in zit is juist wat
je het liefst wilt weten: de fout zonder `catch`, de `Promise` zonder `.catch()`.
`koppelGlobaleFouten()` haakt op `error` en `unhandledrejection`.

⚠️ **Op native niet, en dat is een grens en geen omissie.** Daar zou het via
`ErrorUtils.setGlobalHandler()` gaan. Die code kan hier niet draaien en is niet
te toetsen — er is geen native build. Ongetoetste code schrijven die pas over
maanden voor het eerst uitgevoerd wordt, is dezelfde fout als het proefscript dat
nooit gedraaid had, en die kostte 26-08 twee ronden. Wat op native wél werkt is
elke expliciete `reportError()`: dezelfde 34 plekken.

### 6. `release` uit `app.json`, of weggelaten

Sentry koppelt source maps aan een release. De versie komt uit
`Constants.expoConfig?.version`; ontbreekt hij, dan gaat het veld niet mee in
plaats van dat er iets van gemaakt wordt. Een verzonnen versie koppelt source
maps aan de verkeerde release, en dat merk je pas als je een stack probeert te
lezen.

### 7. Source maps — criterium 2

`npm run deploy` bouwt sinds 26-08 mét externe source maps, stuurt ze naar Sentry
en **haalt ze daarna zonder uitzondering uit de bundel**.

⚠️ **Die laatste stap is de veiligheidskant van deze feature en is niet
   overslaanbaar.** Een `.map` naast een publieke bundel geeft iedereen je
   volledige broncode, inclusief commentaar. Hij hoort naar Sentry en nooit naar
   de webserver. Daarom controleert het script achteraf dat er geen enkele
   achterblijft, en breekt het de deploy af als dat wel zo is: liever niet live
   dan met je bron erbij.

**Wél `@sentry/cli`, en dat spreekt beslissing 1 niet tegen.** Die ging over de
*runtime*-SDK in de bundel die naar gebruikers gaat. Dit is bouwgereedschap: er
komt geen byte van bij een gebruiker terecht. En wat we hier zouden hand-rollen
is niet een transport — dat is gemeten — maar de **koppelconventie** tussen
bundel en map (debug-id's). Precies het soort logica dat stil verkeerd kan zijn
en die ik hier niet kan verifiëren.

⚠️ **Vastgepind via `npx` en bewust géén devDependency.** Het gereedschap wordt
   door één script gebruikt, op één machine, af en toe. In `package.json` zetten
   zou elke `npm ci` — ook elke CI-run die niets deployt — een platformbinary
   laten downloaden.

⚠️ **`inject` vóór `upload`.** `inject` schrijft debug-id's in de bundel én in de
   map; daarop koppelt Sentry ze. Upload je zonder inject, dan komt alles aan en
   matcht er niets.

**Zonder token slaat de stap zichzelf over**, met in het log wélke van de drie
variabelen ontbreekt. Een deploy laten falen omdat de foutrapportage niet
compleet is, zou de app onbereikbaar maken om een leesbaarheidsprobleem. De maps
worden dan gewoon verwijderd; de bundel gaat schoon de deur uit.

⚠️ **De release-naam staat op twee plekken en dat is een naad.** De app stuurt
   hem mee bij elke gebeurtenis, het deployscript hangt de maps eraan. Ze kunnen
   de functie niet delen — de ene kant is TypeScript, de andere een `.mjs`. Wat
   ze wél delen is `tests/scripts/release-naam.test.ts`, die beide aanroept en de
   uitkomst vergelijkt, inclusief de versie die vandaag écht in `app.json` staat.
   Lopen ze uiteen, dan matcht er niets terwijl alles lijkt te werken.

## Wat dit niet doet
- **Native crashes.** Zie beslissing 1.
- **Breadcrumbs en automatische instrumentatie.** Zie beslissing 1.
