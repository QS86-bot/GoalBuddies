# De melding die een plausibele oorzaak noemde — QS8-562

**19-09-2026.** `scripts/schema-opbouwen.sh` meldde `✗ goalbuddies_opbouw kon
niet weg.` — en de database bestond niet eens.

```bash
if ! "${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1; then
  echo "✗ ${DB} kon niet weg." >&2
```

De `2>&1` gooide de echte foutmelding weg. Wat overbleef was één diagnose, en er
stond een comment vlak boven die uitlegde waaróm die diagnose bestond: op 24-08
hield PostgREST elf verbindingen open en daardoor mislukte de drop. Dus ging de
lezer hangende verbindingen zoeken. Er waren er nul.

## 📏 Wat het werkelijk was

Peer-authenticatie. `PSQL` krijgt alleen een `-h` als `PGHOST` gezet is; zonder
die variabele valt psql terug op de unix-socket, waar `peer` geldt — de sessie
draait als `root` en vraagt om rol `postgres`.

Nagemeten op deze werkplek, dezelfde server, twee wegen ernaartoe:

| aanroep | wat psql zegt |
|---|---|
| zonder `PGHOST` (socket) | `FATAL:  Peer authentication failed for user "postgres"` |
| met `PGHOST=127.0.0.1` (TCP) | `fe_sendauth: no password supplied` |

📏 De sluitende meting was dat de melding **ook** kwam toen de database er
helemaal niet was. Een `drop database if exists` op iets wat niet bestaat, kan
per definitie niet op een verbinding stuklopen. Toen pas was duidelijk dat de
diagnose niet over de werkelijkheid ging. Dat kostte drie rondes.

## De klasse

**Een melding die een plausibele oorzaak noemt in plaats van de gemeten, is
duurder dan geen melding** — ze stuurt de lezer actief de verkeerde kant op, en
de volgende stap is dan de uitslag accepteren.

Dat is hier niet nieuw. `psql.mjs` draagt dezelfde les uit QS8-268 (*"zes
scripts zeiden jarenlang start de lokale stack terwijl die draaide"*), en
QS8-435 ging over de vaste zin *"dit beeld is zo oud als je laatste fetch"* die
er ook stond bij een ref van tien seconden oud. De vorm herhaalt zich omdat een
vaste zin goedkoop is en een gemeten zin niet.

## Wat er staat

`dropOordeel()` en `dropmelding()` in `scripts/psql.mjs`, naast
`verbindingsoordeel()` en om dezelfde reden op dezelfde plek.

⚠️ **Het is een ándere vraag dan `verbindingsoordeel()`, en dat verschil draagt
de reparatie.** Die functie beantwoordt *"kwamen we er überhaupt in"*. Een drop
die faalt terwijl de verbinding prima stond, is daar per definitie `onbekend` —
en juist dát waren de twee gevallen die het script niet uit elkaar hield.

| oordeel | wat psql letterlijk zei (📏 alle vijf uitgelokt, PostgreSQL 16) | advies |
|---|---|---|
| `bezet` | `database "…" is being accessed by other users` | `lokale-stack.sh --stop` |
| `geen-eigenaar` | `must be owner of database …` | draai als de rol die hem aanmaakte |
| `geweigerd` | `Peer authentication failed` / `fe_sendauth: no password supplied` | `PGHOST`, `PGUSER`, `PGPASSWORD` |
| `geen-server` | `Connection refused` / `No such file or directory` | start de stack; noemt de **gebruikte** poort |
| `onbekend` | — | geen gok, alleen wat psql zei |

**Elke tak eindigt met de letterlijke psql-uitvoer.** Dat is acceptatiecriterium
1: een duiding die de lezer niet naast de bron kan leggen, is dezelfde gok in
een ander jasje.

## ⚠️ Drie keuzes die niet vanzelf spreken

**1. De duiding staat in JS en niet in bash.** De patronen in
`verbindingsoordeel()` zijn met de hand geijkt op wat psql écht zegt; ze in bash
overtypen geeft twee kopieën die uit elkaar lopen zodra iemand er één aanpast.
Zelfde reden die `scripts/ci-controle-draai.mjs` opschrijft om `beoordeel()` uit
de poort te hergebruiken. `scripts/psql-drop-oordeel.mjs` is de brug: stdin in,
het oordeel op stdout, de melding op stderr.

⚠️ Mislukt die brug zelf, dan drukt het script de letterlijke psql-fout alsnog
af. Zonder die tak zou een kapotte node de melding **stiller** maken dan hij
vóór dit issue was.

**2. Het script forceert `-h` níet.** Het issue vroeg dat te overwegen. Wie als
OS-gebruiker `postgres` draait, wérkt via de socket, en die zou dan opeens een
wachtwoord moeten hebben. **De verbinding ongevraagd omleggen repareert het ene
geval door het andere te breken.** De melding benoemt de socket nu wel, en
alleen als er ook echt geen `PGHOST` was.

**3. `-w` erbij.** 📏 Zonder die vlag drukt `psql -h 127.0.0.1 -U postgres` hier
`Password for user postgres:` af. Deze opbouw draait onder `idempotent:controle`
en dus in de poort en in CI, en daar is hangen erger dan falen: de uitslag is
dan "nog bezig" en niet "fout".

## ⚠️⚠️ Nergens het woord `OVERGESLAGEN`

Dat is een grendel en geen stijlkeuze. `beoordeel()` in `scripts/poort.mjs`
classificeert op **tekst**: één regel met `OVERGESLAGEN` erin maakt van een
mislukte schemaopbouw een *ongemeten* controle in plaats van een rode. Er is
hier ook geen derde uitkomst — een opbouw is gelukt of niet.

## ⚠️⚠️ Dezelfde fout stond er één laag hoger, en dat was niet de opdracht

`schema-opbouwen.sh` draait onder `npm run idempotent:controle`, en dat is de
weg waarlangs bijna iedereen hem ziet. Die controle gooide de uitvoer van de
opbouw **helemaal** weg en drukte er één vast advies overheen.

📏 Gemeten ná de reparatie hierboven, met een rol die geen eigenaar van de
database is:

```
✗ idempotent-controle: de opbouw viel om zonder te zeggen waar.

Een migratie hoort een tweede run te overleven tegen de toestand waarvoor hij
geschreven is. Zet de opruiming van álle objecten bovenaan, in omgekeerde
afhankelijkheidsvolgorde: …
```

De opbouw zei precies waar — `ERROR:  must be owner of database
goalbuddies_dubbel` — en deze controle zei dat hij dat niet zei, met een advies
over constraints die er niets mee te maken hebben. **Een reparatie die bij de
bron stopt terwijl de lezer twee lagen hoger staat, repareert niets voor die
lezer.** `roodregels()` geeft de uitvoer van de opbouw nu altijd door, en het
opruimadvies alleen als er ook echt een migratie omviel.

⚠️ Alleen de staart, twintig regels. Een geslaagde opbouw schrijft honderden
`NOTICE`-regels; de fout staat altijd aan het eind, want de opbouw stopt erop.

## Geijkt — elf mutaties, en drie ervan waren er eerst geen

Acceptatiecriterium 3 vroeg om twee gevallen met de hand. Het zijn er vijf
geworden, plus een mutatie per grendel.

### Met de hand, op een draaiende Postgres 16

| geval | hoe uitgelokt | wat eruit kwam |
|---|---|---|
| `geweigerd` | zonder `PGHOST`, dus peer op de socket | *de server draait, maar deze gebruiker mag er niet in* + de socketregel |
| `bezet` | acht `psql`-lussen die blijven terugkomen, zoals een pool | *er zit nog een sessie op* + `nog verbonden: 8 sessie(s), o.a. psql` |
| `geen-server` | `PGPORT=5499` | *er luistert geen Postgres op poort `5499`* |
| `geen-eigenaar` | een rol met `connect` maar zonder eigendom | *deze rol is geen eigenaar van die database* |
| de gelukkige weg | gewoon draaien | `✓ 297 migraties afgespeeld op een lege database (Postgres 16)` |

### Per grendel één mutatie

| mutatie | rood | welke toets |
|---|---|---|
| stderr weer weggooien (`>/dev/null 2>&1`) | 2 | de naadtoetsen |
| het `bezet`-patroon weg | 4 | |
| het `geen-eigenaar`-patroon weg | 1 | |
| `zonderRuis` uit | **0 → 1** ⚠️ | *laat een NOTICE het oordeel niet kapen* |
| de socket/peer-regel weg | 1 | |
| de poort weer de standaard | 1 | |
| `OVERGESLAGEN` in een melding | 1 | |
| de sessietelling onvoorwaardelijk | **0 → 1** ⚠️ | *staat binnen een tak die op bezet toetst* |
| de duider bestaat niet | 1 | de terugvaltak |
| het opruimadvies onvoorwaardelijk | **0 → 1** ⚠️ | *houdt dat advies weg als er geen migratie omviel* |
| de uitvoer van de opbouw weggooien | **0 → 1** ⚠️ | *zet de uitvoer er altijd onder* |

### ⚠️⚠️ De vier nullen, want die zijn het leerzaamst

**Twee ervan voerden hun geval langs een éérdere grendel.** Mijn NOTICE-toets
bood `NOTICE + bezet` aan, en het `bezet`-patroon staat vóór
`verbindingsoordeel()` — dus de knip kwam er niet aan te pas en de toets
bewaakte die eerdere grendel. 📏 Met de knip eruit bleven alle 22 toetsen groen.
Het geval dat `zonderRuis` wél raakt is `NOTICE + een fout die verder niemand
herkent`: mét knip `onbekend`, zonder knip `geen-database`.

**Dit is de waarschuwing uit CLAUDE.md woordelijk:** *een ijking die zijn geval
door een pad voert dat een éérdere grendel al afvangt, bewaakt niets van wat hij
belooft.*

De tweede nul is de spiegel ervan. Mijn naadtoets keek of de sessietelling
wegblijft — maar in die toets staat er geen verbinding, dus de tellende `psql`
faalt óók en is met `2>/dev/null || true` stil. **Een geval dat langs een andere
weg al stil is, ijkt niets.** Wat die grendel doet is met de hand gemeten, op het
geval waarin de verbinding wél staat:

```
met grendel     ->  0 regels met "nog verbonden:"
zonder grendel  ->  nog verbonden: 0 sessie(s), o.a. (onbekend)
```

Die tweede regel is precies wat dit issue bestrijdt: een tweede, plausibele
oorzaak onder een melding die zojuist zei dat de verbinding er wél was.

**De andere twee nullen zaten in `hoofd()`** — een functie die een database en
een subproces vraagt, en dus niet te voeden is. `roodregels()` is eruit getild
en staat nu los aangeboden, zelfde vorm als `regels()` in
`ci-controle-draai.mjs`. Daarna één rood per mutatie.

## Wat dit niet oplost

⚠️ **De bash-bomen hebben geen register.** `tests/scripts/psql-verbinding.test.ts`
bewaakt dat `scripts/*.mjs` en `tests/**/*.ts` hun psql-aanroep niet zelf
bouwen; `.sh` valt buiten allebei, en dat zijn precies de twee bestanden die het
wél doen (`schema-opbouwen.sh` en `lokale-stack.sh`). Dat is vandaag geen
toevalligheid maar een structureel verschil — bash kan `psqlArgumenten()` niet
importeren — dus een derde register zou een uitzondering met twee rijen zijn en
één bewaakte rij. 📏 Beide bestanden zijn met de hand nagelezen: ze noemen
allebei `-U`, `-p` en `-h`-indien-`PGHOST`, gelijk aan `psqlArgumenten()`.
Staat in `docs/ENGINEER-REVIEW.md`.

⚠️ En de duiding geldt alleen voor de **drop**. De `create database` en de
migratielus eronder tonen hun stderr wel (die dragen geen `2>&1`), maar zonder
duiding. Dat is vandaag genoeg omdat de drop de eerste is die rapporteert: valt
de authenticatie om, dan valt hij daar om.
