# Fase 1 — acceptatiecriteria (visuele basis in de stijl van Habit Huddle)

> Status 19-11-2026. **Voorstel van acceptatiecriteria, nog geen issues.** Onderdeel van
> `docs/research/verbeterplan-goalbuddies-uit-habit-huddle.md` (Fase 1). Geschreven in een
> onderzoekssessie: geen Linear, geen claim, geen code. De stand van de app is gelezen in de code
> (`src/shared/theme/tokens.ts`, `src/shared/ui/*`, `app/(tabs)/*`), niet gezien op een scherm.
> Het onderwerp "indeling zeer vergelijkbaar" is uitgewerkt in §2; wat nog onbekend is staat in §7.

## 1. Het gewijzigde besluit B (Quinten, 19-11-2026)

Eerder koos Quinten "onze navy-tokens houden". Hij komt daarop terug: hij wil de huisstijl aanpassen
naar die van Habit Huddle en de indeling van de app **zeer vergelijkbaar** maken. Dat is zijn
product en zijn besluit. Hoe ik het in de criteria heb vertaald, en waarom:

| Onderdeel | Vertaling in deze criteria | Reden |
|---|---|---|
| Indeling (zijnavigatie, paginakop, weekstrook, kaarten, tellers, profieltabs) | **Zo dicht mogelijk bij Habit Huddle** | Patronen van functie en ordening; geen beschermd werk |
| Kleurgevoel (donker blauw met een groen accent, verloop op de achtergrond, ruime ronde vlakken) | **Overnemen als richting**, met **eigen waarden** | Zie hieronder |
| Kleurwaarden, pictogrammen, mascotte, namen van onderdelen, teksten | **Eigen, niet gekopieerd** | ToS §7: *"Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent."* Een app die in uiterlijk én indeling vrijwel gelijk is, loopt tegen die zin aan. Dat risico is van Quinten; ik adviseer het te beperken, niet het weg te nemen |

**Concreet voor de kleur:** GoalBuddies had in PRD 10.1 al een groene richting (emerald `#10b981`) die op
15-08-2026 voor het Q-Projects-stelsel werd ingeruild (`CLAUDE.md`, *Stack*). Teruggaan naar een groen
accent op donker navy is dus een eigen, verdedigbare keuze en geen gekopieerd palet. Ik heb **geen
kleurwaarden uit hun schermen gehaald**; de waarden worden in de besluitfase vastgesteld (§7, E).

⚠️ Dit is een inschatting van een gewone ontwikkelaar en geen juridisch advies. Wil Quinten zekerheid
over "vergelijkbaar genoeg om een probleem te zijn", dan hoort die vraag bij een jurist.

## 2. Wat "vergelijkbaar" in Fase 1 concreet is

De volgende patronen komen uit de schermafbeeldingen s1–s20 (zie het verbeterplan §3, V1–V11). Fase 1
bouwt alleen de **bouwstenen**; de schermen (Vandaag, statistieken, profiel) volgen in Fase 2 en later.

- V1 zijnavigatie op breed scherm → issue 1.4
- V2 paginakop met voortgangsstreep → issue 1.2
- V5 kaart met één grote hoofdhandeling → issue 1.3
- V11 maat: radius, afstanden, grote cijfers → issue 1.1
- Kleur en verloop → issue 1.1 (na besluit E)

## 3. Issue 1.0 — Besluit en documenten (voorwaarde voor 1.1)

**Doel:** de huisstijlwijziging is vastgelegd voordat er één token verandert.

Acceptatiecriteria:
1. Een besluitdocument in `docs/decisions/` met: het oude en het nieuwe uitgangspunt, de keuze voor
   eigen waarden naast het ToS-risico (§1), de gevolgen voor de Status Tracker, en wie het besloot en wanneer.
2. De sectie *Stack* in `CLAUDE.md` en de kop van `src/shared/theme/tokens.ts` ("verzin nooit een kleur bij")
   zijn bijgewerkt zodat ze het nieuwe stelsel noemen. **Dit doet een bouwsessie; deze onderzoekssessie
   raakt `CLAUDE.md` niet.**
3. `npm run docs:controle` is groen en geen feit staat dubbel in `CLAUDE.md`, `WERKVOORRAAD.md` en `VOLGENDE-SESSIE.md`.
4. Een zin in het besluit zegt hoe de Status Tracker en GoalBuddies uit elkaar mogen lopen (Quinten kiest in E).

Review: geen agent; Quinten tekent het besluit af. Model: licht.

## 4. Issue 1.1 — Tokens: kleur, radius, afstand, cijfermaat

**Doel:** één bron voor het uiterlijk, in de nieuwe stijl, zonder dat een scherm iets zelf bepaalt.

Acceptatiecriteria:
1. Alle kleuren staan in `src/shared/theme/tokens.ts`. Een test faalt zodra een scherm (`app/`) of component
   (`src/shared/ui/`) een kleurliteraal (hex, `rgb(`, `rgba(`) bevat buiten de tokens. *(Een controle die
   alles meldt, wordt genegeerd: de test moet ook de bestaande, bewuste uitzonderingen kennen, met reden.)*
2. Er zijn tokens voor **radius** (kleine, middel, grote kaart), **afstand** (een vaste schaal) en
   **cijfergrootte** (voor tellers en reeksen), en elk bestaand scherm gebruikt ze in plaats van losse getallen.
3. Het accent en de achtergrond zijn de nieuwe waarden uit besluit E. Elke nieuwe voorgrondkleur haalt
   een contrastverhouding van minstens **4.5:1** tegen zijn ondergrond voor tekst en **3:1** voor grote cijfers
   en bedieningselementen. Gemeten, met de meting in het besluit.
4. `red` blijft uitsluitend voor deadline-risico (regel 7, bestaand commentaar in `tokens.ts`). Een test zorgt
   dat het token niet op een gemiste week of een lege dag wordt gebruikt.
5. Het heldenpalet (`heldkleurenNavy`, `heldkleurenNavyLight`) is ongewijzigd en `heldkleuren.test.ts` is groen.
6. Een lege dag of week wordt in de nieuwe stijl **neutraal** getoond (grijs, geen rood, geen doorstreping).
   Dat is een nuance uit s5 en bevestigt regel 7 voor je eigen overzicht.
7. Beide bestaande thema's (`navy` en `navy-licht`) hebben alle nieuwe tokens, of het licht thema is bewust
   uitgezet (besluit E).
8. `npm run poort` is groen, inclusief de emoji-controle en `padverwijzing:controle`.

Mutatietest (regel 18, vraag 3): met de hand een hex-waarde in een scherm zetten moet de test van criterium 1
rood maken; met de hand `red` op een lege dag zetten moet criterium 4 rood maken. De uitslag staat in de PR.

Review: één lichte controle (UI, regel 3). Model: licht. Afhankelijk van 1.0.

## 5. Issue 1.2 — Paginakop

**Doel:** één kop op alle hoofdschermen, in de indeling van V2.

Acceptatiecriteria:
1. Eén component (naam is een voorstel: `Paginakop`) in `src/shared/ui/` toont titel, een optionele
   voortgangsstreep en rechts de **eigen** reeks en de meldingen.
2. De streep neemt alleen een **voortgangswaarde tussen 0 en 1** aan (mijlpaalgebaseerd, loopt alleen
   omhoog) en geen score of punten. Het type laat niets anders toe (regel 10: score en voortgang nooit in één balk).
3. De reeks rechtsboven is de eigen reeks; er is geen prop om de reeks van een ander te tonen (regel 7, A15 regelt waar groepsleden hem wel zien).
4. Alle vijf hoofdschermen (`index`, `doelen`, `groep`, `lijst`, `profiel`) gebruiken het component. Een test legt dat naast de echte routes in `app/`, zoals
   `tests/beloftes/taakbalk-overal.test.ts` dat voor de balk doet.
5. Elke tekst komt uit de catalogus in beide talen (geen kale string); de kop heeft de rol *header* voor schermlezers.
6. De drie toestanden van een asynchrone weergave (laden, fout, leeg; regel 16) zijn onveranderd.
7. Elke nieuwe functie is korter dan vijftig regels. Het aantal lange functies in `app/` stijgt niet
   (`npm run regel15:controle`).
8. Een nieuw scherm zonder kop wordt niet stilzwijgend toegestaan: het hoort in een register met reden of krijgt de kop.

Review: licht. Model: licht. Afhankelijk van 1.1.

## 6. Issue 1.3 — Actiekaart en afvinkcirkel — en Issue 1.4 — Brede indeling

### 1.3 Actiekaart

Acceptatiecriteria:
1. `Card` krijgt een variant met één hoofdhandeling: een grote ronde afvinkknop rechts, reeks links, titel en subtitel midden (V5).
2. De afvinkknop is minstens **44 bij 44** punten (aanraakdoel) en heeft een toegankelijkheidslabel.
3. De knop kent vier toestanden: leeg, vloer gehaald, plafond gehaald, en uitgeschakeld. **Vloer en plafond zijn
   onderscheidbaar zonder alleen kleur** (vorm of vulling), en een vloer telt als gehaald (regel 8).
4. De kaart toont geen punten en geen telling die kan dalen.
5. De kaart bevat geen emoji in tekst (emoji-regel).
6. `Ritmestrook` en de dagafvinking staan **niet** op een groepsscherm (regel 9). Een test controleert dat `app/(tabs)/groep.tsx` ze niet importeert.
7. Tekst en pictogrammen zijn eigen, niet gekopieerd van Habit Huddle.

### 1.4 Brede indeling

Acceptatiecriteria:
1. Vanaf een breakpoint (**aanname: 1024 breedte**, vast te stellen in 1.0) staat een **zijnavigatie** links met dezelfde vijf bestemmingen als de taakbalk. Eronder, links, de eigen naam en avatar.
2. Zijnavigatie en taakbalk tekenen uit **één lijst** (`src/shared/ui/tabbladen.ts`). Een test faalt zodra ze uiteenlopen.
3. Onder het breakpoint is de taakbalk ongewijzigd.
4. Het oplichten van het actieve onderdeel volgt dezelfde logica als nu (`tabbladen.ts`), niet een tweede.
5. `schermingang:controle` en `tests/beloftes/taakbalk-overal.test.ts` blijven groen.
6. Er komt **geen niveau- of XP-kop** in Fase 1 (dat is een nieuw concept en een nieuw punten-oppervlak; regel 10). Dat is een bewuste afbakening, geen vergeten onderdeel.

Review: licht. Model: licht. 1.3 en 1.4 hangen af van 1.1 en mogen parallel als ze andere bestanden raken.

## 7. Wat nog onbekend is voordat er issues kunnen komen

> **Stand 19-11-2026, antwoorden van Quinten:**
> - **E2 licht thema:** mee omzetten.
> - **E3 Status Tracker:** laten uiteenlopen, bewust vastgelegd in `docs/decisions/` (issue 1.0).
> - **E4 breakpoint:** 1024 breed.
> - **E1 kleur:** nog open. Quinten wil eerst een **visueel voorbeeld** en wil dat de app "heel visueel
>   aantrekkelijk" wordt. Het voorbeeld staat in `docs/research/mockup-fase-1-kleurvarianten.html`
>   (drie varianten: A emerald op navy, B goud met groen voor voortgang, C emerald met levendig verloop).
>   De rijen hieronder voor E2 t/m E4 zijn daarmee beantwoord; E1 en 0.2 blijven open.

Quinten vroeg om de issues "wanneer alles bekend is". Dit ontbreekt nog:

| # | Wat | Waarom het uitmaakt | Wie |
|---|---|---|---|
| E1 | **Accentkleur en achtergrond** (eigen waarden) | Zonder waarden is criterium 1.1.3 niet te meten | Quinten, met een meting van contrast |
| E2 | **Licht thema:** ook omzetten of uitzetten | Dubbel werk in 1.1 | Quinten |
| E3 | **Status Tracker:** mee veranderen of uit elkaar laten lopen | Raakt het gedeelde stelsel | Quinten |
| E4 | **Breakpoint** voor de zijnavigatie | Criterium 1.4.1 | Quinten of 1.0 |
| 0.2 | **Schermafbeeldingen van de huidige GoalBuddies** | Zonder referentie is "vergelijkbaar" niet te meten | Quinten |
| 0.3 | **Meting van het weekpasgat** | Alleen nodig voor Fase 6, niet voor Fase 1 | bouwsessie |

Pas als E1 t/m E4 en 0.2 er zijn, zijn de issues 1.0–1.4 af te schrijven met alleen invulwerk. Daarvoor niet.

## 8. Voor het aanmaken van de issues (afspraken uit `CLAUDE.md`)

- Eerst nagaan of er al een issue bestaat (geen duplicaten), en bij elk bestaand issue de **reacties** lezen
  (QS8-411: besluiten staan daar).
- Eén issue per afgebakend deel: 1.0, 1.1, 1.2, 1.3, 1.4. Niet bundelen; elk krijgt een eigen tak via
  `npm run claim`, met de naam die Linear voorstelt.
- Volgorde met blokkeerrelaties: 1.0 → 1.1 → 1.2, en 1.1 → 1.3 en 1.4.
- Elk issue draagt zijn eigen acceptatiecriteria uit dit document en de regel
  "klaar = `npm run poort` groen + mutatietest + vóór- en na-screenshot".

## 9. Gemeten en niet gemeten

- **Gemeten:** de patronen uit de schermafbeeldingen; de ToS-zin over trade dress (uit `/tos`, eerder gelezen); de
  bestanden en testnamen in dit document, in de repo gelezen.
- **Aannames:** het breakpoint; dat de genoemde testbestanden (`taakbalk-overal.test.ts`, `heldkleuren.test.ts`) de
  bedoelde grendels zijn; dat 4.5:1 en 3:1 hier de juiste drempels zijn; dat een groen accent op navy
  de ToS-lezing van Quinten voldoende ontwijkt.
- **Niet gemeten:** hoe de app er nu uitziet op een scherm; hoeveel werk 1.1 is (het kan groter zijn dan "licht"
  als schermen veel losse kleuren bevatten).
