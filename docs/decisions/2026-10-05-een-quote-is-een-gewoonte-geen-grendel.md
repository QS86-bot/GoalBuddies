# Een quote is een gewoonte en geen grendel

**Datum:** 05-10-2026 · **Issue:** QS8-629 · **Raakt:** `tests/scripts/hulpscripts.ts`,
`tests/scripts/hulpscripts.test.ts`

## Waar dit over gaat

QS8-585 liet de integratieharnassen hun scriptlijst afleiden uit de importsluiting
in plaats van hem te typen. Twee detectoren dragen die belofte: `lokaleImports()`
(welke scripts importeert dit script?) en `kopieeracties()` (kopieert een harnas
zelf scripts?). Beide lazen alleen **enkele** aanhalingstekens.

## De meting

📏 Op 05-10-2026, `origin/main` = `e649fa2`, onafhankelijk herhaald na de
verificatie van 24-09:

- `lokaleImports('import { a } from "./a.mjs";')` gaf **0** treffers.
- Er staat in `scripts/*.mjs` geen relatieve import met dubbele quotes, en er is
  geen Prettier-config of `quotes`-lintregel die enkele quotes afdwingt. Wat de
  detector deed kloppen was dus alleen een gewoonte.
- Met de oude detectoren en één `import { zonderCommentaar } from
  "./zonder-commentaar.mjs";` bovenaan `scripts/paden.mjs`: **26 rood, 13
  skipped** over de zeven harnassen — de faalvorm van QS8-585, ongewijzigd.
  Met de nieuwe: **94 geslaagd** over de acht bestanden (de ijking meegeteld).

## De keuze, met de prijs

| richting | prijs |
|---|---|
| **A — de detectoren herkennen elke quote** | twee regexen en een handvol toetsen; geen nieuwe regel voor wie scripts schrijft |
| **B — de enkele quote afdwingen met een lintregel** | een regel op `scripts/` die niemand eerder nodig had, en een tweede plek waar `.mjs`-stijl wordt vastgelegd |

**Gekozen is A.** Een detector die zijn invoer alleen in één spelling kent, is
precies de vorm waar dit project het vaakst voor betaald heeft (QS8-412, QS8-414:
*een regel die je met de hand handhaaft, handhaaf je op de vorm die je toevallig
intypt*). B zou de gewoonte afdwingen in plaats van de belofte te bewaken, en
laat de volgende detector met dezelfde aanname achter.

## Wat er staat

- De sluitende quote moet de openende zijn (`\1`): `"./a.mjs'` is geen import.
- Een backtick telt alleen zonder `${…}`: een samengesteld pad is niet statisch te
  volgen, en de detector moet niet doen alsof.
- De grendel tegen terugkomen (`geen enkel harnas kopieert zijn scripts nog
  zelf`) kijkt sinds dit issue naar elk `.ts`-bestand in `tests/` en niet alleen
  naar `*.test.ts`. 📏 Gemeten bij het verbreden: **één** treffer, de
  implementatie `kopieerHulpscripts()` zelf, die als vrijstelling in het register
  staat. Een ratel houdt die verbreding vast: een vrijstelling die het scanbereik
  niet meer vindt, is rood.

## IJking

Stand ervóór **93** geslaagd over de acht bestanden. Eén mutatie per grendel:

| mutatie | rood |
|---|---|
| `lokaleImports` terug naar alleen `'` | `vindt een import met dubbele quotes`, `… met een backtick`, `laat een uitgecommentarieerde import met dubbele quotes liggen` |
| backtick eraf | `vindt een import met een backtick zonder interpolatie` |
| sluitende quote niet gelijk eisen | `laat een import met ongelijke quotes liggen` |
| `kopieeracties` terug naar alleen `'` | `vindt een kopieeractie uit scripts/ met dubbele quotes` + `… met een backtick` |
| `kopieeracties` zonder backtick | `vindt een kopieeractie uit scripts/ met een backtick` |
| scan weer alleen `*.test.ts` | `elke vrijstelling dekt nog een kopieeractie die de scan zou vinden` |

⚠️ De laatste mutatie gaf **nul** rood vóórdat de ratel er was: de enige treffer
buiten `*.test.ts` stond al als vrijstelling, dus een versmalde scan bleef
groen. Zelfde les als bij QS8-585: een grendel op de grendel is iets wat je
verdient met een mutatie, niet iets wat je aanneemt.

## Wat niet gedekt is

`copyFile` en `cp` zonder `Sync`, `writeFileSync(…, readFileSync(…))` en een
samengesteld pad (`${…}`) blijven buiten beide detectoren. Dat staat als Laag-rij
in `docs/ENGINEER-REVIEW.md`, met de voorwaarde waaronder het zwaarder wordt.
