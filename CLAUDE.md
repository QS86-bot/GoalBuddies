# CLAUDE.md — GoalBuddies

> Grondwet van deze codebase. Claude Code en alle subagents lezen dit bij elke sessie.
> De eerste beslissingen in dit project zijn de duurste; ze gaan jaren mee.

## 👉 Begin hier

**Nieuwe sessie? Lees `docs/WERKVOORRAAD.md`.** Daar staat waar het project
staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet als je
het overslaat. Sectie 0 geeft de stand in tien regels. Dit bestand zegt hoe je
werkt; dat bestand zegt wat er aan de beurt is.

**`docs/VOLGENDE-SESSIE.md`** bevat de startprompt om in een nieuwe chat te
plakken: de stand, de werkafspraken en de valkuilen die dit project al een keer
gekost hebben. Werk hem bij aan het eind van elke sessie.

Verder bouwen doe je met **`/verder`**. Die pakt zelf het volgende issue uit
Linear en werkt het af tot een pushbare branch.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.

Note: teammates also need gstack installed locally — clone `https://github.com/garrytan/gstack` and run `./setup` from within `~/.claude/skills/gstack` (or their host's skills dir) to register the skills.

## Project
- **Naam:** GoalBuddies
- **Doel:** Accountability- en doelen-app: AI-gestuurde doelopsplitsing, buddy-groepen
  met onafhankelijke doelen, peer-goedkeuring van voltooiingen, commitment devices,
  en een instelbare start-van-de-week per gebruiker.
- **Schaaldoel:** 100k+ users.
- **Team:** Quinten (product owner, architect én enige developer).
  Claude Code is de primaire implementer. Engineer-review vanaf eind okt/nov 2026.

### Documenten
| Bestand | Wat erin staat |
|---|---|
| `PRD-accountability-app.md` | Productdefinitie, epics, user stories |
| `docs/PRODUCT-PROPOSAL.md` | Product- en ontwerpvoorstel, incl. de vier goedgekeurde beslispunten |
| `docs/research/habit-huddle-teardown.md` | Concurrentieanalyse Habit Huddle |
| `docs/decisions/NNN-*.md` | Architectuurbeslissingen |
| `docs/ENGINEER-REVIEW.md` | Agenda voor de engineer-review in november |
| `docs/DEPLOY.md` | Deploy- en migratiehandleiding |

**Linear:** project GoalBuddies in team `QS86-bot Linear` (prefix `QS8`).
**Supabase:** project `goalbuddies`, ref `wehgocadxehottiiyvsc`, regio `eu-west-3`.
**GitHub:** `QS86-bot/GoalBuddies`, hoofdbranch `main`.

### Versiebeheer
- **Eén branch per Linear-issue, en dat is vastgelegd op 23-08-2026.** Gebruik de
  naam die Linear zelf voorstelt
  (`quintenstrijdonk/qs8-98-08-rls-testsuite-met-echte-jwts`) — dan koppelt Linear
  de branch, de PR en het issue automatisch aan elkaar.

  Dit wint van "één branch per epic", dat tot 23-08 in `docs/VOLGENDE-SESSIE.md`
  stond. Twee documenten die elkaar tegenspraken leverden in de praktijk geen van
  beide op: PR #1 was één branch voor acht issues met een zelfbedachte naam, en
  dus koppelde Linear niets — alle acht statussen zijn met de hand bijgewerkt, en
  bij een gemiste zou het bord hebben gelogen.

  ⚠️ **Raakt je werk meerdere issues, dan zijn het meerdere branches en meerdere
  PR's.** Kan een issue niet los landen omdat het op een ander leunt, gebruik dan
  de blokkeerrelatie in Linear en land ze in volgorde. Bundelen mag alleen als de
  issues één ondeelbare wijziging zijn — en dan hoort er één issue te zijn, geen
  acht.
- Nooit rechtstreeks op `main` committen zodra er code staat.
- **Werk landt via een PR op GitHub**, met een merge-commit en niet met een
  squash: de commit-berichten in dit project dragen het waaróm, en squashen slaat
  dat plat.
- Commit-berichten in het Nederlands: eerste regel wat er verandert, daarna
  waaróm. Bij een niet-vanzelfsprekende keuze een verwijzing naar
  `docs/decisions/NNN-*.md`.
- Een PR gaat pas open nadat de reviewagents gedraaid hebben die bij die
  wijziging horen — zie onwrikbare regel 19, die sinds 20-08-2026 naar risico
  indeelt in plaats van alle drie op elke epic.

## ⚠️ Solo-fase — geldt tot de engineer er is
Er is niemand die jouw werk nakijkt.
1. **Tests zijn de enige review die bestaat.** Niet optioneel.
2. Bij twijfel over een architectuurkeuze: kies en bouw door — zie *Beslisbevoegdheid*.
3. Documenteer elke niet-vanzelfsprekende keuze in `docs/decisions/NNN-titel.md`.
4. Houd `docs/ENGINEER-REVIEW.md` bij als agenda voor november.

## ⚠️ Greenfield — de eerste beslissingen zijn de duurste
Voordat er één feature gebouwd wordt:
1. **Datamodel eerst, volledig, met RLS.** Doelen, buddy-groepen, lidmaatschappen,
   voltooiingen, goedkeuringen, commitments. Op papier vóór in code.
2. **Week-start is een fundamentele keuze, geen instelling achteraf.** Elke query
   die "deze week" berekent, moet de voorkeur van de gebruiker respecteren.
   Bouw hier vanaf de eerste dag een gedeelde helper voor; los het nooit ad hoc op.
3. Kies de conventies één keer en leg ze hier vast zodra ze er zijn.

## Stack
- Frontend: React + Expo (web + mobiel) + TypeScript (strict)
- Backend: Supabase — **gratis tier op dit moment**
- Hosting: **Hostinger** (testfase), later Vercel
- Observability: Sentry
- Werkvoorraad: Linear
- Visuele richting: **het Q-Projects navy-stelsel**, gedeeld met de Status Tracker
  (`tracker.q-projects.tech`), thema's `navy` en `navy-licht`. Navy is de
  ondergrond, goud het accent. **Gebruik uitsluitend Q-Projects-kleurstellingen** —
  geen zelfbedachte kleuren erbij. Volledige tokenset in Linear QS8-87.
  *(Vervangt de emerald-richting uit PRD 10.1, gewijzigd 15-08-2026.)*

### Live-adressen
| Omgeving | Adres |
|---|---|
| GoalBuddies | `goalbuddies.q-projects.tech` (Hostinger, `public_html/goalbuddies`) |
| Status Tracker | `tracker.q-projects.tech` — referentie voor het design |

## ⚠️ Supabase gratis tier
- Projecten pauzeren na inactiviteit.
- Beperkte opslag, bandbreedte en actieve gebruikers.
- **Geen automatische backups.** `pg_dump` vóór elke migratie.
- Geen read replicas; connection pooling vanaf dag één.
- Markeer alles wat een betaalde tier vereist met `// TODO(paid-tier)`.

## ⚠️ Hostinger + Expo
- Geen Vercel-specifieke API's, packages of Edge Runtime.
- Server-side code als gewone langdraaiende Node-server.
- Alle configuratie via env vars.
- Houd `docs/DEPLOY.md` actueel als migratiehandleiding.
- Expo: houd web- en native-code gescheiden waar platformen verschillen;
  deel de datalaag, niet de platformspecifieke UI.

## Domeinregels (specifiek voor GoalBuddies)

1. **Twee klokken, expliciet gescheiden.** `shared/time` levert er twee, en beide
   bestaan vanaf dag één:
   - `currentUserCycle(userId)` — de persoonlijke week-startdag. Bepaalt wanneer
     weekdoelen resetten en wanneer punten tellen.
   - `currentGroupPeriod(groupId)` — de huddledag van de groep. Bepaalt de
     weekafsluiting, De Ketting en het groepsoverzicht.

   Geen enkele query, streak-berekening of UI-component rekent dit zelf uit.
   Test elke week-afhankelijke feature met minstens twee verschillende week-starts.

2. **Tijdzones.** Alles in UTC opslaan. "Vandaag" en "deze week" worden berekend in
   de tijdzone van de gebruiker. Een streak die om middernacht verkeerd breekt,
   kost je een gebruiker.

3. **Peer-goedkeuring is een autorisatiegrens.** Alleen een lid van dezelfde
   buddy-groep mag een voltooiing goedkeuren. Nooit jezelf. Afgedwongen in RLS
   **én** met een database-constraint, niet alleen in de UI. Test dit expliciet.

4. **Buddy-groepen hebben onafhankelijke doelen.** Een groepslid ziet de doelen
   van anderen alleen voor zover de groepsinstellingen dat toestaan — RLS bepaalt
   dit, niet de UI.

5. **Commitment devices raken vertrouwen.** Alles wat een consequentie oplegt
   (inzet, verlies, publieke zichtbaarheid) moet expliciet bevestigd zijn,
   auditeerbaar, en nooit stilzwijgend geactiveerd.

6. **Streaks en voltooiingen zijn append-only.** Corrigeren gebeurt via een
   correctie-record, niet door geschiedenis te overschrijven.

7. **⚠️ Falen is nooit publiek.** De groepsfeed, systeemberichten, het
   groepsoverzicht, De Ketting, seizoensrecaps en notificaties bevatten uitsluitend
   positieve signalen: afgeronde weekdoelen, mijlpalen, goedkeuringen,
   aanmoedigingen. **Nooit** een gemiste week, verbroken reeks of achterstand van
   iemand anders. Eigen tegenvallers zijn privé zichtbaar voor jezelf.

   Er zijn precies drie routes waarlangs tegenslag de groep bereikt, en alle drie
   lopen via de gebruiker zelf: vraag 2 van de weekafsluiting, de knop "vraag je
   groep om hulp" van de Risico-radar, en het verzoek om je streefdatum te
   verschuiven (A7). De enige uitzondering is een straf die de gebruiker zelf
   vooraf heeft ingesteld en bevestigd.

   ⚠️ **Twee benoemde verruimingen.** De groep mag je reeks zien (A15) en je
   deadline-verschuiving zien (A7 — die vraag je zelf aan). Ze staan met
   onderbouwing in `docs/decisions/002-...md` §4a. Ze verruimen de regel op twee
   plekken; ze schaffen hem niet af. Voor élk ander oppervlak geldt hij
   onverkort, en bij twijfel is het antwoord nee.

   ⚠️ **A17 was de derde en is op 20-08-2026 teruggedraaid.** De groep zag je
   risicostatus, en het beslisdocument had zelf al opgeschreven dat dat
   herbevestigd moest worden vóór EPIC 12 — want vanaf het moment dat de
   Risico-radar draait, ís `risk_status` een afgeleide van andermans gemiste
   weken. Bij die herbevestiging is het dichtgezet: migratie 0050 verhuisde de
   kolommen naar `goal_risk`, eigenaar-only. **Dit is het bewijs dat "herbevestigen
   vóór X" werkt — schrijf zo'n aantekening op zodra een besluit aan een
   toekomstige feature hangt.**

   *Waarom:* in een groep van drie vrienden doodt één schaamtemoment de hele groep.
   Dit is de belangrijkste vondst uit de Habit Huddle-analyse.

   **Bij élk nieuw ding dat de groep te zien krijgt, twee vragen:** kan hieruit
   iemands gemiste week worden afgeleid, én kan iemand dat met één API-verzoek
   uitlezen buiten de UI om? De les van EPIC 5 is dat de schermen de regel netjes
   aanhielden terwijl de database hem lekte. **De regel is pas afgedwongen als de
   dátabase hem afdwingt.** RLS kan geen kolommen beperken: is de eis "deze kolom
   mag je niet lezen", dan heb je een kolomgrant, een view met expliciete
   kolomlijst of een rijbeperking nodig — een policy alleen is altijd te weinig.

   De volledige inventarisatie van elk groepsoppervlak staat in
   `docs/decisions/002-domeinregel7-oppervlakken.md`, inclusief wat er vandaag nog
   lekt en met welke deadline. **Werk dat document bij bij elk nieuw oppervlak.**

   Drie sloten die je niet mag omzeilen:
   - **Een nieuw type systeembericht vraagt een migratie.** De CHECK
     `chat_messages_system_event_bekend` is een allowlist en geldt ook voor
     `service_role`. De kopie in `src/modules/buddies/chat-schemas.ts` staat onder
     test — een toevóeging is daar ook een rode test, niet alleen een verkeerde.
   - **Een systeembericht noemt de persoon en de gebeurtenis, nooit een titel,
     notitie of niveau.** Een bericht is een onveranderlijke kopie die de
     autorisatie overleeft waaronder hij gemaakt is; ontkoppelen trekt de
     toestemming in, maar wist geen chat. Uitleg in beslisdocument 002 §3.
   - **⚠️ Nooit `REPLICA IDENTITY FULL` op een tabel in de realtime-publicatie**
     (`completions`, `weekly_goals`, `chat_messages`). Supabase past RLS toe op
     INSERT en UPDATE, maar **niet op DELETE**: met `FULL` gaat bij een
     verwijdering de volledige oude rij over de lijn — inclusief
     `status = 'missed'`, de notitie of de tekst van een privégesprek — naar
     iedereen die zich abonneert, lid of niet. `publish` is een optie van de
     publicatie en niet per tabel in te stellen, dus er is geen technische rem.
     `realtime_bewaking()` (migratie 0027) maakt het testbaar; de test staat in
     `tests/rls/epic7.test.ts`. Abonneer je bovendien nooit op DELETE.

8. **De vloer telt.** Een weekdoel kan een vloer hebben (de versie die je op je
   slechtste week nog haalt) naast het plafond. De vloer is optioneel, maar de UI
   moedigt hem actief aan. Vloer gehaald betekent dat de week telt: de reeks loopt
   door en goedkeuring verloopt identiek. Alleen de punten verschillen.
   De reeks dient de gebruiker, nooit andersom.

9. **De Dagzet is standaard privé** en levert nooit punten of goedkeuring op. De week
   blijft de enige eenheid die telt. De Dagzet is aanwezigheid, geen prestatie — een
   dagboekregel die je desgewenst met je groep deelt. Een dag overslaan heeft geen
   enkel gevolg.

10. **Het puntenmodel.** Plafond gehaald `+2`, vloer gehaald `+1`, week gemist `−1`,
    adempauze `0`. Elk doel heeft een puntenplafond: de som van de plafondpunten van
    zijn weekdoelen. Taken toevoegen verhoogt het plafond.

    Drie regels die daaruit volgen en niet mogen verwateren:
    - Een **weekpas beschermt de reeks, niet het punt.** Anders is missen gratis en
      zegt de score niets.
    - **Punten zijn privé.** `points_ledger` en het puntentotaal zijn alleen voor de
      eigenaar leesbaar. Een dalend totaal is zichtbaar bewijs van een gemiste week,
      en dat botst met domeinregel 7. De groep ziet De Ketting en mijlpalen.
    - **Score en voortgang zijn twee dingen.** Voortgang is mijlpaalgebaseerd en loopt
      alleen omhoog; de score kan dalen. Nooit in één balk tonen.

    ⚠️ **Een deadline verschuiven kost geen punten** en dat is een besluit, geen
    omissie (Q-TODO A7). De rem zit ergens anders: verschuiven kán alleen met
    akkoord van een buddy, en zonder akkoord blijft de datum staan. Zou er ook een
    minpunt op staan, dan betaal je twee keer voor één gebeurtenis. Alleen
    `correction` mag verder negatief boeken, en dat is per definitie het
    rechtzetten van iets dat al geboekt was.

11. **Een straf treedt alleen in werking bij een verstreken deadline.** Een gemiste
    week kost een minpunt, meer niet. De begunstigde groep krijgt pas leesrecht op het
    commitment op het moment dat het verschuldigd wordt.

## Emoji — vastgelegd 22-08-2026 (QS8-111)

**De app zelf gebruikt geen emoji in tekst.** Niet in knoppen, statuslabels,
systeemberichten, meldingen of UI-componenten. Ze vertalen slecht, ze renderen
per platform anders, en een schermlezer leest "gezicht met vreugdetranen" midden
in een zin. Op 20-08 en 22-08 nagemeten: er stond er geen één in `src/` of `app/`.
Deze regel legt vast wat er al was.

**De gebruiker mag ze overal typen.** Eén uitzondering waar de app ze zelf wél
gebruikt: reacties op een bericht (A24). Daar ís de emoji de boodschap.

⚠️ **Gevolg dat geen zin maar een controle nodig heeft.** Omdat gebruikers ze
overal mogen typen, mag geen enkele plek gebruikerstekst afkappen of het eerste
teken pakken met `charAt(0)`, `[0]` of `.slice(0, n)`. JavaScript telt in
UTF-16-eenheden; een emoji kost er twee en 👨‍👩‍👧‍👦 elf. Snijden op zo'n grens
levert een halve codepoint op en dat rendert als `�`. Gebruik de gedeelde helpers
uit `src/shared`, nooit de kale string-methodes. Zie QS8-118.

⚠️ Zod's `.max()` en `.length` tellen UTF-16-eenheden; `char_length` in
Postgres telt codepunten. Die twee zijn niet dezelfde grens.

**Eén eenheid overal: codepunten, want dat is wat de database telt.** Gebruik
`telTekens()` uit `src/shared/tekst`, ook in een teller onder een invoerveld.
Een teller die in grafemen telt terwijl de grens in codepunten staat, is een
nieuwe fout en geen reparatie: hij zegt "lang genoeg" op een ander moment dan
het schema. `telGrafemen()` bestaat voor waar je écht zichtbare tekens bedoelt,
zoals een preview — nooit voor een grens.

⚠️ Bij een **ondergrens** gaat het verschil de gevaarlijke kant op. `.length` is
altijd ≥ `char_length`, dus een client die in UTF-16 telt laat door wat Postgres
weigert. Tien emoji halen `.length >= 20`, maar `char_length` is dan 10 en de
gebruiker kreeg een storingsmelding nadat het formulier "Lang genoeg" zei. Dat
stond zo in het deadline-argument tot QS8-118.

## Architectuur
Modulaire monoliet. Module-communicatie alleen via `modules/<naam>/index.ts`.

```
src/
  modules/
    goals/          doelen, opsplitsing, mijlpalen
    buddies/        groepen, lidmaatschappen, uitnodigingen
    completions/    voltooiingen, peer-goedkeuring, streaks
    commitments/    commitment devices
    ai/             doelopsplitsing via AI
  shared/
    time/           ⚠️ week-start, tijdzone, "vandaag" — één bron van waarheid
  lib/
supabase/migrations/
docs/decisions/
```

## Onwrikbare regels

### Beveiliging
1. Elke tabel heeft RLS met policies voor SELECT, INSERT, UPDATE én DELETE.
2. Autorisatie op de server. Groepslidmaatschap wordt in RLS afgedwongen.
3. Alle input servergevalideerd met Zod.
4. Secrets alleen via env vars.
5. **Rate limiting op AI-calls, uitnodigingen en auth.** Uitnodigingen zijn een
   spam-vector; bouw een limiet per gebruiker per dag.
6. Elke AI-call kost geld: cache, dedupliceer, quota per gebruiker, log kosten per user-id.

### Correctheid (belangrijkste categorie hier)
7. Geen enkele tijd- of weekberekening buiten `shared/time`.
8. AI-jobs draaien nooit synchroon in de request. Job-tabel + polling of realtime.
9. Goedkeuringen in een transactie; dubbele goedkeuring is onmogelijk (unieke constraint).

### Schaalbaarheid
10. Geen ongepagineerde lijstquery's.
11. Index op elke foreign key en elke kolom in WHERE/ORDER BY.
12. Geen N+1 — met name in groepsoverzichten (klassieke valkuil hier).

### Code
13. TypeScript strict. Geen `any`, geen `@ts-ignore` zonder reden.
14. Geen lege catch. Elke externe call heeft een timeout.
15. Functies <50 regels, nesting <3 diep.
16. Elke async view heeft loading-, error- én empty-state.

### Proces
17. Elke feature begint met `spec-planner`.
18. Elke feature eindigt met tests die de acceptatiecriteria dekken.
19. **Reviewagents naar risico, niet naar schema** — zie hieronder.
20. Migraties zijn idempotent, met rollback-pad en dump vooraf.

#### Regel 19 uitgeschreven (herzien 20-08-2026)

Stond eerst als "geen merge zonder code-critic, security-reviewer en
critical-user", op elke epic. Dat was te grof: het draaide drie agents koud over
dezelfde bestanden, ook bij een wijziging waar twee van de drie niets te zoeken
hadden.

**De maatstaf is of een bevinding rot als je hem laat liggen.**

| Agent | Wanneer | Waarom |
|---|---|---|
| `security-reviewer` | **Direct**, bij elke wijziging die auth, RLS, punten, goedkeuring, commitments of een nieuw groepszichtbaar oppervlak raakt | Bevindingen stapelen. Zie hieronder. |
| `code-critic` | Eén keer per **milestone** | Dode code, laagscheiding en complexiteit kosten over drie maanden evenveel om te repareren als vandaag |
| `critical-user` | Eén keer per **milestone**, samen met code-critic in één opdracht | Idem voor tekst, toon en randgevallen |

⚠️ **Waarom de security-reviewer nooit wacht.** Drie redenen, alle drie op
19–20 augustus in de praktijk gezien:

1. **Wat je uitstelt groeit mee met wat je erop bouwt.** De vier routes naar een
   weggepoetste week (0043 t/m 0046) zijn gevonden doordat er direct gereviewd
   werd. Waren ze blijven liggen, dan stond EPIC 11, 12 en 9 bovenop een reeks
   die te verzinnen was — en dan is het niet één migratie maar alles wat erop
   leunt opnieuw nakijken.
2. **Fouten worden gekopieerd.** De `auth.uid()`-NULL-val kostte veertig regels
   omdat er precies één functie was die hem had. Elke definer-functie daarna is
   een kopie van de vorige.
3. **De database is nu leeg, en dat is tijdelijk.** Vandaag kun je testrijen
   aanmaken, verifiëren en weggooien. Zodra er één echte gebruiker is, is een
   vervalste reeks échte data die gemigreerd of gecorrigeerd moet worden.

⚠️ **Verifieer elke bevinding zelf voordat je hem verwerkt.** Ze hebben het ook
mis: in de ronde van 20-08 was de zwaarste bevinding aantoonbaar onjuist (ze las
een migratiebestand waar de gedéployde functie strenger was), terwijl twee andere
kritieke bevindingen wél klopten. `pg_get_functiondef()` is de waarheid.

**Wat je uitstelt, vang je zelf op** met een controlepas langs wat die twee
agents historisch vinden: dode code, dubbele teksten, ontbrekende loading-,
error- of lege staat, een component dat op het verkeerde scherm kan belanden, en
copy die een regel uitlegt die de gebruiker anders zelf moet raden.

## Commando's
```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

## Beslisbevoegdheid — vastgelegd 22-08-2026

> Vervangt de lijst "Wat je NOOIT doet zonder te vragen". Quinten heeft die op
> 22-08-2026 ingeruild voor één grens, omdat de lijst hem vaker ophield dan
> beschermde.

**Claude beslist zelf en werkt af.** Er zijn precies twee redenen om te stoppen
en te vragen:

1. **De keuze bepaalt wat er tegen een mens beloofd of in rekening gebracht
   wordt.**
2. **De handeling is onomkeerbaar vernietigend.**

In élk ander geval: kies de conservatiefste optie die het werk áf maakt, bouw
door, en zet de aanname zichtbaar in het issue én in het beslisdocument.
Niet wachten, niet vragen, niet halverwege stoppen.

### Wat die twee hier betekenen

GoalBuddies heeft nog geen betalende klanten. Zonder vertaling is grens 1 leeg
en staat er in de praktijk "vraag nooit iets". Dit is de vertaling:

**Grens 1 — beloofd of in rekening gebracht.**
- Een **commitment device**: alles wat een gebruiker te horen krijgt als een
  consequentie die hij draagt — inzet, verlies, een straf die verschuldigd
  wordt. Dat is hier het contract. Domeinregel 5 staat er niet voor niets.
- Iets dat **Quinten geld kost** of hem extern vastlegt: een betaalde tier, een
  tweede Supabase-project, een betaalde API, een domein, een developer-account.
- Een **eerste uitgaande stroom naar echte mensen** die niet meer terug te nemen
  is: een e-mail of pushmelding naar de hele gebruikersgroep.

**Grens 2 — onomkeerbaar vernietigend.**
- Gegevens of geschiedenis weggooien die niet terug te halen is: `drop`,
  `truncate`, een `delete` zonder filter, een migratie zonder rollback-pad op
  een **gevulde** tabel, gebruikers in bulk verwijderen.
- `git push --force` over werk dat niet van jou is.
- Een sleutel roteren of intrekken waarmee je jezelf of Quinten buitensluit.

Een migratie die kolommen **toevoegt** aan een lege tabel valt hier niet onder.
Rollback in de kop, doorgaan.

### Wat gewoon verboden blijft — dat is iets anders dan vragen

Deze stonden in de oude lijst maar waren nooit vragen; het zijn harde regels en
ze blijven staan:
- Geen tijd- of weekberekening buiten `shared/time` (correctheidsregel 7).
- Geen Vercel-specifieke API of package.
- Geen `REPLICA IDENTITY FULL` op een tabel in de realtime-publicatie.
- Geen nieuw type systeembericht zonder migratie.

En deze zijn van gate naar afweging gegaan — je beslist ze zelf, maar je
verantwoordt ze in het beslisdocument: een dependency toevoegen, het datamodel
van een bestaande tabel wijzigen, auth-/RLS-/goedkeuringslogica aanpassen, een
migratie op het echte project draaien, meer dan 15 bestanden aanraken.
