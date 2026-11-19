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

## 10. Aanvulling 19-11-2026: alle drie de stijlen, een Uiterlijk-instelling, meer C-varianten en pictogrammen

Wat Quinten erbij vroeg, en hoe het in de criteria landt. Voorbeeld: `docs/research/mockup-fase-1-uiterlijk.html`.

- **A, B én C worden alle drie gebruikt.** De gebruiker kiest zelf, in een nieuw scherm *Uiterlijk*.
  Dat is ook de bedoeling achter Habit Huddle's Style Studio, maar hier **gratis voor iedereen**:
  er is geen betaald niveau, dus geen `// TODO(paid-tier)` en geen geld (domeinregel 5).
- **C krijgt meer kleurvarianten.** Voorstel in het voorbeeld, met eigen namen: *Baai*, *Avondgloed*,
  *Bosrand*, *Pruim*, *Koraal*. Ik heb **hun namen en hun combinaties niet overgenomen**.
- **Kleurrijke pictogrammen** (medailles, sterren, vlammen, trofeeën). Dit botst met de emoji-regel; zie 10.3.

### 10.1 Gevolg voor issue 1.1 (tokens)
De thema-opbouw groeit: 3 stijlen, bij C vijf varianten, elk in donker en licht (E2). Dat is
**7 uiterlijken × 2 weergaven = 14 paletten** (aanname: A en B krijgen geen varianten).
Aanvullende criteria:
1. Een palet is een **benoemde, volledige** set tokens. Een test controleert dat elk palet **alle** sleutels heeft
   en dat er geen sleutel in één palet ontbreekt.
2. **Elk palet** haalt de contrasteisen uit 1.1.3 (4.5:1 tekst, 3:1 grote cijfers en bedieningselementen),
   gemeten per palet en niet voor het eerste.
3. `red` blijft op elk palet uitsluitend voor deadline-risico (regel 7).
4. Het heldenpalet (`heldkleurenNavy`, `heldkleurenNavyLight`) is ontworpen voor twee ondergronden. **Het is niet
   gemeten of het op alle 14 paletten leesbaar blijft**; een test per palet toetst dat, en de uitkomst bepaalt of
   een variant erbij mag (zie `heldkleuren.test.ts` en `CLAUDE.md`, *Stack*).
5. Eerst ondersteunen we een **kleine startset** (E7 hieronder); de rest is een vervolg zonder codewijziging buiten de tokens.

### 10.2 Nieuw issue 1.5 — Uiterlijk-instelling
**Doel:** de gebruiker kiest stijl, kleurvariant, weergave en dichtheid in één scherm.

Acceptatiecriteria:
1. Een scherm *Uiterlijk* bereikbaar vanuit Profiel (een ingang is verplicht: `schermingang:controle`).
2. Keuzes: **stijl** (A, B, C), bij C een **kleurvariant**, **weergave** (donker, licht, systeem) en **dichtheid** (ruim, compact).
3. De keuze geldt **direct** en blijft bewaard na herstart. Zonder opgeslagen keuze geldt een vaste standaard.
4. Is de opslag onleesbaar, dan volgt de app de systeeminstelling en de standaard; dat mislukt **niet stil**
   (zoals `ThemeProvider.tsx` nu al doet: `console.warn` en doorgaan).
5. De voorkeur is **privé**: geen ander lid ziet iemands stijl (geen nieuw groepsoppervlak; regel 7 en 4).
6. Bestaande voorkeur (`goalbuddies.thema`, drie standen) blijft werken; een bestaande gebruiker ziet na de update
   geen onverwachte verandering.
7. Alle teksten via de catalogus, beide talen. Elke keuze is met toetsenbord en schermlezer te bedienen en toont de gekozen staat.
8. Een test legt vast dat **elke** stijl × kleurvariant × weergave een bestaand palet oplevert (geen ongedefinieerde combinatie).
9. Regel 15: geen nieuwe functie boven de vijftig regels.

Review: één lichte controle (UI). **Een migratie is niet nodig** als de opslag per apparaat blijft (E6, advies);
kiest Quinten voor een accountvoorkeur, dan is het een nieuwe kolom met RLS, grants (`revoke … authenticated`),
een rollback-pad en `security-reviewer`.

### 10.3 Nieuw issue 1.6 — Pictogrammen
**Het conflict dat Quinten moet beslissen (E5).** `CLAUDE.md`, sectie *Emoji* (QS8-111): *"De app zelf gebruikt
geen emoji in tekst. Niet in knoppen, statuslabels, systeemberichten, meldingen of UI-componenten."* Dat is een
besluit van Quinten zelf, met redenen: emoji vertalen slecht, renderen per platform anders, en een schermlezer leest
een beschrijving midden in een zin. Er is een controle, `npm run emoji:controle`, die rood wordt zodra er een in
app-tekst staat. De enige uitzondering is een reactie op een bericht (A24).

Wat Quinten vraagt (kleurrijk, leuk, medailles, sterretjes, "zoals WhatsApp of Messenger") en wat de regel
beschermt, zijn te combineren met **eigen vectorpictogrammen**: ze zijn even kleurrijk, zien er overal hetzelfde
uit, en een schermlezer krijgt een eigen label. Het voorbeeld toont ze. Wat **niet** kan: de emoji-afbeeldingen van
WhatsApp of Messenger zelf gebruiken. Dat is hun artwork (Meta, Apple, Google) en niet vrij te hergebruiken.

Acceptatiecriteria (bij de keuze "eigen vectorpictogrammen", advies):
1. Een kleine set eigen pictogrammen in `src/shared/ui/` (vlam, ster, schild, medaille, trofee, ketting), als component
   met een verplicht toegankelijkheidslabel uit de catalogus. Geen emoji-teken in de bron.
2. Elk pictogram heeft een kleurvariant per palet **of** werkt op elk palet zonder contrastprobleem.
3. **Alleen bij positieve dingen:** voltooiing, mijlpaal, reeks, weekpas, ketting, viering. **Nooit** een pictogram dat
   een gemiste week, een lege dag, een verbroken reeks of achterstand aanduidt (regel 7). Een test faalt als zo'n
   pictogram in een groepsoppervlak voor een negatieve toestand wordt gebruikt.
4. Vergrendelde prestaties zijn een **grijze, gedimde** versie van hetzelfde pictogram, geen kruis of treurig teken.
5. Geen pictogram-tekst-in-afbeelding; labels staan als echte tekst.
6. `npm run emoji:controle` blijft groen. Is de keuze anders (zie E5), dan hoort een besluitdocument en een aangepaste
   controle bij het issue, en niet een wegwerp-uitzondering.
7. Eigen tekeningen: geen overgenomen vormen van hun mascotte of hun pictogrammen.

Review: één lichte controle. Model: licht. Hangt af van 1.1 (kleurtokens).

### 10.4 Nieuwe openstaande besluiten
| # | Wat | Mijn advies |
|---|---|---|
| E5 | Emoji-regel en pictogrammen | Eigen vectorpictogrammen; regel blijft; emoji alleen door gebruikers en in reacties |
| E6 | Waar de uiterlijkvoorkeur bewaard wordt | Per apparaat, zoals de bestaande themavoorkeur; account later als gebruikers het vragen |
| E7 | Hoeveel varianten bij de eerste oplevering | A, B en C met twee kleurvarianten (Baai en Avondgloed); de rest in een vervolg |

### 10.5 Gemeten en niet gemeten (aanvulling)
- **Gemeten:** het voorbeeld rendert in een headless browser (stijl C met Avondgloed en stijl A in licht bekeken); de bestaande
  themavoorkeur en de opslagsleutel staan in `src/shared/theme/ThemeProvider.tsx`.
- **Aannames:** 14 paletten; dat het heldenpalet op de nieuwe paletten leesbaar is (niet gemeten); dat de
  opslag per apparaat genoeg is; dat vectorpictogrammen "leuk genoeg" zijn voor wat Quinten voor ogen heeft.
- **Niet gemeten:** hoe de pictogrammen in React Native renderen (SVG is een eigen keuze daar); of gebruikers
  een Uiterlijk-scherm gebruiken; de contrastwaarden per palet.

## 11. Besluiten E5, E6 en E7 (Quinten, 19-11-2026) en wat ze betekenen

Quinten koos bij alle drie een andere route dan mijn advies. Het zijn zijn besluiten; hieronder staat wat ze
**extra** vragen, zodat het in de issues terechtkomt en niet pas bij de bouw opduikt.

| # | Keuze van Quinten | Mijn advies was | Wat het extra kost |
|---|---|---|---|
| E1 | Alle drie de stijlen (A, B, C) blijven bestaan | n.v.t. | Zie E7 |
| E5 | **Eigen vectorpictogrammen én emoji, alleen op de prestaties** | Alleen vectoren | Een uitzondering op de emoji-regel (QS8-111) met besluitdocument en een aangepaste `emoji:controle` |
| E6 | **Voorkeur op het account** | Per apparaat | Een migratie, RLS, grants, Zod, `security-reviewer` |
| E7 | **Alle 7 uiterlijken in één keer** (14 paletten) | Vier uiterlijken | Meer contrastmeting; het heldenpalet moet op alle paletten leesbaar blijken |

### 11.1 E5 — emoji op prestaties: wat de uitzondering moet zijn
De regel beschermt tegen drie dingen: emoji vertalen slecht, ze renderen per toestel anders, en een schermlezer
leest een beschrijving midden in een zin. Een uitzondering **alleen op prestaties** kan dat grotendeels
afvangen. Acceptatiecriteria bij issue 1.6b:
1. Een besluitdocument in `docs/decisions/` dat QS8-111 wijzigt tot een **benoemde uitzondering**: emoji staan
   uitsluitend in het prestatiecomponent, nooit in knoppen, statuslabels, systeemberichten of meldingen.
   De sectie *Emoji* in `CLAUDE.md` wordt in hetzelfde issue bijgewerkt (door een bouwsessie).
2. De emoji staat in een **apart, decoratief veld** van het component, verborgen voor schermlezers
   (`aria-hidden`), met de tekstnaam van de prestatie als label ernaast. Geen emoji midden in een zin.
3. Elke emoji komt uit een **vaste, in de code benoemde lijst**; er is geen vrije invoer en dus geen
   `telTekens()`-vraag.
4. `emoji:controle` kent het ene toegestane bestand met reden. Een emoji in een ander bestand maakt hem **rood**;
   de mutatietest staat in de PR (regel 18, vraag 3), en een uitzondering geldt niet stilzwijgend voor een map.
5. Elke emoji is een **positief** teken (medaille, ster, trofee, vlam). Geen teken voor gemist, gebroken of
   achterstand (regel 7), en een vergrendelde prestatie toont het gedimde vectorpictogram, niet een emoji.
6. De weergave is niet gemeten op alle toestellen (aanname: systeem-emoji verschillen per platform en versie).
   Wie dat storend vindt, valt terug op de vector; die blijft er altijd naast bestaan.

### 11.2 E6 — voorkeur op het account (issue 1.5a, eerst de data)
Dit is een **datamodelwijziging aan een bestaand object** (gebruikersinstellingen), een afweging die Quinten zelf
beslist en in een besluitdocument verantwoordt (*Beslisbevoegdheid*). Bouwsessie leest eerst het schema:
welke tabel er nu is voor profiel of instellingen is in dit onderzoek niet bekeken.

Acceptatiecriteria:
1. Migratie via `npm run migratie:nieuw`, idempotent, met rollback-pad in de kop en dump vooraf
   (`pg_dump`, geen backups op de gratis tier). Een kolom toevoegen aan een gevulde tabel is geen onomkeerbare
   handeling mits het rollback-pad klopt.
2. Kolommen voor stijl, kleurvariant, weergave en dichtheid met **`NOT NULL` en een vaste standaard** en een
   **CHECK met een allowlist**. Een nieuwe variant later vraagt dus een migratie; dat patroon bestaat al voor
   `chat_messages_system_event_bekend` en is een bewuste keuze, geen omissie.
3. **RLS** op de rij: alleen de eigenaar leest en schrijft zijn voorkeur (SELECT, INSERT, UPDATE, DELETE; regel 1).
   Een **test met echte JWT's** toont dat een groepslid, ook uit dezelfde groep, de voorkeur **niet** kan lezen
   (regel 4 en 7: de regel is pas afgedwongen als de database hem afdwingt).
4. Geen functie die `authenticated` per ongeluk erft: `revoke … from public, anon, authenticated` met zoveel woorden
   en `tests/rls/functiegrants.test.ts` groen (regel 4).
5. Zod-validatie op de allowlist aan de clientkant en de serverkant (regel 3).
6. `npm run types:db` hergenereren; geen handwerk in `database.types.ts`.
7. **Eerst lokaal tonen, dan verzoenen:** de app leest bij het opstarten de lokale kopie (geen flits) en vervangt
   die door de accountwaarde zodra die er is. Bij een mislukte lezing geldt de lokale kopie en de standaard.
   Wint de laatste schrijver bij twee apparaten, dan staat dat in het besluit.
8. `security-reviewer` **direct** (regel 19: een tabel met RLS raakt dit), `pg_get_functiondef()` is de waarheid.

### 11.3 E7 — alle 7 uiterlijken: 14 paletten, in drie issues
Een enkel issue 1.1 wordt te groot. Voorstel (elk eigen tak, eigen PR):
- **1.1a Architectuur + A en B:** palet-opbouw, tests per palet, 4 paletten (A, B × donker, licht).
- **1.1b C-Baai en C-Avondgloed:** 4 paletten.
- **1.1c C-Bosrand, C-Pruim, C-Koraal:** 6 paletten.

Aanvullende criteria voor alle drie:
1. Elk palet haalt 4.5:1 en 3:1 (1.1.3), **per palet gemeten**; de meting staat in het besluit.
2. **Het heldenpalet is niet gemeten op de nieuwe paletten.** Een test per palet toetst de leesbaarheid van de
   zes helden op het heldenoppervlak. **Faalt een palet daarop, dan krijgt een held op dat palet een eigen neutraal
   vlak** (een "bord") in plaats van de kleur van het palet te raken; de uitzondering uit `CLAUDE.md` (*Stack*) blijft
   uitsluitend voor heldenoppervlakken (14-09-2026, QS8-470).
3. Eén tabel `paletten` met 14 benoemde sleutels; een test faalt op een ontbrekende of dubbele sleutel.
4. Een visueel verslag per palet (vóór-/ná-screenshot van Vandaag), zodat "ziet er goed uit" meetbaar is.

### 11.4 De issuelijst na deze besluiten
| # | Issue | Hangt af van | Review |
|---|---|---|---|
| 1.0 | Besluiten en documenten (huisstijl; emoji-uitzondering; account-voorkeur; tracker uiteen) | geen | Quinten |
| 1.1a | Palet-architectuur + A en B | 1.0 | licht |
| 1.1b | C-Baai en C-Avondgloed | 1.1a | licht |
| 1.1c | C-Bosrand, C-Pruim, C-Koraal | 1.1a | licht |
| 1.2 | Paginakop | 1.1a | licht |
| 1.3 | Actiekaart en afvinkcirkel | 1.1a | licht |
| 1.4 | Zijnavigatie vanaf 1024 | 1.1a | licht |
| 1.5a | Uiterlijkvoorkeur op het account (migratie, RLS, grants) | 1.0 | **`security-reviewer`** |
| 1.5b | Scherm *Uiterlijk* | 1.1a, 1.5a | licht |
| 1.6a | Eigen vectorpictogrammen | 1.1a | licht |
| 1.6b | Emoji op prestaties (benoemde uitzondering) | 1.0, 1.6a | licht + `emoji:controle` |

### 11.5 Wat er nog openstaat voordat de issues in Linear kunnen
- **0.2 Schermafbeeldingen van de huidige GoalBuddies-app** (jij).
- **E8 Standaarduiterlijk voor nieuwe gebruikers:** welke van de zeven? *(Advies: C-Baai donker, het voorbeeld dat je
  het mooist vond; vraag hem nog.)*
- **De tabel voor de voorkeur:** de bouwsessie leest het schema en kiest; dat is geen besluit voor jou.
- Jouw uitdrukkelijke "maak de issues aan"; ik controleer dan eerst op duplicaten en lees bestaande reacties (`CLAUDE.md`).
- **Aanname die het meeste weegt:** dat elf issues in één Fase 1 niet te veel is voor een solo-ontwikkelaar. Mijn advies
  is 1.0 en 1.1a eerst op te leveren en de rest daarna te plannen; dat is het besluit van Quinten.
