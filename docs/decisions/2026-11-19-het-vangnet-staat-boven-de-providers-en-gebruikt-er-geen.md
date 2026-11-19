# Het vangnet in de wortel staat boven de providers en gebruikt er geen (QS8-710, punt 1)

Besloten 19-11-2026 door een bouwsessie, op uitdrukkelijk verzoek van Quinten om alleen dit punt van QS8-710 nu te bouwen (de andere drie wachten op de Sentry-uitslag van QS8-705, zoals zijn besluit op QS8-710 zei). De tak staat bovenop QS8-705 (`9c93729a`); de volgorde is dus eerst 705, dan 710.

## Wat QS8-705 liet liggen

`TabFout` vangt een renderfout op één tabblad, maar tekent `Screen` en dus `Taakbalk`. Gooit het probleem in `Screen`, `Taakbalk` of het thema, dan valt de foutstaat zelf om en blijft er niets over. Daarnaast hebben ~26 routes geen boundary (weekafsluiting, groepschat, ledenlijst, `groep/beheer/[id]`). Zie ER-rij 1 en 2 van QS8-705 en de bevindingen van de code-critic.

## Besluit

1. **Een React-klasse (`RootVangnet`) boven alles in `app/_layout.tsx`**: buiten `SafeAreaProvider`, `ThemeProvider`, `SessionProvider` en `ProfielProvider`. Het is een gewone klasse met `getDerivedStateFromError`.
   ⚠️ **Een `ErrorBoundary`-export op `_layout` was ook mogelijk geweest en zou óók boven de providers hebben gestaan**: expo-router wikkelt het routebestand zelf in `Try` (`useScreens.js`, nagelezen door de code-critic van QS8-705), dus de hele `RootLayout` zit eronder. Een eerdere versie van dit document beweerde dat de export niet kon; dat was onnauwkeurig. De klasse is gekozen om andere redenen: de reset op padwissel, de rapportage en de foutstaat staan in één eigen, toetsbare module, terwijl `retry` van `Try` alleen de foutstand wist en niet op een padwissel reset. Niet gemeten: of de export-vorm hetzelfde had opgeleverd.
2. **De foutstaat gebruikt niets wat kan breken.** Geen `Screen`, `Taakbalk`, `Heading`, `Body`, `Button` (die lezen allemaal `useTheme()`), geen `useSafeAreaInsets`, geen sessie. Kleuren uit `themeFor(Appearance.getColorScheme())`, dus de **systeemvoorkeur en niet de gekozen themavoorkeur** van de gebruiker: die leeft in de provider die hier niet mag bestaan. Dat is de prijs van "kan niet breken", en hij is klein, want dit scherm staat er alleen als er iets stuk is. Alleen tokens uit `tokens.ts`, geen eigen kleuren.
3. **Reset op padwissel** met het pad (`usePathname()`) als sleutel, via `getDerivedStateFromProps`. Dezelfde sleutel houdt de foutstaat vast, anders verdwijnt hij bij elke render van de ouder en gooit het kind meteen weer: een lus. Plus een knop "Opnieuw proberen". De beslissingen staan in een pure module (`src/shared/ui/vangnet.ts`), want de klasse importeert `react-native` en dat kan een unit-test hier niet laden.
4. **`TabFout` blijft.** Een route met een eigen boundary vangt eerst; dit vangnet krijgt wat daardoorheen valt of waar geen boundary is. Eén vanger vervangt de ander niet.
5. De fout gaat naar `reportError(…, 'root.render', { componentStack })` (afgekapt op 1000 tekens). Nooit `error.message` op het scherm.

## Gemeten (19-11-2026, lokale webexport, Playwright, gemockte REST)

Met een opzettelijke fout in `Taakbalk` (alleen op `/doelen`, na het meten teruggezet):

- `/doelen` toont "De app kon niet verder" met herstelknop, en `root.render` is gemeld. Vóór dit besluit was dit een wit scherm: de tab-foutstaat tekent `Taakbalk` en viel zelf om.
- Vanuit die foutstaat een padwissel naar `/lijst` (zonder op de knop te drukken) toont het gewone scherm weer.
- "Opnieuw proberen" op dezelfde route bracht de app naar Vandaag; dat is een eigenschap van de remount van de navigator na een fout in de eerste render, en niet iets wat dit besluit bedoelde. Het is gemeten, niet verklaard.

## Wat dit niet is

- **Niet** punt 2 (hydratiefout #418), 3 (ingang naar `/meldingen`) of 4 (naam van de groepentab); die staan nog open op QS8-710, op Quintens besluit.
- Geen vervanging van een fout in `ThemeProvider` of in de allereerste render van de navigator: wat het vangnet boven die providers vangt, is een renderfout, geen fout in `index.html`, het script of de bundel zelf.
- Het vangnet toont een vaste foutstaat zonder navigatie: de Stack is dan weg, dus er is geen menu. De weg terug is de browserknop of een herstart; de tekst zegt dat.
- Een render-test in CI bestaat niet (geen renderer in dit project). `tests/beloftes/root-vangnet.test.ts` bewaakt de beslissingen en de aansluiting (boven alle providers, geen verboden imports); dat React de klasse zo aanroept is met Playwright gemeten.

## Grendels

`tests/beloftes/root-vangnet.test.ts` (8 toetsen). Geijkt met de hand, één mutatie per grendel: nooit resetten, altijd resetten, `gevangen: false`, het vangnet binnen `ThemeProvider`, `Screen` importeren in `RootVangnet.tsx`, `naPadwissel` uit de klasse halen: telkens viel precies de bedoelde toets om.
