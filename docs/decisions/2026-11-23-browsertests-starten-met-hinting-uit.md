# Browsertests starten Chromium met font-hinting uit (QS8-812)

Datum: 23-11-2026. Issue: QS8-812, vervolg op QS8-811. Besluit V7a van de orchestrator.

## Probleem

QS8-811 gaf de browserharnassen een vast lettertype
(`docs/decisions/2026-11-23-de-stijltoets-meet-met-een-vast-lettertype.md`). 📏 De
dispatch op `main` daarna (run 45187664320, `917a2556`) was **14 van 15**. Het lettertype
laadde op de runner, maar de tekstbreedtes werden afgerond op hele pixels: `Optie A` 80 px
tegen 79,94 verwacht, `Optie B` 103/78 tegen 102,94/77,95.

**Oorzaak.** Met font-hinting aan rondt Chromium de breedte van tekst af op hele pixels,
en de standaard verschilt per machine. Op de runner staat hinting aan, in de cloudsessie
niet. 📏 Lokaal nagemeten (een losse `<span>` "Optie A", 14 px, gewicht 600, in het vaste
lettertype):

| `--font-render-hinting` | breedte |
| --- | --- |
| geen vlag | 51,9375 |
| `none` | 51,9375 |
| `medium` | 52 |
| `full` | 52 |

⚠️ **Via fontconfig liet het zich niet nabootsen.** Met `hintstyle hintfull` in een eigen
`FONTCONFIG_FILE` bleef de breedte 51,9375; alleen de Chromium-vlag zelf veranderde hem. Een
ijking die alleen fontconfig had geprobeerd, had gezegd dat hinting er niet toe deed.

**Een vast lettertype zonder vaste rendering meet nog steeds de machine.**

## Wat er gebouwd is

| Onderdeel | Wat |
| --- | --- |
| `tests/browser/lettertype.ts` | `CHROMIUM_VLAGGEN = ['--font-render-hinting=none']`, naast het lettertype |
| `tests/browser/rook.test.ts`, `tests/browser/spatiebalk.test.ts` | `chromium.launch({ args: CHROMIUM_VLAGGEN })` |
| `tests/beloftes/browsertests-starten-met-vaste-vlaggen.test.ts` | rood als een `.launch…(` in `tests/browser/` de constante niet meegeeft, of als de constante hinting niet uitzet. Draait in `unit`, dus bij elke push |

**Waarom `none` en niet `full`.** `none` geeft dezelfde waarden als zonder vlag in de
cloudsessie, dus de momentopname van QS8-811 blijft staan. En het is de enige stand die de
subpixelbreedte behoudt: met `full` valt een verschuiving van minder dan een halve pixel
weg, en de orchestrator wilde geen marge.

**Wat de toets op de launches niet ziet:** vlaggen die via een tussenvariabele binnenkomen.
Die vorm staat nergens. Wie hem invoert, maakt de toets rood en moet hem dan aanpassen; dat
is de veilige richting.

## IJking

Met de hand, 23-11-2026, één mutatie tegelijk.

| | Mutatie | Uitslag |
| --- | --- | --- |
| A | `rook.test.ts` start `chromium.launch()` zonder vlaggen | 📏 1 rood: `rook.test.ts: launch('') gebruikt CHROMIUM_VLAGGEN` |
| B | de constante wordt `['--foo']` | 📏 1 rood: *de constante zet font-hinting uit* |
| C | de constante wordt `--font-render-hinting=full` | 📏 1 rood: de stijltoets, met **precies** de waarden van de runner (`16,44,80,40`) |
| D | terug op `none` | 📏 15/15 groen, ook met de fontconfig van QS8-811 die alles op FreeMono zet |

C is de kern: de lokale nabootsing geeft exact wat de runner gaf.

## Aanname

Dat de runner met deze vlag 15/15 groen wordt, is nagebootst (C en D) en niet gemeten. De
dispatch op `main` na de merge meet het.

## Volgende stap

Na de merge één `workflow_dispatch` van `browsertest.yml` op `main`, en de uitslag op QS8-812
en QS8-811.
