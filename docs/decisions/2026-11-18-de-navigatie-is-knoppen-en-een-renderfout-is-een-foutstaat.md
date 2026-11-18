# De navigatie is vijf knoppen en een renderfout op een tabblad is een foutstaat (QS8-705)

Besloten 18-11-2026 door een bouwsessie, naar aanleiding van een melding van Quinten tijdens het klikpad van QS8-634.

## Wat er gemeld werd

1. "Groep" in het menu en de knop "Naar mijn groepen" geven een volledig wit scherm.
2. Het menu is één lap kleine tekst; Quinten wil knoppen, onder elkaar.

## Wat gemeten is (en wat niet)

📏 Gemeten op een lokale webexport (`expo export --platform web`) met Playwright en gemockte REST-antwoorden, zonder inlog op productie:

| `groups` levert | resultaat vóór de reparatie |
|---|---|
| lege lijst | lege staat, scherm in orde |
| een groep | lijst in orde |
| HTTP 500 | foutstaat van `AsyncView`, in orde |
| een groep met een tijdzone die `Intl` niet kent | **`document.body` leeg**: `RangeError: Invalid time zone` uit `isHuddledagVandaag()` tijdens het renderen |
| een groep met een object waar een tekst hoort | idem (React #31) |

**Het mechanisme is gereproduceerd:** een fout tijdens het *tekenen* heeft nergens een vanger. `AsyncView` vangt een mislukte query, niet een gegooide renderfout, en er stond geen `ErrorBoundary` in `app/`. Elke renderfout op een tabblad laat dus het hele scherm leeg, inclusief menu.

**De trigger in productie is niet gemeten.** Productie is vanuit de cloudsessie niet bereikbaar (de proxy weigert de host) en er is bewust niet ingelogd. Dat "Naar mijn groepen" (`router.replace('/groep')`) hetzelfde scherm geeft, wijst op data-afhankelijkheid van dezelfde tabblad; een onbekende tijdzone is de enige trigger die ik echt heb kunnen laten gebeuren. Na de deploy zegt Sentry het: `reportError(…, 'tab.render')` meldt nu elke vangst met de foutnaam.

De service worker (`public/sw.js`) is alleen een pushontvanger en cachet niets; een verouderde bundel via de worker is daarmee uitgesloten. Of Hostinger of de browser een oude `index.html` serveert (QS8-139) is **ongemeten**.

## Besluiten

1. **Een `ErrorBoundary` per tabblad** (`export { TabFout as ErrorBoundary }` in elk bestand van `app/(tabs)/`) en op `app/groep/[id].tsx`.
   *Niet* één op `app/(tabs)/_layout.tsx`: die vervangt de hele navigator, en de menuknoppen in de foutstaat wijzen dan naar een router die zelf in de fout staat. Gemeten: met een boundary per tabblad werkt het menu in de foutstaat (klik op Doelen toont Doelen; terug op Groep toont de herstelknop weer). *Niet* op de wortel: `RootLayout` draagt zelf de providers, dus een fallback daar heeft geen thema en geen veilige zone.
   De foutstaat toont nooit `error.message` (zelfde reden als `AsyncView`) en meldt de fout, want een door React gevangen fout haalt `window.onerror` niet.
2. **`isHuddledagOp()` vangt een onbekende tijdzone** en geeft `false` (met `reportError`). Dat is een label bij een groep, geen berekening waar iets van afhangt. Elders (weekafsluiting, De Ketting) blijft een onbekende zone een fout, nu mét foutstaat. Dit raakt geen domeinregel 1: de berekening blijft in `shared/time`.
3. **De lege groepentab draagt zelf de knop "Groep maken"** (`AsyncView` kreeg een optionele `empty.action`). Met groepen blijft "Groep aanmaken" onderaan staan; zonder groepen niet, anders staan er twee.
4. **Het menu is vijf knoppen** met rand, tikvlak van minstens 44 punten en 15 punten tekst. Rol `link` met `aria-current="page"` en niet `button`: het zijn bestemmingen met een adres (`Link` tekent een `<a href>`), en een schermlezer zegt dan "link, huidige pagina". Visueel is het een knop. Landmark `navigation` met label "Hoofdmenu". Alleen themakleuren (`panel`, `border`, `text`, `accent`); geen eigen kleur, geen heldkleur. Het actieve tabblad heeft naast de kleur een dikkere rand.
5. **Twee vormen, breekpunt 900 punten (`BREED_VANAF`).** Breed: kolom links van 220 breed, onder elkaar. Smal: rij bovenin die omslaat naar een tweede regel (gemeten: 390 breed geeft 4 + 1 knoppen). Bewust niet verticaal op een telefoon (vijf gestapelde knoppen kosten 230 punten hoogte op elk scherm) en niet scrollend (scrollen verbergt tabbladen, en een verborgen tabblad is precies de klacht). 900 omdat de inhoud 620 breed is en een kolom van 220 daarnaast 840 nodig heeft; een tablet rechtop (768) houdt de rij.
6. **Beginstand `bovenrand` en de echte breedte pas na het hydrateren** (`useSyncExternalStore` met server-snapshot). De webexport wordt vooraf getekend zonder venster.

## Wat dit niet is

- Geen oorzaak-voor-productie. Wat er bij Quinten gebeurde, is een aanname tot Sentry het toont.
- Geen boundary op alle 27 routes: alleen de vijf tabbladen en het groepsdetail. Een route zonder boundary valt terug op wat er vandaag is.

## Twee dingen die onderweg gemeten zijn en niet van dit issue zijn

- 📏 **React #418 (hydratie) bij elke Nederlandstalige laadbeurt.** De statische export wordt in het Engels vooraf getekend; de client rendert Nederlands. Met `locale: 'en-US'` verdwijnt hij. Hij gaat via `globaal.fout` naar Sentry. Vervolgissue.
- `Link asChild` geeft een stijl-*functie* niet door aan de `<a>` (knoppen bleven 19 punten hoog) en een stijl-*array* ongeflattend door (`Failed to set an indexed property`, wit scherm op elk tabblad). `Taakbalk` flattent daarom een stijlobject.

## Grendels

`tests/beloftes/tabblad-foutstaat.test.ts`: elk bestand in `app/(tabs)/` exporteert de foutstaat; een onbekende zone is geen renderfout (en een geldige rekent nog); het breekpunt. Geijkt met de hand: export uit `lijst.tsx` halen geeft rood op de lijst-toets; de try/catch uit `isHuddledagOp()` halen geeft rood op de zone-toets; `BREED_VANAF` op 700 geeft rood op het breekpunt. Dat expo-router de export ook daadwerkelijk om de route zet is met Playwright gemeten en staat niet in CI.
