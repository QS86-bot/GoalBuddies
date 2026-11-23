# Een gekozen keuzeknop is op web een wisselknop met `aria-pressed`; de radio is geprobeerd en teruggedraaid — QS8-794

**Datum:** 23-11-2026 · **Issue:** QS8-794 (gevonden in de klikronde van QS8-785; criterium 9 van QS8-733)
**Raakt:** `src/shared/ui/Button.tsx`, `src/shared/ui/keuze-aria.ts`, de vier vragenlijststappen
**Status:** gebouwd. Licht risico, geen migratie, geen datamodel, geen auth. (Bestandsnaam heet nog "of een radio": de vraag was die twee; het antwoord staat hieronder.)

## Wat gemeten is

📏 Gemeten op `main` 10116ee3. `Button` zette bij een gekozen keuzeknop alleen `accessibilityState.selected`.
react-native-web 0.21.2 (`createDOMProps`) leest `accessibilityState` niet: alleen de losse `aria-*`-props
en `role` komen in de DOM. Op web stond er dus niets, en een schermlezer hoorde elke keuze als ongekozen.
De toets leest de echte DOM via de echte vragenstappen (`tests/render/keuzeknop.test.ts`), niet de props.

## Besluit

Alle vier de stappen zijn een **wisselknop met `aria-pressed`**; `Button` krijgt `gekozen?: boolean`.

| Stap | Gedrag | Vorm |
|---|---|---|
| Focus | tot drie gebieden tegelijk, tik haalt weg | `aria-pressed` |
| Valkuil | meer antwoorden tegelijk | `aria-pressed` |
| Gevoel | één voorstel, een tweede tik haalt hem weg | `aria-pressed` |
| Held | precies één van zes | `aria-pressed`, de zes knoppen in een `role="group"` met de vraag als naam |

## Waarom Held geen radio is (geprobeerd en teruggedraaid)

Held is inhoudelijk een keuze uit een groep, en de eerste bouw was `role="radio"` + `aria-checked` in een
`radiogroup`. De code-critic wees erop, en dat is in de bron van react-native-web 0.21.2 nagelezen
(`PressResponder.js`, `isValidKeyPress`): de spatiebalk gaat alleen door op een `<button>` of rol `button`.
`role="radio"` maakt van de knop een `<div>`, dus op web werkt dan alleen Enter, en bij een spatie scrolt de
pagina. Bij een radio is de spatie juist de verwachte toets: een toegankelijkheidsfix die het toetsenbord slechter
maakt, is geen fix. Dit is **afgeleid uit de bron en niet in een browser gedraaid.**

⚠️ **Een radio kan terug** zodra hij een eigen spatie-afhandeling heeft, mét een toets die een spatie afvuurt in
een echte browser (jsdom maakt bij een spatie geen klik, dus daar is het niet te toetsen). Pas dan is hij beter
dan deze wisselknop. Tot dan: bij twijfel een wisselknop, want die belooft minder.

## Wat niet gemeten is

- **De spatiebalk op een `<button>` in een echte browser.** De test legt alleen vast dat elke knop een `<button>`
  blijft (waar de browser zelf een klik van maakt) en dat er geen `role=radio` is.
- **Native.** Niet gemeten: geen apparaat of simulator. `accessibilityState` is voor `selected` ongewijzigd en
  `disabled`/`busy` zijn niet aangeraakt; alleen op web komt `aria-pressed` erbij.
- **Echte schermlezers** (NVDA, VoiceOver, TalkBack): niet gedraaid. Gemeten is wat in de DOM staat, niet wat
  een lezer ervan maakt of hoe hij een `group` aankondigt.

## Wat dit niet repareert

Dezelfde fout (`accessibilityState` dat op web niets doet) staat nog op: `Choice` (rol radio met `selected`),
`DatumKeuze`, `Taakbalk`, `Instellingenscherm`, `Schakelaar` (`checked`), `Afvinkcirkel` (`checked`), `Field`
(`selected` van de zichtbaarheidsknop), `MeerKnop`/`Taakbalk` (`expanded`) en `Microfoon` (`busy`). Het issue
noemt alleen plekken waar `Button` een gekozen stand heeft. Dat is een eigen issue, QS8-803 (zie ook het AFGELEVERD-bericht
op QS8-794 voor het nummer) en is niet stilzwijgend meegenomen (`docs/PROMPT-SESSIE.md` §8).

## IJking

Zie de kop van `tests/render/keuzeknop.test.ts`: zes mutaties met de hand (23-11-2026), elk met de tests die omvielen.
