# De prerender is neutraal en de app start na de hydratie (QS8-740)

Besloten 19-11-2026 door een bouwsessie, naar aanleiding van QS8-710 punt 2 (React-fout #418 bij Nederlandstalige laadbeurten). Afgesplitst als eigen issue op verzoek van de orchestrator namens Quinten en door de gebruiker van de QS8-705-sessie bevestigd.

## Wat gemeten is

📏 Lokale webexport, Playwright, 19-11-2026. De fout is niet "Nederlandstalige laadbeurten" maar **een verschil tussen de taal van de prerender en de taal van de client**:

| bouwmachine | client | #418 |
|---|---|---|
| en-US | nl-NL | 2 |
| en-US | en-US | 0 |
| nl-NL | nl-NL | 0 |
| nl-NL | en-US | 2 |

De oorzaak: `app/_layout.tsx` roept op moduleniveau `zetTaalUitApparaat(apparaatVoorkeuren())` aan. Tijdens `expo export` draait dat in Node, en Node heeft sinds v21 een globale `navigator` waarvan `language` de `LANG` van de machine volgt (gemeten: `LANG=nl_NL.UTF-8` geeft `nl-NL`, anders `en-US`). De prerender bevat bovendien de volledige tekst van het uitgelogde Vandaag-scherm, in de taal van de bouwmachine; `+html.tsx` zet `lang="nl"` vast, ook als de tekst Engels is.

**Wat dat betekent voor productie, en wat niet gemeten is:** `npm run deploy` draait op Quintens machine, dus de prerender in productie staat in de taal van **zijn** `LANG`. Dat is niet vanuit deze sessie vast te stellen (productie is niet bereikbaar). Is het `nl`, dan hebben Nederlandstalige bezoekers geen #418 en alleen Engelstalige. Hoe dan ook hangt de uitvoer van een deploy af van de machine waarop hij draait, en dat is het eigenlijke defect.

## Besluit

1. **Tot de hydratie klaar is, tekent `Shell` alleen de achtergrond.** `useGehydrateerd()` (`useSyncExternalStore` met server-snapshot `false`) geeft `false` op de server en bij de eerste clientronde, daarna `true`. De wachters en de `Stack` staan erachter. Server en eerste clientronde zijn dus identiek en kunnen niet verschillen; daarna tekent de client gewoon, zonder hydratie. Gemeten: `<body>` van de export bevat geen tekst, en #418 is 0 in 12 van 12 combinaties (3 paden × 2 bouwtalen × 2 clienttalen).
2. **Niet gekozen: de prerender vastzetten op Nederlands.** Dat lost het voor Nederlandstalige clients op elke machine op, maar Engelstalige clients behouden #418 en een flits van Nederlandse (uitgelogde) schermtekst. Ook niet: de taal pas na het mounten zetten met een hertekening, want de taal is een procesbrede variabele en geen state (zie `profiel.tsx` bij `TaalInstelling`): zonder abonnementsmechanisme blijven schermen in de oude taal staan.
3. **Wat dit kost:** tot de eerste clientronde na de hydratie (milliseconden na het laden van het script) staat er alleen de achtergrondkleur in plaats van een uitgelogd scherm. Dat scherm hoort een bezoeker niet te zien: de routewacht stuurt hem naar aanmelden. Er is geen zoekmachine- of deellinkvoordeel verloren dat de app gebruikt: alles zit achter inloggen, er staan nergens `og:`- of `<Head>`-tags in `app/` en `src/` (gegrept), en de prerender van `/uitnodiging/[code]` is een schil zonder code erin (de body bevatte vóór en na deze wijziging geen uitnodigingsspecifieke tekst; gemeten op `uitnodiging/[code].html`, 0 `og:`-tags). Een linkvoorbeeld voor uitnodigingen (QS8-706) hangt dus niet van deze prerender af en moet een eigen oplossing krijgen.
4. **Geen wijziging aan de taalkeuze van de gebruiker.** `zetTaalUitApparaat` en `ProfielProvider` blijven zoals ze waren.

## Gemeten dat de app zelf nog werkt

Ingelogd (gemockte REST, Playwright): `/groep` met lege, gevulde en falende lijst; deep links `/doelen`, `/groep/<id>`, `/profiel`; menu en lege-staatknop; geen console-fouten behalve de bedoelde 500 in het foutgeval, en geen `#418`.

## Wat dit niet is, en wat niet gemeten is

- Niet `html lang`: `+html.tsx` zet `lang="nl"` vast, dus een Engelstalige gebruiker krijgt Engelse tekst onder een Nederlands taalattribuut (schermlezers lezen Engels met een Nederlandse stem). Gemeten in de matrix (`html lang=nl` bij client `en-US`), niet gerepareerd: dat vraagt een taalwissel van `document.documentElement.lang` bij start en bij profielwissel. **Vervolgissue.**
- Niet gemeten: native (het `useSyncExternalStore`-pad is hetzelfde, maar op native is er geen prerender, dus er verandert niets), productie, en of een andere route dan de gemeten drie iets van de prerender nodig had.
- Geen CI-grendel op de prerender zelf (geen DOM, en een export in CI vraagt een eigen controle). `tests/beloftes/prerender-is-neutraal.test.ts` bewaakt de serverhelft van de hook en de aansluiting in `Shell`. **Wordt zwaarder als:** er buiten `Shell` iets bij komt dat tekst tekent vóór de hydratie (een provider met een laadtekst, een `Text` in `RootLayout`); dan is een `prerender:controle` die `index.html` op tekst in de body toetst de volgende stap.
