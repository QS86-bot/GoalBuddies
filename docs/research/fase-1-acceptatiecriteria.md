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

### 11.6 Besluiten E8 en E9 (Quinten, 19-11-2026)
- **E8 standaarduiterlijk voor nieuwe gebruikers: B, goud met groen.** Dicht bij de huidige huisstijl; mijn advies was C-Baai.
- **E9 standaardweergave: altijd donker.** Mijn advies was het toestel volgen (zoals de huidige voorkeur `systeem`).

Gevolg voor de criteria (aanvulling op 1.5a en 1.5b):
1. De kolomstandaarden in de migratie zijn stijl `b` en weergave `donker`; de lokale terugval bij een onleesbare opslag is
   hetzelfde, in plaats van "de systeeminstelling volgen" (dat stond in criterium 1.5.4).
2. **Een bestaande gebruiker verandert niet.** Wie nu al de voorkeur `systeem`, `donker` of `licht` heeft bewaard
   (`goalbuddies.thema`), behoudt die; alleen nieuwe gebruikers krijgen de nieuwe standaard. Een test legt dat vast.
3. Bij een nieuw account zonder lokale of accountwaarde geldt dus donker, ook als het toestel op licht staat. "Volg het
   toestel" blijft als **keuze** in het scherm *Uiterlijk* (donker, licht, systeem).
4. Aanname: een nieuwe gebruiker op een toestel met lichte stand ziet de app donker. Dat is niet getest en kan als
   storend gelden voor wie een lichte telefoon verwacht; het blijft een besluit van Quinten.

### 11.7 Wat er nu nog openstaat
Nog twee dingen vóór de issues in Linear kunnen: **0.2** (schermafbeeldingen van de huidige GoalBuddies-app, door Quinten)
en Quintens uitdrukkelijke opdracht om de issues aan te maken. Alle andere besluiten (E1–E9) zijn genomen.

## 12. Wat Linear en de repo al hadden (19-11-2026) — de duplicaatcontrole

Voordat er issues komen is in Linear gezocht en zijn de reacties gelezen (`CLAUDE.md`: *lees het issue én zijn
reacties*). Er zijn **nog geen issues aangemaakt**, want dit vond ik, en het verandert de lijst.

### 12.1 Wat ik zag in Linear (GEMETEN, bron: de issues zelf)
| Issue | Wat het zegt | Raakt |
|---|---|---|
| **QS8-705** (Urgent, *In Review*, tak klaar, batch-PR #693 draft) | Navigatie als **knoppen in een kolom**: links vanaf **900** breed, op een telefoon **gestapeld bovenaan** (Quinten bevestigde dat). 44 punten hoog, `aria-current`. Volgende stap, als het te veel hoogte kost: een **inklapbaar menu** | Issue 1.4 en 1.2 |
| **QS8-255** (Done, besluit A55, 31-08) | Kleur alleen waar hij iets codeert; drie **families** (`gezondheid`, `softskills`, `ambitie`) gemeten op onderscheid, **15 categoriepictogrammen** met `@expo/vector-icons`, en de regel *"een pictogram naast een label is iets anders dan een emoji in een label"* | Issues 1.1 en 1.6a |
| **QS8-252** (Done, epic *"Een app die je wilt openen: ritme, kleur en een dashboard"*) | Dit is **al eens** uit een Habit Huddle-ronde gekomen (31-08). A56: de vragenlijst komt **ná** de aanmeldmuur | Fase 3 |
| **QS8-257** (Done) | De korte vragenlijst bestaat al (vier vragen, `app/onboarding/vragenlijst.tsx`) | Fase 3 |
| **QS8-15** (Done, epic *Design system*) | Navy en wit, gedeeld met de Status Tracker, "geen zelfbedachte kleuren" | Issue 1.0 |
| **QS8-649** (Backlog, `wacht-op-Quinten`) | Besluit van 03-11 om de app naar **zakelijk gebruik** met organisaties toe te spitsen; het productvoorstel koos bewust voor *rustig gereedschap* | Issue 1.0 |
| **CRE-175** (Status Tracker, Done) | *"Voorkeuren horen bij een gebruiker, niet bij een apparaat"* | Steunt E6 (account) |

### 12.2 Correcties op mijn eigen plan
1. **Issue 1.4 (zijnavigatie vanaf 1024) dubbelt QS8-705**, en E4 (1024) botst met de bestaande 900. Mijn aanname van
   een **onderbalk** op telefoon klopte niet: het menu staat bovenaan als kolom. 1.4 wordt daarom: *wachten tot
   QS8-705 geland is*, daarna alleen het menu restylen per palet en eventueel inklapbaar maken.
2. **Issue 1.6a (eigen pictogrammen)** moet voortbouwen op `CategorieMerk` en `@expo/vector-icons` uit QS8-255 in plaats van een tweede set. De
   keuze voor **emoji op prestaties (E5)** staat daarnaast en blijft een aparte uitzondering.
3. **Fase 3 (onboarding)** is grotendeels gebouwd (QS8-257, A56). Alleen de herinneringsvoorvertoning en de belofte zijn nieuw; dat is
   een los, later issue.
4. Issues die `Taakbalk`, `Screen` of de kop raken (1.2, 1.4) horen **na** de merge van QS8-705 en krijgen een blokkeerrelatie.
5. Het besluit van A55 (*kleur alleen waar hij iets codeert*) en het productvoorstel (*rustig gereedschap*) worden door Quintens
   nieuwe richting **vervangen**. Dat is zijn besluit, maar het hoort in 1.0 met een verwijzing naar QS8-255, QS8-252 en QS8-649.

### 12.3 De kleurmeting (GEMETEN, met `src/shared/theme/kleurafstand.ts` en `MIN_AFSTAND = 10`)
De bestaande toets (`kleurafstand.test.ts`) eist dat een **categoriekleur** minstens 10 afstand heeft tot `green`, `orange`, `red` én `accent`
(gewone afstand). Dat zijn: gezondheid `#22cc22`, softskills `#dd4fa0`, ambitie `#ffe14d`. De drie families zijn dus **niet vrij**
zodra het accent per uiterlijk verandert.

Gewone afstand van de voorgestelde accenten tot de drie families (drempel 10):
| Uiterlijk | Accent | gezondheid / softskills / ambitie | Uitslag |
|---|---|---|---|
| A | `#10b981` | 11.7 / 34.7 / 27.2 | haalt, maar krap bij gezondheid |
| B (huidig) | `#e8b648` | 21.5 / 29.5 / 11.6 | haalt |
| C-Baai | `#10b981` en `#22d3ee` | 11.7 / 34.7 / 27.2 en 23.5 / 34.3 / 27.4 | haalt |
| C-Avondgloed | `#f59e0b` en `#f472b6` | 24.8 / 26.7 / 16.1 en 40.2 / **8.5** / 32.9 | **roze faalt** (softskills `#dd4fa0`) |
| C-Bosrand | `#a3e635` en `#34d399` | 12.9 / 43.1 / 12.4 en 11.5 / 37.1 / 22.0 | haalt, krap |
| C-Pruim | `#c084fc` en `#f0abfc` | 41.0 / 15.9 / 37.9 en 38.3 / 21.4 / 28.4 | haalt |
| C-Koraal | `#fb7185` en `#fdba74` | 36.9 / 11.2 / 29.3 en 26.0 / 28.1 / 11.4 | haalt, krap |

Strenger gemeten (**slechtste geval over drie soorten kleurenblindheid**, ook tegen de statuskleuren; de afbeelding bij dit besluit):
- Een **emerald accent** (A, C-Baai) is bijna gelijk aan de statuskleur `green` (1.8). Dat is geen testfout (het accent staat niet tegen `green` in de
  toets), maar **semantisch een risico**: "gehaald" en "merkkleur" worden dezelfde kleur.
- **Koraal** ligt dicht bij `orange` (2.2), `green` (2.8) en `red` (5.7); `red` betekent uitsluitend deadline-risico (regel 7). Dat is **precies de
  verwarring waar QS8-255 al eens voor corrigeerde** (roze tegen rood, 8.9).
- **Avondgloed** (amber) ligt dicht bij `goud` en bij `orange`.
- Aanname: de bestaande toets meet alleen de gewone afstand; deze strengere meting volgt uit mijn eigen script en is **niet** wat het project afdwingt.

### 12.4 Herziene issuelijst (nog niet aangemaakt)
| # | Issue | Verandering t.o.v. §11.4 |
|---|---|---|
| epic | EPIC Uiterlijk en indeling in de stijl van Habit Huddle | nieuw, hoort bij het project GoalBuddies |
| 1.0 | Besluiten en documenten | + verwijzing naar QS8-255, QS8-252, QS8-649; A55 wordt vervangen |
| 1.1a | Palet-architectuur + A en B | + `kleurafstand.test.ts` per palet; families per palet vastgelegd |
| 1.1b | C-Baai en C-Avondgloed | + Avondgloed-roze aanpassen of de families verschuiven |
| 1.1c | C-Bosrand, C-Pruim, C-Koraal | + Koraal getoetst tegen `red` en `orange` |
| 1.2 | Paginakop | wacht op QS8-705 |
| 1.3 | Actiekaart en afvinkcirkel | ongewijzigd |
| ~~1.4~~ | ~~Zijnavigatie vanaf 1024~~ | **vervalt**; wordt *Menu restylen en inklapbaar* na QS8-705 |
| 1.5a | Uiterlijkvoorkeur op het account | + steun van CRE-175 |
| 1.5b | Scherm Uiterlijk | ongewijzigd |
| 1.6a | Pictogrammen: `CategorieMerk` uitbreiden | herschreven |
| 1.6b | Emoji op prestaties | ongewijzigd |

### 12.5 Wat er over de ingelogde schermen (0.2) kon, en wat niet
- Ik heb de app hier **gebouwd en gestart** (`expo export`, een lokale statische server, een Playwright-browser, geen verbinding met een echte
  backend). Gezien: alleen het **aanmeldscherm** (licht thema, kaartopbouw, een gouden knop, Engelse tekst door de browsertaal).
- Alles achter de login is **niet te zien**: er is geen Docker-daemon voor de lokale Supabase-stack, en ik gebruik geen account van Quinten.
- De beschrijving van de schermen uit de Linear-reacties (QS8-705) en de code geeft genoeg om de issues te schrijven; een **vóór-/ná-screenshot hoort bij
  elke bouwsessie** (die heeft de lokale stack wel), en niet bij mij.

## 13. Besluiten van 19-11-2026 (tweede ronde) en de aangemaakte issues

### 13.1 Besluiten
| Vraag | Keuze van Quinten | Mijn advies |
|---|---|---|
| Menu en navigatie | **Eerst QS8-705 laten landen**; breakpoint blijft 900; mijn issue "zijnavigatie vanaf 1024" vervalt en wordt 1.4 (restylen, eventueel inklapbaar) | zelfde |
| Kleurbotsingen | **Accent bijstellen** tot de bestaande toets (`MIN_AFSTAND` 10) gehaald wordt | zelfde |
| Emerald naast statusgroen | **Blauwgroen accent** voor A en C-Baai | zelfde |
| Onboarding (Fase 3) | **"De vragenlijst opnieuw doen"** | Uit het plan halen |

⚠️ *(Opgelost, zie §13.4.)* Het laatste besluit was **onduidelijk en tegenstrijdig**: de optie zei "het bestaande besluit A56 herzien en de vragenlijst voor de aanmelding
zetten", terwijl Quinten eerder (vraag C, 19-11) koos voor *"plan bouwen pas ná het account"*. Er is daarom **geen onboarding-issue** aangemaakt
en het epic noemt dat als open punt.

### 13.2 Gemeten kandidaatwaarden voor de bijgestelde accenten (gewone afstand tot de families gezondheid / softskills / ambitie, drempel 10)
| Voor | Kandidaat | Afstanden | Opmerking |
|---|---|---|---|
| A en C-Baai (blauwgroen) | `#22d3ee` | 23.5 / 34.3 / 27.4; tot `green` gewoon 13.1, slechtste geval 9.2 | haalt de toets; onder 10 alleen in het strengere geval |
| C-Avondgloed (roze) | `#e879f9` | 44.5 / 14.0 / 37.9 | haalt; slechtste geval tot `goud` 8.5, tot `orange` 9.1 |
Voorstellen om in 1.1a/1.1b te valideren, geen besluit.
**Emerald** `#10b981` ligt op 3.2 van het statusgroen `#3fbf8f` (gewone afstand): daarom de bijstelling.

### 13.3 Aangemaakte issues in Linear (project GoalBuddies, team QS8)
| Id | Titel | Wacht op |
|---|---|---|
| **QS8-721** | EPIC Uiterlijk en indeling in de stijl van Habit Huddle | n.v.t. |
| QS8-722 | 1.0 Besluiten en documenten | n.v.t. |
| QS8-723 | 1.1a Palet-architectuur en A en B | QS8-722 |
| QS8-724 | 1.1b C met Baai en Avondgloed | QS8-723 |
| QS8-725 | 1.1c Bosrand, Pruim en Koraal | QS8-723 |
| QS8-726 | 1.2 Paginakop | QS8-723, QS8-705 |
| QS8-727 | 1.3 Actiekaart met afvinkcirkel | QS8-723 |
| QS8-728 | 1.4 Menu restylen en inklapbaar | QS8-723, QS8-705 |
| QS8-729 | 1.5a Uiterlijkvoorkeur op het account | QS8-722 |
| QS8-730 | 1.6a Pictogrammen (`CategorieMerk` uitbreiden) | QS8-723 |
| QS8-731 | 1.5b Scherm Uiterlijk | QS8-723, QS8-729 |
| QS8-732 | 1.6b Emoji op prestaties | QS8-722, QS8-730 |

Vóór het aanmaken is gezocht op duplicaten en zijn de reacties van QS8-705 en QS8-252 gelezen. Er is **niets geclaimd, niets gebouwd en geen
bestaand issue gewijzigd**.

### 13.4 Onboarding verduidelijkt (Quinten, 19-11-2026)
Quinten koos na doorvragen: **vragenlijst herontwerpen, ná het account** (mijn advies). A56 blijft staan; vraag C (plan pas ná het account) ook.
Aangemaakt: **QS8-733 (1.7)**, wacht op QS8-723, QS8-726 en QS8-727. Gelezen in de repo: `app/onboarding/vragenlijst.tsx` telt 795 regels en bevat de
focusgebieden, minuten, het moment, de valkuil en de heldvragen; het splitsen is onderdeel van het issue (regel 15). Een **belofte ondertekenen** staat
er bewust **niet** in: dat is een besluit voor Quinten zodra er een gevolg aan hangt.

Totaal in Linear: epic **QS8-721** met **QS8-722 t/m QS8-733** (twaalf kinderen).

## 14. Derde besluitronde (19-11-2026): gemeten feiten, besluiten en nieuwe issues

### 14.1 Correcties op mijn eigen issues (gemeten in de repo)
- Het type `ThemePreference` heeft de waarden **`systeem | navy | navy-licht`**, niet `donker | licht` zoals ik in QS8-723 en QS8-729 schreef. Gecorrigeerd in Linear.
- Alleen `@expo/vector-icons` staat in `package.json`. **`expo-linear-gradient` en `react-native-svg` ontbreken**: het verloop van uiterlijk C en de meerkleurige pictogrammen vragen dus twee nieuwe dependencies.
- `profiles_select` laat leden van een gedeelde groep andermans rij lezen; alleen een kolomgrant (0089) beperkt dat tot `id`, `display_name` en `avatar_url`.
- Er is **geen Prestatiescherm**; er zijn 5 badges (`first_goal`, `first_milestone`, `first_review`, `streak_4`, `streak_12`), privé en nooit weg.

### 14.2 Besluiten van Quinten
| Vraag | Keuze | Mijn advies |
|---|---|---|
| Bibliotheken | **`expo-linear-gradient` en `react-native-svg` toevoegen** | zelfde |
| Opslag voorkeur | **Aparte tabel, alleen eigenaar** | zelfde |
| Prestaties | **Volledig Habit Huddle-achtig met zeldzaamheid en XP** | eigen scherm zonder zeldzaamheid en XP |
| Scherm Uiterlijk | Stijl en kleurvariant, weergave, live voorvertoning **én dichtheid** | dichtheid weglaten |
| Aantal badges | **Scherm op de 5, catalogus later** | zelfde |
| XP-model | **Aparte teller die alleen optelt, privé** | zelfde |
| Zichtbaarheid niveau/XP | **Alleen Prestatiescherm en eigen profiel** | zelfde |
| Delen | **In de groep** | nu niet bouwen |
| Delen: hoe | **Per prestatie, één groep naar eigen keuze** | zelfde |
| Delen in teamgroepen | **Ook in teamgroepen** | niet |
| XP-bedragen | **Plafond 20, vloer 10, gemist 0; badge naar zeldzaamheid (10 tot 200)** | zelfde |
| Niveaus | **Genummerd, 10 niveaus** | zelfde |

### 14.3 Nieuwe issues
| Id | Titel | Wacht op |
|---|---|---|
| QS8-734 | 1.9 XP en niveau (datamodel, RLS, toekenning) | QS8-722 |
| QS8-735 | 1.8 Prestatiescherm | QS8-723, QS8-730, QS8-734 |
| QS8-736 | 1.10 Een prestatie delen in één groep | QS8-722, QS8-735 |

QS8-722, QS8-724, QS8-729, QS8-730 en QS8-732 zijn aangevuld met de besluiten hierboven (dependencies, tabel, dichtheid, Prestatiescherm).

### 14.4 Wat nog niet besloten is (open vragen in de issues, niet aangenomen)
1. XP-drempels per niveau (1 t/m 10) — QS8-734.
2. Krijgen bestaande gebruikers XP terugwerkend — QS8-734.
3. Zeldzaamheid van de 5 bestaande badges — QS8-734, QS8-735.
4. Verdwijnt een gedeeld prestatiebericht bij accountverwijdering — QS8-736.
5. Delen in teamgroepen: staat uit tot QS8-649 geland is (een gevolg van Quintens keuze, niet van mijn aanname).

### 14.5 Vierde ronde: de open vragen beantwoord (Quinten, 19-11-2026; alle vier volgen mijn advies)
| Vraag | Keuze |
|---|---|
| XP-drempels niveau 1 t/m 10 | **20, 50, 100, 180, 300, 480, 750, 1150, 1700, 2500** |
| Terugwerkend XP voor bestaande gebruikers | **Ja, eenmalig uit de bestaande gegevens** (migratie op gevulde tabel, met rollback en dump) |
| Zeldzaamheid van de 5 badges | **Drie gewoon (10 XP), `streak_4` ongewoon (25 XP), `streak_12` zeldzaam (50 XP)** |
| Gedeeld prestatiebericht bij accountverwijdering | **Verdwijnt** (tweede benoemde uitzondering naast QS8-335) |

QS8-734, QS8-735 en QS8-736 zijn aangevuld. Hiermee zijn alle open vragen uit §14.4 beantwoord, behalve één **aanname** in QS8-736: dat alle leden van de
groep het bericht zien.

## 15. Vijfde en zesde ronde (19-11-2026): alle openstaande vragen beantwoord

| Vraag | Keuze van Quinten | Mijn advies |
|---|---|---|
| Koraal naast statusrood | **Koraal houden en het statusrood meeverschuiven** (nieuw issue QS8-743) | Koraal laten vervallen als hij niet te redden is |
| Avondgloed-amber | **Houden en het risico accepteren** | verschuiven |
| Pictogrammen | **De zes houden, plus doel, kroon of bliksem, hart of duim** (bouwsessie tekent beide van elk paar; Quinten kiest in de PR) | de zes houden |
| Emoji uitzetten | **Ja, schakelaar in het scherm Uiterlijk** (vijfde voorkeur) | nee |
| Limiet delen | **5 per dag** | zelfde |
| Wie ziet het gedeelde bericht | **Alle leden van die groep** | zelfde |
| Nieuwe vraag in de vragenlijst | **'Hoe wil je je voelen'** | geen nieuwe vragen |
| Wat doet dat antwoord | **Alleen de herinneringsteksten aanpassen** | privé opslaan en tonen |
| Bouwvolgorde | **1.0, dan 1.1a, dan de rest** | zelfde |
| Twee apparaten | **De laatste keuze wint** | zelfde |
| Helden op een onleesbaar palet | **Eigen neutraal bord** | zelfde |
| Belofte | **Gekoppeld aan een commitment, aangeboden pas wanneer er een groep of getuige is** (poort-issue QS8-744) | nu niet |

Nieuw in Linear: **QS8-743** (1.1d statusrood) en **QS8-744** (1.11 poort belofte). Het epic QS8-721 noemt nu zestien kinderen.

### Nog open (bewust niet aangenomen)
1. **De lijst van gevoelens** voor de vraag 'hoe wil je je voelen' (QS8-733): aantal en woorden.
2. **Eén statusrood voor de hele app of een eigen rood per uiterlijk** (QS8-743).
3. **Alles in de poort QS8-744** (gevolg, week-eenheid, begunstigde, bevestiging, hergebruik van het bestaande commitment, accountverwijdering).
4. **Het inklapbare menu** (QS8-728): Quinten beoordeelt dat zelf op zijn telefoon na de deploy van QS8-705.

### Een waarschuwing over de lopende bouw
QS8-722 en QS8-723 staan in Linear inmiddels op **In Review**: een bouwsessie is dus al begonnen, vóór deze laatste besluiten erin stonden. Die sessie moet
de aanvullingen onderaan beide issues lezen (de aanvulling op QS8-722 noemt acht punten; QS8-723 het neutrale bord). Dit is precies het geval dat `CLAUDE.md`
beschrijft bij QS8-411: een besluit in een reactie of aanvulling is de nieuwste tekst, de beschrijving de oudste.

## 16. Zevende ronde (19-11-2026): de drie open punten besloten

| Onderdeel | Keuze van Quinten | Mijn advies |
|---|---|---|
| Statusrood (QS8-743) | **Eén rood voor de hele app** | zelfde |
| Gevoelens (QS8-733) | **Zes voorstellen** (rustig, gemotiveerd, trots, gesteund, energiek, gefocust) plus een eigen omschrijving | vier voorstellen |
| Eigen omschrijving | **Alleen op het eigen scherm**, nooit letterlijk in een melding, nooit zichtbaar voor de groep | zelfde |
| Belofte, gevolg (QS8-744) | **Vrije tekst**, nooit geld | zelfde |
| Belofte, systeem | **Hergebruik van het bestaande commitment** | zelfde |
| Belofte, periode | **Eigen week van de gebruiker** | zelfde |
| Belofte, wie | **Groep of één getuige, door de gebruiker gekozen**; leesrecht pas bij verschuldigd (regel 11) | zelfde |
| Belofte, bevestiging | **Aparte stap** met gevolg, periode en zichtbaarheid, in het auditspoor | zelfde |
| Belofte, terugdraaien | **Tot het gevolg verschuldigd wordt** | zelfde |
| Belofte, accountverwijdering | **Dezelfde regel als QS8-335**, geen tweede uitzondering | zelfde |

**Gevolg voor de issues.** QS8-733 en QS8-743 zijn nu bouwklaar. QS8-744 is besloten, het label `wacht-op-Quinten` is eraf. Het bouwt nog niets: criteria 1 (besluitdocument in `docs/decisions/`) en 3 (spec-planner-ronde met `security-reviewer`) van dat issue moeten nog gebeuren in een bouwsessie. Dit onderzoeksbestand is daarvoor niet het besluitdocument.

## 17. Issues voor Fase 0.3 en Fase 2 tot en met 6 (19-11-2026)

Alle onder epic QS8-721. De nummering van de titels wijkt op twee plekken af van het verbeterplan, omdat het plan en de Fase 1-issues elkaar overlappen.

| Issue | Inhoud | Opmerking |
|---|---|---|
| QS8-745 | Fase 0.3: het gat in de bescherming nameten | alleen lezen op productie |
| QS8-748 | Fase 2.3: Vandaag-scherm splitsen (plan 2.4) | gaat vóór 2.1 en 2.2 |
| QS8-746 | Fase 2.1: weekstrook | blokkeert op 748 |
| QS8-747 | Fase 2.2: drie tellers | blokkeert op 748 |
| QS8-749 | Fase 4.1: statistiekpagina | alleen jezelf |
| QS8-750 | Fase 4.2: profiel met tabs (plan 4.3) | `security-reviewer` direct; blokkeert op QS8-735 |
| QS8-751 | Fase 5.1: groepskaart | |
| QS8-752 | Fase 5.2: groep dempen | `security-reviewer` direct |
| QS8-753 | Fase 5.3: pauze los van weggaan | poort, `wacht-op-Quinten` |
| QS8-754 | Fase 5.4: instellingen als lijst met paneel | blokkeert op QS8-731 |
| QS8-755 | Fase 5.5: meldingen, full house | standaard uit tot Quinten; blokkeert op 752 |
| QS8-756 | Fase 6.1: achteraf-venster | voorwaardelijk, blokkeert op QS8-745 |

**Bewust geen eigen issue** omdat er al een issue voor bestaat of besloten is:
- plan 2.3 (vloer en plafond op de kaart): QS8-727;
- plan 3.1 en 3.2 (vragenvolgorde, herinneringsvoorbeeld): QS8-733 en het bestaande QS8-257 (af);
- plan 3.3 (plan bouwen vóór aanmelden): besloten **nee** tot er een kostenrem op AI-calls is;
- plan 3.4 (belofte): QS8-744;
- plan 4.2 (prestaties): QS8-735.
