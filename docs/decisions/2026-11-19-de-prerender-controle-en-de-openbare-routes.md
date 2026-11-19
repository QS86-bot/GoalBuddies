# De prerender-controle en het besluit over de openbare routes (QS8-742)

Besloten 19-11-2026. Staat bovenop QS8-740 (de neutrale prerender): zonder die reparatie is de controle per definitie rood.

## Besluit 1 — het lege vlak op `/aanmelden` en `/uitnodiging/[code]` is geaccepteerd

Volgens de orchestrator (19-11-2026, antwoord van Quinten via AskUserQuestion in de sessie van de orchestrator; niet rechtstreeks aan de bouwsessie gegeven) is de prijs van QS8-740 geaccepteerd. Die prijs is gemeten in `docs/decisions/2026-11-19-de-prerender-is-neutraal-en-de-app-start-na-de-hydratie.md`: de twee openbare routes tonen tot de bundel binnen en gehydrateerd is alleen de achtergrondkleur (eerste zichtbare tekst ~60 ms vóór, ~280 ms na, ~1780 ms bij een bundel die 1500 ms te laat komt; lokaal).

Wat daarmee **besloten** is: de prerender van die routes blijft neutraal; er wordt geen Nederlandse prerender voor de openbare routes vastgezet. Wat **niet** besloten is: een grens aan de eerste-tekst-tijd, en een meting op een echte telefoon of netwerk (FCP/LCP). Wordt de tijd tot eerste tekst op een trage verbinding een klacht, dan is het besluit herzienbaar; dit document noemt de meting die erbij hoort.

## Besluit 2 — `prerender:controle` leest de uitvoer, niet de bron

`tests/beloftes/prerender-is-neutraal.test.ts` (QS8-740) leest `app/_layout.tsx` en bewaakt de plaats van de poort. 📏 Gemeten op een echte export: een tekst naast `<Shell />` (buiten `Shell`) laat die test groen (6 van 6) en brengt #418 terug. `scripts/prerender-controle.mjs` leest de geëxporteerde HTML en eist een lege body (zonder scripts, stijlen en commentaar) op elke pagina. Zelfde gedachte als `bundel:controle`: de bron is een plek, de export is de belofte.

- **"Geen tekst" in plaats van "dezelfde tekst in twee bouwtalen".** Een lege body is in elke taal gelijk, dus er is geen tweede bouw met een afwijkende `LANG` nodig; dat zou de kosten verdubbelen voor dezelfde uitspraak.
- **De zoekfunctie controleert zichzelf:** elke pagina moet een `<body` hebben en `index.html` en `aanmelden.html` moeten er zijn, anders is "geen tekst" een lege uitspraak (een halve of afgebroken `dist/`).
- **Zonder `dist/` is de uitslag `OVERGESLAGEN` (exit 0) en telt de poort hem als ongemeten**, niet als groen. Hij draait mee in `npm run poort` zodra er een `dist/` is.
- 📏 Geijkt op echte exports: vóór QS8-740 (`origin/main`) rood op de pagina's met tekst (mét de tekst in de melding); na QS8-740 groen op 36 pagina's; tekst naast `Shell` rood op 34 pagina's. Zie de kop van het script voor de volledige ijking.

## Wat dit niet doet, en wat Quinten nog moet beslissen

- **CI draait hem niet.** CI bouwt niet, en `expo export` kost minuten. Hij staat met reden in `ZONDER_CI` (`scripts/ci-controles.mjs`). Een exportstap in `.github/workflows/ci.yml` is een wijziging aan `.github/` en dus een besluit van Quinten met de volledige reviewset (`docs/PROMPT-SESSIE.md` §12c); die is hier **niet** gedaan. **Een grens is hiervoor één opgehoogd:** de toets 'is een uitzondering en geen tweede lijst' in `tests/scripts/ci-controles.test.ts` stond op minder dan 12 rijen in `ZONDER_CI`, nu minder dan 13. Het eerlijker alternatief (hem in CI laten draaien met `OVERGESLAGEN` en exit 0) laat `cidekking:controle` hem tellen als "draait in CI" terwijl hij daar niets meet: ongemeten als groen. De grens zakt weer zodra `ci.yml` een exportstap krijgt. Tot dan bewaakt alleen de poort, en alleen waar iemand eerst `npm run build` draait. **Wordt zwaarder als:** er iets buiten `Shell` tekst tekent vóór de hydratie (een provider met een laadtekst): de bron-test mist dat, CI mist het nu ook, en #418 komt dan stil terug tot iemand de poort met een `dist/` draait.
- Een attribuut (`aria-label`, `alt`) telt niet mee: #418 gaat over tekstknooppunten.
- Niet gemeten: een export met een afwijkende `LANG` in CI, Windows (`npm run build` op Quintens machine), en of `expo export` ooit een `<noscript>`-tekst in de body zet (dan wordt de controle rood en is een uitzondering een bewuste keuze).
