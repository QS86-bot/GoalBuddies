# De spatiebalk op een radio, schakelaar en vinkje: een eigen `onKeyDown` op web, het element blijft een `<div>` — QS8-804

**Datum:** 23-11-2026 · **Issue:** QS8-804 (gevonden bij QS8-803; besluit Quinten 23-11 06:08 UTC, vorm A van de orchestrator)
**Raakt:** `src/shared/ui/keuze-aria.ts` (alleen toegevoegd), `src/shared/ui/Choice.tsx`, `src/shared/ui/Schakelaar.tsx`, `src/shared/ui/Afvinkcirkel.tsx`
**Status:** gebouwd. Licht risico, geen migratie, geen datamodel, geen auth. Niets zichtbaars verandert.

## Wat gemeten is

📏 **In een echte browser** (Chromium van de cloudsessie, `require('playwright')`), op de tak van QS8-803
(`75cc000`): de Schakelaar gefocust, spatie ingedrukt. `aria-checked` bleef `false`, `onPress` werd **0** keer
aangeroepen en de pagina scrolde naar `scrollY = 630`. Enter wisselde de stand wel. Dat bevestigt in een browser
wat QS8-794 uit de bron afleidde, en nu voor alle drie de rollen.

## Waarom het element geen `<button>` wordt

De opdracht noemde "het element wordt een `<button>`". **Dat vervalt**, omdat het in react-native-web 0.21.2 niet
kan zonder de rol op te geven, en criterium 4 zegt dat de rol blijft:

- `node_modules/react-native-web/dist/modules/AccessibilityUtil/propsToAccessibilityComponent.js`: het elementtype
  komt uit de **rol** (`roleComponents`); alleen rol `button` geeft `'button'`. Voor `radio`, `switch` en
  `checkbox` staat er niets, dus blijft het `'div'`.
- `node_modules/react-native-web/dist/exports/View/index.js`: `component = 'div'`, en de enige andere uitweg is
  `href` (wordt `<a>`). Er is geen prop om het elementtype los van de rol te kiezen.
- `node_modules/react-native-web/dist/modules/usePressEvents/PressResponder.js`, `isValidKeyPress`: de spatie telt
  alleen op een `<button>` of rol `button`; Enter altijd. En alleen bij rol `button`/`menuitem` voorkomt hij het
  scrollen (`preventDefault`).

Een `<button role="radio">` zou wel geldige HTML zijn, maar via `Pressable` is hij niet te maken. Een eigen element
via `unstable_createElement` (vorm B) verliest `Pressable` en de stijl; rol `button` met `aria-pressed` (vorm C) geeft
de rol op. Beide zijn afgewezen.

## Besluit

`spatieActiveert(onPress, uitgeschakeld, web)` in `keuze-aria.ts` geeft op web een `onKeyDown` en op native `{}`.
De drie componenten spreiden hem naast hun `aria`-props. `Pressable` voert eerst zijn eigen keydown uit en dan de
onze (`exports/Pressable/index.js`, `keyDownHandler`), dus er wordt niets overschreven.

- **Alleen de spatie** (`' '` of `'Spacebar'`). Enter blijft van react-native-web; zou de helper hem ook nemen, dan
  activeert Enter twee keer.
- **`preventDefault` en `stopPropagation`** bij elke spatie: de pagina scrolt niet, en een ouder met een eigen
  `onKeyDown` krijgt hem niet ook.
- **Activeren op keydown, één keer.** `repeat` activeert niet opnieuw. Een `<button>` activeert op keyup; keydown is
  gekozen omdat het geen bijgehouden toestand vraagt. Het risico dat keyup afdekt (de focus verspringt tijdens
  keydown) speelt vandaag niet: geen `onPress` van deze drie verplaatst de focus. ⚠️ Dat is een aanname die met
  een nieuwe aanroeper kan vervallen.
- **Uitgeschakeld of bezig: niet activeren, wel `preventDefault`.** De focus kan op een vinkje blijven staan dat net
  bezig werd; ook dan mag de pagina niet scrollen.
- **Niet bij Ctrl, Alt of Meta, en niet tijdens IME-compositie** (sneltoetsen van het systeem). Shift+spatie wel,
  zoals bij een `<button>`.
- **De Schakelaar springt niet zelf om.** De helper roept alleen `onPress` aan; het scherm beslist of er eerst een
  bevestiging komt (domeinregel 5), net als bij een tik.

## Stijl

📏 Gemeten in dezelfde harnas, vóór en ná de reparatie, voor alle zes elementen: `tagName`, bounding box
(x, y, breedte, hoogte) en `display`, `padding`, `borderWidth`, `borderRadius`, `font`, `cursor`,
`backgroundColor`. **Byte-gelijk.** Het element blijft een `DIV`. De waarden staan als `STIJL_VOOR` in
`tests/browser/spatiebalk.test.ts`, en die test wordt rood als ze verschuiven (ijking M10).

⚠️ De harnas laadt geen lettertype (Times New Roman), dus de breedte van een `Choice`-knop is die van deze opzet en
niet die van de app.

## Toetsen

- `tests/browser/spatiebalk.test.ts`: Chromium via Playwright, met een harnas die vite bundelt
  (`tests/browser/bundel.ts`, `tests/browser/harnas/spatiebalk.tsx`). Per component: spatie wisselt `aria-checked`,
  teller op precies 1, `scrollY` 0; Enter wisselt, teller 1; ingedrukt gehouden spatie, teller 1; uitgeschakelde
  Schakelaar en bezige Afvinkcirkel doen niets en scrollen niet; Ctrl+spatie doet niets; rol en element blijven;
  de stijl van vóór.
- `tests/render/spatie.test.ts` (jsdom): de helper los, met de vormen die hij met rust moet laten, en per component
  dat een DOM-keydown de helper bereikt. **Dit is de helft die in CI draait.**

⚠️⚠️ **De browsertest draait niet in CI.** `playwright` is geen dependency; de cloudsessie heeft hem voorgeïnstalleerd,
de CI-runner niet, en de opdracht was niets te installeren. Zonder Playwright slaat de suite zich over met de melding
`ONGEMETEN`; met `BROWSER_TEST=1` faalt hij. Wat de browsertest bewaakt (scrollen, de echte toets, de stijl), is
buiten een cloudsessie dus **ongemeten**. Playwright als devDependency met Chromium in CI is een eigen afweging
(downloadgrootte, CI-duur) en is hier niet besloten.

## IJking

Met de hand, 23-11-2026, één mutatie tegelijk, de vier testbestanden samen (`tests/browser/spatiebalk.test.ts`,
`tests/render/spatie.test.ts`, `tests/render/stand-aria.test.ts`, `tests/render/keuzeknop.test.ts`). De uitslag is
wat er werkelijk omviel; `stand-aria` en `keuzeknop` bleven bij elke mutatie groen.

| # | mutatie | rood |
|---|---|---|
| M0 | de reparatie weg (de drie spreads) | 10: in de browser de drie spatietoetsen, de drie herhaaltoetsen en uitgeschakeld/bezig (de pagina scrolt); in jsdom de drie componenttoetsen. **De Enter-toetsen bleven groen.** |
| M1 | spread weg uit Choice | 3: browser spatie + herhaling Choice; jsdom Choice |
| M2 | idem Schakelaar | 3: browser spatie + herhaling Schakelaar; jsdom Schakelaar |
| M3 | idem Afvinkcirkel | 4: browser spatie + herhaling Afvinkcirkel, uitgeschakeld/bezig (scroll); jsdom Afvinkcirkel |
| M4 | `preventDefault` weg | 10: alle zes browser-spatie/herhaaltoetsen, uitgeschakeld/bezig; jsdom helper-spatie, helper-herhaling, Choice |
| M5 | `repeat`-controle weg | 4: de drie herhaaltoetsen in de browser; jsdom helper-herhaling |
| M6 | uitgeschakeld-controle weg | 4: browser uitgeschakeld/bezig; jsdom helper-herhaling, Schakelaar, Afvinkcirkel |
| M7 | helper reageert ook op Enter | 5: de drie Enter-toetsen in de browser (teller 2); jsdom Enter met rust, isSpatie |
| M8 | modifiercontrole weg | 2: browser Ctrl+spatie; jsdom isSpatie |
| M9 | Afvinkcirkel geeft `uit` door zonder `busy` | 2: browser uitgeschakeld/bezig; jsdom Afvinkcirkel |
| M10 | stijl verschoven (`marginLeft: 1` op de Choice-knop) | 1: browser stijl |
| M11 | `web` genegeerd in de helper | 1: jsdom "op native: niets" |

## Wat niet gemeten is

- **Native.** Geen apparaat of simulator. De helper geeft daar `{}` (getoetst in jsdom), en verder is aan native
  niets veranderd; wat een echte telefoon doet, is niet gemeten.
- **Andere browsers dan Chromium** (Firefox, Safari): niet gedraaid.
- **Echte schermlezers:** niet gedraaid. NVDA en VoiceOver sturen een spatie in bladermodus soms als klik in plaats
  van als toets; die weg loopt via `onClick` en is hier niet geraakt.
- **CI:** zie hierboven; de browsertest is daar ongemeten.

## Wat dit niet doet

- **Held (QS8-794) blijft een wisselknop.** Het besluit daar zegt dat een radio terug kan zodra er een eigen
  spatie-afhandeling is, getoetst in een browser. Die is er nu; Held terugzetten is een eigen besluit en is niet
  meegenomen.
- **Geen controle** die afdwingt dat een nieuwe component met rol radio, switch of checkbox de helper draagt. Vandaag
  zijn het er precies drie (grep op `accessibilityRole` in `src/` en `app/`).
