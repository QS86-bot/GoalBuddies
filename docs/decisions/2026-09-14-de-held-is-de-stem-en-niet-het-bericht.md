# De held is de stem en niet het bericht

**Datum:** 14-09-2026
**Issue:** QS8-475 (epic QS8-468)
**Raakt:** `reminder_tone` (QS8-92), de gratis poort van QS8-341,
correctheidsregel 7, besluit 3 van QS8-468

---

## 1. `reminder_tone` blijft bestaan als terugval

Het issue schreef *"de held ís de toon"* en *"vervang die laag, zet er geen
tweede naast"*. Maar `reminder_tone` is geen interne laag: het is een knop in het
profielscherm, met de hint *"Streng is directer, nooit verwijtend. De app rekent
je nergens op af."*

**Besluit van Quinten, 14-09-2026: de held wint, de toon blijft de terugval.**
Heeft de gebruiker een held — uit de quiz of uit een contextuele trigger — dan
spreekt die. Heeft hij er geen, dan blijft de bestaande `gentle`/`firm`-tekst
staan.

De grond is grens 1 van de beslisbevoegdheid: een instelling die iemand bewust
gezet heeft, is een belofte aan hem. Hem weghalen is een migratie plus een
schermwijziging, en dat is een eigen besluit.

⚠️ **Wat dit kost.** Er staan hierna twee toonmechanismen naast elkaar, en dat is
precies waar het issue voor waarschuwde. De grens die het leefbaar houdt is dat
ze elkaar niet overlappen: de toon is **alléén** bereikbaar als er geen held is,
en dat is één `if` in `metHeldenstem()`. Komt daar ooit een tweede tak bij, dan
is dát de bevinding.

## 2. De slotregel is van de held, de feitzin van de melding

De letterlijke lezing van *"dezelfde berichten, andere stem"* zou zijn: elke
meldingstekst per held hertalen. Dat zijn zes soorten maal zes helden maal twee
talen — **tweeënzeventig teksten die allemaal hetzelfde feit moeten blijven
melden.** Eén die afdrijft is een melding die iets anders zegt dan wat er gebeurd
is, en niets zou dat rood maken.

Gekozen vorm: `berichtVoor()` levert de feitzin zoals hij was, en de held zet er
zijn eigen zin achter. De gebeurtenis is een eigenschap van de melding; de stem
is een eigenschap van de held.

**Drie momenten en niet zes.** Er zijn zes meldingsteksten, maar ze vallen in
drie soorten momenten: er staat nog iets open (`aansporing`), er is iets goed
gegaan (`erkenning`), er wordt iets van je gevraagd (`gevraagd`). Binnen zo'n
moment klinkt een held hetzelfde — het verschil tussen "je week is bevestigd" en
"je week is afgelopen" zit in de feitzin. Eén regel per held zou wél te weinig
zijn: dezelfde zin onder een felicitatie en onder een herinnering leest als een
sjabloon.

## 3. De quotes landen in de app en niet in de pushmelding

**Besluit van Quinten.** De quote met zijn bronvermelding komt in de app te staan
wanneer je de melding opent.

De reden is besluit 3 van QS8-468: een quote hoort bij zijn bron. Een
bronvermelding past niet in een pushmelding die kort moet blijven en op een
vergrendeld scherm staat dat iemand anders kan meelezen — en een quote zónder
bron haalt precies de scheiding weg die besluit 1 maakte: het personage is eigen
IP, de historische figuur blijft zichtbaar als bronvermelding.

**De keuze van de quote is deterministisch en niet willekeurig.** Het issue
waarschuwt daarvoor bij Quip: willekeur in een pad dat je wilt toetsen is een
test die soms faalt, en "flake" is in dit project geen root cause. Hier is het
gratis op te lossen — `hero_appearances.shown_at` ligt al vast. ⚠️ Het is
bovendien geen testvoordeel alleen: een willekeurige keuze laat de quote
verspringen zodra het scherm opnieuw tekent.

## 4. `tussendoor` als trigger van een hoofdheld-verschijning

`hero_appearances.trigger` draagt een CHECK met zes waarden, en er is er geen
voor "gewoon de hoofdheld". `tussendoor` is de enige die geen gebeurtenis
beschrijft maar een moment.

⚠️ **Het gevolg is dat een hoofdheld-verschijning in de tabel niet te
onderscheiden is van een Quip-verschijning.** Dat is vandaag geen verlies: de
tabel bestaat om *"is er vandaag al een held geweest"* te beantwoorden, en
daarvoor telt elke rij gelijk. Wordt er ooit op trigger gerapporteerd, dan is een
zevende CHECK-waarde de reparatie en niet een tweede betekenis voor deze.

## 5. Waar de tijdberekeningen staan

Correctheidsregel 7 laat geen tijdberekening buiten `shared/time` toe, en dit
issue raakt er drie:

| Vraag | Waar | Met wat |
|---|---|---|
| Is dit dag 1-2 of dag 3+ zonder activiteit? | `stem.ts`, `tegenslagtrigger()` | `daysBetween()` |
| Heeft er vandaag al een held gesproken? | de job, `heldenVandaag()` | `localDateOf()` |
| Is de laatste verschijning van vandaag? | het scherm, `HeldBlok` | `localDateOf()` |

`magVerschijnen()` krijgt het **getal** aangereikt en telt niet zelf — anders zou
dat bestand een dag moeten bepalen, en dan is er een tweede plek waar een dag
begint.

⚠️ `laatsteActiviteitDatum()` leest **twee** bronnen. Wie zijn weekdoel afrondt
maar nooit een Dagzet schrijft is niet stil, en met alleen `daily_moves` zou
Lucerna hem na drie dagen aanspreken alsof hij verdwenen was — precies de
vergissing waar de overgang van Ignis naar Lucerna voor bestaat.

## 6. De splitsing die de sync afdwong

`helden.ts` importeerde `Sleutel` uit i18n, en dat kan Deno niet oplossen. De
catalogus-helpers staan nu in `heldteksten.ts`; het register is importvrij en
gaat mee.

Achteraf is dat de juiste scheiding — het register is data, wat je ermee in de
app doet is een laag erboven — maar het kwam pas boven toen
`edge:types:controle` erop omviel.

`sync-edge-shared.mjs` kreeg er één transformatie bij: een import naar een
buurmap moet van diepte veranderen, want in `src/` ligt `modules/helden` twee
niveaus onder `shared/` en in `_shared/` liggen ze naast elkaar. ⚠️ Of een pad
een map is, wordt met `statSync` van schijf gelezen en niet geraden — de voor de
hand liggende heuristiek ("een schuine streep erin betekent een bestand") klopt
vandaag toevallig voor `i18n/types` en `time`, en breekt op de eerste geneste
map.

## 7. Twee grendels die niets bewaakten

Bij het ijken van `tests/beloftes/de-heldenstem-kiest-op-een-plek.test.ts` bleven
**twee van de vier mutaties groen**, en allebei waren het fouten in de test zelf:

- `from('hero_profiles')` mist de **embedding** die PostgREST gebruikt. De
  mutatie die de grendel moest vangen — `hero_profiles(hero_key)` in de select
  van de profielquery — heeft geen `from(` eromheen. De controle stond groen op
  precies het geval dat zijn eigen comment beschreef.
- `toMatch(/noteerVerschijning\(/)` matcht ook de **definitie**. De aanroep
  weghalen liet hem dus groen.

Allebei gerepareerd door op de kale naam te tellen in plaats van op een vorm die
toevallig in beeld was, en opnieuw geijkt.

⚠️ **Dit is waarom een ijking per grendel moet, en niet per controle.** Was ik
gestopt bij "de suite wordt rood", dan waren er twee tests bij gekomen die niets
bewaken — en die lezen daarna als bewijs.

## 8. En een drempel die een smaak toetste

De dekkingstoets eiste eerst een regel van meer dan tien tekens. Daar viel Ignis'
`Won. Next.` op om: precies tien. Die held **is** kort ("Kort, hard, warm
vanbinnen"), dus de drempel toetste geen belofte maar een voorkeur. Vervangen
door: er staat een zin, en hij is afgemaakt.
