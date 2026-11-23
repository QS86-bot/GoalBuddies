# Een knop zegt zijn stand op web met een losse `aria-*`-eigenschap, nooit met `aria-selected` — QS8-803

**Datum:** 23-11-2026 · **Issue:** QS8-803 (vervolg op QS8-794)
**Raakt:** `src/shared/ui/keuze-aria.ts`, `Choice`, `Schakelaar`, `Afvinkcirkel`, `MeerKnop`, `Microfoon`, `Field`,
`DatumKeuze`, `src/schermen/instellingen/Instellingenscherm.tsx`; `Taakbalk` alleen een toets
**Status:** gebouwd. Licht risico, geen migratie, geen datamodel, geen auth.
**Bouwt op:** `docs/decisions/2026-11-23-een-gekozen-keuzeknop-is-een-wisselknop-of-een-radio.md` (QS8-794)

## Wat gemeten is

📏 Op de tak van QS8-794 (react-native-web 0.21 onder jsdom, de DOM gelezen en niet de props):

| prop op een `Pressable` | wat er in de DOM komt |
|---|---|
| `accessibilityState={{ selected / checked / expanded / busy }}` | **niets**, voor elke sleutel |
| `accessibilityState={{ disabled }}` + `disabled` | `aria-disabled="true"` (uit de `disabled`-prop) |
| losse `aria-checked`, `aria-expanded`, `aria-busy`, `aria-pressed` | staat erin |
| losse `aria-selected` op `role="button"` | staat erin, maar is daar geen geldige ARIA |
| `accessibilityRole="radio"`, `"switch"`, `"checkbox"` | `<div role="…">`, geen `<button>` |

QS8-794 had dit voor `selected` gevonden. Het geldt voor alle standen. De `Taakbalk` was op web al goed: hij zette
naast `accessibilityState` ook `aria-expanded` op de kop en `aria-current="page"` op het actieve tabblad.

## Besluit

**Eén vertaling, in `keuze-aria.ts`: `standEigenschappen(stand, web)`.** Native leest `state`, web leest `aria`.
`keuzeEigenschappen()` van QS8-794 blijft bestaan en geeft precies hetzelfde terug.

| component | wat het is | web | native (ongewijzigd) |
|---|---|---|---|
| `Choice` | radio in een radiogroup | `aria-checked` | `selected` |
| `Schakelaar` | switch | `aria-checked` | `checked` |
| `Afvinkcirkel` | checkbox, kan bezig zijn | `aria-checked`, `aria-busy` | `checked`, `busy` |
| `MeerKnop` | opent een menu | `aria-expanded` | `expanded` |
| `Microfoon` | luistert: aan of uit | `aria-pressed` | `busy` |
| `Field` (wachtwoord tonen) | wisselknop | `aria-pressed` | `selected` |
| `DatumKeuze` (dagvakje) | een gekozen dag in een rij knoppen | `aria-pressed` | `selected` |
| `Instellingenscherm` (lijstrij) | navigatie: elk onderdeel is een route | `aria-current="page"` | `selected` |
| `Taakbalk` | kop en tabbladen | `aria-expanded`, `aria-current="page"` (al zo) | ongewijzigd |

**De drie knoppen met een gekozen stand (Field, DatumKeuze, Instellingen) zijn besloten door de orchestrator
(23-11-2026, technische ARIA-keuze onder *Beslisbevoegdheid*, optie C):** de keuze is `aria-pressed`, de plek is
`aria-current`. Zo spreekt de app één taal: een tabblad en een instellingenonderdeel zijn allebei een plek.

⚠️ **Microfoon is een wisselknop, geen `aria-busy`** (orchestrator, optie A, na de review van de code-critic).
Het issue noemde `busy`. Maar `aria-busy="true"` betekent "dit element wordt nog bijgewerkt", en sommige
schermlezers stellen het voorlezen dan uit. Juist op dat moment wisselt het label naar "stop met inspreken". De
knop staat aan of uit, en daar is `aria-pressed` voor. **Niet gemeten in een echte schermlezer.** Native blijft
`accessibilityState.busy`. `aria-busy` blijft wel bij de `Afvinkcirkel`, die echt bezig is met opslaan.

⚠️ **`aria-selected` nergens.** Het komt in de DOM, maar op een knop of link zegt een schermlezer het niet. Een
test die er dan naar zoekt, is groen terwijl niemand iets hoort. `tests/render/stand-aria.test.ts` scant `src/`
en `app/` en wordt rood zodra een bestand `aria-selected` zet, of de verouderde `accessibilitySelected`, die
react-native-web 0.21 ook omzet naar `aria-selected` (gelezen in `createDOMProps`).

⚠️ **Op native verandert niets.** `accessibilityState` staat er nog precies zoals het stond, ook bij `Choice`
(`selected`, al zegt de vertaaltabel op web `checked`). Een native radio van `selected` naar `checked` zetten
verandert wat VoiceOver en TalkBack zeggen, en dat is hier niet te meten. Daarom gebruiken de componenten van de
helper alleen de `aria`-helft; `Button` (QS8-794) gebruikt beide helften. Dat betekent twee bronnen per knop die
uit elkaar kunnen lopen. Dat is een bewuste en bekende zwakte, en staat als ER-rij in de afleverreactie op QS8-803.

## Wat dit niet repareert

**De spatiebalk op `Choice`, `Schakelaar` en `Afvinkcirkel`.** Die worden op web een `<div role="…">`, en
react-native-web laat de spatie alleen door op een `<button>` of rol `button` (`isValidKeyPress`, gelezen in de
bron in QS8-794 voor een radio). Voor switch en checkbox is dat **afgeleid, niet gemeten**; in een echte browser is
geen van de drie gedraaid. Het zat al op `main` en wordt hier niet slechter. Eigen issue, besloten door de
orchestrator (optie A): QS8-804.

## Wat niet gemeten is

- **Native**: geen apparaat of simulator.
- **Echte schermlezers** (NVDA, VoiceOver, TalkBack): niet gedraaid. Gemeten is wat in de DOM staat.
- **Een echte browser**: jsdom. De DOM-attributen zijn dezelfde code (react-native-web), het toetsenbordgedrag niet.

## IJking

Met de hand, één mutatie tegelijk, en per mutatie is opgeschreven welke toets omviel. Zie de koppen van
`tests/render/stand-aria.test.ts` (A tot en met J2) en het blok QS8-803 in
`tests/render/instellingenpanelen.test.ts`. Elke mutatie gaf rood, en het rood viel op de toets die hem noemt.
