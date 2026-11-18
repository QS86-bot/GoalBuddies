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
2. **`isHuddledagOp()` toetst de tijdzone vooraf** (`isGeldigeTijdzone()` uit `shared/time`) en geeft bij een zone die dit toestel niet kent `false`, met één `reportError` per zone. Dat is een label bij een groep, geen berekening waar iets van afhangt. Elke andere fout wordt *niet* opgevangen en gaat naar de foutstaat; een brede `try/catch` zou een latere regressie in `shared/time` stil "niet vandaag" laten zeggen, en zou op het renderpad bij elke render een Sentry-event sturen (de eerste versie deed dat; verbeterd na de code-critic).
   ⚠️ **De database weigert zo'n zone** (trigger in 0119 toetst tegen `pg_timezone_names`), dus `Mars/Olympus` komt in productie niet voor. Wat wél kan: de database kent er meer (1196) dan `Intl` op een oudere Hermes of Safari (418, gemeten in de kop van 0119), dus een zone die het toestel van de maker kent kan op dat van een medelid onbekend zijn. Dat is een aanname en niet gemeten; de test gebruikt een onbekende zone als stand-in.
   ⚠️ **Dit beschermt alleen de lijstregel.** `app/groep/weekafsluiting/[id].tsx`, `app/groep/leden/[id].tsx` en `app/groep/chat/[id].tsx` rekenen de groepsperiode uit en hebben geen boundary: dezelfde zone geeft daar nog steeds een wit scherm zonder menu. (Een eerdere versie van dit document beweerde het tegendeel; dat was onjuist.)
3. **De lege groepentab draagt zelf de knop "Groep aanmaken"** (`AsyncView` kreeg een optionele `empty.action`). De knop onderaan verdwijnt alleen als de lijst geladen is en leeg (anders staan er twee); tijdens het laden en bij een fout blijft hij staan.
4. **Het menu is vijf knoppen** met rand, tikvlak van minstens 44 punten en 15 punten tekst. Rol `link` met `aria-current="page"` en niet `button`: het zijn bestemmingen met een adres (`Link` tekent een `<a href>`), en een schermlezer zegt dan "link, huidige pagina". Visueel is het een knop. Landmark `navigation` met label "Hoofdmenu". Alleen themakleuren (`panel`, `border`, `text`, `accent`); geen eigen kleur, geen heldkleur. Het actieve tabblad heeft naast de kleur een dikkere rand.
5. **Twee vormen, breekpunt 900 punten (`BREED_VANAF`).** Breed: kolom links van 220 breed, onder elkaar. Smal: rij bovenin die omslaat naar een tweede regel (gemeten: 390 breed geeft 4 + 1 knoppen). Bewust niet verticaal op een telefoon (vijf gestapelde knoppen kosten 230 punten hoogte op elk scherm) en niet scrollend (scrollen verbergt tabbladen, en een verborgen tabblad is precies de klacht). 900 omdat de inhoud 620 breed is en een kolom van 220 daarnaast 840 nodig heeft; een tablet rechtop (768) houdt de rij.
6. **Beginstand `bovenrand` en de echte breedte pas na het hydrateren** (`useSyncExternalStore` met server-snapshot). De webexport wordt vooraf getekend zonder venster.

## Wat dit niet is

- Geen oorzaak-voor-productie. Wat er bij Quinten gebeurde, is een aanname tot Sentry het toont.
- Geen boundary op alle 27 routes: alleen de vijf tabbladen en het groepsdetail. Een route zonder boundary valt terug op wat er vandaag is. Een vangnet als gewone React-boundary in de JSX van `RootLayout` om `<Stack>` (binnen de providers, dus mét thema; zie de bevinding van de code-critic) is niet gebouwd en wél de juiste volgende stap; het moet resetten op padwissel, anders is het menu in de foutstaat dood. **Vervolgissue.**
- Geen oplossing voor een fout in `Screen`, `Taakbalk` of het thema zelf: de foutstaat tekent dezelfde rand en gooit dan opnieuw. Alleen dat vangnet in de wortel dekt dat, en dan zonder menu.
- De herstelknop herlaadt het scherm; zit de fout in de data zelf, dan keert hij terug.

## Open vragen voor Quinten (niet beslist door de bouwsessie)

1. **Je vroeg knoppen onder elkaar; op een telefoon (390) en tablet (768) is het een rij van twee regels (~110 punten hoog).** Besluit 5 kiest dat als conservatieve vorm. Wil je de kolom ook op een telefoon, dan is dat één getal (`BREED_VANAF`) en een stijl, tegen de prijs van ~230 punten hoogte op elk scherm, óók in de groepschat met toetsenbord.
2. De laatste knop (Profiel) staat op 390 alleen op de tweede regel en rekt uit over de volle breedte.

## Twee dingen die onderweg gemeten zijn en niet van dit issue zijn

- 📏 **React #418 (hydratie) bij elke Nederlandstalige laadbeurt.** De statische export wordt in het Engels vooraf getekend; de client rendert Nederlands. Met `locale: 'en-US'` verdwijnt hij. Hij gaat via `globaal.fout` naar Sentry. Vervolgissue.
- `Link asChild` geeft een stijl-*functie* niet door aan de `<a>` (knoppen bleven 19 punten hoog) en een stijl-*array* ongeflattend door (`Failed to set an indexed property`, wit scherm op elk tabblad). `Taakbalk` flattent daarom een stijlobject.

## Grendels

`tests/beloftes/tabblad-foutstaat.test.ts`: elk bestand in `app/(tabs)/` exporteert de foutstaat; een onbekende zone is geen renderfout (en een geldige rekent nog); het breekpunt. Geijkt met de hand: export uit `lijst.tsx` halen geeft rood op de lijst-toets; de try/catch uit `isHuddledagOp()` halen geeft rood op de zone-toets; `BREED_VANAF` op 700 geeft rood op het breekpunt. Dat expo-router de export ook daadwerkelijk om de route zet is met Playwright gemeten en staat niet in CI.
