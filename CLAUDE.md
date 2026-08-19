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
- Eén branch per Linear-issue. Gebruik de naam die Linear zelf voorstelt
  (`quintenstrijdonk/qs8-98-08-rls-testsuite-met-echte-jwts`) — dan koppelt Linear
  de branch, de PR en het issue automatisch aan elkaar.
- Nooit rechtstreeks op `main` committen zodra er code staat.
- Commit-berichten in het Nederlands: eerste regel wat er verandert, daarna
  waaróm. Bij een niet-vanzelfsprekende keuze een verwijzing naar
  `docs/decisions/NNN-*.md`.
- Een PR gaat pas open na `code-critic`, `security-reviewer` en `critical-user`.

## ⚠️ Solo-fase — geldt tot de engineer er is
Er is niemand die jouw werk nakijkt.
1. **Tests zijn de enige review die bestaat.** Niet optioneel.
2. Bij twijfel over een architectuurkeuze: stop en vraag het.
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

   ⚠️ **Drie benoemde verruimingen, besloten door Quinten op 18-08-2026.** De groep
   mag je reeks zien (A15), je risicostatus zien (A17) en je deadline-verschuiving
   zien (A7). Die staan met onderbouwing in `docs/decisions/002-...md` §4a. Ze
   verruimen de regel op drie plekken; ze schaffen hem niet af. Voor élk ander
   oppervlak geldt hij onverkort, en bij twijfel is het antwoord nee.

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
19. Geen merge zonder code-critic, security-reviewer en critical-user.
20. Migraties zijn idempotent, met rollback-pad en dump vooraf.

## Commando's
```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

## Wat je NOOIT doet zonder te vragen
- Een dependency toevoegen
- Het datamodel van een bestaande tabel wijzigen
- Auth-, RLS-, goedkeurings- of commitment-logica aanpassen
- Een tijd-/weekberekening schrijven buiten `shared/time`
- Een migratie draaien op iets anders dan lokaal
- Een Vercel-specifieke API of package gebruiken
- Meer dan 15 bestanden in één keer aanraken
