# Een kalender zonder pakket

**Datum:** 03-09-2026
**Issue:** QS8-223
**Status:** gebouwd

## Wat er stond

Elk datumveld in de app was een kaal tekstveld met een ISO-plaatshouder:
`2026-12-31` bij een nieuw doel, `2027-03-31` bij een mijlpaal, `2027-03-01` bij
het verzetten van een deadline, `2027-06-01` in het planscherm. De gebruiker
moest `JJJJ-MM-DD` kennen.

Dat `isoDatum` in `modules/goals/schemas.ts` bestaat, komt daar rechtstreeks uit:
er was een veld zonder formaatcontrole, iemand typte iets anders, en
`datumLigtInDeToekomst` vergelijkt strings — `'morgen' > '2026-08-18'` is gewoon
waar. Het formulier liet dat door en Postgres struikelde erover.

## De keuze: geen dependency, wél één raster voor beide platformen

Het issue stelt voor: `<input type="date">` op web en
`@react-native-community/datetimepicker` op native. Het is een eigen component
geworden, in gewone React-Native-primitieven, op allebei de platformen hetzelfde.
**Dat is een afwijking van wat het issue voorstelt, en dit zijn de drie redenen.**

**1. Het rekenwerk hoort in `shared/time`, niet in de binnenkant van een pakket.**
Een maandraster is kalenderrekenen: waar begint de week, hoeveel dagen heeft
februari, wat is de eerste van de volgende maand. Correctheidsregel 7 zegt dat
zulk rekenwerk nergens anders staat. `maandraster.ts` is puur en heeft achttien
tests; een picker rekent het intern uit en is niet los te toetsen.

**2. Domeinregel 1 heeft een plek nodig om binnen te komen.** De eerste kolom van
een kalender is een week-startvraag. `DatumKeuze` neemt `startDag` verplicht aan
en de aanroeper haalt hem uit het profiel — een derde partij weet niet dat deze
app die instelling heeft. Een van de zes ijkingen is precies dit: een vaste `1`
in het raster maakt twee tests rood.

**3. Er is geen native build waarin een native picker ook maar één keer te zien
zou zijn geweest.** De app draait vandaag als web op Hostinger; een echte build
staat als eigen rij in `docs/ENGINEER-REVIEW.md` (QS8-179). Twee implementaties
waarvan er één op geen enkele manier te draaien is, is twee keer zoveel om te
onderhouden en één keer zoveel bewijs.

⚠️ **Wat dit kost, en dat is echt iets.** `<input type="date">` op web geeft de
kalender van het besturingssysteem: bekend, toetsenbordbediening zoals de
gebruiker die gewend is, en gratis ondersteuning voor schermlezers. Dit raster
moet dat zelf doen — het heeft een focusring, `accessibilityRole="button"` per
dag en een `accessibilityState` voor gekozen en uitgeschakeld, maar dat is niet
hetzelfde als de weken werk die in een OS-widget zitten. **Vindt Quinten de
webervaring hierdoor slechter, dan is `<input type="date">` op web erbij zetten
een kleine wijziging** — de component is dan de enige plek die het weet.

## De grens verschuift niet

Een kalender is gebruiksgemak en geen validatie. `isoDatum`,
`datumLigtInDeToekomst` en de CHECK's in de database blijven onaangeroerd en
blijven de grens: wat er via PostgREST binnenkomt heeft nooit langs dit scherm
gehoeven. Dezelfde redenering als in de kop van `auth/schemas.ts`.

Wat er wél verandert: bij een nieuw doel en in het planscherm is `min` morgen, dus
een streefdatum in het verleden is een dag die je niet kunt aantikken in plaats
van een melding achteraf. Bij een mijlpaal staat er met opzet géén ondergrens —
een mijlpaal in het verleden afvinken is een normale handeling.

## De bewaking

`tests/beloftes/datum-uit-een-kalender.test.ts` toetst de belofte en niet de vijf
plekken: **geen enkel datumveld in de app eist nog dat de gebruiker het formaat
kent.** Het zoekt naar de vórm van de fout — een `Field` met een ISO-plaatshouder
of met `datum` in zijn sleutel — zodat een zesde veld dat iemand morgen toevoegt
hier rood wordt en niet pas bij de volgende doorloop met een mens.

⚠️ **Zes grendels, zes mutaties, elk apart rood gemaakt:**

| Mutatie | Wat er rood werd |
|---|---|
| een kaal datumveld met ISO-plaatshouder terug | "geen enkele Field draagt een datum" |
| een datumveld zonder plaatshouder, alleen de sleutel | idem — dit is de helft die de plaatshouder mist |
| `startDag={1}` in een scherm | "geen verzonnen week-startdag" |
| geen enkel scherm rendert `DatumKeuze` meer | "de app gebruikt de component ook echt" |
| het raster begint altijd op maandag | twee tests op de startdag |
| `maandErbij()` rekent in dagen (31) | de jaargrens én "31 januari wordt geen 3 maart" |

Die vierde staat er omdat de eerste twee anders een app zonder datumvelden groen
zouden verklaren.

## Wat hier niet gemeten is

⚠️ **Er is geen browser en geen toestel aan te pas gekomen.** Het rasterrekenwerk
is puur en getoetst; hoe de kalender oogt, of hij op een telefoon prettig aan te
tikken is en hoe een schermlezer erdoorheen loopt, is niet gemeten. Dat vraagt de
app op een scherm, en dat is in deze omgeving niet te doen.
