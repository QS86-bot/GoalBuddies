# De prerender-controle en het besluit over de openbare routes (QS8-742)

Besloten 19-11-2026. Staat bovenop QS8-740 (de neutrale prerender): zonder die reparatie is de controle per definitie rood.

## Besluit 1 — het lege vlak op `/aanmelden` en `/uitnodiging/[code]` is geaccepteerd

Volgens de orchestrator (19-11-2026, antwoord van Quinten via AskUserQuestion in de sessie van de orchestrator; niet rechtstreeks aan de bouwsessie gegeven) is de prijs van QS8-740 geaccepteerd. Die prijs is gemeten in `docs/decisions/2026-11-19-de-prerender-is-neutraal-en-de-app-start-na-de-hydratie.md`: de twee openbare routes tonen tot de bundel binnen en gehydrateerd is alleen de achtergrondkleur (eerste zichtbare tekst ~60 ms vóór, ~280 ms na, ~1780 ms bij een bundel die 1500 ms te laat komt; lokaal).

Wat daarmee **besloten** is: de prerender van die routes blijft neutraal; er wordt geen Nederlandse prerender voor de openbare routes vastgezet. Wat **niet** besloten is: een grens aan de eerste-tekst-tijd, en een meting op een echte telefoon of netwerk (FCP/LCP). Wordt de tijd tot eerste tekst op een trage verbinding een klacht, dan is het besluit herzienbaar; dit document noemt de meting die erbij hoort.

## Besluit 2 — `prerender:controle` leest de uitvoer, niet de bron

`tests/beloftes/prerender-is-neutraal.test.ts` (QS8-740) leest `app/_layout.tsx` en bewaakt de plaats van de poort. 📏 Gemeten op een echte export: een tekst naast `<Shell />` (buiten `Shell`) laat die test groen (6 van 6) en brengt #418 terug. `scripts/prerender-controle.mjs` leest de geëxporteerde HTML en eist een lege body (zonder scripts, stijlen en commentaar) op elke pagina. Zelfde gedachte als `bundel:controle`: de bron is een plek, de export is de belofte.

- **"Geen tekst" in plaats van "dezelfde tekst in twee bouwtalen".** Een lege body is in elke taal gelijk, dus er is geen tweede bouw met een afwijkende `LANG` nodig; dat zou de kosten verdubbelen voor dezelfde uitspraak.
- **De controle controleert zichzelf op drie manieren:** elke pagina heeft een `<body` en `index.html` en `aanmelden.html` zijn er; een kanarie (`zichtbareTekst()` moet tekst vinden op een vaste pagina waar die staat); en de bouw mag niet ouder zijn dan de bron.
- **Een oude `dist/` is ongemeten, niet groen** (code-critic, QS8-742). `npm run deploy` laat `dist/` in de repo staan; zonder de ouderdomscheck meldde de poort dan "geen tekst" over de bouw van maandag. Is `app/` of `src/` nieuwer dan `dist/index.html`, dan is de uitslag `OVERGESLAGEN` met de leeftijd erbij. Alleen "bestaat niet" heet zo; elke andere leesfout gooit. (`bundel-controle.mjs` heeft dit gat ook; niet aangeraakt.)
- **Zonder `dist/` is de uitslag `OVERGESLAGEN` (exit 0) en telt de poort hem als ongemeten**, niet als groen. Hij draait mee in `npm run poort` zodra er een verse `dist/` is.
- 📏 Geijkt op echte exports: vóór QS8-740 (`origin/main`) **rood op 32 van de 36 pagina's** (de andere vier hebben in die bouw een lege body), mét de Engelse tekst van de bouwmachine in de melding; na QS8-740 **groen op 36**; een tekst naast `Shell` **rood op 34 van de 36**. Zie de kop van het script voor de volledige ijking.
- **Twee pagina's meten niets:** `+not-found.html` en `_sitemap.html` worden zonder `RootLayout` geprerenderd (alleen `<div id="root"><div></div></div>`) en zijn altijd groen. "36 pagina's" betekent dus 34 die er iets over zeggen.

## Besluit 3 — de deploy draait dezelfde controle (de derde weg)

De eerste versie kende twee wegen: de controle niet in CI (alleen de poort) of in CI met `OVERGESLAGEN`. De code-critic wees op een derde: `npm run deploy` (`scripts/deploy-web.mjs`) bouwt **altijd** vers en draait al controles op dat artefact (geheimenscan, DSN, source maps). `eisEenNeutralePrerender()` draait nu direct na de geheimenscan en vóór er iets geüpload wordt, en breekt de deploy af als er tekst in een body staat (`Er is niets geüpload`). Dat is het pad waar #418 ontstond: de bouwmachine van Quinten met zijn `LANG`. Het raakt `.github/` niet.

- Gemeten op echte exports: de schone export laat de deploy door; een tekst naast `Shell` en de export van `main` zonder reparatie breken hem af, met pagina en tekst in de melding.
- **Prijs:** een valse positief houdt een deploy tegen (bijvoorbeeld een `<noscript>`-tekst na een Expo-upgrade, of een taalonafhankelijke merknaam). De melding noemt de pagina en de tekst; een bewuste uitzondering is dan een aanpassing aan de controle, niet een omzeiling van de deploy.
- Niet gemeten: een echte deploy (`npm run deploy:droog` vraagt de bouw en `.env`); alleen de stap zelf tegen echte exports en de plaats in `main()` uit de bron.

## Wat dit niet doet, en wat Quinten nog moet beslissen

- **CI draait hem niet.** CI bouwt niet, en `expo export` kost minuten. Hij staat met reden in `ZONDER_CI` (`scripts/ci-controles.mjs`). Een exportstap in `.github/workflows/ci.yml` is een wijziging aan `.github/` en dus een besluit van Quinten met de volledige reviewset (`docs/PROMPT-SESSIE.md` §12c); die is hier **niet** gedaan. **Een grens is hiervoor één opgehoogd:** de toets 'is een uitzondering en geen tweede lijst' in `tests/scripts/ci-controles.test.ts` stond op minder dan 12 rijen in `ZONDER_CI`, nu minder dan 13. Het eerlijker alternatief (hem in CI laten draaien met `OVERGESLAGEN` en exit 0) laat `cidekking:controle` hem tellen als "draait in CI" terwijl hij daar niets meet: ongemeten als groen. De grens zakt weer zodra `ci.yml` een exportstap krijgt. Wat live gaat wordt sinds besluit 3 wél getoetst (de deploy); wat in een PR staat nog niet. **Wordt zwaarder als:** er iets buiten `Shell` tekst tekent vóór de hydratie (een provider met een laadtekst) en niemand de poort met een verse `dist/` draait: de bron-test mist dat, CI mist het, en pas `npm run deploy` houdt het tegen.
- **"Geen tekst" is een goede maatstaf maar geen volledige.** #418 ontstaat in React 19 ook door een verschil in *structuur* zonder tekst (`{taal === 'en' && <View />}` vóór de poort): de body blijft dan leeg en de controle groen. Taalonafhankelijke tekst maakt hem juist rood zonder #418. Een attribuut (`aria-label`, `alt`) telt niet mee: dat geeft geen #418, al blijft een verschil in attributen bij de hydratie staan (React 19 herstelt het in productie niet; niet gemeten).
- Niet gemeten: een export met een afwijkende `LANG` in CI, Windows (`npm run build` op Quintens machine), en of `expo export` ooit een `<noscript>`-tekst in de body zet (dan wordt de controle rood en is een uitzondering een bewuste keuze).
