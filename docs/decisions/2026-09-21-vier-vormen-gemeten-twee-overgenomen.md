# Vier vormen gemeten, twee overgenomen

**Datum:** 21-09-2026 · **Issue:** QS8-572 · **Status:** gebouwd

## Waar dit over gaat

`leestBronMetNaampatroon()` in `scripts/knip-controle.mjs` herkent een controle
die brón leest en daar een patroon uit een **naam** in zoekt. Zo'n controle moet
commentaar wegknippen, anders telt een treffer in een comment als code.

QS8-567 zette die detector neer op één vorm — `new RegExp(` met een template — en
schreef zijn eigen rand in de kop: vier vormen die hij mist. Dit issue is die
rand.

⚠️ **De opdracht was uitdrukkelijk niet "detecteer alles".** Elke verbreding
levert registerrijen op, en een register vol haastige redenen is slechter dan
geen. Elke vorm is daarom los gemeten: hoeveel treffers erbij, en hoeveel daarvan
een échte bronscan.

## 1. De meting

📏 Gemeten op 21-09-2026 over `scripts/` (100 bestanden), met elke vorm los aan
de detector gevoerd. De precondities blijven `readFileSync(`/`readFile(` en de
gedeelde knip.

| vorm | treffers | nieuw | daarvan een échte bronscan | besluit |
| -- | -- | -- | -- | -- |
| `new RegExp(`…${naam}…`)` (de bestaande) | 12 | — | — | — |
| `RegExp(` zónder `new` | 12 | **0** | n.v.t. | **overgenomen** |
| `RegExp('…' + naam)` — concatenatie | 1 | **1** | 1 | **overgenomen** |
| `.includes(`…${…}…`)` | 1 | 0 | **0** | afgewezen |
| `.split(`…${…}…`)` | 0 | 0 | 0 | afgewezen |
| `.startsWith(`…${…}…`)` | 4 | **3** | **1** | afgewezen |
| `RegExp(naam)` — kale variabele | 1 | **1** | **0** | afgewezen |

⚠️ **Het aantal bronlezers waarmee dit issue begon klopt niet meer, en dat is
geen fout maar de reden dat je hem meet.** Het issue noemt **11**; bij het
oppakken waren het er **12** — `catalogus-controle.mjs` kwam erbij via QS8-571.
Na deze ronde zijn het er **13**.

## 2. Wat er overgenomen is, en waarom het goedkoop was

**`RegExp(` zonder `new` — 0 nieuwe treffers.** `RegExp('x')` doet in JavaScript
precies hetzelfde als `new RegExp('x')`. Een detector die het ene wel ziet en het
andere niet, is een detector waar de volgende grendel zich met een weggelaten
sleutelwoord aan onttrekt. Dit is verzekering en geen opruiming — het kostte
vandaag niets en het sluit een gratis ontsnapping.

**Concatenatie — 1 nieuwe treffer.** Dat is `padverwijzing-controle.mjs`, dat
zijn twee regexen uit `EXTENSIES` en `SUBMAPPEN` aan elkaar plakt. Een rij dus —
maar wél de rij die dit issue hoe dan ook wilde, en de reden erachter is scherp:
**hij mag niet knippen.** Een pad ín een comment is daar juist het onderwerp.
QS8-412 ontstond bij `src/shared/ui/Foto.tsx`, dat in zijn eigen kop naar een
toets wees die nooit geschreven is; knippen zou precies die klasse wegnemen.

⚠️ **De concatenatietak eist een stringliteraal vóór de `+`.** Dat is geen
zuinigheid maar het verschil tussen een naald die om een naam heen gebouwd wordt
en een variabele die toevallig een patroon bevat — zie §3.

## 3. Wat er afgewezen is, en dat is de vondst

De drie stringmethode-vormen zien er verwant uit: een naald uit een naam, gezocht
in tekst. 📏 Maar de **ontvanger** verschilt, en die is met een vormdetector niet
te zien:

| treffer | wat het werkelijk is |
| -- | -- |
| `catalogus-controle.mjs` — `!p.includes(`${'i18n'}`)` | een **pad**filter |
| `padverwijzing-controle.mjs` — `pad.startsWith(`${map}/`)` | een **pad**vergelijking |
| `knip-controle.mjs` zelf — `sleutel.startsWith(`${pad}:`)` | een **sleutel**vergelijking |
| `conflictmarkeringen-controle.mjs` — `regel.startsWith(`${vorm} `)` | een échte bronscan |

**Eén op de vijf.** Een controle die vier van de vijf keer iets meldt dat niet aan
de hand is, leer je uitzetten — dat staat al in de kop van `scripts/paden.mjs` en
het geldt hier onverkort. Wat er op stringmethodes ontbreekt is dus geen bredere
regex maar een ánder soort signaal (welke variabele draagt de gelezen bron), en
dat is een eigen issue waard.

⚠️ **De zesde vorm kwam onderweg boven en is dezelfde les.** `RegExp(naam)` met
een kále variabele levert 📏 één nieuwe treffer op: `afstemgetal-controle.mjs`
regel 102, `new RegExp(patroon, 'iu')`, waar `patroon` een héél patroon is en
geen naam die ergens in gevlochten wordt. Precisie 0 op 1 — en het is dezelfde
valse treffer die QS8-567 al eens corrigeerde toen dat bestand een instantie leek
omdat het een template literal gebruikte.

📏 **Eén observatie die geen bevinding is.** `catalogus-controle.mjs` schrijft
zijn padfilter als `!p.includes(`${'i18n'}`)` — een template met een
stringliteraal erin, wat hetzelfde doet als `!p.includes('i18n')`. Hier niet
aangeraakt: het is een andere controle en een ander issue. Het staat er omdat het
verklaart waarom de `includes`-vorm überhaupt een treffer had.

## 4. Het tweede register, en waarom het er een moest zijn

`conflictmarkeringen-controle.mjs` is de énige échte bronscan die de detector
niet ziet. Hij **mag** niet knippen: een conflictmarkering in een uitgecommentarieerd
blok is nog steeds een kapotte merge, en juist die is met het blote oog het
makkelijkst te missen. Hij faalt dus bewust **open**, in de veilige richting.

Een rij in `ZONDER_KNIP` kon niet: dat register hangt aan de detector, en
`verweesdeVrijstellingen()` gooit een rij eruit zodra hij niets meer vrijstelt —
een rij voor een bestand dat niet gedetecteerd wordt, zou meteen als verweesd
gemeld worden. Vandaar `BEOORDEELD`: **gezien, gemeten, en met opzet niet
gedetecteerd.**

⚠️ **Het verschil tussen de twee registers staat in de kop, want het is precies
het soort onderscheid dat een half jaar later verdwijnt.** `ZONDER_KNIP` hangt
aan de detector; `BEOORDEELD` wordt met de hand bijgehouden en bestaat juist
omdát de detector die rijen niet vindt.

`verweesdeBeoordelingen()` houdt hem eerlijk in drie richtingen: het bestand is
weg, het knipt inmiddels, of het wórdt inmiddels gedetecteerd — en dan hoort de
rij in `ZONDER_KNIP` en niet hier. Twee registers met dezelfde rij is de val waar
CLAUDE.md bij twee gelijknamige controles voor waarschuwt.

⚠️⚠️ **Wat die ratel níet vangt, met de meting erbij.** Hij meldt een rij die weg
**mag**; hij kan niet weten dat er een rij **mist**. 📏 Geijkt door het register
leeg te maken: `knip:controle` bleef groen op exitcode 0, en alleen drie toetsen
werden rood — en die vallen om omdat ze een echte sleutel nodig hebben, niet omdat
ze de leegte bewaken. Dat is de prijs van een handgeschreven register. Hij staat
in de kop in plaats van weggeredeneerd te worden.

## 5. De teller die het veld onderschatte

De slotregel zei *"12 bronlezers met een naampatroon"*, en dat las als *"zoveel
bronlezers zijn er"*. 📏 In `scripts/` lezen **61** bestanden bron; **13** bouwen
daar een patroon uit een naam mee. Beide getallen staan er nu, plus het aantal
beoordeelde rijen. Een getal zonder zijn noemer is dezelfde vorm waarmee dit
project eerder een uitrolstand en een testteller verkeerd gelezen heeft.

## 6. De ijking — vijf mutaties, één per grendel

📏 **Ervoor gemeten: `knip:controle` exitcode 0 en nul rode tests.** Na elke
mutatie teruggezet en opnieuw op nul gemeten.

| mutatie | wat er rood werd |
| -- | -- |
| de detector terug naar alleen `new RegExp(` + template | de drie *"ziet …"*-toetsen van de nieuwe vormen, **én** `knip:controle` met *"`padverwijzing-controle.mjs` staat in ZONDER_KNIP maar heeft die vrijstelling niet meer nodig"* |
| `.startsWith` alsnog in het patroon | *"laat een startsWith op een template met rust"*, **én** `verweesdeBeoordelingen` via *"zwijgt over een rij die zijn beoordeling nog nodig heeft"*, **én** `knip:controle` dat `conflictmarkeringen` nu als ongeclassificeerde bronlezer meldt |
| de woordgrens `\b` vóór `RegExp` weg | *"laat een naam die op RegExp eindigt met rust"* — `XRegExp(` zou meetellen |
| `conflictmarkeringen-controle.mjs` laten knippen | `knip:controle`: *"staat in BEOORDEELD maar hoort daar niet meer"* |
| `BEOORDEELD` leegmaken | **`knip:controle` bleef groen** — zie §4 |

⚠️ De tweede mutatie is de nuttigste: hij maakt zowel de toets als het register
rood, en laat zien dat de twee elkaar dekken. De vijfde is de eerlijkste: hij laat
zien waar de grendel ophoudt.
