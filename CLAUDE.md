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

## Webbrowsen

Gebruik `WebFetch` en `WebSearch`. Nooit `mcp__claude-in-chrome__*`.

## Project
- **Naam:** GoalBuddies
- **Doel:** Accountability- en doelen-app: AI-gestuurde doelopsplitsing, buddy-groepen
  met onafhankelijke doelen, peer-goedkeuring van voltooiingen, commitment devices,
  en een instelbare start-van-de-week per gebruiker.
- **Schaaldoel:** 100k+ users.
- **Team:** Quinten (product owner, architect én enige developer).
  Claude Code is de primaire implementer. Engineer-review vanaf eind okt/nov 2026.

### Wie bezit welk feit — vastgelegd 23-08-2026 (QS8-125)

| Document | Bezit | Bezit níét |
|---|---|---|
| `CLAUDE.md` | de regels en conventies — domeinregels, verruimingen, werkwijze | de stand |
| `docs/WERKVOORRAAD.md` | de stand en de volgorde — testteller, migratiebereik, wat af is | de regels |
| `docs/VOLGENDE-SESSIE.md` | de startprompt en de valkuilen | allebei de andere |

**Staat een feit in het ene document, dan verwijst het andere ernaar — het
herhaalt het niet.** `npm run docs:controle` wordt rood zodra dat wel gebeurt en
draait mee in `/audit`.

⚠️ **Een script vangt alleen wat een patroon heeft** — een tegenspraak zonder
getal ontsnapt eraan. Daarom ook de handmatige regel: **werk je iets bij, grep dan
op dat feit in alle drie de bestanden voordat je klaar bent**, en controleer bij
het afsluiten van een issue of Linear en de documenten hetzelfde zeggen.

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

  ⚠️ **Sinds 24-08 een controle:** `npm run verbindingen:controle` wordt rood
  zodra er een Postgres-driver in `package.json` staat of een verbindingsstring in
  `src/`, `app/` of `supabase/functions/`. De regel klopt vandaag omdat álles via
  PostgREST loopt — dat is geen instelling maar de afwezigheid van iets, en die is
  stil kwijt te raken. `max_connections` is **60** voor de héle database; wat er
  moet gebeuren zodra er een langdraaiende Node-server bijkomt staat in
  `docs/DEPLOY.md` §2.7.
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

   ⚠️ **A17 was de derde en is op 20-08-2026 teruggedraaid** — migratie 0050,
   kolommen naar `goal_risk`, eigenaar-only. De les die blijft: **schrijf
   "herbevestigen vóór X" op zodra een besluit aan een toekomstige feature hangt.**

   ⚠️ **Besluit A41 (24-08-2026): een keuze per groep — standaard beschermd.**
   Bij het aanmaken kiest een groep tussen **beschermd** (de standaard) en **open**
   (de groep ziet ook tegenslag). De regel afschaffen is afgewezen.

   Wat dat besluit **niet** is: geen verruiming van bestaande groepen (die zijn
   beschermd), geen tweede pad naast RLS — de keuze is een kolom op `groups` die
   **voor geen enkele client schrijfbaar** is en waar de policies op variëren, en
   die nooit alleen in de UI mag bestaan — en geen
   omzetting die stilzwijgend gebeurt. Omzetten verandert met terugwerkende kracht
   wat er over ándere leden zichtbaar wordt, dus het loopt via
   `zet_groepszichtbaarheid()` met de zorgvuldigheid van een commitment device
   (domeinregel 5).

   ⚠️ **"Open" betekent nooit "alles open".** Zes oppervlakken blijven dicht óók
   in een open groep: systeemberichten over tegenslag, realtime, ingetrokken
   goedkeuringen, de weekpassen, de teller van De Ketting en de
   mijlpaalaankondiging. Het waren er zeven tot 01-09-2026; A54 haalde de punten
   eruit, en alléén het groepstotaal per lid — die grens staat bij domeinregel 10.
   Wie er nog een wil verruimen, leest eerst de rij en de reden in
   `docs/decisions/002-domeinregel7-oppervlakken.md` §6b.

   ⚠️ **Voor élk níeuw oppervlak is beschermd het antwoord tot iemand het
   tegendeel besluit.** Bouw niets "vast open"; dat is precies hoe een standaard
   verschuift zonder dat iemand het besloten heeft.

   *Waarom:* in een groep van drie vrienden doodt één schaamtemoment de hele
   groep — de belangrijkste vondst uit de Habit Huddle-analyse. Bij zakelijk
   gebruik weegt dat zwaarder, niet lichter: zit er een leidinggevende in de groep,
   dan beschermt de regel niet tegen schaamte maar tegen een beoordelingsgesprek.

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
    - **Je persoonlijke puntentotaal is privé.** `points_ledger` is alleen voor de
      eigenaar leesbaar. Een dalend totaal is zichtbaar bewijs van een gemiste week,
      en dat botst met domeinregel 7.

      ⚠️ **A42 (24-08-2026): zo houden.** Een gedeeld totaal is competitiever
      én het lekt: wie het totaal deelt, deelt het missen via een omweg. Wat wél
      mag is een teller die **alleen optelt**, zoals De Ketting.

      ⚠️ **A54 (31-08-2026, gebouwd 01-09, migratie 0141): één smalle
      uitzondering.** Een **open** groep krijgt een klassement per lid — niet je
      persoonlijke totaal maar wat je **in díe groep** verdiend hebt. Drie
      grendels dragen dat verschil en geen ervan mag weg: `cycle_missed` boekt
      zónder `group_id` (CHECK `points_ledger_gemist_is_niet_van_een_groep`), dus
      het klassement kan niet dalen van een gemiste week; `groep_klassement()`
      geeft geen delta en geen datum; in een beschermde groep geeft de RPC nul
      rijen via `lid_van_open_groep()`. Redenering in
      `docs/decisions/2026-08-31-ritme-klassement-en-kleur.md` §2, rij 28 in 002.

    - **Score en voortgang zijn twee dingen.** Voortgang is mijlpaalgebaseerd en loopt
      alleen omhoog; de score kan dalen. Nooit in één balk tonen.

    ⚠️ **Een deadline verschuiven kost geen punten** — een besluit, geen omissie
    (A7, herbevestigd 24-08-2026 als A43). De rem is het akkoord van een buddy en
    niet een minpunt: zonder akkoord blijft de datum staan, en met een minpunt
    erbij betaal je twee keer voor één gebeurtenis. Dit zou bovendien de enige
    plek in het model zijn waar je je uit een afspraak kunt kópen. Alleen
    `correction` mag verder negatief boeken.

11. **Een straf treedt alleen in werking bij een verstreken deadline.** Een gemiste
    week kost een minpunt, meer niet. De begunstigde groep krijgt pas leesrecht op het
    commitment op het moment dat het verschuldigd wordt.

## Emoji — vastgelegd 22-08-2026 (QS8-111)

**De app zelf gebruikt geen emoji in tekst.** Niet in knoppen, statuslabels,
systeemberichten, meldingen of UI-componenten. Ze vertalen slecht, ze renderen per platform
anders, en een schermlezer leest "gezicht met vreugdetranen" midden in een zin.

**De gebruiker mag ze overal typen.** Eén uitzondering waar de app ze zelf wél
gebruikt: reacties op een bericht (A24). Daar ís de emoji de boodschap.

⚠️ **Dit is sinds 23-08 een controle en geen zin meer:** `npm run emoji:controle`
draait mee in `/audit` en wordt rood zodra er emoji in app-tekst staat.
Commentaar en testbestanden tellen niet mee — de ⚠️ hierboven is huisstijl, en
de tests vóéden juist 😀 en 👨‍👩‍👧‍👦 aan `telTekens()`.

⚠️ **Gevolg.** Omdat gebruikers ze overal mogen typen, mag geen enkele plek
gebruikerstekst afkappen met `charAt(0)`, `[0]` of `.slice(0, n)`: JavaScript telt
in UTF-16-eenheden, een emoji kost er twee en een samengesteld gezin elf, en
snijden op zo'n grens rendert als een vervangingsteken. Gebruik de gedeelde
helpers uit `src/shared`, nooit de kale string-methodes.

**Eén eenheid overal: codepunten, want dat is wat de database telt.** Gebruik
`telTekens()` uit `src/shared/tekst`, ook in een teller onder een invoerveld — een
teller in grafemen bij een grens in codepunten is een nieuwe fout en geen
reparatie. `telGrafemen()` is voor waar je écht zichtbare tekens bedoelt, zoals
een preview, nooit voor een grens. Zod's `.max()` en `.length` tellen
UTF-16-eenheden; `char_length` in Postgres telt codepunten.

⚠️ Bij een **ondergrens** gaat het verschil de gevaarlijke kant op: `.length` is
altijd ≥ `char_length`, dus een client die in UTF-16 telt laat door wat Postgres
weigert. Zie `docs/decisions/2026-08-28-tekst-zonder-grens.md` (QS8-118).

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

   ⚠️ **Elke `revoke` noemt `authenticated` met zoveel woorden.** In Supabase
   deelt `alter default privileges` élke nieuwe functie en tabel in `public` uit
   aan `anon`, `authenticated` én `service_role`. `revoke ... from public, anon`
   ziet eruit als "van iedereen" en houdt precies de rol over waaronder iedere
   ingelogde gebruiker draait. De vorm is `from public, anon, authenticated`.
   Sinds 0115 een grendel: `tests/rls/functiegrants.test.ts` legt elke functie die
   `authenticated` mag uitvoeren naast de `grant`-regels — een recht zonder
   grant-regel is geërfd en niet besloten. Het geval dat dit opleverde staat in
   `docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md`.

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

    ⚠️ **Sinds 24-08 een controle:** `npm run migraties:controle` wordt rood bij
    een gat in de nummering, twee migraties met hetzelfde nummer, of een migratie
    zonder rollback-pad in zijn kop. Het gat is de belangrijkste: de bestanden
    zijn de enige manier om dit schema ergens anders op te bouwen, en ontbreekt er
    één, dan toetst de RLS-suite daar een ánder schema dan productie — groen
    zonder iets te bewijzen.

    ⚠️ **"Idempotent" betekent: idempotent tegen de toestand waarvoor de migratie
    geschreven is.** Verandert een latere migratie de vorm van hetzelfde object,
    dan is de botsing bij herhaling correct gedrag en geen defect — die weigering
    is soms het enige dat een ongewenste terugzet tegenhoudt. **Zo'n fout neem je
    nooit weg.** De grendel staat in `tests/migraties/idempotentie.test.ts` en
    draait mee in `npm test`; hij vindt de echte fouten en laat die tweede klasse
    met rust. Meting en beide klassen in
    `docs/decisions/2026-08-28-idempotent-betekent-niet-altijd-doorlaten.md`.

    ⚠️ **De drop-uitzondering leest de handtekening en niet alleen de naam.** Een
    migratie die de vorm van een functie verandert móet hem eerst droppen, want
    `or replace` kan een returntype niet wijzigen. Maar een drop van
    `f(uuid, text, text)` dekt geen nieuwe `f` met zes argumenten — dat is een
    andere functie. Een controle die op naam vergelijkt, laat precies die bug door.

#### Regel 19 uitgeschreven (herzien 20-08-2026)

**De maatstaf is of een bevinding rot als je hem laat liggen.**

| Agent | Wanneer | Waarom |
|---|---|---|
| `security-reviewer` | **Direct**, bij elke wijziging die auth, RLS, punten, goedkeuring, commitments of een nieuw groepszichtbaar oppervlak raakt | Bevindingen stapelen. Zie hieronder. |
| `code-critic` | Eén keer per **milestone** | Dode code, laagscheiding en complexiteit kosten over drie maanden evenveel om te repareren als vandaag |
| `critical-user` | Eén keer per **milestone**, samen met code-critic in één opdracht | Idem voor tekst, toon en randgevallen |

⚠️ **De security-reviewer wacht nooit**, om drie redenen die alle drie in de
praktijk gezien zijn: wat je uitstelt groeit mee met wat je erop bouwt, fouten
worden gekopieerd (elke definer-functie is een kopie van de vorige), en de
database is nu leeg — wat tijdelijk is. Uitgewerkt in
`docs/decisions/2026-09-02-de-geschiedenis-achter-de-grondwet.md` §2.

⚠️ **Verifieer elke bevinding zelf voordat je hem verwerkt.** Ze hebben het ook
mis: in één ronde was de zwaarste bevinding aantoonbaar onjuist — ze las een
migratiebestand waar de gedéployde functie strenger was — terwijl twee andere
kritieke bevindingen wél klopten. `pg_get_functiondef()` is de waarheid.

#### Regel 18 uitgeschreven: elk onderdeel klopt en het geheel lekt (24-08-2026)

Zeven keer is de duurste fout dezelfde fout geweest, en elke keer was er een
uitgebreide, groene testsuite die er niets van zag. De gevallen staan met issue en
migratienummer in `docs/decisions/2026-09-02-de-geschiedenis-achter-de-grondwet.md` §3.

**De vorm is elke keer dezelfde:** de test toetst een eigenschap van een
ónderdeel, terwijl de belofte een eigenschap van het gehéél is. Onderdelen zijn
makkelijk te testen en naden niet, dus de naad blijft onbewaakt — en dat is
precies waar een refactor, een migratie of een tweede schrijver langskomt.

**Zes vragen bij elke feature die af is:**

1. **Waar knopen twee correcte onderdelen aan elkaar?** Daar hoort een test, en
   niet alleen op weerszijden ervan.
2. **Toetst deze test de belofte, of een eigenschap van het onderdeel?** "De
   melding is duidelijk" is het onderdeel; "er gaat geen gebruikerstekst de deur
   uit" is de belofte. Alleen de tweede blijft kloppen als iemand code verplaatst.
3. **Kan deze test groen blijven terwijl de belofte breekt?** Zo ja, dan bewaakt
   hij niets.
4. **Grijpt deze test naar een plek in plaats van naar de belofte?** Een test die
   een letterlijke zin in een schérmbestand zoekt, verhuist niet mee als die zin
   verhuist — hij wordt niet rood, hij bewaakt iets anders. Toets de sleutel én de
   catalogus, niet het bestand waar de zin vandaag toevallig staat.
5. **Is de keten ergens onderbroken terwijl elk schakeltje af is?** De variant
   zonder kapot onderdeel, en dus de variant die geen enkele test vindt. Vraag bij
   een feature die "klaar" heet: kan een gebruiker hier daadwerkelijk bij, en langs
   welke knop?
6. **Tilt deze feature een aanname van "er is er altijd precies één" naar "er
   kunnen er meer zijn"?** Dan staat de fout er waarschijnlijk al en heeft niemand
   hem kunnen zien — er is dan geen test die de belofte kón raken. Grep op `[0]`,
   `.find(`, `first`, `single()` en `maybeSingle()` in alles wat die zaak
   aanraakt, vóór je de feature bouwt.

⚠️ **Vraag 3 beantwoord je niet door erover na te denken, maar door de belofte
met de hand te breken en te kijken of hij rood wordt.** Dat is in dit project de
standaard voor élke nieuwe controle en elke test die een regel bewaakt — en het
is dezelfde gedachte als bij de secret-scan in de deploy: eentje die nog nooit
rood is geweest, is een aanname.

⚠️ **Breek de grendel die de ijking nóemt, niet zomaar iets — anders is de ijking
zelf de aanname.** Een controle heeft meestal meer dan één grendel achter elkaar,
en een ijking die zijn geval door een pad voert dat een éérdere grendel al
afvangt, bewaakt niets van wat hij belooft. **Mutatie per grendel, en niet één
mutatie voor de hele controle.**

**Een controle die je niet kunt voeden, kun je niet ijken.** Elk script dat een
regel bewaakt heeft daarom een geëxporteerde functie en een test die hem élke vorm
los aanbiedt — de vormen die hij moet vinden én de vormen die hij met rust moet
laten. Die tweede helft is even belangrijk: een controle die alles meldt, leert je
hem te negeren. Zie `tests/scripts/tekst-controle.test.ts` en
`tests/scripts/migratieregister.test.ts`.

⚠️ Twee van die zeven gevallen kwamen boven bij een **verhuizing** —
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

⚠️ **Vraag bij elke nieuwe beslissing die op een bestaande primitieve handeling
leunt: staat daar een weggelegde bevinding over?** Een rij die terecht Laag was
werd vier dagen later een scoregat, toen een migratie het minpunt aan precies die
handeling ophing. Het geval staat in
`docs/decisions/2026-09-02-de-geschiedenis-achter-de-grondwet.md` §4.

**Wat je uitstelt, vang je zelf op** met een controlepas langs wat die twee
agents historisch vinden: dode code, dubbele teksten, ontbrekende loading-,
error- of lege staat, een component dat op het verkeerde scherm kan belanden, en
copy die een regel uitlegt die de gebruiker anders zelf moet raden.

## Commando's
```bash
npm run dev
npm run poort          # ⚠️ dit is de poort vóór een push — zie hieronder
npm run typecheck
npm run lint
npm run test
npm run build
```

⚠️ **`npm run poort` draait álles: typecheck, lint, beide testsuites en elke
`*:controle`.** Draai die en niet een greep eruit. Een PR is al rood gegaan op een
controle die niet meegedraaid was: de controle deed precies zijn werk, de poort
was de inschatting van een mens over zijn eigen werk.

⚠️ **Een controle zonder database is niet groen maar *ongemeten*.** De poort houdt
die twee uit elkaar en faalt op allebei. `functies:controle` en
`register:controle` printen "OVERGESLAGEN" en geven daarna exitcode 0; wie alleen
naar de exitcode kijkt, telt ze als bewijs.

⚠️ **Maar "geen database" moet dan wel waar zijn.** Sinds 04-09-2026 (QS8-268)
deelt `scripts/psql.mjs` een mislukte verbinding in vier: er is geen server, de
database bestaat niet, de gebruiker wordt geweigerd, of het is iets anders.
Alleen de eerste twee heten **OVERGESLAGEN**; een geweigerde gebruiker is een
kapotte instelling en dus **rood**, want de database ligt er gewoon. Zes scripts
zeiden jarenlang "start de lokale stack" terwijl die draaide, en de poort telde
er daardoor negen ongemeten waar er vier hoorden.

⚠️ **Een controle die `psql` aanroept, bouwt zijn eigen aanroep niet.** Dat is
zesmaal dezelfde vergeten vlag geweest. `psqlArgumenten()` is de enige weg; een
uitzondering hoort in het register in `tests/scripts/psql-verbinding.test.ts`,
mét reden. Uitleg in
`docs/decisions/2026-09-04-geen-database-was-de-verkeerde-reden.md`.

⚠️ **Een nieuwe migratie begint met `npm run migratie:nieuw -- "naam"`.** Die
kijkt naar élke branch die de remote kent en niet alleen naar je eigen map, en hij
**fetcht zelf** (sinds 01-09-2026, QS8-247). Migratienummers zijn vier keer
gebotst, de vierde keer mét de tool: `refs/remotes/origin` is zo oud als je laatste
fetch. **Een gereedschap dat bestaat om een botsing te voorkomen, mag zijn
juistheid niet laten afhangen van een handeling die het zelf niet doet** — dan is
de waarschuwing een disclaimer en verplaats je het probleem naar de lezer.

De grens loopt tussen twee soorten scripts, en die is er een om aan te houden:

| Soort | Fetcht | Waarom |
|---|---|---|
| **Deelt een nummer uit** — `migratie:nieuw`, `migratie:hernummer` | ja | een verouderd beeld is hier een verkeerd antwoord |
| **Controleert** — `migraties:controle` | nee | draait in de poort en in CI, waar een netwerkaanroep de uitslag afhankelijk maakt van bereikbaarheid — en CI draait toch al op een verse checkout |

Mislukt de fetch, dan telt het script dóór — zonder netwerk moet je een migratie
kunnen beginnen — maar noemt hij hoe oud het beeld is. **Het verschil tussen "van
net" en "van eergisteren" ís het risico**; één tekst voor beide gevallen leest als
een disclaimer, en die leer je overslaan.

⚠️ Beide kanten staan onder test in `tests/scripts/migratie-fetch.test.ts`, met
een echte remote op schijf — niet met een zelfgevoerd object, want dan is "klopt
dat object" niet te stellen. Vraag 3 in zijn zuiverste vorm.

## Beslisbevoegdheid — vastgelegd 22-08-2026

**Claude beslist zelf en werkt af.** Er zijn precies twee redenen om te stoppen
en te vragen:

1. **De keuze bepaalt wat er tegen een mens beloofd of in rekening gebracht
   wordt.**
2. **De handeling is onomkeerbaar vernietigend.**

In élk ander geval: kies de conservatiefste optie die het werk áf maakt, bouw
door, en zet de aanname zichtbaar in het issue én in het beslisdocument.
Niet wachten, niet vragen, niet halverwege stoppen.

### Wat die twee hier betekenen

Zonder vertaling is grens 1 leeg — er zijn nog geen betalende klanten, en dan
staat er in de praktijk "vraag nooit iets". Dit is de vertaling:

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

Harde regels, geen vragen:
- Geen tijd- of weekberekening buiten `shared/time` (correctheidsregel 7).
- Geen Vercel-specifieke API of package.
- Geen `REPLICA IDENTITY FULL` op een tabel in de realtime-publicatie.
- Geen nieuw type systeembericht zonder migratie.

En deze zijn van gate naar afweging gegaan — je beslist ze zelf, maar je
verantwoordt ze in het beslisdocument: een dependency toevoegen, het datamodel
van een bestaande tabel wijzigen, auth-/RLS-/goedkeuringslogica aanpassen, een
migratie op het echte project draaien, meer dan 15 bestanden aanraken.
