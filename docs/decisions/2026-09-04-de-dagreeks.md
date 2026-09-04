# De dagreeks

**Datum:** 04-09-2026
**Besluit:** A59
**Status:** besloten; **optie 4 heeft twee uitvoeringen en die keuze staat open** — §4
**Aanleiding:** antwoord van Quinten op vraag R1 van de besluitenronde

---

## 1. Het besluit

> *Optie 3 en 4 doorvoeren.*

Uit de vier voorgelegde vormen:

- **optie 3** — een dagreeks met eigen dagpassen en een nachtmarge;
- **optie 4** — diezelfde dagreeks levert ook punten op.

Ze zijn gevraagd als één ding en ze zijn het niet: optie 3 is een uitbreiding van
wat er staat, optie 4 raakt twee domeinregels. Dit document behandelt ze daarom
apart, en optie 3 kan los landen.

---

## 2. Optie 3 — de dagreeks zelf

Een doel met ritme `daily` of `x_per_week` telt al dagen af (besluit A53,
migratie 0140). Wat erbij komt is een **reeks**: hoeveel dagen achter elkaar je
hebt afgevinkt, met twee dingen eromheen.

**Dagpassen.** Een gemiste dag is te beschermen, net als een gemiste week. Dat is
geen nieuwe gedachte maar de bestaande regel doorgetrokken: *de reeks dient de
gebruiker, nooit andersom* (domeinregel 8).

**Een nachtmarge.** Zonder marge breekt de reeks om middernacht in je eigen
tijdzone, en dan verliest iemand die om 00:20 afvinkt een reeks van tachtig
dagen. De weekcyclus heeft daar al `GRACE_HOURS` voor; de dag krijgt hetzelfde
mechanisme uit `shared/time` en rekent het nergens zelf uit
(correctheidsregel 7).

### Wat dit verandert aan domeinregel 9

Domeinregel 9 zegt vandaag:

> *De Dagzet is aanwezigheid, geen prestatie. Een dag overslaan heeft geen enkel
> gevolg.*

De tweede zin wordt onwaar: overslaan breekt voortaan een reeks, tenzij je er een
pas op zet. **De eerste zin blijft staan**, en dat is het verschil met optie 4 —
een reeks is aanwezigheid die je bijhoudt, geen prestatie die scoort.

⚠️ **De regel moet dus mee in dezelfde wijziging.** Een domeinregel die de code
tegenspreekt is erger dan geen regel; dat is het patroon uit QS8-125.

### Wat het kost

Een **tweede passenvoorraad** naast de weekpassen, met een eigen bijvulregel, een
eigen uitleg in de app en een eigen plek in het scherm. Dat is de grootste post
van deze optie, en hij is echt: twee soorten passen die op elkaar lijken maar
anders werken, is precies het soort naad waar dit project last van heeft.

⚠️ **Weekpassen beschermen de reeks, niet het punt** (domeinregel 10). Dagpassen
horen dat te spiegelen: een dagpas beschermt de dagreeks en verandert niets aan
wat de week oplevert. Anders is missen gratis geworden via een omweg.

### Wat dit níét is

**De dagreeks is privé, net als de Dagzet zelf.** Domeinregel 9 en oppervlak 27
in `002-domeinregel7-oppervlakken.md` zeggen allebei hetzelfde: dagafvinkingen
zijn eigenaar-only in béide groepsstanden, ook in een open groep. Rij 27 staat er
letterlijk over:

> *Een open groep heeft afgesproken elkaars gemiste wéken te zien, en dat is iets
> anders dan elkaars gemiste dágen. Wie dat ooit wil verruimen, verruimt niet één
> stap maar zeven per week.*

**Een dagreeks verandert daar niets aan.** Hij komt in geen enkel groepsoppervlak
terecht — niet in het groepsoverzicht, niet in De Ketting, niet in een
systeembericht. Wie dat later wél wil, komt langs die rij.

---

## 3. Optie 4 — dagen leveren punten op

Dit is de helft die botst, en de botsing is niet klein.

### Wat er breekt bij "punten bovenop"

De vorm zoals hij op de vragenlijst stond — een dag levert een punt op, naast wat
de week oplevert — raakt vier dingen:

1. **Domeinregel 9.** *De Dagzet levert nooit punten of goedkeuring op.* Dat is
   niet een detail van de regel maar de regel.
2. **Domeinregel 10: de week is de enige eenheid die telt.** Een doel van twaalf
   weken met één weekdoel heeft vandaag een puntenplafond van `24`. Eén punt per
   dag zet daar `84` bovenop. De weekscore verdrinkt in de dagscore, en dan zegt
   "punten" iets anders dan het nu zegt.
3. **Het puntenplafond per doel klopt niet meer.** `goals.max_points` is de som
   van de plafondpunten van de weekdoelen — dat is wat voortgang meet. Dagpunten
   zitten er niet in, dus voortgang kan boven de honderd procent uitkomen.
4. **Het klassement kan gaan dalen.** A54 rust op één grendel: `cycle_missed`
   boekt zónder `group_id` (CHECK `points_ledger_gemist_is_niet_van_een_groep`),
   dus een gemiste week kan een groepsklassement niet laten zakken. Een gemiste
   **dag** zou dezelfde behandeling moeten krijgen — en sinds A57 draagt die
   CHECK het klassement in élke groep, niet alleen in een open. Vergeet je hem
   bij de dagpunten, dan is domeinregel 7 weg in elke groep tegelijk.

⚠️ **Punt 4 is de gevaarlijkste, want hij is stil.** De andere drie merk je bij
het bouwen; deze merk je pas als iemands klassement zakt.

---

## 4. De twee uitvoeringen van optie 4

De wens is helder: **afgevinkte dagen moeten meetellen voor je punten.** Er zijn
twee manieren om dat waar te maken, en ze verschillen op één ding — of de week de
eenheid blijft.

### Uitvoering A — dagen bepalen hoevéél van de weekpunten je haalt

De week levert nog steeds `+2` bij plafond en `+1` bij vloer. Wat de dagen doen,
is bepálen welke van die twee je haalt: vier dagen is de vloer, zeven het
plafond. Bij een ritme-doel is dat al precies wat `vloer` en `plafond` betekenen
sinds A53.

Dan geldt:

- domeinregel 9 blijft heel — de Dagzet zelf levert nog steeds niets op; het
  **weekdoel** levert op, en de dagen zijn hoe je het haalt;
- domeinregel 10 blijft heel — de week blijft de eenheid;
- `goals.max_points` klopt, want er komt niets bovenop;
- de CHECK van A54/A57 hoeft niet aangeraakt.

**Nul van de vier breuken.** En de gebruiker ziet wat hij vroeg: zijn dagen tellen.

### Uitvoering B — dagen leveren punten bovenop de week

Wat er letterlijk op de vragenlijst stond. Dan moeten alle vier de punten uit §3
opgelost worden, en dat is geen bouwwerk maar een herziening:

- domeinregel 9 en 10 gaan open in `CLAUDE.md`, met de nieuwe verhouding erin;
- `goals.max_points` krijgt de dagpunten erbij, en de voortgangsberekening mee;
- `points_ledger` krijgt een nieuw type `day_completed`, en een gemiste dag moet
  net als `cycle_missed` **zonder** `group_id` boeken — met een CHECK erop, want
  zonder die CHECK is het een toevalligheid van één Edge Function;
- de score van vandaag en die van morgen zijn niet meer vergelijkbaar. Er is nog
  geen gebruiker met een geschiedenis, dus dat is nú gratis en later niet.

⚠️ **Uitvoering B is te bouwen.** Dit is geen verkapt nee — het is de prijskaart,
en die hoort erbij te staan omdat vier regels in twee domeinregels erdoor
veranderen.

### Wat ik aanhoud tot je iets anders zegt

**Uitvoering A**, om de reden die CLAUDE.md voorschrijft: kies de conservatiefste
optie die het werk áf maakt. A geeft wat gevraagd is — dagen die meetellen —
zonder een domeinregel te openen, en A is later naar B uit te breiden. Andersom
niet: B terugdraaien betekent iemands punten afpakken.

⚠️ **Dit is een aanname en geen mededeling.** Bedoelde je B, zeg dat dan; dan
wordt dit document een ander document en gaan er twee domeinregels mee open.

---

## 5. Volgorde

1. **Optie 3 zonder punten** — dagreeks, dagpassen, nachtmarge. Landt los en
   raakt het puntenmodel niet.
2. **Uitvoering A van optie 4** — de dagen voeden vloer en plafond van het
   ritme-weekdoel. Bouwt op 1 en verandert geen domeinregel.
3. **Alleen als je B bedoelt:** een eigen ronde met een herziening van
   domeinregel 9 en 10, een migratie op `points_ledger` en een CHECK op de
   gemiste dag.

---

## 6. De grendel die hierbij hoort

⚠️ **Onwrikbare regel 18, vraag 6, en die is hier van toepassing:** *tilt deze
feature een aanname van "er is er altijd precies één" naar "er kunnen er meer
zijn"?* Ja — er was één soort pas en er komen er twee. Grep vóór het bouwen op
`weekpas`, `[0]`, `.find(`, `single()` en `maybeSingle()` in alles wat passen
aanraakt: waar nu "de pas" staat, moet straks "welke pas" staan.

De belofte die getoetst moet worden, per stap:

- **een dagpas beschermt de reeks en niet het punt** — met de hand rood te maken
  door de dagpas ook het weekpunt te laten redden. Dit is de spiegel van de
  weekpas-toets die er al is;
- **de nachtmarge werkt in de tijdzone van de gebruiker en niet in UTC** — te
  toetsen met twee gebruikers in verschillende zones die op hetzelfde moment
  afvinken;
- **de dagreeks komt in geen enkel groepsoppervlak terecht** — de vorm van
  `tests/beloftes/dagzet-privacy.test.ts`, die dit voor de Dagzet zelf al doet;
- **bij uitvoering A verandert `goals.max_points` niet** — de test die aantoont
  dat het plafond na een week met zeven afgevinkte dagen hetzelfde is als ervoor.
  Dat is de belofte die uitvoering A van B onderscheidt, en de enige die zichtbaar
  maakt dat er niet stiekem B gebouwd is.
