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

1. **Tot de hydratie klaar is, tekent `Shell` alleen de achtergrond.** `useGehydrateerd()` (`useSyncExternalStore` met server-snapshot `false`) geeft `false` op de server en bij de eerste clientronde, daarna `true`. De wachters en de `Stack` staan erachter. Server en eerste clientronde zijn dus identiek in tekst en structuur, en een verschil daarin kan niet ontstaan; daarna tekent de client gewoon, zonder hydratie. (Attributen zoals de themakleur kunnen verschillen: de server kent het apparaat niet. Gemeten dat dit niet blijft hangen: op een donker toestel heeft de Shell na het laden `rgb(14, 23, 48)`, het donkere navy.) Gemeten: `<body>` van de export bevat geen tekst, en #418 is 0 in 12 van 12 combinaties (3 paden × 2 bouwtalen × 2 clienttalen).
2. **Niet gekozen: de prerender vastzetten op Nederlands.** Dat lost het voor Nederlandstalige clients op elke machine op, maar Engelstalige clients behouden #418 en een flits van Nederlandse (uitgelogde) schermtekst. Ook niet: de taal pas na het mounten zetten met een hertekening, want de taal is een procesbrede variabele en geen state (zie `profiel.tsx` bij `TaalInstelling`): zonder abonnementsmechanisme blijven schermen in de oude taal staan.
3. **Wat dit kost, en dit is de echte prijs.** De prerender van `/` is een uitgelogd scherm dat een bezoeker niet hoort te zien (de routewacht stuurt hem naar aanmelden), dus daar is niets verloren. Maar **`/aanmelden` en `/uitnodiging/[code]` zijn openbaar** (`bestemmingVoor()` in `routewacht.ts`, de uitnodigingslink is "het eerste dat iemand van dit product ziet"), en daar stond er vóór deze wijziging meteen tekst (aanmeldformulier, in de taal van de bouwmachine). Nu is er een leeg vlak (alleen de achtergrondkleur) tot de bundel binnen is en gehydrateerd is. 📏 Gemeten (lokaal, Playwright, `/aanmelden`, eerste zichtbare tekst): **~60 ms vóór, ~280 ms na**, en **~1780 ms na** met een bundel die 1500 ms te laat komt (vóór: nog steeds ~55 ms). De lege periode begint bij aankomst van de HTML, niet bij het laden van het script, en duurt zolang de bundel erover doet; op een trage mobiele verbinding is dat de tijd tot de eerste inhoud. Niet gemeten: een echte telefoon of netwerk, en Web Vitals (FCP/LCP). `history.length` is gelijk (2 en 2): geen extra history-item door het later mounten van de Stack.
   **Besloten door Quinten op 19-11-2026: geaccepteerd.** Hij koos in de sessie van de orchestrator (AskUserQuestion) voor *"accepteer de prijs"*; de batchsessie heeft dit uit Linear (QS8-740) en van de orchestrator, niet rechtstreeks van hem. De vraag was: is een leeg vlak tot de bundel binnen acceptabel op de aanmeldpagina en de uitnodigingslink, tegen een prerender zonder #418 en zonder afhankelijkheid van de bouwmachine? Het alternatief hieronder is daarmee niet gekozen; `prerender:controle` en het besluit over de openbare routes bewaakt QS8-742. Alternatief: die twee routes uit de poort halen en hun prerender vastzetten op Nederlands; dan krijgt een Engelstalige bezoeker daar #418 en een flits Nederlands terug. Er is geen zoekmachine- of deellinkvoordeel verloren dat de app gebruikt: er staan nergens `og:`- of `<Head>`-tags in `app/` en `src/` (gegrept), en de prerender van `/uitnodiging/[code]` is een schil zonder code erin (geen uitnodigingsspecifieke tekst, 0 `og:`-tags). Een linkvoorbeeld voor uitnodigingen (QS8-706) hangt dus niet van deze prerender af.
4. **Geen wijziging aan de taalkeuze van de gebruiker.** `zetTaalUitApparaat` en `ProfielProvider` blijven zoals ze waren.

## Gemeten dat de app zelf nog werkt

Ingelogd (gemockte REST, Playwright): `/groep` met lege, gevulde en falende lijst; deep links `/doelen`, `/groep/<id>`, `/profiel`; menu en lege-staatknop; geen console-fouten behalve de bedoelde 500 in het foutgeval, en geen `#418`.

## Wat dit niet is, en wat niet gemeten is

- Niet `html lang`: `+html.tsx` zet `lang="nl"` vast, dus een Engelstalige gebruiker krijgt Engelse tekst onder een Nederlands taalattribuut (schermlezers lezen Engels met een Nederlandse stem). Gemeten in de matrix (`html lang=nl` bij client `en-US`), niet gerepareerd: dat vraagt een taalwissel van `document.documentElement.lang` bij start en bij profielwissel. Eigen vervolgissue: QS8-741.
- Niet gemeten: native (het `useSyncExternalStore`-pad is hetzelfde, maar op native is er geen prerender, dus er verandert niets), productie, en of een andere route dan de gemeten drie iets van de prerender nodig had.
- Geen CI-grendel op de prerender zelf (geen DOM, en een export in CI vraagt een eigen controle). `tests/beloftes/prerender-is-neutraal.test.ts` bewaakt de serverhelft van de hook en de aansluiting in `Shell`. Vervolgissue voor de controle en de open afweging over de openbare routes: QS8-742. **Wordt zwaarder als:** er buiten `Shell` iets bij komt dat tekst tekent vóór de hydratie (een provider met een laadtekst, een `Text` in `RootLayout`); dan is een `prerender:controle` die `index.html` op tekst in de body toetst de volgende stap.
