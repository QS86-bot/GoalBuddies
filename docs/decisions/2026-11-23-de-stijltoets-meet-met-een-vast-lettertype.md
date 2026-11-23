# De stijltoets meet met een vast lettertype (QS8-811)

Datum: 23-11-2026. Issue: QS8-811, vervolg op QS8-804 en QS8-808.

## Probleem

📏 De eerste nachtelijke browsertest op `main` (run 45179652334, `workflow_dispatch`,
`44fae34a`) was rood: 13 van 14 groen. Rood was de stijltoets van de spatiebalk
(`tests/browser/spatiebalk.test.ts`). Die vergelijkt tag, bounding box en computed
style van de knoppen met een momentopname van vóór de reparatie van QS8-804. Alleen de
breedte en x van de twee `Choice`-knoppen verschilden: `Optie A` 78,09 px verwacht en
77,27 px gemeten.

**Oorzaak.** Het harnas laadde geen lettertype. De tekst in een knop valt dan terug op
wat de machine heeft, en de breedte van een tekstknop volgt het lettertype. De
momentopname was dus machinegebonden.

⚠️ **Het was niet alleen `"Times New Roman"`.** De computed style van de knop toonde die
familie, maar het label daarbinnen krijgt van react-native-web zijn eigen systeemstapel.
📏 Een `font-family` op `html, body` veranderde de breedte daarom niet (78,09 bleef
78,09). Pas met `!important` op elk element verschoof hij (79,94). Een toets die alleen
naar de computed style van de knop keek, zou gezegd hebben dat het lettertype vast stond
terwijl dat niet zo was.

## Besluit (orchestrator, V6a)

Een **vast lettertype in het harnas**, geen marge. Zonder nieuwe dependency en zonder
download in CI.

## Wat er gebouwd is

| Onderdeel | Wat |
| --- | --- |
| `tests/browser/harnas/lettertype/DejaVuSans-latijn.ttf` | een subset (U+0020–U+007E) van DejaVu Sans 2.37, **28 KB**, met `LICENSE.txt` ernaast |
| `tests/browser/lettertype.ts` | `lettertypeStijl()`: een `@font-face` met een `data:`-URL en `*{font-family: … !important}`. `wachtOpLettertype()`: laadt het lettertype in de pagina en zegt of het er is |
| `tests/browser/spatiebalk.test.ts` | laadt het lettertype in `beforeEach`; een nieuwe toets *het vaste lettertype is geladen*; de stijltoets eist dat ook; `STIJL_VOOR` opnieuw gemeten |

### Waarom deze vorm

* **Een bestand in de repo, geen dependency.** In `node_modules` staan alleen
  pictogramlettertypes (`@expo/vector-icons`, `material-symbols`, `codicon` van
  Playwright), en daarin zitten geen letters. Een npm-pakket met een tekstlettertype is
  een nieuwe dependency. Een download van Google Fonts in CI is netwerk. Beide had de
  orchestrator uitgesloten.
* **DejaVu Sans**, omdat de licentie (Bitstream Vera, met de DejaVu-wijzigingen in het
  publieke domein) verspreiden en aanpassen toestaat, mits de naam geen "Bitstream" of
  "Vera" bevat. De subset is een aanpassing; de licentie staat ernaast.
* **Een subset van 28 KB** in plaats van het hele bestand van 760 KB. De harnassen tonen
  alleen ASCII. Gemaakt met `pyftsubset` (fonttools), eenmalig, in een tijdelijke venv. Het
  is geen projectdependency.
* **Een eigen familienaam (`Harnaslettertype`)**, en niet `DejaVu Sans`. In de cloudsessie
  staat DejaVu Sans als systeemlettertype, en dan kan de browser die volledige versie pakken
  in plaats van de subset.
* **`!important` op elk element.** Zonder dat houdt het label de systeemstapel van
  react-native-web (zie *Probleem*).
* **Een toets dat het lettertype geladen is.** Een `@font-face` die mislukt, valt in de
  browser stil terug op het systeemlettertype, en dan meet de stijltoets weer de machine.
  `document.fonts.check()` is daarvoor niet bruikbaar: die zegt ook `true` bij een familie
  die niet bestaat.

### Geldt de belofte nog?

De belofte van de stijltoets is: *de reparatie van 804 verschuift niets*. 📏 Met het vaste
lettertype zijn de verwachte waarden opnieuw gemeten op de componenten van **vóór** de
reparatie (`659d84ab`, `main` vóór de merge van 804, met het harnas van nu erbij). Ze waren
regel voor regel gelijk aan de waarden van na de reparatie. De belofte staat dus, nu met een
meting die op elke machine hetzelfde is.

⚠️ **Wat de toets nu níet meer ziet: een andere lettertypefamilie in een component.** Het
lettertype wordt met `!important` opgelegd. Dat zag de toets ook vroeger niet: de kolom
`font` is die van de knop (de `div`) en niet van het label. Wat hij wél blijft zien, via de
breedte: lettergrootte, gewicht, spatiëring, padding, rand en marge (zie *IJking*, M1 en M2).

## IJking

Met de hand, 23-11-2026, één mutatie tegelijk. De uitslag is wat er werkelijk omviel.

| | Mutatie | Grendel | Uitslag |
| --- | --- | --- | --- |
| M1 | `marginLeft: 1` op de `Choice`-knop | een verschuiving van 1 px is rood | 📏 1 rood: de stijltoets |
| M2 | `letterSpacing: 0.15` op het `Choice`-label, minder dan 1 px per knop | een stijlwijziging binnen de tekst is rood | 📏 1 rood: de stijltoets |
| M3 | het lettertype onleesbaar (`LICENSE.txt` als bestand) | het lettertype moet geladen zijn | 📏 2 rood: *het vaste lettertype is geladen* en de stijltoets. ⚠️ De eerste vorm liet `document.fonts.load()` afwijzen in `beforeEach` en maakte álle tests rood; nu wordt dat `false`, en vallen precies deze twee om |
| M4 | `!important` weg | het label volgt het vaste lettertype | 📏 1 rood: de stijltoets |
| M5 | een "andere machine": `FONTCONFIG_FILE` die elke familie op FreeMono zet, **met** het vaste lettertype | de meting is machine-onafhankelijk | 📏 15/15 groen |
| M6 | dezelfde andere machine, **zonder** deze wijziging | de oude vorm was machinegebonden | 📏 1 rood: `Optie A` 86,81 px in plaats van 78,09 |

M5 en M6 samen zijn de kern: dezelfde nagebootste machine laat de oude vorm omvallen en
de nieuwe staan.

## Aanname

* Dat de runner van GitHub hetzelfde meet als de cloudsessie, is nagebootst (M5) en niet
  gemeten. De dispatch op `main` na de merge meet het.
* Subpixelrendering kan per Chromium-versie verschillen. De versie ligt vast via
  `playwright` 1.63.0 in de lockfile (QS8-808). Wie hem ophoogt, kan deze waarden opnieuw
  moeten meten.

## Vervolg

📏 De dispatch na de merge (run 45187664320) was 14 van 15: de runner rondt tekstbreedtes
af omdat font-hinting daar aan staat. Dat is gerepareerd in QS8-812, zie
`docs/decisions/2026-11-23-browsertests-starten-met-hinting-uit.md`.

## Volgende stap

Na de merge één `workflow_dispatch` van `browsertest.yml` op `main`, en de uitslag op QS8-811.
