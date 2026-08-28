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

### Wie bezit welk feit — vastgelegd 23-08-2026 (QS8-125)

Drie documenten beschreven dezelfde stand en liepen op één dag **vijf keer**
uiteen. Twee van die vijf ontstonden tijdens het bijwerken van diezelfde
documenten: één plek bijgewerkt, de andere vergeten. Wie kopieën met de hand
onderhoudt, maakt het probleem groter.

| Document | Bezit | Bezit níét |
|---|---|---|
| `CLAUDE.md` | de regels en conventies — domeinregels, verruimingen, werkwijze | de stand |
| `docs/WERKVOORRAAD.md` | de stand en de volgorde — testteller, migratiebereik, wat af is | de regels |
| `docs/VOLGENDE-SESSIE.md` | de startprompt en de valkuilen | allebei de andere |

**Staat een feit in het ene document, dan verwijst het andere ernaar — het
herhaalt het niet.** `npm run docs:controle` wordt rood zodra dat wel gebeurt en
draait mee in `/audit`.

⚠️ **Een script vangt alleen wat een patroon heeft.** "EPIC 3 is nooit gedraaid"
twintig regels boven "EPIC 3 heeft gedraaid" is geen getal, en QS8-77 die op
Done staat terwijl twee documenten hem open noemen al helemaal niet. Daarvoor
geldt de handmatige regel: **werk je iets bij, grep dan op dat feit in alle drie
de bestanden voordat je klaar bent**, en loop bij het afsluiten van een issue na
of de status in Linear en in de documenten hetzelfde zeggen.

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

  ⚠️ **Sinds 24-08 een controle en geen zin meer.** `npm run verbindingen:controle`
  draait mee in `/audit` en wordt rood zodra er een Postgres-driver in
  `package.json` staat of een verbindingsstring in `src/`, `app/` of
  `supabase/functions/`. Vandaag klopt de regel omdat álles via PostgREST loopt
  en er niets is dat een socket kan openen — dat is geen instelling maar de
  afwezigheid van iets, en die is stil kwijt te raken. `max_connections` is **60**
  voor de héle database. Wat er moet gebeuren zodra er een langdraaiende
  Node-server bijkomt, staat in `docs/DEPLOY.md` §2.7: transactiepooler op 6543,
  `prepare: false`, kleine pool.
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

   ⚠️ **Besluit A41, 24-08-2026: er komt een keuze per groep — en de standaard
   blijft beschermd.** Bij het aanmaken kiest een groep tussen **beschermd**
   (zoals nu, en de standaard) en **open** (de groep ziet ook tegenslag). Dat is
   variant 2 van QS8-128; variant 3, de regel afschaffen, is afgewezen.

   Wat dat besluit **niet** is:

   - Geen verruiming van bestaande groepen. Alles wat vandaag dicht zit, blijft
     dicht tot de epic gebouwd is, en bestaande groepen zijn **beschermd**.
   - Geen tweede pad naast RLS. De keuze wordt een kolom op `groups` waar de
     policies op variëren; hij mag nooit alleen in de UI bestaan.
   - Geen keuze die je later stilzwijgend omzet. Een groep die van beschermd naar
     open gaat, verandert met terugwerkende kracht wat er over ándere leden
     zichtbaar wordt — dus dat is een handeling met dezelfde zorgvuldigheid als
     een commitment device (domeinregel 5).

   ⚠️ **Gebouwd op 24-08-2026 (QS8-132, migraties 0076 t/m 0079).** De kolom
   `groups.zichtbaarheid` bestaat en is voor geen enkele client schrijfbaar; het
   omzetten loopt via `zet_groepszichtbaarheid()` — actieve beheerder, expliciet
   bevestigd, een rij in `group_events`, een systeembericht. Alle twintig
   oppervlakken zijn beoordeeld en alles wat om moest is om: weekdoelen (0077),
   de beste reeks en de laatste cyclus (0078), De Ketting (0079).

   ⚠️ **"Open" betekent nooit "alles open", en zeven oppervlakken bewijzen dat.**
   Punten (A42), systeemberichten over tegenslag, realtime, ingetrokken
   goedkeuringen, de weekpassen, de teller van De Ketting en de
   mijlpaalaankondiging blijven dicht, óók in een open groep. Wie er ooit een wil
   verruimen, leest eerst de rij en de reden in
   `docs/decisions/002-domeinregel7-oppervlakken.md` §6b.

   ⚠️ **Voor élk níeuw oppervlak is beschermd het antwoord tot iemand het
   tegendeel besluit.** Bouw niets "vast open"; dat is precies hoe een standaard
   verschuift zonder dat iemand het besloten heeft.

   *Waarom:* in een groep van drie vrienden doodt één schaamtemoment de hele groep.
   Dit is de belangrijkste vondst uit de Habit Huddle-analyse.

   ⚠️ **En juist bij zakelijk gebruik weegt dat zwaarder, niet lichter.** Zit er
   een leidinggevende in een buddy-groep, dan beschermt deze regel niet meer tegen
   schaamte maar tegen een beoordelingsgesprek. Dat is een zwaardere reden om hem
   te houden dan de reden waarom hij er staat.

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

      ⚠️ **Besluit A42, 24-08-2026: zo houden.** De vraag was of een gedeeld
      puntentotaal niet competitiever is. Dat is het, en het lekt: wie het totaal
      deelt, deelt het missen via een omweg. Wat wél mag is een teller die **alleen
      optelt** — "deze groep heeft samen 47 weken afgerond". Die gaat nooit omlaag
      en verraadt niemand. Dat is dezelfde vorm als De Ketting en zijn mijlpalen
      (migratie 0070), dus het is een bestaand patroon en geen idee.
    - **Score en voortgang zijn twee dingen.** Voortgang is mijlpaalgebaseerd en loopt
      alleen omhoog; de score kan dalen. Nooit in één balk tonen.

    ⚠️ **Een deadline verschuiven kost geen punten** en dat is een besluit, geen
    omissie (Q-TODO A7). **Herbevestigd op 24-08-2026 als besluit A43** (QS8-129):
    er komt géén minpunt op verschuiven zonder akkoord. Dat zou de enige plek in
    het model zijn waar je je uit een afspraak kunt kópen, en een punt is
    goedkoper dan een gesprek. De rem zit ergens anders: verschuiven kán alleen met
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

⚠️ **Dit is sinds 23-08 een controle en geen zin meer:** `npm run emoji:controle`
draait mee in `/audit` en wordt rood zodra er emoji in app-tekst staat.
Commentaar en testbestanden tellen niet mee — de ⚠️ hierboven is huisstijl, en
de tests vóéden juist 😀 en 👨‍👩‍👧‍👦 aan `telTekens()`.

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
18. Elke feature eindigt met tests die de acceptatiecriteria dekken — en
    minstens één daarvan staat op de náád. Zie hieronder.
19. **Reviewagents naar risico, niet naar schema** — zie hieronder.
20. Migraties zijn idempotent, met rollback-pad en dump vooraf.

    ⚠️ **Sinds 24-08 een controle en geen zin meer.** `npm run migraties:controle`
    draait mee in `/audit` en wordt rood bij een gat in de nummering, twee
    migraties met hetzelfde nummer, of een migratie zonder rollback-pad in zijn
    kop. Het gat is de belangrijkste van de drie: de bestanden zijn de enige
    manier om dit schema ergens anders op te bouwen, en ontbreekt er één, dan
    toetst de RLS-suite daar een ánder schema dan productie — groen zonder iets
    te bewijzen. Twee keer met de hand gevonden, beide keren bij toeval.

    ⚠️ **En sinds 28-08 is "idempotent" scherper gesteld, want letterlijk
    gelezen eist die zin iets dat het schema slechter maakt.** Gemeten door het
    schema op een lege database op te bouwen en daarna élk bestand een tweede
    keer af te spelen: zeven van de 109 vielen om, en dat waren twee
    verschillende dingen.

    - **Klasse A — werkelijk niet idempotent.** Drie regels in twee bestanden:
      een `create function` zonder `or replace` en een `create index` zonder
      `if not exists`. Dit is de fout, en die hoort weg.
    - **Klasse B — valt om, en dat is de beveiliging.** Vijf bestanden proberen
      bij een tweede ronde een **oudere** definitie terug te zetten van een
      object dat een latere migratie veranderd heeft. Postgres weigert dat.
      **Die weigering is het enige dat de terugzet tegenhoudt** — bij
      `group_visible_streaks` zou het zelfs een domeinregel-7-besluit
      terugdraaien (0003 laat `last_cycle_start` er bewust uit, 0078 zette hem
      er onder besluit A41 weer in). **Zo'n fout neem je nooit weg.**

    **De regel luidt dus: idempotent tegen de toestand waarvoor de migratie
    geschreven is.** Verandert een latere migratie de vorm van hetzelfde object,
    dan is de botsing bij herhaling correct gedrag en geen defect.

    ⚠️ De grendel staat in `tests/migraties/idempotentie.test.ts` en draait mee
    in `npm test`, dus bij elke push. Hij vindt klasse A en laat klasse B met
    rust; beide helften zijn met de hand geijkt. Hij hoort thuis in
    `migraties:controle` en staat in `tests/` omdat `scripts/` het werkgebied
    van een parallelle sessie was — verhuizen zodra dat vrij is.

    ⚠️ **De drop-uitzondering leest de handtekening en niet alleen de naam.**
    Een migratie die de vorm van een functie verandert móet hem eerst droppen,
    want `or replace` kan een returntype niet wijzigen — dat is goed. Maar 0059
    dropte `plaats_systeembericht(uuid, text, text)` en maakte daarna een versie
    met zés argumenten: een andere functie, dus de drop dekte hem niet. Een
    controle die op naam vergelijkt, laat precies die bug door.

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

#### Regel 18 uitgeschreven: elk onderdeel klopt en het geheel lekt (24-08-2026)

Drie keer in één week was de duurste fout dezelfde fout, en alle drie de keren
was er een uitgebreide, groene testsuite die er niets van zag.

| Wanneer | Wat er klopte | Wat er lekte |
|---|---|---|
| Migratie 0032/0034 | `SYSTEEM_GEBEURTENISSEN` en de CHECK, elk voor zich | De test vergeleek de app-lijst met **zichzelf**. 0032 zette `deadline_requested` op de CHECK, de app bleef op acht staan, en er werd niets rood |
| QS8-115 / PR #9 | `deadlineVerzoekSchema` c.s. waren netjes vertaald | Ze verhuisden naar een eigen bestand (QS8-120/121) en de Nederlandse zinnen kwamen terug. De schematests toetsen de **inhoud** van de melding, niet de **herkomst** |
| QS8-24 | `scrubMessage()` en `scrubContext()`, allebei uitgebreid getest | `reportError()` nam de geschoonde melding en zette de **ruwe stack** ernaast. De eerste regel van een stack ís de melding, dus alles ging er alsnog uit |
| QS8-85 / QS8-115 | De test greep in `app/doel/[id].tsx` naar de letterlijke zin "De app rekent niets af" | De zin verhuisde naar de catalogus. De test bewaakte daarna nog steeds íets — een bestand — maar niet meer de belofte, en bleef groen tot hij per ongeluk rood werd |
| QS8-113 / QS8-115 | Kolom, CHECK, kolomgrant, leeskant en catalogus: elk stuk af en getest | Er was geen schrijfpad naar `profiles.locale`. De héle keten was dood hout en geen enkele test kon dat zien, want er was niets kapot |
| QS8-56 | `vraag_deadline_verschuiving()`, `beslis_deadline_verzoek()` en `deadline_requests_select` toetsten alle drie de goede groep, en alle drie waren gemeten | Het scherm koos die groep met `groepen[0]`, uit een lijst zonder `order by`. **Er was geen test die groen bleef terwijl de belofte brak — er was geen test die de belofte kón raken**, want tot PRD 5.5 was "een doel in twee groepen" een onbereikbare toestand |
| QS8-115 / `tekst:controle` | Zeven heuristieken, elk met een uitgeschreven ijking in het commentaar | De controle zelf stond nooit onder test. Zeven vormen kwamen er niet doorheen — één woord op een prop, een prop over meerdere regels, een sleutel in een objectliteraal, een zin in `setMelding()`, JSX-tekst met een accolade. 23 zinnen door de app, en `npm run tekst:controle` meldde nul |

**De vorm is elke keer dezelfde:** de test toetst een eigenschap van een
ónderdeel, terwijl de belofte een eigenschap van het gehéél is. Onderdelen zijn
makkelijk te testen en naden niet, dus de naad blijft onbewaakt — en dat is
precies waar een refactor, een migratie of een tweede schrijver langskomt.

**Drie vragen bij elke feature die af is:**

1. **Waar knopen twee correcte onderdelen aan elkaar?** Daar hoort een test, en
   niet alleen op weerszijden ervan. Bij QS8-24 werd dat `rapport.test.ts`: die
   toetst wat `reportError()` daadwerkelijk aan een sink geeft.
2. **Toetst deze test de belofte, of een eigenschap van het onderdeel?** "De
   melding is duidelijk" is het onderdeel. "Er gaat geen gebruikerstekst de deur
   uit" is de belofte. Alleen de tweede blijft kloppen als iemand de code
   verplaatst.
3. **Kan deze test groen blijven terwijl de belofte breekt?** Als het antwoord ja
   is, bewaakt hij niets.
4. **Grijpt deze test naar een plek in plaats van naar de belofte?** Een test die
   een letterlijke zin in een schérmbestand zoekt, verhuist niet mee als die zin
   verhuist. Hij wordt dan niet rood — hij bewaakt gewoon iets anders. Toets de
   sleutel én de catalogus, niet het bestand waar de zin vandaag toevallig staat.
5. **Is de keten ergens onderbroken terwijl elk schakeltje af is?** Dat is de
   variant zonder kapot onderdeel, en dus de variant die geen enkele test vindt.
   Vraag bij een feature die "klaar" heet: kan een gebruiker hier daadwerkelijk
   bij, en langs welke knop? Bij QS8-113 lag er een kolom met een grant en een
   policy die niemand ooit kon vullen.
6. **Tilt deze feature een aanname van "er is er altijd precies één" naar "er
   kunnen er meer zijn"?** Dan staat de fout er waarschijnlijk al, en heeft
   niemand hem kunnen zien — er is dan niet "een test die groen bleef terwijl de
   belofte brak", er is geen test die de belofte kón raken. Grep op `[0]`,
   `.find(`, `first`, `single()` en `maybeSingle()` in alles wat die zaak
   aanraakt, vóór je de feature bouwt. Bij QS8-56 kostte dat vijf minuten en
   leverde het één echte vondst op.

⚠️ **Vraag 3 beantwoord je niet door erover na te denken, maar door de belofte
met de hand te breken en te kijken of hij rood wordt.** Dat is in dit project de
standaard voor élke nieuwe controle en elke test die een regel bewaakt — en het
is dezelfde gedachte als bij de secret-scan in de deploy: eentje die nog nooit
rood is geweest, is een aanname.

⚠️ **En dat geldt óók voor de controlescripts zelf, wat op 24-08 pijnlijk bleek.**
`npm run tekst:controle` bewaakt de belofte "er staat nergens meer UI-tekst hard
in de code" en meldde maandenlang nul, terwijl er in één scherm zeven
onvertaalde zinnen stonden. De heuristieken waren niet slecht; ze zijn nooit
tegen een bekend geval gelegd, want er wás geen manier om te zien wat het script
wél vindt zonder de hele codebase te wijzigen.

**Een controle die je niet kunt voeden, kun je niet ijken.** Sinds QS8-115 heeft
elk script dat een regel bewaakt daarom een geëxporteerde functie en een test die
hem élke vorm los aanbiedt — de vormen die hij moet vinden én de vormen die hij
met rust moet laten. Die tweede helft is even belangrijk: een controle die alles
meldt, leert je hem te negeren. Zie `tests/scripts/tekst-controle.test.ts` en
`tests/scripts/migratieregister.test.ts`.

⚠️ Twee van de drie gevallen hierboven kwamen boven bij een **verhuizing** —
code die naar een ander bestand ging. Dat is de gevaarlijkste beweging die er
is: de tests verhuizen mee en blijven groen, want ze toetsen wat er in het
bestand staat en niet wat het bestand belóófde. **Loop bij elke verhuizing na
welke belofte eraan hing en of die nog ergens getoetst wordt.**

#### Een bevinding die je wegzet, zegt wanneer hij terugkomt (QS8-123)

Elke rij in `docs/ENGINEER-REVIEW.md` met risico **Laag** draagt de zin
`**Wordt zwaarder als:** …` — de aanname die hem laag houdt. `npm run
review:controle` wordt rood zodra er een Laag-rij zonder staat, en draait mee in
`/audit`.

⚠️ **De voorwaarde, niet de datum.** De A17-aantekening ("herbevestigen vóór
EPIC 12") werkte, maar noemde een feature die al gepland was. Dat kon niet bij de
rij van 17-08 over het ontkoppelen: QS8-110/optie C bestond toen nog niet als
plan. Wat je wél altijd kunt opschrijven is waaróm iets nú laag is. Vervalt die
aanname, dan is het geen Laag meer.

⚠️ **Waarom dit ertoe doet.** Die rij van 17-08 was terecht Laag — zelfbedrog,
geen autorisatiegrens. Vier dagen later liet 0064 het minpunt van precies die
handeling afhangen, en werd het een scoregat dat 0066 moest dichten. **Vraag bij
elke nieuwe beslissing die op een bestaande primitieve handeling leunt: staat
daar een weggelegde bevinding over?**

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
