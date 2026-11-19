# Het vangnet in de wortel staat boven de providers en gebruikt er geen (QS8-710, punt 1)

Besloten 19-11-2026 door een bouwsessie, op uitdrukkelijk verzoek van Quinten om alleen dit punt van QS8-710 nu te bouwen (de andere drie wachten op de Sentry-uitslag van QS8-705, zoals zijn besluit op QS8-710 zei). De tak staat bovenop QS8-705 (`9c93729a`); de volgorde is dus eerst 705, dan 710.

## Wat QS8-705 liet liggen

`TabFout` vangt een renderfout op één tabblad, maar tekent `Screen` en dus `Taakbalk`. Gooit het probleem in `Screen`, `Taakbalk` of het thema, dan valt de foutstaat zelf om en blijft er niets over. Daarnaast hebben ~26 routes geen boundary (weekafsluiting, groepschat, ledenlijst, `groep/beheer/[id]`). Zie ER-rij 1 en 2 van QS8-705 en de bevindingen van de code-critic.

## Besluit

1. **Een React-klasse (`RootVangnet`) boven alles in `app/_layout.tsx`**: buiten `SafeAreaProvider`, `ThemeProvider`, `SessionProvider` en `ProfielProvider`. Het is een gewone klasse met `getDerivedStateFromError`.
   ⚠️ **Een `ErrorBoundary`-export op `_layout` was ook mogelijk geweest en zou óók boven de providers hebben gestaan**: expo-router wikkelt het routebestand zelf in `Try` (`useScreens.js`, nagelezen door de code-critic van QS8-705), dus de hele `RootLayout` zit eronder. Een eerdere versie van dit document beweerde dat de export niet kon; dat was onnauwkeurig. De klasse is gekozen om andere redenen: de reset op padwissel, de rapportage en de foutstaat staan in één eigen, toetsbare module, terwijl `retry` van `Try` alleen de foutstand wist en niet op een padwissel reset. Niet gemeten: of de export-vorm hetzelfde had opgeleverd.
2. **De foutstaat gebruikt niets wat kan breken.** Geen `Screen`, `Taakbalk`, `Heading`, `Body`, `Button` (die lezen allemaal `useTheme()`), geen `useSafeAreaInsets`, geen sessie. Kleuren uit `themeFor(Appearance.getColorScheme())`, dus de **systeemvoorkeur en niet de gekozen themavoorkeur** van de gebruiker: die leeft in de provider die hier niet mag bestaan. Dat is de prijs van "kan niet breken", en hij is klein, want dit scherm staat er alleen als er iets stuk is. Alleen tokens uit `tokens.ts`, geen eigen kleuren.
3. **Reset op padwissel** met het pad (`usePathname()`) als sleutel, via `getDerivedStateFromProps`. Dezelfde sleutel houdt de foutstaat vast, anders verdwijnt hij bij elke render van de ouder en gooit het kind meteen weer: een lus. De beslissingen staan in een pure module (`src/shared/ui/vangnet.ts`); de klasse zelf wordt in de test rechtstreeks aangeroepen met een `react-native`-stub (zoals `src/modules/auth/servermelding.test.ts`). Een eerdere versie van dit document en van `vangnet.ts` beweerde dat een unit-test `react-native` niet kan laden; dat was onwaar.
   **`usePathname()` staat in een wrapper (`PadVangnet`) en niet in `RootLayout`**: anders maakt elke navigatie daar een nieuw kindelement en renderen alle providers, `Shell` en `Stack` mee (code-critic).
4. **Eén knop: "Naar het beginscherm"**, niet "Opnieuw proberen". Gemeten: de knop remount de boom en de navigator start dan op de beginroute (Vandaag), niet op het scherm waar het misging. Het label zegt wat hij doet. Waarom de navigator zo herstart is afgeleid (React Navigation ruimt de state van een geneste navigator op bij het unmounten) en niet in de bron van `@react-navigation` nagelezen.
5. **`TabFout` blijft.** Een route met een eigen boundary vangt eerst; dit vangnet krijgt wat daardoorheen valt of waar geen boundary is. Eén vanger vervangt de ander niet.
6. De fout gaat naar `reportError(…, 'root.render', { componentStack })` (afgekapt op 1000 tekens). Nooit `error.message` op het scherm. Geen `fontFamily`: `fontSans` is een CSS-stack en de enige `fontFamily` in de app; `Button` en `Text` zetten er ook geen.

## Gemeten (19-11-2026, lokale webexport, Playwright, gemockte REST)

Met een opzettelijke fout in `Taakbalk` (na het meten teruggezet), `pushState` + `popstate` binnen de app en dus geen `page.goto`:

- **Fout alleen op `/doelen`:** `/doelen` toont "De app kon niet verder" met herstelknop en `root.render` is gemeld. Vóór dit besluit was het een wit scherm: de tab-foutstaat tekent `Taakbalk` en viel zelf om. Vanuit die foutstaat haalt een padwissel naar `/lijst` (zonder op de knop te drukken) het gewone scherm terug.
- **Fout op elke route** (de aanleiding van het issue): de foutstaat blijft op elke route staan, er is geen lus, en het aantal `root.render`-meldingen is **2 bij het laden** (de sleutel wisselt eenmaal van `/` naar het echte pad), daarna **1 per padwissel** en 1 per tik op de knop (2, 3, 4, 5 gemeten). Een kind dat blijft gooien, geeft dus een melding per ander pad en niet per render.

## Wat dit niet is, en wat niet gevangen wordt

- **Niet** punt 2 (hydratiefout #418), 3 (ingang naar `/meldingen`) of 4 (naam van de groepentab); die staan nog open op QS8-710, op Quintens besluit.
- **Wel gevangen:** een renderfout in `ThemeProvider`, `SessionProvider`, `ProfielProvider`, `Shell`, de wachters, `Stack`, `Screen`, `Taakbalk`, `TabFout` en elke route zonder eigen boundary. (Een eerdere versie van dit document zei dat een fout in `ThemeProvider` of in de eerste render niet gevangen werd; dat klopte niet, en `_layout.tsx` en de commit zeiden het tegendeel.)
- **Niet gevangen:** een fout bij het laden van een module (`setErrorSink`, `clientEnv()` op topniveau in `_layout.tsx`), een fout in een effect of een promise, en een fout in `index.html` of de bundel zelf.
- **Het vangnet toont een vaste foutstaat zonder menu:** de Stack is dan weg. De knop brengt de app naar het beginscherm; blijft dat misgaan, dan is de weg een herstart.
- **Gat in de rapportage:** `TabFout` meldt in een `useEffect`. Gooit `TabFout` zelf een andere fout, dan commit dat effect nooit en komt alleen de tweede fout als `root.render` in Sentry; de eerste, de oorzaak, wordt nooit gemeld. Is het dezelfde fout (de gemeten `Taakbalk`-casus), dan is er geen gat. **Wordt zwaarder als:** een fout in de tab-laag vaak samenvalt met een tweede fout in `Screen` of het thema.
- **Ongemeten:** native (splash: `Try` roept `SplashScreen.hideAsync()` aan en dit vangnet niet; niemand gebruikt `preventAutoHideAsync`, maar op native is het niet gemeten), VoiceOver bij `accessibilityRole="alert"`, en pressed- en focusstijl op de knop (`Button` heeft die, deze knop niet). Een wissel van alleen de zoekparameters reset niet (`pathname` laat de query weg).
- Een render-test in CI bestaat niet (geen renderer in dit project). De klasse wordt in `tests/beloftes/root-vangnet.test.ts` zonder renderer aangeroepen; dat React hem zo aanroept is met Playwright gemeten.

## Grendels

`tests/beloftes/root-vangnet.test.ts` (12 toetsen): de pure beslissingen, de klasse zelf (`getDerivedStateFromError`, `getDerivedStateFromProps`, `render`, `componentDidCatch`, de knop) met een `react-native`-stub, en de aansluiting (het vangnet staat boven alle providers, `usePathname` zit in de wrapper, en alle `from`-specifiers van `RootVangnet.tsx`, ook meerregelige en barrels, zijn onschuldig). Geijkt met de hand, één mutatie per grendel (hernoemde `getDerivedStateFromError`, omgekeerde `render`, `getDerivedStateFromProps` altijd `null`, een meerregelige import van `Screen`, een import uit `./index`, een import van de barrel `../theme`, `reportError` weg, `PadVangnet` binnen `ThemeProvider`, `naPadwissel` nooit en altijd resetten): telkens viel de bedoelde toets om. Eerste versie: de code-critic liet zien dat een typfout in `getDerivedStateFromError` alles groen liet; dat is de reden voor deze opzet.
