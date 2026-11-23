# Een gekozen keuzeknop is een wisselknop of een radio, en op web zegt alleen `aria-*` het — QS8-794

**Datum:** 23-11-2026 · **Issue:** QS8-794 (gevonden in de klikronde van QS8-785; criterium 9 van QS8-733)
**Raakt:** `src/shared/ui/Button.tsx`, `src/shared/ui/keuze-aria.ts`, de vier vragenlijststappen
**Status:** gebouwd. Licht risico, geen migratie, geen datamodel, geen auth.

## Wat gemeten is

📏 Gemeten op `main` 10116ee3. `Button` zette bij een gekozen keuzeknop alleen `accessibilityState.selected`.
react-native-web 0.21.2 (`createDOMProps`) leest `accessibilityState` niet: alleen de losse `aria-*`-props
(`aria-pressed`, `aria-checked`, `aria-selected`) en `role` komen in de DOM. Op web stond er dus niets, en een
schermlezer hoorde elke keuze als ongekozen. De toets staat op de echte DOM (`tests/render/keuzeknop.test.ts`), niet op de props.

## Besluit: welke vorm bij welke knop

"Gekozen" betekent twee dingen, en de vorm volgt uit wat de knop *doet*, niet uit hoe hij eruitziet.

| Stap | Gedrag | Vorm | Waarom |
|---|---|---|---|
| Focus (`Focus.tsx`) | tot drie gebieden tegelijk, tik haalt weg | `wissel` → `aria-pressed` | meer dan één gekozen; een radio kent er één |
| Valkuil (`Valkuil.tsx`) | meer antwoorden tegelijk | `wissel` → `aria-pressed` | idem |
| Gevoel (`Gevoel.tsx`) | één voorstel, maar een tweede tik haalt de keuze weg | `wissel` → `aria-pressed` | een radio is niet uit te zetten zonder een andere te kiezen; het gedrag is dat van een wisselknop |
| Held (`Held.tsx`) | precies één van zes, de gekozene blijft | `radio` → `role=radio` + `aria-checked`, in een `role=radiogroup` met de vraag als naam | een echte keuze uit een groep |

⚠️ **De regel voor een volgende knop:** kan er meer dan één gekozen zijn, of haalt een tweede tik de keuze weg, dan is
het `wissel`. Is het precies één uit een vaste groep en blijft die staan, dan is het `radio`, en dan hoort er een
`radiogroup` omheen. Bij twijfel `wissel`: een wisselknop belooft minder dan een radio (een radiogroep laat een
schermlezer pijltoetsgedrag verwachten dat hier niet gebouwd is).

⚠️ **Een radio belooft pijltoetsen en deze groep heeft ze niet.** Een schermlezer meldt "1 van 6", maar
pijltoets-navigatie binnen de groep is niet gebouwd en niet gemeten; Tab en Enter/spatie werken zoals voorheen.
Dat is de prijs van `role=radio` op `Pressable`, en het staat hier zodat de volgende die dit leest het niet als
beloofd neemt.

## De vorm in code

`Button` verving `selected?: boolean` door `keuze?: { vorm: 'wissel' | 'radio'; gekozen: boolean }`. Een kale
boolean liet de aanroeper de vorm niet kiezen, en dat was de aanleiding. `keuzeEigenschappen()` in
`src/shared/ui/keuze-aria.ts` (zonder `react-native`, dus los toetsbaar) geeft twee dingen terug: `state` voor
`accessibilityState` (altijd; native leest dat) en `aria` voor de losse props (alleen op web). Op native blijft
`accessibilityState` dus staan (`selected` voor een wisselknop, `checked` voor een radio), `aria-pressed` gaat daar
niet mee omdat het niet in de typen van react-native staat.

## Wat niet gemeten is

- **Native.** Niet gemeten: geen apparaat of simulator in deze sessie. `accessibilityState` is ongewijzigd voor
  `disabled` en `busy`; `selected` blijft voor een wisselknop, en de radio kreeg `checked` in plaats van `selected`.
  Dat laatste is een aanname over wat TalkBack en VoiceOver met `accessibilityRole="button"` + `checked` doen:
  de rol op native blijft `button`, en het is niet bekeken of een schermlezer daar "gecontroleerd" bij zegt.
- **Echte schermlezers** (NVDA, VoiceOver) op web zijn niet gedraaid. Gemeten is wat in de DOM staat, niet wat een lezer ervan maakt.
- **Pijltoetsen** in de radiogroep: zie hierboven.

## Wat dit niet repareert, en wat apart is gemeld

Dezelfde fout (`accessibilityState` dat op web niets doet) staat nog op: `Choice` (radio met `selected`),
`DatumKeuze`, `Taakbalk`, `Instellingenscherm`, `Schakelaar` (`checked`), `Afvinkcirkel` (`checked`), `Field`
(`selected` van de zichtbaarheidsknop), `MeerKnop`/`Taakbalk` (`expanded`) en `Microfoon` (`busy`). Het issue noemt
alleen plekken waar `Button` een gekozen stand heeft; dit is bij de bevinding gemeld als eigen issue en niet
stilzwijgend meegenomen (`docs/PROMPT-SESSIE.md` §8).

## IJking

Zie de kop van `tests/render/keuzeknop.test.ts`: vijf mutaties met de hand, elk met de test die omviel.
