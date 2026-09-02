# CLAUDE.md — Luz de Luna Lera

> Grondwet van deze codebase. Claude Code en alle subagents lezen dit bij elke
> sessie. De eerste beslissingen in dit project zijn de duurste; ze gaan jaren mee.
>
> Dit project is opgezet op 02-09-2026 uit de kick-off met Evianne en uit wat
> GoalBuddies heeft geleerd. Dit bestand zegt **hoe** je werkt;
> `docs/WERKVOORRAAD.md` zegt **wat** er aan de beurt is;
> `docs/LESSEN-UIT-GOALBUDDIES.md` zegt **waarom** de regels er staan.

## 👉 Startinstructies — de eerste sessie

Doorloop dit één keer, in deze volgorde. Daarna geldt "Begin hier" hieronder.

1. **Zet de map op zijn plek en maak er een repo van.**
   ```bash
   cd "C:\Users\Quint\.claude\projects\Luz de Luna Lera"
   npm install
   npm run poort          # moet groen zijn, niets "ongemeten"
   git init && git add -A && git commit -m "Projectmap Luz de Luna Lera, opgezet uit de kick-off van 02-09-2026"
   ```
   Maak de GitHub-repo aan en push (`main`). Noteer repo en branchnaam in
   `docs/WERKVOORRAAD.md` §1. Dat is issue LDL-1.
2. **Lees het verslag en het PRD.** `docs/VERGADERING-2026-09-02.md` is wat er
   besproken is; `docs/PRD-luz-de-luna-lera.md` is wat er gebouwd wordt.
   Alles met `[EVIANNE]` is nog geen belofte.
3. **Zet het Linear-project op** uit `docs/linear/ISSUES.md` (LDL-6). Zit de
   werkruimte aan de gratis limiet, dan is dat een kostenbesluit voor Quinten
   en blijft dat bestand de bron. `/verder` werkt met allebei.
4. **Vraag om wat alleen mensen kunnen geven** — de tabel in
   `docs/WERKVOORRAAD.md` §6: Eviannes teksten in `docs/content/bron/`, haar
   5–10 voorbeeldposts, de bevestiging van naam, prijs en termijnen; van
   Quinten een Supabase-project, een n8n-keuze, een Hostinger-adres. Wacht er
   niet op: alles hieronder dat er niet van afhangt, kan nu.
5. **Start de twee onderzoeken die het meest blokkeren**, parallel aan M0:
   `/onderzoek privacy-avg` en `/onderzoek betalen-mollie`. Ze vragen geen
   omgeving en bepalen het datamodel, de toestemmingsteksten en de betaalpagina.
6. **Sessie 1 uit de vergadering — functioneel en technisch:** `/verder` door
   M0 en M1, dan LDL-11 (het datamodel als beslisdocument, `docs/decisions/003-datamodel.md`).
   Geen migratie vóór dat papier er is.
7. **Sessie 2 uit de vergadering — content:** `/content` zodra de bronmap
   gevuld is. Eerst de zelftest, dan de spiegel; bij Instagram eerst 5–10 posts.
8. **Aan het eind van elke sessie:** werk `docs/WERKVOORRAAD.md` en
   `docs/VOLGENDE-SESSIE.md` bij, en grep op elk feit dat je veranderde in
   alle overdrachtsdocumenten. `npm run docs:controle` vangt wat een patroon heeft.

## 👉 Begin hier — elke sessie

**Lees `docs/WERKVOORRAAD.md`.** Sectie 0 geeft de stand in tien regels.
`docs/VOLGENDE-SESSIE.md` is de startprompt om in een nieuwe chat te plakken.
Verder bouwen doe je met **`/verder`**; een feature met **`/feature`**; een
onderzoeksvraag met **`/onderzoek`**; tekst met **`/content`**; de weekcheck met
**`/audit`**.

### Wie bezit welk feit

In GoalBuddies beschreven drie documenten dezelfde stand en liepen ze op één
dag vijf keer uiteen. Daarom: één feit, één eigenaar, elders een verwijzing.
`npm run docs:controle` wordt rood zodra een feit met een patroon op twee
plekken staat; voor de rest geldt de handmatige regel: **werk je iets bij, grep
dan op dat feit in alle vier de documenten.**

| Document | Bezit | Bezit níét |
|---|---|---|
| `CLAUDE.md` | de regels en conventies | de stand, de prijs, de doelen |
| `docs/WERKVOORRAAD.md` | de stand en de volgorde — testteller, migratiebereik, wat af is, wat op mensen wacht | de regels |
| `docs/VOLGENDE-SESSIE.md` | de startprompt | de stand en de regels |
| `docs/PRD-luz-de-luna-lera.md` | het product — inclusief de prijs van het traject en de groeidoelen | de stand |

### Documenten

| Bestand | Wat erin staat |
|---|---|
| `docs/VERGADERING-2026-09-02.md` | het verslag van de kick-off, besluiten, actiepunten, onduidelijkheden |
| `docs/PRD-luz-de-luna-lera.md` | productdefinitie, klantreis, aanbod, doelen, epics |
| `docs/LESSEN-UIT-GOALBUDDIES.md` | 64 lessen uit het vorige project, met wat ze hier betekenen |
| `docs/decisions/NNN-*.md` | architectuur- en productbesluiten; `000-sjabloon.md` is het sjabloon |
| `docs/research/` | de onderzoeksvragen uit de vergadering en hun beslisdocumenten |
| `docs/linear/ISSUES.md` | milestones en issues om in Linear te zetten; het vangnet zolang dat niet kan |
| `docs/bolt/PROMPTS.md` | elke prompt naar Bolt, genummerd, met de export en wat er gerepareerd is |
| `docs/content/BRIEFING.md` | doelgroep, toon en de vijf contentcategorieën |
| `docs/ENGINEER-REVIEW.md` | het reviewdossier: alles waar niemand zeker over is |
| `docs/DEPLOY.md` | deploy- en migratiehandleiding |

## Project

- **Naam:** Luz de Luna Lera — de coachingpraktijk van Evianne.
- **Doel:** een website met een geautomatiseerde klantreis: Instagram →
  landingspagina → zelftest → gepersonaliseerde e-mailreeks → het 1-op-1-traject
  **Roots**; wie niet koopt blijft in de nieuwsbrief en stroomt later door naar
  laagdrempelige online producten. Boeken, betalen, agenda en publicatie
  geautomatiseerd.
- **Opdrachtgever:** Evianne (coach). **Ontwikkelaar:** Quinten (architect en
  enige developer). Claude Code is de primaire implementer. Er is geen
  engineer-review gepland; de tests en de agents zijn de review.
- **Schaal:** duizenden leads per maand, tientallen klanten. Geen 100k-users-ontwerp,
  wél een funnel die nooit een lead kwijtraakt en nooit twee keer mailt.
- **Prijs, duur en doelen:** staan in het PRD en alleen daar.

**Linear:** project `Luz de Luna Lera` `[team en prefix — zie WERKVOORRAAD §1]`.
**Supabase, n8n, Hostinger, GitHub:** `docs/WERKVOORRAAD.md` §1.

### Versiebeheer
- **Eén branch per issue**, met de naam die Linear voorstelt (`gitBranchName`).
  Raakt je werk meerdere issues, dan zijn het meerdere branches en meerdere PR's.
- Nooit rechtstreeks op `main` committen zodra er code staat.
- **Werk landt via een PR met een merge-commit**, niet met een squash: de
  commitberichten dragen het waarom.
- Commitberichten in het Nederlands: eerste regel wat er verandert, daarna
  waaróm, bij een niet-vanzelfsprekende keuze met verwijzing naar `docs/decisions/`.
- Een PR gaat pas open na `npm run poort` én de reviewagents die bij de
  wijziging horen (regel 19).

## Stack en werkverdeling

| | |
|---|---|
| Frontend | **Bolt** genereert; `frontend-engineer` schrijft de prompt en repareert de export in `web/` |
| Database | **Supabase** (gratis tier, EU): de bron van waarheid, RLS, constraints |
| Automatisering | **n8n**: webhooks, mails, de AI-agent, Google Agenda, betaalprovider, publicatie — elke workflow als export in `n8n/workflows/` |
| Hosting | **Hostinger** (statische export); later mogelijk Vercel — geen Vercel-specifieke API's |
| Werkvoorraad | **Linear** |
| Agenda | **Google Agenda** van Evianne |

**Waarheid in Supabase, gedrag in n8n, weergave in Bolt — en nooit dezelfde
regel op twee plekken.** Uitgeschreven in `docs/decisions/002-stack-en-werkverdeling.md`.

## ⚠️ Solo-fase
Er is niemand die jouw werk nakijkt.
1. **Tests zijn de enige review die bestaat.** Niet optioneel.
2. Bij twijfel over een architectuurkeuze: kies en bouw door — zie *Beslisbevoegdheid*.
3. Documenteer elke niet-vanzelfsprekende keuze in `docs/decisions/NNN-titel.md`,
   met een `## Herbevestigen vóór` als het besluit aan iets toekomstigs hangt.
4. Houd `docs/ENGINEER-REVIEW.md` bij; elke Laag-rij zegt wanneer hij zwaarder wordt.

## ⚠️ Greenfield — de eerste beslissingen zijn de duurste
Voordat er één feature gebouwd wordt:
1. **Privacy eerst.** `docs/research/privacy-avg.md` bepaalt wat er opgeslagen
   mag worden, waar, hoe lang, en door welke verwerkers. Tot dat besluit er is,
   geldt de strengste lezing (domeinregel 1).
2. **Datamodel eerst, volledig, met RLS.** Contacten, toestemmingen, zelftests,
   antwoorden, mailverzendingen, boekingen, betalingen, AI-jobs. Op papier
   (`docs/decisions/003-datamodel.md`) vóór in code.
3. **Tijd op één plek.** Eén gedeelde helper voor Europe/Amsterdam en UTC,
   gebruikt door site, database en n8n. Los het nooit ad hoc op in een Code-node.
4. Kies de conventies één keer en leg ze hier vast zodra ze er zijn.

## ⚠️ Supabase gratis tier en Hostinger
- Projecten pauzeren na inactiviteit; beperkte opslag en bandbreedte; **geen
  automatische backups** — `pg_dump` vóór elke migratie op een gevulde tabel.
- `max_connections` is 60 voor de hele database. Alles loopt via PostgREST;
  niemand opent zelf een pool. `npm run verbindingen:controle` bewaakt dat.
- Markeer alles wat een betaalde tier vereist met `// TODO(paid-tier)`.
- Geen Vercel-specifieke API's of packages. Alle configuratie via env vars.
  Houd `docs/DEPLOY.md` actueel.

## Domeinregels (specifiek voor Luz de Luna Lera)

1. **Persoonsgegevens zijn het contract.** De zelftest vraagt hoe iemand zich
   voelt en waar ze vastloopt; die antwoorden kunnen gezondheidsgegevens zijn
   (AVG art. 9). Tot `privacy-avg` iets anders besluit: uitdrukkelijke
   toestemming, minimale opslag, EU-opslag, een verwijderpad dat ook n8n-
   executies, mailwachtrijen en agendanotities raakt, en geen PII in logs,
   foutmeldingen of URL's. **Voor elk nieuw oppervlak is de strengste lezing
   het antwoord tot iemand het tegendeel besluit.**

2. **Toestemming is expliciet, gescheiden en gelogd.** Drie aparte vinkjes:
   de uitslag per mail, de nieuwsbrief, persoonlijke mails op basis van je
   antwoorden. Double opt-in voor de nieuwsbrief. Elke automatische mail heeft
   een werkende afmeldlink, en afmelden werkt door in n8n én de database
   binnen een uur. **Een mail zonder gelogde toestemming is een blokkerende
   bevinding**, geen aandachtspunt.

3. **De AI schrijft alleen uit Eviannes eigen teksten.** De systeemprompt put
   uit aangewezen bronpassages per thema; de zelftest-antwoorden gaan erin als
   data, nooit als instructie (dat is een injectievector — er staat een test
   op). Geen medische, therapeutische of resultaatclaims, geen verzonnen
   advies. Elke AI-call gelogd per lead, met cache en dagquotum.

4. **Confronterend, nooit beschamend.** Een spiegel benoemt een patroon en
   blijft naast de lezer staan. Geen diagnose, geen label. Evianne leest
   voorbeelden vóór de eerste echte verzending.

5. **Geld en boekingen dwingt de database af.** Een betaling is pas geslaagd
   als de provider dat bevestigt, niet als de bezoeker terugkomt op de
   bedankpagina. Betalingen en boekingen zijn append-only met een
   idempotentie-sleutel; een webhook die twee keer komt, boekt één keer. Geen
   boeking in de betaalde flow zonder bevestigde betaling; geen dubbele boeking
   op één slot — als constraint, niet als n8n-check. **Zoek bij elk slot álle
   routes naar het effect** voordat je er één dichtzet.

6. **De uitgebreide uitslag komt alleen per mail** (besluit A4). De
   bedankpagina toont een korte uitslag en zegt dat de spiegel onderweg is.
   Wie dit wil verruimen, leest eerst waarom het zo besloten is.

7. **Twee klokken, één helper.** UTC in opslag; Europe/Amsterdam voor alles
   wat een mens ziet (een afspraak, een tussenpoos in de funnel). Geen
   tijdberekening buiten de gedeelde helper — niet in de site, niet in een
   databasefunctie, niet in een n8n-node.

8. **Content is van Evianne, en niets gaat naar echte mensen zonder haar
   akkoord.** Elke workflow die verstuurt of publiceert heeft een proefpad
   naar een eigen adres; de schakelaar gaat om na een besluit van een mens.
   Begin klein: 5–10 posts, een handvol spiegels, één nieuwsbrief.

## Emoji en tekst

**De site en de systeemmails gebruiken geen emoji in tekst.** Niet in knoppen,
labels, foutmeldingen of mailsjablonen; ze renderen per platform anders en een
schermlezer leest ze voor. `npm run emoji:controle` wordt rood zodra het
gebeurt. **Content is uitgezonderd:** een Instagram-post of nieuwsbrief mag ze
dragen als Evianne dat wil — die staat in `docs/content/`, niet in `web/`.

**Bezoekers mogen ze overal typen.** Daarom kapt geen enkele plek
gebruikerstekst af met `.length`, `charAt(0)` of `.slice(0, n)`: een emoji kost
twee UTF-16-eenheden, een gezinsemoji elf, en snijden op zo'n grens rendert als
`�`. Tel in codepunten — dat is ook wat Postgres telt — met een gedeelde helper.
Zod's `.max()` en `char_length` zijn niet dezelfde grens, en bij een ondergrens
gaat het verschil de gevaarlijke kant op.

**Nederlands, jij-vorm.** UI-tekst helder en neutraal; content in Eviannes stem.

## Architectuur

```
web/                  de Bolt-export — toont, valideert voor de UX, doet één POST
supabase/migrations/  het schema: genummerd, idempotent, rollback-pad in de kop
supabase/functions/   serverfuncties (Deno), alleen als n8n het niet kan
n8n/workflows/        elke workflow als JSON-export — de bron
n8n/templates/        mailsjablonen
docs/                 PRD, werkvoorraad, besluiten, onderzoek, content, prompts
scripts/ tests/       de gereedschapskist en zijn ijkingstests
```

Communicatie tussen lagen alleen via geauthenticeerde webhooks (site → n8n) en
de REST-API onder RLS (n8n → Supabase). Geen logica op twee plekken.

## Onwrikbare regels

### Beveiliging
1. Elke tabel heeft RLS met policies voor SELECT, INSERT, UPDATE én DELETE.
   `anon` mag precies wat de zelftest nodig heeft en niets meer.
2. Autorisatie op de server. Een uuid in een URL is geen autorisatie.
3. Alle input servergevalideerd met Zod — ook wat uit Bolt of n8n komt.
4. Secrets alleen via env vars; nooit in de webbundel, nooit in een
   geëxporteerde workflow of Code-node.
5. **Elke `revoke` noemt `authenticated` met zoveel woorden:**
   `from public, anon, authenticated`. Supabase deelt elke nieuwe functie
   standaard uit aan alle drie.
6. Elke inkomende webhook is geauthenticeerd. Elke betaalwebhook verifieert
   de status bij de provider. Rate limiting op de zelftest, op alles dat mail
   verstuurt, op boeken en betalen.
7. Elke AI-call kost geld: cache, dedupliceer, dagquotum, log kosten per lead.

### Correctheid
8. Geen tijdberekening buiten de gedeelde helper (domeinregel 7).
9. Zware taken (AI, mail, export) nooit synchroon in de request: jobtabel of n8n.
10. Betalingen, boekingen en verzendingen idempotent; dubbele verwerking
    onmogelijk door een unieke constraint.
11. Elke `security definer`-functie begint met een `auth.uid() is null`-tak.

### Schaal
12. Geen ongepagineerde lijstquery's.
13. Index op elke foreign key en elke kolom in WHERE/ORDER BY.
14. Geen N+1, en geen AI-call per lead zonder cache.

### Code
15. TypeScript strict. Geen `any`, geen `@ts-ignore` zonder reden.
16. Geen lege catch. Elke externe call heeft een timeout en geeft zijn
    statuscode terug — `fetch()` verwerpt alleen bij een netwerkfout.
17. Functies <50 regels, nesting <3 diep. Workflows <15 nodes of een subworkflow.
18. Elke async weergave heeft laad-, fout- én lege staat.

### Proces
19. Elke feature begint met `spec-planner` en eindigt met tests die de
    acceptatiecriteria dekken — **en minstens één daarvan staat op de naad.**
    De zes vragen staan in `docs/LESSEN-UIT-GOALBUDDIES.md` les 16; vraag 3
    beantwoord je door de belofte met de hand te breken.
20. **Reviewagents naar risico, niet naar schema.**

    | Agent | Wanneer |
    |---|---|
    | `security-reviewer` | direct, bij alles wat auth, RLS, betalingen, boekingen, webhooks, een AI-prompt of gebruikersdata raakt |
    | `privacy-reviewer` | direct, bij alles wat persoonsgegevens opslaat, verstuurt of aan een verwerker doorgeeft |
    | `code-critic` + `critical-user` | één keer per milestone, samen in één opdracht |

    Verifieer elke bevinding zelf; ze hebben het ook mis.
21. Migraties idempotent tegen de toestand waarvoor ze geschreven zijn, met
    rollback-pad en dump vooraf. `npm run migratie:nieuw` kiest het nummer;
    `npm run migraties:controle` bewaakt de map.
22. Elke controle heeft een geëxporteerde functie en een ijkingstest die hem
    élke vorm los aanbiedt. Een controle die je niet kunt voeden, kun je niet
    ijken — en een die nog nooit rood is geweest, is een aanname.
23. **Een reflexvalkuil wordt gereedschap, geen zin.** Schrijf je iets nieuws
    op, vraag dan eerst of het een controle kan worden.

## Commando's

```bash
npm run poort            # ⚠️ álles: typecheck, lint, tests, elke *:controle — dit is de poort vóór een push
npm run test             # alleen de suite
npm run migratie:nieuw -- "naam"     # een migratie met een nummer dat niemand anders claimt
npm run migratie:hernummer -- 0004 0006
npm run stand            # het migratieblok in WERKVOORRAAD genereren
```

De losse controles staan in `scripts/README.md`. **Draai de poort en niet een
greep eruit**, en lees het woord "ongemeten" in de uitslag: dat is geen groen.

## Beslisbevoegdheid

**Claude beslist zelf en werkt af.** Er zijn precies twee redenen om te stoppen
en te vragen (`docs/decisions/001-beslisbevoegdheid.md`):

1. **De keuze bepaalt wat er tegen een mens beloofd of in rekening gebracht
   wordt.** Hier: de prijs en inhoud van het traject, termijnen, wat de
   privacyverklaring belooft; wat Quinten of Evianne geld kost of extern
   vastlegt (een betaalprovider-account, een n8n-abonnement, een mailtool, een
   betaalde tier); een eerste mail, post of melding naar echte mensen.
2. **De handeling is onomkeerbaar vernietigend.** `drop`, `truncate`, een
   `delete` zonder filter, bulkverwijdering, `push --force` over andermans werk,
   een sleutel intrekken, de Fresha-configuratie of de Google Agenda aanpassen.

In élk ander geval: kies de conservatiefste optie die het werk áf maakt, bouw
door, en zet de aanname zichtbaar in het issue én in het beslisdocument. Niet
wachten, niet vragen, niet halverwege stoppen.

**Wat gewoon verboden blijft:** tijd buiten de helper, een geheim in de bundel
of een export, een mail zonder gelogde toestemming, PII in logs, `REPLICA
IDENTITY FULL` op een realtime-tabel. **Van gate naar afweging** (zelf
beslissen, wel verantwoorden): een dependency, het datamodel van een bestaande
tabel, auth-/RLS-logica, een migratie op het echte project, een nieuwe
workflow die verstuurt, meer dan 15 bestanden.

## Agents en commands

| Agent | Doet | Model |
|---|---|---|
| `spec-planner` | plan met datamodel, n8n, Bolt-schets, privacyparagraaf, acceptatiecriteria | opus |
| `backend-engineer` | Supabase: migraties, RLS, functies | sonnet |
| `automation-engineer` | n8n: workflows, webhooks, AI-agent, agenda, betalen | sonnet |
| `frontend-engineer` | Bolt-prompts, export beoordelen en repareren | sonnet |
| `content-writer` | tekst in Eviannes stem, alleen uit de bronmap | opus |
| `test-engineer` | tests op de acceptatiecriteria, RLS, idempotentie, de naad | sonnet |
| `security-reviewer` | autorisatie, webhooks, injectie, secrets | opus |
| `privacy-reviewer` | AVG: grondslag, toestemming, verwerkers, bewaren | opus |
| `code-critic` | architectuur, complexiteit, dode ketens | opus |
| `critical-user` | de bezoeker op haar telefoon én Evianne als beheerder | opus |

| Command | Doet |
|---|---|
| `/verder` | pakt het volgende issue en bouwt het af |
| `/feature <omschrijving>` | de volledige keten van plan tot PR |
| `/onderzoek <slug>` | een onderzoeksvraag tot beslisdocument |
| `/content [categorie]` | de content-sessie |
| `/audit` | de wekelijkse gezondheidscheck, inclusief de funnelcijfers |
