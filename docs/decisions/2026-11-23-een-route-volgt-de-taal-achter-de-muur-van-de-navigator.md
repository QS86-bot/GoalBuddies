# Een route volgt de taal, ook achter de muur van de navigator

**Datum:** 23-11-2026
**Issue:** QS8-796 (F1 en F2 uit de Engelse doorloop van QS8-143; opdracht van de orchestrator van week 48, logboek QS8-785)
**Status:** gebouwd, gemeten op een lokale webexport met een nagebootste Supabase in de browser; niet op productie
**Raakt:** `src/shared/i18n/index.ts`, `src/shared/i18n/react.ts` (nieuw), elke route in `app/` (43 bestanden, één regel en één import), drie testbestanden

## 1. De oorzaak, gemeten

De taal is een procesbrede variabele in `shared/i18n` (QS8-113), en dat blijft
zo: `t()` draait ook in de datalaag en in schema's. Er was alleen geen bericht
als ze veranderde. Een route rendert opnieuw als iets wat hij **zelf** leest
verandert, en de navigator verpakt elke route in een `StaticContainer`
(`expo-router/build/react-navigation/core/StaticContainer.js`). Die laat een
render van bovenaf niet door, want hij vergelijkt alleen zijn eigen props.

- **F1.** `TaalInstelling` zet de taal en daarna het profiel. Wat `useProfiel()`
  leest (het paneel) rendert opnieuw; de route `app/instellingen/[onderdeel].tsx`
  leest het profiel niet en houdt zijn titel en het label van de terugknop.
- **F2.** `_layout.tsx` zet bij het laden de apparaattaal. `ProfielProvider`
  zet daarna de profieltaal. Alleen een route die `useProfiel()` leest, rendert
  opnieuw. `/groep/nieuw` doet dat niet en blijft in de apparaattaal staan.
  Op het profiel en de vragenlijst ging het *gedeeltelijk* mis, omdat daar
  alleen het deel dat het profiel leest opnieuw rendert.

📏 Gemeten op een webexport van `main` (`10116ee3`), apparaat `en-US` en profiel
`nl`, `/groep/nieuw` direct geladen: `html lang="nl"`, en de body is helemaal
Engels (*"New group"*, *"Huddle day"*). In de andere richting is het precies
andersom. Na een wissel van `nl` naar `en` op `/instellingen/voorkeuren`: het
paneel *"Language"*, de kop *"Taal en tijd"* en *"← Instellingen"*. Na de
reparatie zijn alle vier de gevallen in één taal.

## 2. De keuze: elke route abonneert zich, en geen herstart van de boom

`abonneerOpTaal()` in `shared/i18n` meldt een wissel, maar alleen een échte
wissel: het profiel zet bij elke lading dezelfde taal nog eens. `useVolgTaal()`
in `shared/i18n/react.ts` is `useSyncExternalStore` daarop, en elke route roept
hem als eerste regel aan. Een abonnee rendert opnieuw, ook achter de muur.

Afgewezen:

- **`key={taal}` op de `Stack`.** Dat laat de navigator opnieuw beginnen. De
  navigatiestatus van een navigator wordt bij het weghalen opgeruimd
  (`useNavigationBuilder`), dus wie op "Taal en tijd" een taal kiest, kan op het
  beginscherm uitkomen. Niet gemeten, wel in de code gelezen. Dat risico is te
  groot voor een reparatie van tekst.
- **Een `key` per scherm via `screenLayout`.** Dan wordt alleen het scherm
  opnieuw opgebouwd, maar de groep `(tabs)` is zelf een navigator, en die zou zijn
  tabstand verliezen. Bovendien gaat de invoer van een formulier verloren.
- **De `Stack` pas tekenen als het profiel binnen is.** Dat lost alleen F2 op,
  en het vertraagt elke start met de duur van de profielquery.
- **De hook in `Screen`.** `Screen` krijgt zijn titel als prop van de route.
  Als `Screen` opnieuw rendert, blijft die prop de oude tekst.

De prijs is één regel per route. `tests/beloftes/route-volgt-de-taal.test.ts`
maakt van die regel een eis, ook voor een route die er later bij komt. De
uitzondering is `app/+html.tsx`, en die staat met haar reden in het register.

⚠️ **Wat dit niet dekt.** Een component dat een vertaalde tekst in `useState` of
`useMemo` vastzet, blijft staan. 📏 Bij dit issue staat dat nergens in `app/` of
`src/` (gegrept op `useState(t(`, `useState(() => t(` en `useMemo` met `t(`).
Ook een `React.memo` blokkeert de render; dat komt in `app/` en `src/` niet voor.

## 3. Wat de prerender en `html lang` doen

Er verandert niets aan de neutrale prerender van QS8-740/742. Vóór de hydratie
tekent `Shell` niets wat van de taal afhangt. De server-snapshot van
`useVolgTaal()` is dezelfde lezer, en die waarde bepaalt daar geen tekst.

📏 `prerender-controle` op de nieuwe export: 48 pagina's, geen tekst in een body.
📏 Een probe met Playwright laadt 16 routes direct, smal met apparaat `en-US` en
profiel `nl`, en breed met apparaat `nl-NL` en profiel `en`: 32 keer geladen,
0 keer #418, vóór en na de reparatie. De probe is geijkt met een export die
`t('nav.terug')` buiten de poort van `Shell` tekent, gebouwd met `LANG=nl_NL`.
Die geeft 16 keer #418 op 32, precies de laadbeurten met een Engels apparaat.
`html lang` volgt de profieltaal in alle gemeten gevallen. Dat deed het al
vóór de reparatie (QS8-741) en het doet het nog steeds.

## 4. Aannames

- **Native is niet gemeten.** Het mechanisme (`StaticContainer`,
  `useSyncExternalStore`) is op elk platform hetzelfde, maar er is geen toestel
  gebruikt.
- **De Supabase van de meting is nagebootst** in de browser (Playwright
  `route()`). Het profiel, de sessie en de opslag van de taal zijn echt in vorm,
  maar niet tegen een echte database.
