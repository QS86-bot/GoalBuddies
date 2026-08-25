# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 24-08-2026 (na de merge van `main` in de QS8-83/91-branch)

---

## 0. De stand in tien regels

Lees dit eerst; de rest is naslag. **Tien regels, en dat is de bedoeling** —
staat er iets bij dat uitleg nodig heeft, dan hoort die uitleg in §2, §3b of §7.

1. **Fase 1 is af op de laatste schakel van EPIC 11 na, en de app is live.**
   Alle epics staan; EPIC 9 sinds 21-08. `goalbuddies.q-projects.tech` draait
   (QS8-99/QS8-100) en deployen is `npm run deploy`. Volgorde in §4, wat er staat
   in §2. ⚠️ Supabase Auth wijst nog naar het oude adres — zie §0a.
2. **Er zijn nog geen echte gebruikers**, en dat is de aanname onder elke afspraak
   hier. Migraties mogen daarom rechtstreeks op productie. **Dat vervalt op de dag
   dat de eerste gebruiker zich aanmeldt.**
3. ✅ **Het migratieregister kent nog één nummering** en de map bouwt het schema
   aantoonbaar op. **QS8-122 is af** en QS8-119 is daarmee vrij. De bestanden
   spelen op een lege database precies het schema van productie af — negen
   vingerafdrukken, alle negen gelijk. Uitleg in §2 en in
   `docs/decisions/004-migratieregister.md`.
4. ✅ **De RLS-suite draait sinds 24-08 lokaal** (QS8-119): `npm run rls:stack`
   en `npm run rls:lokaal`, tegen een echte PostgREST op een database uit
   `supabase/migrations/`. Geen credentials, geen productie, vijf seconden.
   **381 geslaagd, 1 overgeslagen.** Zonder credentials geeft `npm test`
   **684 geslaagd en 361 overgeslagen**; typecheck en lint groen.
   ✅ **En sinds 24-08 draait hij in CI**, in een eigen job zonder secrets.
5. **⚠️ De meldingenketen is compleet en heeft nog nooit iets afgeleverd.**
   `expo-notifications` staat erin (**Q-TODO B4 is af**), de webregistratie sinds
   **QS8-124**, en de PWA eromheen is getoetst (**QS8-117**). **Niemand heeft nog
   een echte melding ontvangen** — dat vraagt een VAPID-sleutelpaar in `.env`, en
   op iOS een fysiek toestel.
6. ✅ **De score is niet meer te verzinnen.** Vier routes naar een weggepoetste
   week dicht (0043–0046) en sinds 23-08 ook de vijfde: ontkoppelen maakte missen
   gratis, gegrendeld in 0066. Zie §2.
7. **De duurste les, en hij geldt nog steeds:** zoek álle routes naar een effect,
   niet de route die je net gevonden hebt. Eén gat kostte vier migraties, en 0066
   was dezelfde vorm nog een keer. Zie §7.
8. **Werk landt sinds 23-08 via een PR**, met een merge-commit en niet met een
   squash, en met **één branch per Linear-issue** — de naam die Linear voorstelt,
   anders koppelt hij niets. Vastgelegd in `CLAUDE.md`. Zie §3b.
9. **Wat op Quinten wacht staat sinds 24-08 op het bord, niet meer alleen in
   `docs/Q-TODO.docx`.** Alles met status **Todo** in Linear is van hem:
   QS8-126 (de repo staat publiek), QS8-131 (21 commits buiten `main`, urgent),
   QS8-127 (A37), QS8-128 (A41+A42+A44), QS8-129 (A43), QS8-130 (A46) en
   QS8-122. ⚠️ **B4 staat niet meer in die lijst** — `expo-notifications` is
   al toegevoegd op de branch van QS8-131; dat besluit wacht op een merge en
   niet op een antwoord. Q-TODO blijft de onderbouwing dragen; de status staat
   in Linear.
10. **⚠️ Alles in de MVP-volgorde is af of wacht op een mens.** EPIC 9 is sinds
    21-08 af. Wat overblijft vraagt jouw hand: een browser met VAPID-sleutels
    (QS8-124), een iPhone (QS8-117), het Supabase-dashboard (QS8-25, A10) en een
    lokale stack (QS8-22, A9). **Het bord klopt beter dan deze documenten** — kijk
    dus eerst in Linear en dan pas hier.

---

## 1. Waar alles staat

| Wat | Waar |
|---|---|
| Code | GitHub `QS86-bot/GoalBuddies`, hoofdbranch `main` |
| Werkvoorraad | Linear, project **GoalBuddies**, team `QS86-bot Linear`, prefix `QS8` |
| Database | Supabase `goalbuddies`, ref `wehgocadxehottiiyvsc`, regio `eu-west-3`, gratis tier |
| Hosting | Hostinger, account `u349450154`, domein `q-projects.tech` |
| Doeladres | `goalbuddies.q-projects.tech` (bestaat nog niet — QS8-99) |
| Design-referentie | `tracker.q-projects.tech` — de Status Tracker, zelfde stelsel |

**Linear is de bron van waarheid voor wát er gebouwd moet worden.** Dit bestand
zegt alleen in welke volgorde en waar de valkuilen zitten.

---

## 2. Wat er nu draait

**Database — af, en nu ook getest.** 30 tabellen. Migraties `0001` t/m `0090`
zijn toegepast op het project. Het datamodel is vastgesteld
in `docs/decisions/001-datamodel.md`; dat document is leidend, niet de losse SQL.
De 24e tabel is `week_review_replies` (EPIC 7, migratie 0026); daarna kwamen
`approval_withdrawals` (0030), `deadline_requests` (0032), `week_pass_events`
(0039), `goal_risk` (0050), `push_tokens` en `notifications_sent` (0053) en
`group_events` (0076) erbij.

⚠️ Hier stond tot 24-08-2026 "26 tabellen", en dat klopte al vier migraties niet
meer — geteld toen `week_review_replies` de laatste was en daarna nooit meer
nagemeten. Een getal in lopende tekst dat niemand hertelt, is dezelfde soort
aanname als een test die nooit rood is geweest. Het echte aantal komt uit
`select count(*) from pg_tables where schemaname = 'public'`.

⚠️ **`supabase/migrations/` is een verslag en geen bron, in béíde richtingen.**
De geschiedenis kent twee onverenigbare nummeringen: 38 genummerd
(`0001`–`0038`) en 28 met een tijdstempel — alles wat sinds 19-08 via de MCP-tool
is toegepast, want die kiest zelf een versie ongeacht hoe het bestand heet. Een
bestandsnaam `0039_….sql` komt dus nooit overeen met een versie in
`schema_migrations`. Daarbovenop ontbreken **`0057` t/m `0061`** als bestand:
`main` springt van `0056` naar `0062`.

Waarom dat meer is dan slordig: zowel een lokale stack als een tweede
cloudproject werkt door de migraties opnieuw af te spelen op een lege database.
Een schema dat daaruit komt is niet gelijk aan productie, en dan toetst de
RLS-suite een verzinsel — groen zonder iets te bewijzen, wat erger is dan tegen
productie draaien.

✅ **Opgelost op 24-08 (QS8-122).** Het register draagt nu één nummering, en
`npm run schema:opbouwen` speelt de map af op een lege database tot exact het
schema van productie. `npm run register:controle` bewaakt dat repo en project
gelijk blijven lopen. Onderbouwing en de twee valkuilen die daarbij boven kwamen
staan in `docs/decisions/004-migratieregister.md`.

### 2a. Wat er van de verdwaalde branch geleerd is — 24-08-2026

Bij het oppakken van de laatste map van QS8-115 bleek `src/shared/i18n/` niet te
bestaan, terwijl dat issue drie afgeronde slices beschrijft. Ze bestonden wel, op
een branch die 21 commits vóór en 44 achter `main` liep en waar geen PR voor open
stond: de hele i18n-infrastructuur, de deploy naar het echte adres,
`expo-notifications` en de migraties `0057` t/m `0061`.

✅ **Geland op 24-08 als PR #9** (QS8-131). Het gat in de migratienummering is
daarmee dicht en `npm run migraties:controle` is groen.

⚠️ **Wat ervan blijft staan is de les.** Dit was QS8-125 een niveau hoger: dat
issue gaat over documenten die uiteenlopen, hier zei het bord Done, had de
database de migraties, en stond de code op een tak. Drie bronnen, drie
antwoorden. **Werk dat niet landt, bestaat voor de volgende sessie niet** — en
het is niet zichtbaar in een document, want het document staat op diezelfde tak.
Kijk bij het beginnen van een sessie naar de branchtabel in
`docs/VOLGENDE-SESSIE.md` en niet alleen naar `main`.

✅ **QS8-115 is daarmee ook af** (In Review, 24-08). Er staat geen Nederlandse
UI-tekst meer hard in `src/` en `app/`; `npm run tekst:controle` meldt nul en
draait mee in `/audit`.

⚠️ **Die nul was op 24-08 een halve waarheid, en dat is dezelfde dag rechtgezet.**
De controle stond groen terwijl er in één scherm zeven onvertaalde zinnen zaten:
een prop met één woord, een prop over meerdere regels, twee tekstsleutels in een
objectliteraal, een zin in `setMelding()` en JSX-tekst met een accolade erin. In
totaal 23 door de hele app, waaronder twee `accessibilityLabel`s die een
schermlezer voorleest. Het probleem was niet de heuristiek maar dat er geen
manier was om te zien wat de controle wél vindt; sinds
`tests/scripts/tekst-controle.test.ts` staat elke vorm apart onder test — acht
die hij moet vinden, zes die hij met rust moet laten.

De taalkeuze op het profielscherm bestaat sinds vandaag — tot dan kon niemand
`profiles.locale` vullen en volgde de app alleen je telefoon. Eén criterium
blijft open en dat vraagt een mens: de app in het Engels doorlopen.

⚠️ **De RLS-suite (QS8-98) vond zeven gaten en die zijn alle zeven gedicht** in
migraties 0005 t/m 0011. Twee waren ernstig: elk groepslid kon zichzelf beheerder
maken, en elk groepslid kon een vals systeembericht plaatsen. De rode draad: RLS
kan geen kolommen beperken — overal waar de eis is "deze kolom mag je niet
veranderen" is een trigger nodig. Zie `docs/ENGINEER-REVIEW.md`.

⚠️ **De reviewronde van EPIC 5 vond het zwaarste gat tot nu toe.**
`weekly_goals_select` gaf elke groepsgenoot de héle rij van een gekoppeld doel,
inclusief de kolom `status` — en die kan letterlijk `'missed'` zijn. Eén `GET`
op `/rest/v1/weekly_goals` leverde de volledige lijst gemiste weken van een
ander op, met datum. Het beslisdocument belooft dat dat niet kan "ook niet door
slim te bevragen"; er was geen slimheid voor nodig. **De schermen deden het
goed, de database niet** — en EPIC 5 bouwt precies de knop die het bereikbaar
maakt. Gedicht in 0019 en 0020; `best_streak` ging in dezelfde ronde mee, want
`best_streak > current_streak` verraadt een verbroken reeks.

⚠️ **EPIC 5 vond er nog een, en dat is de leerzaamste tot nu toe.** De rate
limiting op uitnodigingscodes werkte helemaal niet. `join_group_with_code`
schreef eerst een rij in `invite_events` en zocht daarna pas de code op, juist om
mislukte pogingen te tellen — maar PostgREST draait elke RPC in zijn eigen
transactie, en een `raise exception` rolt die terug inclusief de zojuist
geschreven poging. De teller bleef dus op nul. Gedicht in 0017 door een resultaat
terug te geven in plaats van te gooien. **De regel die eruit volgt: in een
SECURITY DEFINER-RPC overleeft niets een `raise exception`.**

**Code — de app staat, met doelen, weekdoelen en groepen.**
- Expo SDK 57, React 19.2, RN 0.86, TypeScript 6 strict (plus extra strengheid)
- `src/shared/time` — de twee klokken plus `now()`
- `src/shared/theme` — navy-stelsel, drie themastanden
- `src/shared/ui` — 17 componenten, met de domeinregels erin gebakken
- `src/modules/auth` — sessie, profiel, Zod-schema's
- `src/modules/goals` — doelen, weekdoelen, cyclus
- `src/modules/buddies` — groepen, uitnodigingen, groepsklok, overzicht
- `src/modules/completions` — afronden, de Dagzet, peer-goedkeuring
- `src/modules/buddies/chat*` en `weekafsluiting*` — de chat en het huddleritueel
- `tests/rls` — de tests die de policies écht uitvoeren, met echte JWT's; de
  harnas tekent ze sinds 23-08 zelf en logt niet meer in
- `npm run typecheck` en `lint` staan groen; `npm test` geeft zónder credentials
  **684 geslaagd en 361 overgeslagen** (die 361 zijn de RLS-suite, zie §3b)

**Wat werkt in de app:** aanmelden met e-mail, de onboarding, doelen aanmaken en
bijhouden, weekdoelen met vloer en plafond, en sinds EPIC 5 de hele
groepskant — een groep aanmaken met deelbare link, toetreden met een code, het
groepsoverzicht, je doel aan een groep koppelen, de huddledag instellen en de
gastvrije uitnodigingspagina die ook zonder account werkt. Sinds EPIC 7 ook de
groepschat (realtime, met een cache voor een slechte verbinding), automatische
systeemberichten bij positieve gebeurtenissen, en de weekafsluiting: drie vragen
op de huddledag met alle antwoorden op één kaart en reacties eronder. Sinds
EPIC 8 staat **De Ketting** bovenaan het groepsscherm: de gedeelde teller van
hoeveel leden deze periode hun cyclus afsloten.

✅ **`chain_links` wordt sinds 19-08 gevuld** (QS8-80, migraties 0036 en 0037).
Twee routes leggen een schakel: een weekafsluiting via de trigger
`ketting_uit_weekafsluiting()`, en een goedgekeurd weekdoel via
`ketting_schakel()`. Daarmee gaat ook het bolletje "deze week al afgesloten" op
het groepsoverzicht eindelijk aan — `group_overview()` las die tabel al.

✅ **Het systeembericht bij een ketting-mijlpaal staat er sinds 24-08**
(migratie 0070), en daarmee is QS8-70 compleet: acht van de acht gebeurtenissen.
Een mijlpaal is een **rond cumulatief aantal schakels van de groep** — 10, 25,
50, 100, 250, 500, 1000. Waarom die vorm en niet "voltallig deze week" of "N
weken op rij": die twee zijn conditioneel, dus het uitblijven van het bericht
vertelt de groep dat iemand ontbrak. De onderbouwing staat in de kop van 0070 en
in beslisdocument 002 §2, oppervlak 9.

### Wat er in de rondes van 20 t/m 23 augustus bij is gekomen

Stond eerder allemaal in §0; verplaatst omdat §0 tien regels hoort te zijn.

✅ **De score is niet meer te verzinnen.** Vier routes naar een weggepoetste week
zijn dicht (0043–0046, A35/A36/A39/A40): je eigen weekdoel op `approved` zetten,
een gemiste week verwijderen, hem doorschuiven (`carried` breekt de reeks nu,
tenzij er een weekpas op staat), en de `todo`-rij wissen vóór de rollover —
verwijderen is nu **afsluiten**, de rij blijft als `cancelled` staan en de
rollover veegt hem bij het verstrijken van de cyclus mee naar `missed`.

✅ **En op 23-08 de vijfde: ontkoppelen maakte missen gratis** (migratie 0066).
`kan_beoordeeld_worden()` uit 0064 keek of het doel op het moment van boeken aan
een groep hing — en de eigenaar mag `goal_group_links` onvoorwaardelijk
verwijderen én terugzetten, allebei een knop in de app. Ontkoppel op vrijdag,
laat de rollover langsgaan, koppel maandag terug: geen minpunt, elke slechte
week, en de score kon alleen nog omhoog. 0066 legt het antwoord vast op
`weekly_goals.beoordeelbaar` als grendel die maar één kant op beweegt, plus een
tweede trigger die verlagen door de eigenaar blokkeert — zonder die tweede is de
reparatie een decoratie, want de kolom is voor de eigenaar bij te werken.

**Herkomst, en dat is het leerzame deel:** dezelfde handeling stond sinds 17-08
in `ENGINEER-REVIEW.md`, terecht als *Laag* weggelegd omdat het zelfbedrog was en
geen autorisatiegrens. Vier dagen later stond er een feature bovenop die er wél
een scoregat van maakte. Hoe je dat voortaan ziet aankomen is **QS8-123**.

✅ **De RLS-suite bewijst weer iets** (QS8-116). Hij logde per gebruiker in, liep
tegen een limiet aan, sloeg zichzelf over en was groen zonder iets te bewijzen.
De harnas tekent de tokens nu zelf (HS256) en logt niet meer in. Dat mag omdat de
migraties `auth.uid()` 264 keer gebruiken en `auth.jwt()`, `auth.role()`,
`auth.email()` en `request.jwt.claims` nul keer — nagemeten, niet aangenomen.
`tests/rls/jwt.test.ts` draait daardoor zonder credentials mee in CI.

✅ **Verder afgerond:** QS8-106 (de vier datalaagfuncties zonder scherm),
QS8-112 (een weekdoel aanmaken kon helemaal niet — `maakWeekdoel()` werd door
geen enkel scherm aangeroepen terwijl QS8-43 en QS8-44 op Done stonden), QS8-82
(adempauze), QS8-39 (mijlpalen beheren), QS8-76 (feestelijk moment), QS8-85
(commitments aantoonbaar informeel), QS8-118 (`src/shared/tekst`, codepunten als
eenheid overal — dat is wat `char_length` telt), en QS8-120 en QS8-121
(Zod-schema's los van de Supabase-client).

Bij die laatste twee bleken de CHECK op `commitments.body` volledig te ontbreken
(0063) en `commitments.image_url` server-side ongevalideerd (0068): `z.string()
.url()` laat in zod 4 `javascript:`, `data:` en `file:` gewoon door — nagemeten
met 4.4.3. Een commitment is per domeinregel 11 leesbaar voor de begunstigde
groep zodra de straf verschuldigd wordt.

⚠️ **En 0067 repareerde dat 0062 webregistratie onmogelijk had gemaakt.** 0062
zette een CHECK op `push_tokens` die websleutels verplicht stelt en wijzigde
`registreer_push_token()` niet mee; elke aanroep met `platform = 'web'` liep op
een ongevangen 23514 stuk. De tabel was leeg, dus de migratie slaagde en er ging
niets zichtbaar stuk — web push was dood zodra hij aangezet werd.

## 3. Wat een nieuwe sessie als eerste doet

1. Lees `CLAUDE.md`. Dat is de grondwet en die wint van alles hieronder.
2. Lees dit bestand.
3. Lees `docs/decisions/001-datamodel.md` vóór je iets met de database doet.
4. Haal de openstaande issues op uit Linear, project GoalBuddies.
5. Controleer of `.env` bestaat en gevuld is (zie §6).
6. Draai `npm install && npm run typecheck && npm test` om te zien dat je op een
   werkende basis begint.

---

## 3b. Het merge-ritueel — zes stappen, en de laatste wordt vergeten

**De eenheid is één Linear-issue.** Eén branch per issue, met de naam die Linear
voorstelt, en werk dat meerdere issues raakt wordt meerdere branches en meerdere
PR's. Vastgelegd in `CLAUDE.md` op 23-08-2026; landen gebeurt via een PR met een
merge-commit, niet met een squash.

Vóór élke merge naar `main`:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

En dan de twee stappen die geen enkele machine voor je doet:

5. **Draai de reviewagents die bij deze wijziging horen** — naar risico en niet
   naar schema, sinds 20-08-2026. `security-reviewer` **direct** bij alles wat
   auth, RLS, punten, goedkeuring, commitments of een nieuw groepszichtbaar
   oppervlak raakt; `code-critic` en `critical-user` één keer per milestone,
   samen in één opdracht. Bij een puur UI-issue hoeft er niets te draaien. De
   onderbouwing staat in `CLAUDE.md` bij onwrikbare regel 19.

   ⚠️ En verifieer elke bevinding zelf. Ze hebben het ook mis: op 20-08 was de
   zwaarste bevinding onjuist omdat ze een migratiebestand las waar de gedeployde
   functie strenger was.

6. **Draai de RLS-suite en lees de uitslag.** `npm test` doet dit lokaal mee,
   maar alleen omdat `.env` de sleutels heeft. Controleer dat de teller klopt —
   staat er `skipped` bij `tests/rls/`, dan heb je géén RLS-dekking gedraaid en
   zegt groen niets over autorisatie.

⚠️ **Waarom dit een aparte stap is en niet "CI doet het wel".** De CI-job
"Alles groen" dekt typecheck, lint en de niet-RLS-tests. De RLS-suite slaat
zichzelf daar over, en dat is een bewuste en juiste keuze: een sleutel die RLS
omzeilt geef je niet aan een runner die op elke push van elke branch draait
(zie `.github/workflows/ci.yml`).

Het gevolg moet je scherp hebben: **groen in GitHub bewijst niets over
domeinregel 7, groepslidmaatschap, peer-goedkeuring of het puntengrootboek.**
Elke bevinding die er in dit project toe deed — het lek in `weekly_goals.status`
(EPIC 5), de drie routes terug in een uitgezette groep (A18), de weekafsluiting
die andermans reacties meenam bij accountverwijdering (A3), de aanwezigheids-
matrix in `chain_links` (EPIC 8) — is van een soort die CI per definitie niet
ziet. Ze kwamen alle vier uit de RLS-suite of uit een reviewagent.

**Wanneer deze stap kan vervallen:** de helft ervan is op 24-08 vervallen.
QS8-119 is af: `npm run rls:stack && npm run rls:lokaal` draait de volle suite
zonder credentials en zonder het echte project aan te raken. Dat is handwerk van
tien seconden in plaats van een run tegen productie.

✅ **En sinds 24-08 draait de suite in CI**, in een eigen job met een
`postgres:16`-service en de vastgepinde PostgREST-binary. Geen secrets. Daarmee
vervalt de zin die hier stond: **groen in GitHub zegt nu wél iets over
domeinregel 7.**

⚠️ Wat het níét zegt: of het platform zich gedraagt zoals verwacht. Er draait geen
GoTrue in CI, en het verschil tussen twee eigenaren van standaardrechten
(besluit A46) was lokaal onzichtbaar. Een groene CI vervangt de ronde tegen
productie niet; hij maakt hem alleen zeldzamer.

⚠️ Twee dingen zijn hier sinds 23-08 veranderd. **De aanmeldlimiet is geen reden
meer**: de harnas logt niet meer in maar tekent zijn eigen tokens (QS8-116), dus
dat argument is vervallen. En **de weg naar die aparte stack is sinds 24-08 vrij**:
QS8-122 is af, dus de migratiebestanden bouwen het schema van productie op —
nagemeten en niet aangenomen. Wat die reparatie nog opleverde staat in
`docs/decisions/004-migratieregister.md`, en één ding daaruit hoort hier: zonder
de standaardrechten van Supabase in de steiger bouwt een lege database een schema
op dat *strenger* is dan productie. Een RLS-test bevestigt daar dan iets wat op
het echte project niet waar is.

⚠️ **Branch protection op `main` staat sinds 18-08 aan**, maar smal: force push
en verwijderen zijn geblokkeerd, inclusief voor beheerders. Er is bewust géén
verplichte PR of verplichte status check, want die zouden een poort verplicht
stellen die de bovenstaande klasse fouten niet vangt — en een directe push naar
`main` onmogelijk maken. Het volledige pakket hoort bij de engineer-review in
november, als er een echte tweede lezer is.

---

## 4. Uitvoeringsvolgorde

Er zijn vier milestones in Linear. Deze volgorde is geen suggestie — de
afhankelijkheden zitten er echt in.

### Milestone: Fase 1 — MVP

Werk de epics in deze volgorde af. Binnen een epic: op prioriteit, hoog eerst.

| # | Epic | Waarom hier | Status |
|---|---|---|---|
| 1 | **EPIC 0 — Fundering** (QS8-5) | Blokkeert alles | grotendeels af, zie §5 |
| 2 | **EPIC 10 — Design system** (QS8-15) | Elk scherm heeft componenten nodig | ✅ af |
| 3 | **EPIC 1 — Auth & Onboarding** (QS8-6) | Zonder gebruiker geen data | ✅ af, m.u.v. OAuth en avatar-upload |
| 4 | **EPIC 2 — Hoofddoelen** (QS8-7) | Het object waar alles aan hangt | ✅ af |
| 5 | **EPIC 4 — Weekdoelen & cyclus** (QS8-9) | De kernlus. Vloer/plafond, Dagzet, rollover | ✅ af, m.u.v. de UI voor doorschuiven |
| 6 | **EPIC 5 — Buddy-groepen** (QS8-10) | Nodig vóór goedkeuring kan bestaan | ✅ af, m.u.v. de twee `phase:v2`-issues |
| 7 | **EPIC 6 — Peer-goedkeuring** (QS8-11) | Hangt op groepen én weekdoelen | ✅ af, m.u.v. QS8-65 (`phase:v2`) |
| 8 | **EPIC 7 — Chat & weekafsluiting** (QS8-12) | Hangt op groepen | ✅ **af voor de MVP** (24-08), op de twee `phase:v2`-issues na. De ketting-mijlpaal was de laatste schakel; zie §2 |
| 9 | **EPIC 8 — Gamification** (QS8-13) | Ketting, weekpassen, adempauze | ✅ **af voor de MVP**, op de twee `phase:v2`-issues na. QS8-80 (De Ketting), QS8-81 (weekpassen), QS8-75 (dashboard), QS8-82 (adempauze), QS8-76 (feestmoment) en QS8-77 (nudge, Done op 21-08) zijn allemaal af |
| 10 | **EPIC 11 — Notificaties** (QS8-16) | Heeft gebeurtenissen nodig om over te melden | ⚠️ **volledig gebouwd, nooit afgeleverd.** `expo-notifications` staat erin (Q-TODO B4, 21-08), de webregistratie sinds QS8-124, en de PWA eromheen is compleet en getoetst (QS8-117). Wat ontbreekt is een VAPID-sleutelpaar in `.env` en — voor iOS — een fysiek toestel. Er is dus nog geen enkele melding aangekomen |
| 11 | **EPIC 3 — De Doelcoach** (QS8-8) | AI. Werkt pas zinvol als doelen en weekdoelen bestaan | ✅ af voor de MVP (21-08). End-to-end gedraaid met een echte sleutel; alleen QS8-41 (`phase:v2`) blijft open |
| 12 | **EPIC 12 — Risico-radar** (QS8-17) | Rekent op cyclusgeschiedenis, dus laat | ✅ af (20-08). `risk_status` is vóór het bouwen naar een eigen eigenaar-only tabel verhuisd |
| 13 | **EPIC 9 — Commitment device** (QS8-14) | Laatste; raakt vertrouwen, dus niet haasten | ✅ **af** (21-08). QS8-83 (beloning vrijgeven), QS8-84 (straf verschuldigd) en QS8-85 (informeel) staan alle drie op Done; migraties 0057 en 0058, en de rollover is gedeployd mét `maak_straffen_verschuldigd` |
| 14 | **EPIC 13 — Open of beschermde groepen** (QS8-132) | Besluit A41, 24-08. Varieert de gevoeligste policies die er zijn per groep, dus na alles wat erop leunt | ✅ **af** (24-08). Migraties 0076 (kolom, `group_events`, `zet_groepszichtbaarheid()`, twee systeemberichten), 0077 (`weekly_goals_select`), 0078 (`best_streak` en `last_cycle_start`) 0079 (De Ketting) en 0080 (de uitnodiging noemt de stand). Alle twintig oppervlakken beoordeeld; zeven staan bewust dicht, óók in een open groep. Beoordeling per oppervlak in beslisdocument 002 §6 |

**Exit:** een groep van drie draait ≥4 opeenvolgende cycli.

#### Waar het nu op vastzit

De epics zijn af; de MVP is dat niet. Drie dingen, en geen ervan is code die
een agent alleen kan afmaken:

| # | Wat | Waarom het blokkeert | Wie |
|---|---|---|---|
| 1 | ✅ **A47 — de RLS-suite** | Opgelost op 24-08 met QS8-119. Er zat één aanwijsbare oorzaak onder: twee aankondigingen uit dezelfde transactie dragen dezelfde `created_at`, en de test sorteerde daarop. 10 van de 10 rondes schoon, elk met een verse database | af |
| 2 | **QS8-114 — web push** | `expo-notifications` staat erin, maar de app draait alleen op het web en web push is een ánder mechanisme (VAPID, service worker, `PushSubscription`). Vandaag komt er dus geen enkele melding aan | besluit over opslag + werk |
| 3 | **Supabase Auth-URL's** | Bevestigingsmail wijst naar het oude adres. Dashboardhandeling van een minuut, §0a | Quinten |

#### Wat er van de afgeronde epics nog los ligt

Klein, maar het staat nergens anders opgeschreven:

| Wat | Waar | Waarom blijven liggen |
|---|---|---|
| Apple- en Google-login | QS8-25 | Provider moet aan in het Supabase-dashboard; op native vraagt het `expo-web-browser` — een dependency |
| Avatar uploaden | QS8-27 | Er is geen Storage-bucket en geen `storage.objects`-policy |
| ~~Doorschuiven van een gemist weekdoel~~ | QS8-47 | ✅ aangesloten in QS8-106: het blok "Nog open van eerdere weken" op *Vandaag* |
| ~~Een weekdoel aanmaken~~ | QS8-112 | ✅ gebouwd op 20-08. QS8-43 en QS8-44 stonden op Done terwijl er geen scherm was — controleer bij een frontend-issue voortaan of een mens er via het scherm bij kan |
| ~~Een voltooiing corrigeren~~ | QS8-46 | ✅ opgelost in EPIC 6: de RPC `dien_opnieuw_in` doet het append-only en in één transactie |
| Rollover automatisch laten draaien | QS8-49 | De functie werkt en is getest, maar wordt door niets aangeroepen. Zie hieronder |
| ~~Een verschuldigd commitment verdween met het doel~~ | ENGINEER-REVIEW 19-08 | ✅ gedicht in 0058: `verwijder_doel()` weigert bij `unlocked`, `due` of `resolved` — dezelfde lijst als `commitments_select` |
| ~~Systeembericht bij een ketting-mijlpaal~~ | QS8-70 | ✅ gebouwd 24-08 in migratie 0070. De ontbrekende definitie is ingevuld: een rond cumulatief aantal schakels van de groep. `chain_milestone` staat op de allowlist én in `SYSTEEM_GEBEURTENISSEN` |
| Foto's en documenten in de chat | QS8-71, QS8-72 | `phase:v2`. Vraagt een Storage-bucket met policies, en die is er niet — Q-TODO A12 |
| Hetzelfde doel aan meerdere groepen koppelen | QS8-56 | `phase:v2`. `goal_group_links` kan het vanaf dag één en `koppelDoelAanGroep()` ook; er is alleen nog geen scherm dat één doel aan twee groepen hangt |
| Een groep verlaten | QS8-57 | `phase:v2`. De policy staat het toe (`group_members_delete`), maar de overdracht van het laatste beheerderschap is niet geregeld en dat is geen detail |
| ~~Rollover opnieuw deployen~~ | Q-TODO A13 | ✅ **gedaan 19-08.** De Supabase CLI blijkt ingelogd (token in de CLI-config, niet in `.env`), dus `supabase functions deploy rollover` kón gewoon. Geverifieerd met een echte aanroep: `401` zonder token, `200` met een service-role-token — de kapotte regex had hier altijd `403` gegeven. Draai `npm run edge:sync` vóór elke deploy; de kopie liep achter |

✅ **De rollover draait sinds 19-08 vanzelf**, elk uur via
`.github/workflows/rollover.yml`. Geverifieerd op GitHub: `HTTP 200` en
`{"ok":true,"gemist":0,"vrijgesteld":0,"profielen":1,"geslapen":0}`.

Handmatig starten kan met `gh workflow run Rollover`, of rechtstreeks met:

```bash
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/rollover" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

⚠️ **Waarom het GitHub Actions werd en geen Supabase Cron.** Supabase Cron *is*
pg_cron met een schermpje eromheen; een Edge Function aanroepen vanuit Postgres
vraagt `pg_net` plus een `Authorization`-header met de service-role-key. Die
sleutel zou daarmee in de database komen te staan — precies wat een
service-role-key hoort te vermijden, en in strijd met `CLAUDE.md`
beveiligingsregel 4. In GitHub Secrets staat hij in een env var, zoals de regel
het vraagt. Besluit van Quinten, 19-08-2026.

⚠️ **Elk uur en niet dagelijks**, omdat een cyclusgrens op middernacht in de
tijdzone van de gebruiker valt en die kan elke zijn. De functie is idempotent,
dus vaker draaien kost alleen rekentijd.

⚠️ **Twee dingen om te weten als hij ooit stilvalt.** Een geplande workflow
draait uitsluitend vanaf de default branch — staat hij op een feature branch,
dan gebeurt er niets. En GitHub schakelt geplande workflows uit in repo's waar
zestig dagen geen activiteit is.

### Milestone: Live op goalbuddies.q-projects.tech

QS8-99 (subdomein) en QS8-100 (deploy). Kan zodra er iets zinnigs te tonen is —
in de praktijk na EPIC 1 en 2. Niet uitstellen tot het eind: uitnodigingslinks
(QS8-59) hebben een publiek adres nodig, en zonder dat kun je geen tweede
gebruiker testen.

### Milestone: Fase 2 en Fase 3

Pas beginnen als Fase 1 zijn exit-criterium haalt. Alles staat al in Linear met
label `phase:v2` of `phase:v3`.

---

## 5. Wat nog open staat in EPIC 0

| Issue | Wat | Stand |
|---|---|---|
| QS8-98 | RLS-testsuite met echte JWT's | ✅ af, plus zeven gaten gedicht |
| QS8-23 | CI: typecheck, lint, test op elke push | ✅ af — branch protection nog zetten |
| QS8-24 | Sentry | deels: de rand en de PII-scrubbing staan, Sentry zelf niet |
| QS8-22 | Migratie-workflow | deels: dumpscript en docs staan, lokale stack niet |

⚠️ **Besluit 16-08: de lokale stack komt later.** Docker vraagt WSL2 en
beheerdersrechten, en die had de sessie niet. Quinten heeft besloten dat elke
migratie voorlopig direct op het echte project mag, omdat er geen gebruikers
komen voordat alle fases geprogrammeerd zijn.

**Het moment waarop dat omslaat is scherp:** de eerste echte gebruiker die zich
aanmeldt. Vanaf dan geen migratie meer zonder repetitie en zonder dump. Tot die
tijd blijft elke migratie idempotent met een rollback-pad in de kop — dat is de
enige bescherming die er nu is.

⚠️ **Wat er nog niet is en waar je last van gaat krijgen.** Er is nog steeds geen
lokale Supabase-stack: Docker vraagt WSL2 en beheerdersrechten, en die had de
sessie niet. Alle migraties zijn dus rechtstreeks op het echte project gedraaid.
Dat kon nu omdat er geen echte gebruikersdata in stond — dat verandert zodra jij
of een testgebruiker de app opent. `pg_dump` staat er ook nog niet op.

## 6. Wat menselijke actie vereist

Deze dingen kan een sessie niet zelf oplossen.

| Wat | Waarom | Status |
|---|---|---|
| `.env` aanmaken | Staat in `.gitignore`, komt dus niet uit de repo. Kopieer `.env.example` | Quinten heeft hem lokaal gevuld |
| `SUPABASE_SERVICE_ROLE_KEY` | Alleen uit het Supabase-dashboard | ingevuld |
| `SUPABASE_DB_URL` | Bevat het databasewachtwoord | ingevuld |
| `ANTHROPIC_API_KEY` | Nodig vanaf EPIC 3 (Doelcoach) | leeg |
| PostgreSQL client tools | `pg_dump` vóór elke migratie op gevulde data | ✅ geïnstalleerd 18-08-2026 via scoop (PostgreSQL 18.6, géén beheerdersrechten nodig). `npm run db:dump` getest tegen productie: 0,45 MB |
| Docker + WSL2 | Voor een lokale Supabase-stack. Bewust uitgesteld, zie §5 | uitgesteld tot vóór de eerste echte gebruiker |
| Supabase CLI | Voor `db push`, `db diff` en de lokale stack | ✅ geïnstalleerd 18-08-2026 via scoop (v2.115.0), staat op `PATH`. **Nog niet ingelogd en niet gelinkt** (geen `supabase/config.toml`), dus `db push` werkt nog niet — zie Q-TODO C3 |
| ~~GitHub-connector~~ | Voor PR's vanuit een sessie | ✅ **18-08: `gh` 2.97.0 geïnstalleerd en ingelogd als `QS86-bot`**, scopes `repo`, `workflow`, `read:org`, `gist`. Een sessie kan nu PR's openen; roep hem aan via het volledige pad (zie valkuil 19) |
| Branch protection op `main` | Maakt de CI-check "Alles groen" blokkerend | niet gedaan — **kan nu wel**, via `gh api` in plaats van de webinterface |
| Leaked password protection | Staat uit in Supabase Auth. Eén schakelaar in het dashboard | niet gedaan |
| Apple/Google OAuth | Providers aanzetten in het Supabase-dashboard | niet gedaan |
| Storage-bucket | Voor avatars en later bijlagen. Geen bucket én geen `storage.objects`-policy | niet gedaan |
| ~~Rollover inplannen~~ | De Edge Function werd door niets aangeroepen | ✅ **gedaan 19-08.** `.github/workflows/rollover.yml` draait hem elk uur; de sleutel staat in GitHub Secrets en niet in de database. Geverifieerd op GitHub: twee runs geslaagd, log toont `HTTP 200` en `{"ok":true,...}` |
| ~~Rollover opnieuw deployen~~ | Hij roept nu ook `slaap_stille_groepen()` aan (QS8-60), en de repo-versie had een kapotte `Bearer`-regex | ✅ **gedaan 19-08**, geverifieerd met een echte aanroep. De CLI blijkt ingelogd; het access token stond in de CLI-config en niet in `.env`, en dat is de reden dat dit maanden onterecht als geblokkeerd stond |
| `EXPO_PUBLIC_APP_URL` invullen | Voedt de uitnodigingslink. Leeg betekent: terugval op het productieadres, dus een testomgeving deelt links naar productie | niet gedaan — Q-TODO A14 |
| ~~Vier productbeslissingen~~ | A15, A17 en A18 zijn beantwoord op 18-08 en uitgevoerd (0029, 0032). Alleen A16 staat nog open | ✅ op A16 na |
| ~~Twee beslissingen uit EPIC 6~~ | A19 beantwoord en gebouwd (0030); A20 staat in `CLAUDE.md` met een test | ✅ |
| Vier nieuwe vragen | A27 t/m A30 uit de besluitenronde van 18-08: een `ref_id` op `chat_messages`, chat anonimiseren of cascaderen, de puntenvariant bij A7, en wie over een deadline-verzoek beslist | wachten op Quinten |

---

## 7. Valkuilen — hier gaat het mis

> **Deze lijst is op 20-08-2026 opnieuw ingedeeld.** Hij was 21 losse punten en
> groeide elke sessie; een lijst die alleen maar groeit wordt op een dag niet
> meer gelezen, en dan verlies je ook de punten die wél werken.
>
> **Wat er is veranderd.** Vier dode punten eruit (de `winget`-PATH, het
> `gh`-pad, de lege types-generatie en de CRLF-val — allemaal inmiddels opgelost
> gereedschap). Vier regels die al in `CLAUDE.md` staan naar de voetnoot
> onderaan. Vier nieuwe lessen uit de ronde van 19–20 augustus erbij. En alles
> gesorteerd in vier groepen, met de duurste les bovenaan.
>
> Netto is hij nauwelijks korter — 223 naar 204 regels — maar wel dichter: er
> staat minder in dat je niet hoeft te onthouden, en meer dat je wél moet weten.
>
> ⚠️ **De sorteerregel die daaruit volgt, en die je bij elke nieuwe vondst moet
> toepassen.** Een valkuil werkt als hij een **beslissing** raakt die je bewust
> neemt — "is dit een policyfout of de rate limit?", "wat breek ik met deze
> revoke?". Dan lees je hem op het moment dat je nadenkt. Een valkuil werkt
> **niet** als hij een **reflex** moet onderbreken: die lees je niet op het moment
> dat je het commando intikt. Bewijs daarvoor is de CRLF-regel, die op de lijst
> stond, gelezen was, en op één dag alsnog drie keer misging.
>
> **Reflexvalkuilen horen dus in gereedschap** — een lint-regel, een test, een
> `.gitattributes` — en niet in deze lijst. Schrijf je iets nieuws op, vraag dan
> eerst: kan dit een controle worden in plaats van een zin?

### De duurste les tot nu toe

**Zoek eerst álle routes naar het effect, dan pas dicht je er één.**

Eén gat kostte vier migraties (0043 t/m 0046), en elke ronde bleek de vorige
reparatie te smal. 0023 dichtte `weekly_goals.status` voor *wijzigen* met de
juiste redenering erboven — *"een autorisatiegrens is pas dicht als ook het
gevólg ervan op slot zit"* — en niemand keek naar *aanmaken*, *verwijderen*,
*doorschuiven* en *de rij wissen vóór de rollover*. In `ENGINEER-REVIEW.md` stond
het al die tijd afgevinkt als opgelost.

Bij het volgende slot: schrijf eerst op wélk effect je wilt voorkomen (hier: "een
gemiste week verdwijnt uit de geschiedenis"), en zoek dan élke bewerking die dat
effect kan bereiken. Dicht ze in één migratie. Een dichtgestreepte regel is de
plek waar niemand meer kijkt.

⚠️ **Op 23-08 is dezelfde vorm nog een keer langsgekomen, en dat is het bewijs
dat deze les nog niet zit.** 0064 introduceerde "geen minpunt als niemand je week
kon beoordelen" en beantwoordde die vraag op het moment van boeken. Het effect
dat voorkomen moest worden was hetzelfde als hierboven — een gemiste week die
niets kost — en de route was een handeling die al bekend was: de eigenaar mag
`goal_group_links` verwijderen en terugzetten. Gedicht in 0066.

Het verschil met 0043–0046: daar werd de reparatie elke ronde te smal, hier werd
bij het bouwen van een níéuwe regel niet gekeken welke bestaande handelingen hem
konden omzeilen. **Vraag bij elke nieuwe beslissing die op de stand van de
database leunt: wie kan die stand veranderen, en wanneer?**

### Autorisatie en de database

1. **In een `SECURITY DEFINER`-RPC overleeft niets een `raise exception`.**
   PostgREST draait elke RPC in zijn eigen transactie; gooien rolt die terug,
   inclusief alles wat je net wilde onthouden. Bouw je een rate limiter, een
   auditregel of een blokkade, zet die dan in de happy path en geef een resultaat
   terug. Kostte de uitnodigingslimiet zijn werking (0017) — de teller bleef op
   nul en de limiet gold alleen voor gelúkte toetredingen.

2. **Een vergelijking met een mogelijk lege waarde is geen controle.** `x <> y`
   is in SQL geen bewering over ongelijkheid zodra één kant leeg kan zijn, maar
   een derde antwoord dat zich in een `if` als "niet waar" gedraagt — en dat is
   de verkeerde kant om op te falen. `eigenaar <> auth.uid()` ging zonder sessie
   dus nooit af, waarna een SECURITY DEFINER-functie de weekpasvoorraad van elk
   willekeurig doel teruggaf (0039, gedicht in 0040).

   **Goedkope test die op elke definer-functie past:** roep hem aan als
   `service_role`, want daar is `auth.uid()` leeg. Begin elke definer-functie met
   een expliciete `if auth.uid() is null`-tak, zoals de andere er zes al doen.

3. **RLS kan geen kolommen beperken.** Is de eis "deze kolom mag je niet
   veranderen" of "niet lézen", dan heb je een kolomgrant, een view met een
   expliciete kolomlijst of een rijbeperking nodig. Zeven keer misgegaan (0006,
   0010, 0019, 0023, 0029, 0043, 0046).

4. **Een kolomgrant intrekken breekt de app stil, niet luid.** Typecheck en lint
   blijven groen, want het type klopt nog. Zoek na een revoke elke `.insert(` en
   `.update(` op die kolom in `src/`, `app/` **én** `tests/` — en schrijf meteen
   de tegentest: *"het normale geval werkt nog"*. Zonder die tweede test weet je
   alleen dat je iets hebt dichtgezet, niet dat de app nog werkt.

5. **Een ontbrekende policy weigert stil, niet luid.** Bij INSERT krijg je een
   harde `42501` — er is geen rij om weg te filteren. Bij UPDATE en DELETE niet:
   RLS filtert de rijen weg, en een DELETE die niets raakt is geen fout. De
   client krijgt dus HTTP 204 en een ongewijzigde tabel. **Een test die op
   `42501` rekent wordt daar groen zonder iets te bewijzen.** Toets de úítkomst
   (staat de rij er nog?), of trek het tabelrecht in als je een luide weigering
   wilt.

6. **Een `on delete set null` sneuvelt stil op een onveranderlijkheidstrigger.**
   Een referentiële actie is zélf een UPDATE op de kindtabel. Staat daar een
   BEFORE UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de
   actie in dezelfde bewerking terug. Postgres controleert de sleutel daarna niet
   opnieuw: geen fout, geen waarschuwing, wél een verwijzing naar een rij die
   niet meer bestaat. Kostte 0031 zijn AVG-belofte; gerepareerd in 0033.
   **Bij elke nieuwe `on delete set null`: staat er een trigger op die kolom?**

### Domeinregel 7 — falen is nooit publiek

7. **De regel is pas afgedwongen als de dátabase hem afdwingt.** De schermen van
   EPIC 5 waren zorgvuldig — geen gemiste weken, geen puntentotaal, een leeg
   vakje in plaats van een grijs kruisje — en tóch stond de hele lijst gemiste
   weken van elk groepslid open via één `GET`, omdat `weekly_goals_select` de
   statuskolom meegaf. Bij élke nieuwe policy die groepsgenoten iets laat lezen:
   welke kolommen zitten er in die rij, en zegt een daarvan iets over falen?

8. **Een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
   "Afwezigheid betekent nog niet" hield stand tot `chain_links` gevuld werd, en
   toen was het een aanwezigheidsmatrix. Vraag bij elke tabel die van leeg naar
   gevuld gaat: **wat betekent een ontbrekende rij nu?** `chain_links` en
   `week_pass_events` zijn dit stadium door; **`ai_jobs` is de laatste die nog
   leeg is.**

9. **Domeinregel 7 per component is niet hetzelfde als per scherm.** De Ketting
   toont aantallen zonder namen; de ledenlijst twintig pixels lager toont
   dezelfde weekstatus mét naam. Geen datalek, wel een inconsistentie die geen
   enkele RLS-test kan vangen — er lekt immers niets uit de database. Staat als
   productbeslissing in `ENGINEER-REVIEW.md` (19-08).

10. **Een test kan net naast de bescherming kijken. Drie keer gebeurd.** De
    domeinregel-7-test op `cancelled` draaide op twee gebruikers die helemaal
    niet samen in een groep zaten, dus `shares_group_with_goal()` gaf altijd
    `false`: je kon `'cancelled'` uit de policy slopen en de test bleef groen.
    Eerder ging het zo bij `best_streak` (de test controleerde `total_points` en
    `last_cycle_start` en liet hem er precies langs) en bij de allowlist van
    systeemberichten.

    **Zet bij elke "de groep mag dit niet zien"-test een positieve controle
    ernaast: de groep móét het toegestane wél zien.** Zonder die tegenhanger
    bewijst een lege uitkomst alleen dat er iets anders stuk is.

11. **Twee insluitingen zijn geen gelijkheid.** De allowlist van systeemberichten
    werd twee kanten op getoetst — "de app kent niets dat de database verbiedt" en
    "de lijst in de app is exact deze acht namen" — en liep tóch uit elkaar, want
    de tweede test vergeleek de oude lijst met zichzelf. Bouw je een "twee kopieën
    die gelijk moeten blijven"-slot, toets dan de gelíjkheid
    (`systeembericht_allowlist()`, migratie 0034).

12. **Nooit `REPLICA IDENTITY FULL`** op `completions`, `weekly_goals` of
    `chat_messages`. Die staan in de realtime-publicatie, en Supabase past RLS
    toe op INSERT en UPDATE maar **niet op DELETE**: met `FULL` gaat bij een
    verwijdering de volledige oude rij over de lijn, inclusief `status =
    'missed'`. Staat in `CLAUDE.md` en er is een test op (`realtime_bewaking()`,
    migratie 0027). Abonneer je bovendien nooit op DELETE.

13. **Een nieuw type systeembericht vraagt een migratie, en dat is opzet.** De
    CHECK `chat_messages_system_event_bekend` geldt ook voor `service_role`; de
    kopie in `chat-schemas.ts` staat onder een gelijkheidstest. De drempel dwingt
    de vraag af of de groep het mag zien. En een systeembericht noemt **persoon
    en gebeurtenis, nooit een titel, notitie of niveau** — een bericht is een
    onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is.

### Werken met dit project

14. **De repo en het echte project lopen uit elkaar, in béíde richtingen.**
    Migraties gaan via een MCP-tool en niet via `supabase db push`, dus
    `supabase/migrations/` is een verslag en geen bron — vergelijk bij twijfel
    `list_migrations` met de map.

    Andersom net zo, en dat is de kant die je niet verwacht: een reviewbevinding
    las een migratiebestand waar de gedéployde functie strenger was, en meldde
    een gat dat niet bestond. **`pg_get_functiondef()` is de waarheid; een
    migratiebestand is een momentopname.** Dat geldt voor reviewbevindingen net
    zo goed als voor je eigen aannames — een uur werk aan een niet-bestaand gat
    is even duur als een uur niet werken aan een echt gat.

    Hetzelfde geldt voor `supabase/functions/`: die vallen buiten typecheck, lint
    én CI, en geen enkele workflow deployt ze. Draai `npm run edge:sync` vóór elke
    deploy en controleer de gedéployde versie, niet de repo-versie.

15. **⚠️ Een aannemelijke diagnose is geen meting.** Hier stond tot 23-08 dat
    Supabase weigert na *ongeveer dertig aanmeldingen per uur*, en dat je de
    RLS-suite daarom niet vaker dan een paar keer per uur kon draaien. **Dat
    klopte niet.** De auth-logs zeggen: alle 429's op `/auth/v1/token` en géén
    enkele op `/auth/v1/admin/users`; 370 accounts aangemaakt in één uur zonder
    één weigering; 262 geslaagde aanmeldingen in het uur dat er 13 weigeringen
    had; 39 in één minuut. Het is een **burstlimiet per IP**, geen uurquotum en
    niets per project.

    Dat verschil was duur: op de verkeerde diagnose is "een tweede
    Supabase-project" de logische oplossing, en die verplaatst een IP-limiet niet.
    De echte oplossing was de limiet helemaal niet meer raken — de harnas tekent
    sinds QS8-116 zijn eigen tokens en logt niet meer in. **De bovengrens op hoe
    vaak je kunt verifiëren bestaat niet meer.**

    **Wat wél blijft staan is het faalbeeld.** Een uitgeputte limiet ziet eruit
    als een kapotte policy — een paar bestanden rood, de rest "skipped" — en dat
    is het vier keer níét geweest. Een tweede gezicht hiervan is **"JWT issued at
    future"**: klokverschil, ook geen policyfout. Zoek bij een opbouwfout dus
    eerst in de melding, niet in de policies.

16. **Een comment die uitlegt waarom iets zo moet, bewijst niet dat het zo is.**
    Het scherm "Vandaag" haalde onophoudelijk gegevens op omdat er objecten in een
    dependency-array stonden die elke render vers gebouwd worden — met de comment
    erboven die precies uitlegde waarom dat niet mocht, en de lijst eronder die
    het tegenovergestelde deed. Onzichtbaar in de app, zichtbaar op een gratis
    tier.

17. **Let op de limieten die je zelf hebt ingebouwd:** 10 groepen per gebruiker
    per dag, 20 toetredingspogingen per dag, 12 leden per groep, 5
    deadline-verzoeken per dag, 2 weekpassen tegelijk, 24 uur bedenktijd. Een
    test die daar overheen gaat lijkt op een policyfout en is het niet.

### Afgedwongen door gereedschap — je hoeft ze niet te onthouden

Deze stonden hier als tekst en zijn nu een controle. Ze staan er alleen nog zodat
je weet wát je tegenkomt als de controle afgaat.

- **Tijd buiten `shared/time`** → lint-regel op `new Date()` en `Date.now()`.
  Kom je hem tegen: breid `shared/time` uit, zet er geen `eslint-disable` op.
- **Kleuren buiten `shared/theme`** → `contrast.test.ts`. Goud is nergens een
  kleur voor lopende tekst, en een goudvlak draagt in de lichte modus geen
  lopende tekst.
- **CRLF en meerregelige zoek-en-vervang** → `.gitattributes` met `eol=lf`. De
  bestanden staan sinds 20-08 als LF op schijf, dus dit kán niet meer misgaan.
  Was drie keer misgegaan op één dag terwijl de waarschuwing op deze lijst stond.
- **Geen Vercel-specifieke API's, geen dependency zonder overleg, niet meer dan
  15 bestanden per keer** → staan in `CLAUDE.md`, niet hier.

---

## 8. Openstaande onzekerheden

Staan in `docs/ENGINEER-REVIEW.md`, met datum, risico en uitleg. Dat bestand is
de agenda voor de engineer-review in november. **Vul het aan tijdens het bouwen**,
niet achteraf — een onzekerheid die je nu niet opschrijft, ben je in november kwijt.

De zwaarste op dit moment:

1. ~~**`goals.risk_status` en `risk_reason` lekken naar groepsgenoten.**~~
   **Afgehandeld, en de aantekening heeft zijn werk gedaan.** Quinten antwoordde
   op 18-08 dat de groep je risicostatus mocht zien (A17), mét de aantekening
   *herbevestigen vóór EPIC 12* — want de Risico-radar leidt `behind` en
   `unreachable` zélf af uit gemiste weken, en daarmee wordt die kolom een
   afgeleide van andermans tegenslag.

   Bij die herbevestiging is het besluit **teruggedraaid**: migratie **0050**
   verhuisde de drie risicokolommen naar `goal_risk`, eigenaar-only. **A17 geldt
   dus niet meer.** Er zijn nog **twee** benoemde verruimingen van domeinregel 7
   — A15 (de groep mag je reeks zien) en A7 (je deadline-verschuiving, die je
   zelf aanvraagt) — niet drie. `CLAUDE.md` en beslisdocument 002 §4a zijn de bron.

   ⚠️ Dit is het gedocumenteerde bewijs dát zo'n aantekening werkt. De keerzijde
   staat in QS8-123: bij een bevinding zónder aantekening ging het op 23-08 wél
   mis.
2. ~~**`inactive` ontneemt niets.**~~ Opgelost in 0029. Er bleken drie routes terug
   naar binnen te zijn in plaats van één; de andere twee herstelden het
   lidmaatschap zelfs (eigen status terugzetten, eigen rij weggooien en opnieuw
   toetreden).
3. **De RLS-suite draait niet in CI** (§5). Groen in GitHub zegt niets over
   groepen, rate limiting of domeinregel 7. **Dit is nu de zwaarste van de lijst**,
   want er staan 290 RLS-tests die niemand automatisch draait — dat is precies
   het aantal dat `npm test` zonder credentials overslaat.
4. **Niets bewaakt dat de repo en het echte project hetzelfde bevatten** (§7.15).
5b. ~~**Niets schrijft `week_pass_events`**~~ — opgelost 19-08 in QS8-81, en het
   is dezelfde les nog een keer. De tabel is nu gevuld, dus de vraag "wat
   betekent een ontbrekende rij?" heeft een nieuw antwoord: **"deze gemiste week
   is niet gered"**. Dat is een gevoelig gegeven, en het is de reden dat de tabel
   alleen voor de eigenaar leesbaar is en dat `weekpas_stand()` een eigen
   eigenaarstoets heeft in plaats van op RLS te leunen. Die toets was in 0039
   fout (`eigenaar <> auth.uid()` gaat zonder sessie niet af, want `null` is niet
   `false`) en is gerepareerd in 0040. **Van de drie tabellen uit die les is nu
   alleen `ai_jobs` nog leeg.**

5. ~~**Niets schrijft `chain_links`**~~ — opgelost 19-08 in QS8-80. Twee routes
   vullen de tabel, en het lek dat daardoor ontstond (de aanwezigheidsmatrix per
   persoon per week) is dezelfde dag gedicht in 0037. **Wat de les hiervan is:
   een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
   "Afwezigheid, geen kruisje" hield stand tot het moment dat er rijen kwamen.
6. **Vraag 1 van de weekafsluiting wordt voorgevuld met privé Dagzetten.** De
   bescherming dat je dat merkt vóór je op "Delen met mijn groep" drukt, is één hint
   onder het veld. Zie `docs/ENGINEER-REVIEW.md`, 18-08.

7. ~~**Een doel kan niet meer op `completed` komen.**~~ **Opgelost 21-08 in
   EPIC 9** (QS8-102, A31), en het heeft twee epics stilgelegen zonder dat iemand
   het merkte: `meld_doel_af()` én `meld_commitment()` stonden er allebei
   maandenlang zonder ooit af te gaan. De keuze is `rond_doel_af()` — de eigenaar
   verklaart zijn doel af, en de server weigert zolang er een mijlpaal op `todo`
   staat. Die eis is geen netheid maar de énige rem op het laten vervallen van je
   eigen straf; onderbouwing in `docs/decisions/003-commitments-afwikkelen.md` §1.
   Het kolomrecht blijft ingetrokken (0035 voor UPDATE, 0046 voor INSERT) en er
   staat nu voor allebei een test — die op UPDATE ontbrak nog.

8. **⚠️ Een onveranderlijkheidstrigger sloopt stil een `on delete set null` — en op 21-08 is het voor de derde keer gebeurd.** Migratie 0059 citeerde dit punt in zijn eigen kop, paste het correct toe op `actor_id`, en greep er één regel lager naast voor `subject_id`. Gedicht in 0060, dezelfde dag. **Lees dit punt niet als geschiedenis maar als checklist: bij elke nieuwe kolom met `on delete set null` hoort de vraag of er een BEFORE UPDATE-trigger op die tabel staat.** Origineel: Een
   referentiële actie is zelf een UPDATE op de kindtabel; staat daar een BEFORE
   UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de actie in
   dezelfde bewerking terug. Postgres controleert de sleutel daarna niet opnieuw:
   geen fout, geen waarschuwing, wél een verwijzing naar een rij die niet meer
   bestaat. Kostte 0031 zijn AVG-belofte; gerepareerd in 0033. **Bij elke nieuwe
   `on delete set null`: staat er een trigger op die kolom?**

**Nog één productbeslissing ligt bij Quinten** (`docs/Q-TODO.docx`): mag een
uitnodigingslink de doeltitels van je leden tonen aan iedereen die hem heeft
(A16). Gebouwd zoals de issue het vraagt, en ingeperkt in 0019, maar het blijft
een keuze die anders kan uitvallen.

**Vier nieuwe vragen uit de besluitenronde staan als A27 t/m A30 in Q-TODO.** Drie
daarvan zijn keuzes die ik zelf heb moeten maken omdat het antwoord ze niet
afdekte: chatberichten anonimiseren in plaats van cascaderen (A28), bij A7 de
variant zonder puntenstraf (A29), en één ander groepslid als beslisser in plaats
van unanimiteit (A30). Alle drie zijn goedkoop terug te draaien.

---

## 9. Beslissingen die al genomen zijn

Niet opnieuw ter discussie stellen zonder Quinten. Volledige onderbouwing in
`docs/PRODUCT-PROPOSAL.md` en `docs/decisions/`.

| Besluit | Kort |
|---|---|
| De Dagzet | Dagelijks logje van 10 seconden. **Standaard privé.** Nooit punten, nooit goedkeuring |
| Twee klokken | `currentUserCycle` voor punten, `currentGroupPeriod` voor het groepsritme |
| Vloer & plafond | Optioneel veld, UI moedigt aan. Vloer halen = week telt |
| Bewijs | Instelbaar per groep, standaard notitie verplicht |
| Puntenmodel | Plafond +2, vloer +1, gemiste week −1, adempauze 0. Plafond per doel stijgt bij extra taken |
| Straf | Alleen bij een verstreken deadline, nooit bij een gemiste week |
| Backlog-indeling | Per epic, zoals PRD sectie 7 |
| Design | Q-Projects navy-stelsel, gedeeld met de Status Tracker |
