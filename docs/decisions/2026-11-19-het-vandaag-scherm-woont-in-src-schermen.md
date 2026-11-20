# Het Vandaag-scherm woont in `src/schermen/vandaag/` — QS8-748

**Besluit (Claude, binnen de beslisbevoegdheid; afweging, geen gate):** de onderdelen
van het Vandaag-scherm staan in een nieuwe map `src/schermen/vandaag/`, en
`app/(tabs)/index.tsx` is alleen nog de samenstelling.

## Waarom een nieuwe map

Het scherm mengt datalaag (`@/modules/*`) en componenten (`@/shared/ui`). De
lintzones sluiten elke bestaande plek uit:

| Plek | Waarom niet |
|---|---|
| `src/modules/**` | mag `shared/ui` niet importeren (QS8-207, QS8-425) |
| `src/shared/**` | mag `modules` niet importeren |
| `app/**` | elk bestand is een route in Expo Router; een hulpbestand wordt een scherm |

`src/schermen/` valt buiten alle drie de zones. Er geldt daar wel de lintregel
van 50 regels per functie (`src/**` buiten `shared/ui`), en dat is bedoeld: de
splitsing verplaatst de lange functies niet naar een map waar ze blijven staan,
ze zijn echt kleiner gemaakt (hooks per ophaalronde, deelcomponenten per blok).

## Wat er niet veranderd is

- Afhankelijkheidslijsten, `levend`-vlaggen en de volgorde van effecten zijn
  overgenomen (dit scherm had al een oneindige laadlus, QS8-75).
- Elke ophaalronde laadt en faalt nog apart.
- De tekstsleutels zijn gelijk: `tests/beloftes/het-vandaag-scherm-houdt-zijn-teksten.test.ts`.
- Domeinregel 9 en 7: de Dagzet en de gegevens eronder blijven privé, er is geen
  nieuw groepsoppervlak.

## Aannames

- `DagzetBlok` kreeg `vandaagLokaal` uit `useVandaag()` in plaats van een tweede
  `localDateIn(tz, now())` in het scherm; dat is dezelfde waarde binnen één render.
- Een deel van de uitleg-commentaren is ingekort bij het verhuizen; de ⚠️-redenen
  zijn behouden.
- Weekstrook (QS8-746) en tellers (QS8-747) krijgen geen lege component: een
  nieuw blok is een regel erbij vóór `KaartenLijst`.
