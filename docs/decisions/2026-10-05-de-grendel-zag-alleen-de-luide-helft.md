# De grendel zag alleen de luide helft

*05-10-2026 — QS8-638. Volgt op QS8-599 (de toets) en QS8-608 (de tien scripts).*

## 1. Wat er aan de hand was

`tests/scripts/hoofdwacht.test.ts` bewaakt één belofte: **een script in
`scripts/` importeren doet niets.** Hij deed dat door alle scripts in één
kindproces te importeren en te eisen dat `stdout` en `stderr` leeg blijven.

Die vorm vindt een script dat bij import **print of werpt**. Hij vindt niet een
script dat bij import stil afsluit of stil schrijft — en dat zijn precies de
twee dingen die de tien scripts van QS8-608 déden.

📏 Gemeten op 05-10-2026, stand ervóór **3/3 groen**, elke mutatie teruggezet en
met `diff -q` bevestigd:

| mutatie | uitslag |
| -- | -- |
| `process.exit(0);` bovenaan `scripts/auth-urls.mjs` | **3/3 groen** |
| `process.exit(1);` bovenaan `scripts/auth-urls.mjs` | **3/3 groen** |
| een stille `writeFileSync(…)` bovenaan `scripts/psql.mjs` | **3/3 groen**, en het bestand stond er |
| `console.log('hallo');` bovenaan `scripts/psql.mjs` | rood — de énige vorm die hij zag |

## 2. Twee oorzaken die elkaar versterkten

**De exitstatus viel weg in de `catch`.** `execFileSync` wérpt bij een exitcode
≠ 0, en de `catch` eromheen las `stdout` en `stderr` uit het foutobject. Een
exit zónder tekst is daarmee ononderscheidbaar van een schone run: beide geven
twee lege stromen.

**Eén proces maakt een stille exit besmettelijk.** De lus importeert alles in
hetzelfde kind, dus `process.exit()` kapt de lus af. Alles wat alfabetisch ná de
schuldige komt werd niet eens geïmporteerd — en de toets zei daar niets over,
want hij keek alleen naar uitvoer.

⚠️ **Dat de tien scripts van QS8-608 wél gevonden zouden zijn, was geluk.** Ze
printten toevallig óók. Een grendel die de helft van zijn gevallen mist maar
toevallig de gevallen vangt die zich aandienen, leest als een werkende grendel —
en dat is de klasse fout waar regel 18 vraag 3 voor bestaat: *kan deze test
groen blijven terwijl de belofte breekt?* Hier kon dat, driemaal.

## 3. De keuze: één proces met een bereikt-lijst, niet 105 processen

Het acceptatiecriterium liet beide vormen toe. Gekozen is de goedkope.

| | 105 eigen processen | één proces + bereikt-lijst |
| -- | -- | -- |
| prijs | ~105 × node-start | 📏 **1,3 s**, gelijk aan de oude vorm |
| isolatie | volledig | geen — een script kan de volgende beïnvloeden |
| wijst de schuldige aan | ja, per proces | **ja** — het eerste ontbrekende script |

De isolatie die je opgeeft, geeft de oude vorm ook al niet, en de belofte gaat
niet over isolatie maar over inertie. Wat de bereikt-lijst erbij geeft is dat de
toets de **naam** van de schuldige noemt in plaats van alleen *er is er één*.

⚠️ **Het meetprincipe is dat `finally` níet draait bij `process.exit()`.** De
lus schrijft elke naam weg in een `finally` ná de import; een exit halverwege
laat dus exact het voorvoegsel staan, en het eerste ontbrekende script is de
schuldige. Dat is geen beperking die we omzeilen, het is waar de meting op
leunt.

## 4. De schrijfactie: twee kanten, want er zijn twee soorten pad

Een stille schrijfactie wordt langs twee wegen gevangen, en dat is geen
dubbelop:

- **een absoluut pad** landt in de repo → `git status --porcelain` vóór en ná;
- **een relatief pad** landt in de `cwd` van het kind → dat is een verse
  wegwerpmap, en die hoort leeg te blijven.

⚠️ De boomvergelijking toetst *veránderd* en niet *schoon*. Tijdens een
ontwikkelronde staan er altijd wijzigingen in de boom; een toets die eist dat
die er niet zijn, is een toets die je uitzet.

## 5. Wat grendel 3 niet dekt — opgeschreven in plaats van overschreeuwd

`git status --porcelain` ziet geen pad dat `.gitignore` uitsluit. Een script dat
bij import in `dist/` of `node_modules/` schrijft, komt er dus niet uit. De twee
historische gevallen (`sync-edge-shared.mjs` kopieerde 19 bestanden,
`maak-iconen.mjs` schreef zes PNG's) schreven allebei in de bewaakte boom, dus
voor de gevallen die dit project gekost hebben is de dekking volledig — maar de
grens is echt en staat daarom in de kop van de toets én hier.

⚠️ Grendel 3 leunt bovendien op de regel van QS8-442 dat een testbestand nooit
buiten zijn eigen fixture schrijft. Zonder die regel zou een gelijktijdig
draaiende suite deze toets rood kunnen maken op andermans schrijfactie — en een
rood dat niet van jou is, is de valkuil van QS8-262.

## 6. De ijking

Stand ervóór: **5 groen, 0 rood**. Eén mutatie per grendel, en per mutatie is
genoteerd wélke toets omvalt — niet dát er een omvalt.

| mutatie | welke toets rood werd | andere toetsen |
| -- | -- | -- |
| `process.exit(0);` in `auth-urls.mjs` | *elk script wordt bereikt, en het kind sluit met 0 af* | 4 groen |
| `process.exit(1);` in `auth-urls.mjs` | idem, en de melding noemt `auth-urls.mjs` | 4 groen |
| `writeFileSync('/home/user/GoalBuddies/bewijs-c.txt', …)` in `psql.mjs` | *geen enkel script schrijft bij import* — de boomkant | 4 groen |
| `writeFileSync('relatief.txt', …)` in `psql.mjs` | idem — de wegwerpmapkant, melding noemt `relatief.txt` | 4 groen |
| `console.log('hallo');` in `psql.mjs` | *geen enkel script werpt of print bij import* | 4 groen |

Elke mutatie is teruggezet en met `diff -q` tegen een kopie bevestigd; na afloop
stond er in `git status` niets anders dan de bedoelde wijziging.

## 7. Wat dit niet is

Geen wijziging aan een script in `scripts/`. De tien van QS8-608 zijn gemeten
inert en blijven dat; wat hier veranderde is de wacht die dat moet blijven
vaststellen.
