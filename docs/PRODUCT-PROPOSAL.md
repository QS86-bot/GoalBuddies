# GoalBuddies — Product- en ontwerpvoorstel

| | |
|---|---|
| **Van** | Claude (hoofd productontwikkeling) |
| **Voor** | Quinten Strijdonk (opdrachtgever) |
| **Datum** | 15-08-2026 |
| **Status** | ✅ Beslissingen genomen 15-08-2026 — in uitvoering |
| **Gebaseerd op** | `PRD-accountability-app.md` + `docs/research/habit-huddle-teardown.md` |

---

## Besluitenlijst — vastgesteld 15-08-2026

| # | Vraag | Besluit | Waar het landt |
|---|---|---|---|
| 1 | Dagelijkse hartslag naast de wekelijkse cyclus? | **Ja — de Dagzet.** Tien seconden, optioneel, nooit punten of goedkeuring | QS8-50 |
| 2 | Persoonlijke week-start naast een groepsritme? | **Twee klokken.** `currentUserCycle` én `currentGroupPeriod`, beide vanaf dag één | QS8-20, QS8-58 |
| 3 | Hoeveel bewijs bij het afronden? | **Instelbaar per groep**, standaard notitie verplicht en bijlage optioneel | QS8-66 |
| 4 | Bouwvolgorde: slices of epics? | **Per epic, zoals de PRD.** Mijn slice-voorstel (§4.3) is niet gevolgd | Linear-structuur |

Besluit 4 wijkt af van mijn advies. De Linear-backlog is daarom per epic geordend,
met prioriteit binnen `phase:mvp` als volgorde-indicator. De slice-tabel in §4.3
blijft staan als achtergrond bij de afhankelijkheden tussen epics — EPIC 0 moet
hoe dan ook eerst, en EPIC 6 kan niet vóór EPIC 5.

---

## 0. De kern in vijf zinnen

De PRD beschrijft een goed product. Mijn onderzoek naar Habit Huddle legt één probleem
bloot dat de PRD niet oplost en dat het verschil maakt tussen een app die werkt en een
app die na drie weken leeg is: **een wekelijkse cyclus geeft je één engagement-moment
per week, en dat is te weinig om een groep levend te houden.** Habit Huddle's hele motor
is de dagelijkse check-in — zeven momenten per week, elk tien seconden, elk met sociale
beloning. Als we hun mechanismen (streaks, groepsketting, seizoenen) overnemen op een
wekelijks ritme, importeren we de vorm zonder de werking. Mijn voorstel is daarom
**twee ritmes in één product**: de week blijft de eenheid van commitment, de dag wordt
de eenheid van aanwezigheid.

---

## 1. Wat we van Habit Huddle overnemen, en hoe we het vertalen

Volledige analyse staat in `docs/research/habit-huddle-teardown.md`. Hier de vertaalslag.

### 1.1 Vloer & Plafond — de belangrijkste import

Habit Huddle geeft elke gewoonte twee niveaus: een **floor** (de versie die je op je
slechtste dag nog haalt) en een **ceiling** (je beste dag). **Beide tellen als volledige
check-in.** Dat is de reden dat hun gebruikers streaks van 200, 400, 638 dagen halen.

Bij ons: **elk weekdoel krijgt bij het aanmaken twee versies.**

> Weekdoel: *3 klantgesprekken voeren*
> **Vloer:** 1 gesprek ingepland — **Plafond:** 3 gesprekken gevoerd

Je vloer halen betekent dat de week telt. Je buddy keurt de vloer net zo goed goed als
het plafond; alleen de punten verschillen.

Dit lost het grootste faalpunt van doelen-apps op. Een weekdoel dat je woensdag al niet
meer haalt, negeer je — en daarna negeer je de app. Met een vloer is er tot zondagavond
altijd nog een winnende zet.

### 1.2 Vergevingsmechanismen — de reeks dient de gebruiker

| Habit Huddle | GoalBuddies |
|---|---|
| Streak freezes (1 per 30 dagen) | **Weekpas** — één gemiste week verbruikt een pas i.p.v. je reeks. Je verdient er één per 6 voltooide cycli. |
| Vacation Mode (14 dagen) | **Adempauze** — tot 2 cycli, vooraf aangekondigd aan je groep. Vakantie, ziekte, drukke periode op het werk. |
| Night Owl Checkins (tot 08:00) | **Coulanceperiode** — tot 12 uur ná je cycle-rollover kun je de vorige week nog afsluiten. Zondagavond klaar, maandagochtend gelogd: niets verloren. |

Habit Huddle heeft dit als expliciet principe opgeschreven, en ik neem het over:
*de reeks dient de gebruiker, nooit andersom.*

### 1.3 De Ketting

Hun Checkin Chain: één schakel per lid dat die dag incheckt. Bij ons: **één schakel per
lid dat zijn cyclus afsloot.** De groep bouwt een gezamenlijke score terwijl iedereen aan
iets anders werkt. Dit is Habit Huddle's beste groepsmechanisme en het past exact op onze
groepsvorm, waarin doelen juist níét gedeeld zijn.

### 1.4 Falen is nooit publiek — een ontwerpregel, geen feature

Habit Huddle toont **nooit** gemiste dagen. De feed bevat uitsluitend positieve signalen.
Wie afhaakt gaat stil op inactief. Stille groepen gaan slapen in plaats van door te zeuren.

Dit is de subtielste en belangrijkste vondst van het onderzoek, en ik wil het als
harde regel in de codebase: **de groepsfeed bevat alleen afgeronde weekdoelen, mijlpalen,
goedkeuringen en aanmoedigingen.** Nooit "Quinten heeft zijn week niet gehaald". Wie
achterloopt krijgt een privé-signaal en kiest zelf of de groep het hoort (zie 2.1).

In een groep van drie vrienden doodt één schaamtemoment de hele groep.

### 1.5 De rest, korter

| Habit Huddle | GoalBuddies |
|---|---|
| Seasons (maandelijks) | **Seizoenen per groep**, standaard per kwartaal — een maand is bij weekcycli maar 4 datapunten. Recap met wie er stond en welke mijlpalen gehaald zijn, dan reset. |
| Identity-vraag op de habit-card | **"Wie word ik als dit lukt?"** naast het doel. Bij een doel van zes maanden is identiteit de enige brandstof die zo lang meegaat. |
| Habit Library (kopieerbaar) | **Roadmap-bibliotheek** — kant-en-klare doelen mét mijlpalen: "website live in 12 weken", "certificering halen", "eerste 3 klanten". Sterke oplossing voor de lege staat. |
| Gastvrije links | **Elke uitnodigingslink toont de echte groep vóór signup.** Habit Huddle heeft hier veel werk in gestoken; hun changelog laat zien dat een kapotte invite-link stil elke uitnodiging killt. |
| Slapende huddles | **Slapende groepen** na 30 dagen stilte: één afscheidsbericht, dan stilte. Eén afsluiting wekt hem. |
| Changelog als marketing | Publieke changelog + ideeën-inbox vanaf dag één. Kost bijna niets, en het is hun sterkste retentiesignaal naar bestaande gebruikers. |

Wat we bewust **niet** overnemen: publieke/ontdekbare groepen en de globale feed (buiten
scope per PRD 2.4, en bij persoonlijke doelen als omzet of studieresultaten een
privacyrisico dat bij "10 squats" niet speelt), de Style Studio (monetisatie-oppervlak
voor een product dat al werkt), en de Discord-bot (niet het kanaal van jouw doelgroep).

---

## 2. Wat ik toevoeg

Vijf ideeën die van GoalBuddies iets eigens maken, gerangschikt op impact.

### 2.1 De Risico-radar — hét antwoord op "waarom niet gewoon Habit Huddle?"

Habit Huddle's groep is **reactief**: je juicht als iemand incheckt. Bij een doel met een
deadline is dat te laat. Een gemiste week merk je wel. Drie weken achterstand op een
mijlpaal met nog vijf weken tot je deadline merkt niemand — jijzelf het minst, want je zit
er te dicht op.

GoalBuddies berekent per doel continu een haalbaarheidssignaal: benodigd tempo tegenover
werkelijk tempo, resterende mijlpalen tegenover resterende cycli, en het patroon van de
afgelopen weken. Vier standen: **op koers · oppassen · achterstand · deadline onhaalbaar.**

Wat het uniek maakt is wat er dán gebeurt. Bij *achterstand* krijgt de gebruiker eerst
een **privé**-signaal, met één knop: **"vraag je groep om hulp"**. Eén tik en er verschijnt
een kaart in de groep:

> *Quinten loopt 3 weken achter op "website live". Nog 5 weken te gaan. Wie heeft een idee?*

Nooit automatisch. Altijd door de gebruiker zelf getriggerd — dat is het verschil tussen
hulp en aan de schandpaal.

Bij *deadline onhaalbaar* biedt de app een **herplanning** aan: deadline verzetten,
mijlpalen schrappen, of scope verkleinen — met de expliciete boodschap dat een doel
bijstellen beter is dan het stilletjes laten doodbloeden. Dat is precies het moment waarop
mensen apps als deze weggooien.

Een gewoonte heeft geen deadline. Jouw doel wel. Dit is waar we het verschil maken.

### 2.2 De Weekafsluiting — het ritueel dat echte accountability-groepen draaien

Elke mastermind-groep die werkt doet hetzelfde: wekelijks vertelt iedereen wat er gelukt
is, wat er misging, en wat er komt. Geen enkele app doet dat asynchroon.

Bij rollover krijgt elk lid drie vragen:

1. **Wat heb je gedaan?**
2. **Wat zat in de weg?**
3. **Wat is je volgende week?**

De antwoorden verschijnen **samen, als één kaart** in de groep — niet druppelsgewijs, maar
als een vergadering die je in je eigen tijd bijwoont.

Vraag 2 is de belangrijkste van het hele product. Het is de enige plek waar het expliciet
oké is om te zeggen dat het niet lukte, en waar dat geen publiek falen is maar een vraag
om hulp. Alles in 1.4 zorgt ervoor dat dit de énige plek is waar het misgaan aan bod komt —
en dan op uitnodiging, in je eigen woorden.

### 2.3 Goedkeuring op bewijs, niet op je woord

De PRD noemt goedkeuringsmisbruik als open risico ("gameable if a group colludes"). Het
probleem is niet de goedkeuringsregel — het is dat er niets te beoordelen valt. Een duim
omhoog op een bewering is een sociale formaliteit, en dat weten beide partijen.

- **Afronden vereist een spoor.** Een notitie, een link, een foto, een bestand. De
  goedkeurder ziet wát er gebeurd is, niet alleen de titel van het weekdoel.
- **"Vertel me meer"** staat als vriendelijke, gelijkwaardige actie naast Goedkeuren —
  geen afwijzing. De meeste ongemakkelijke gevallen zijn geen fraude maar onduidelijkheid.
- **De goedkeurder verdient ook punten.** Reviewen is een bijdrage aan de groep, geen
  klusje. Dit is de goedkoopste manier om jouw eigen succesmetriek (≥80% goedgekeurd
  binnen 48 uur) te halen.
- **Nooit jezelf goedkeuren** — afgedwongen in RLS *en* met een database-constraint,
  niet alleen in de UI. Staat al als onwrikbare regel in `CLAUDE.md`.

### 2.4 De Doelcoach — een interview, geen generator

De PRD zegt: tik op "Generate milestones", krijg een lijst. Dat levert generieke mijlpalen
op, want de AI weet niets van jou. Habit Huddle's Genie doet het beter door te vragen
*"wat laat jouw gewoonten normaal stuklopen?"* Ik ga verder.

De Doelcoach stelt zes vragen vóór hij één mijlpaal genereert:

1. Wat wil je bereiken, en waaraan zie je dat het gelukt is? *(dwingt meetbaarheid af)*
2. Wie word je als dit lukt? *(identiteit)*
3. Wanneer moet het klaar zijn, en waarom die datum? *(echte deadline of wens?)*
4. **Hoeveel uur per week heb je hier écht voor?**
5. Wat heb je hier al aan gedaan? *(voorkomt dat mijlpaal 1 iets is dat al af is)*
6. **Je hebt dit of iets vergelijkbaars eerder geprobeerd — waar liep het vast?**

Vraag 4 en 6 zijn het geld. Ze maken het verschil tussen "12 mijlpalen in 12 weken" en:

> *Je hebt 3 uur per week. Dat maakt dit 6 mijlpalen, niet 12 — en de datum die je noemde
> is dan niet realistisch. Zullen we hem verzetten, of de scope verkleinen?*

**Een coach die je tegenspreekt is meer waard dan een generator die je gelijk geeft.**
Dat is de toon van het hele product.

Output per mijlpaal: titel, streefdatum, en 2–3 voorgestelde weekdoelen inclusief vloer en
plafond. Alles bewerkbaar, alles verwijderbaar, en er is altijd een handmatig pad als de
AI-call faalt (PRD 3.1).

### 2.5 Solomodus die op zichzelf goed is

De PRD noemt cold start als grootste risico. Terecht: een accountability-app zonder buddies
is leeg. Maar "AI als accountability partner" is een leugen — een taalmodel kan niet
controleren of jij je website hebt gelanceerd, en gebruikers doorzien dat binnen een week.

Wat wél werkt: de app is in solomodus **een uitstekende doelenplanner** — Doelcoach,
mijlpalen, weekcyclus, risico-radar, het ritueel van de weekafsluiting — en zegt eerlijk
dat goedkeuring op een buddy wacht. Weekdoelen die je zelf afvinkt krijgen de status
**afgerond, niet geverifieerd**: ze tellen voor je voortgang, niet voor je punten.

Dat verschil is voelbaar, en het geeft een echte reden om iemand uit te nodigen in plaats
van een lege staat die je wegklikt. Daar komt bij: **een buddy hoeft zelf geen doel te
hebben** om goed te keuren en aan te moedigen. Dat staat al in de PRD-persona's; het moet
ook zo gebouwd worden — geen verplichte onboarding-trechter voor wie alleen komt helpen.

---

## 3. De dagelijkse hartslag — beslispunt 1

Zie sectie 0. Een wekelijkse app heeft één moment per week. Habit Huddle heeft er zeven.

**Voorstel: de Dagzet.** Optioneel, tien seconden, alleen tekst: *"waar heb je vandaag aan
gewerkt?"*, gekoppeld aan je huidige weekdoel(en). Geen goedkeuring, geen punten.
Het is aanwezigheid, geen prestatie.

Wat het oplevert:

- Een dagelijkse reden om de app te openen — waardoor de push-notificatie bestaansrecht
  heeft in plaats van een wekelijkse onderbreking te zijn.
- De groepsfeed heeft elke dag inhoud in plaats van één piek per week.
- Bij de weekafsluiting is vraag 1 al ingevuld: je hebt je week zelf opgeschreven.
- De Ketting kan dagelijks én wekelijks tellen, waardoor Habit Huddle's beste
  groepsmechanisme daadwerkelijk werkt.

**Het risico dat ik erken:** het is een tweede ritme, en twee ritmes kunnen verwarren.
Daarom is de regel hard: **de Dagzet levert nooit punten of goedkeuring op.** De week
blijft de enige eenheid die telt. De zet is een dagboekregel die je groep toevallig ziet.

*Zonder dit is GoalBuddies een planningstool waar je wekelijks even langsgaat. Met dit is
het een plek waar je woont. Ik raad het sterk aan, maar het verandert het datamodel en het
hele notificatie-ontwerp — daarom leg ik het aan jou voor.*

---

## 4. Ontwerpbeslissingen die ik aan jou voorleg

### 4.1 Persoonlijke week-start naast groepsritme — beslispunt 2

`CLAUDE.md` zegt: week-start per gebruiker is fundamenteel, geen instelling achteraf.
Mee eens. Maar als drie leden hun week starten op maandag, woensdag en zaterdag, heeft
de groep geen gezamenlijk moment — en de Ketting, de weekafsluiting en het
seizoensoverzicht hebben allemaal een gedeeld raster nodig.

**Voorstel: twee klokken, expliciet gescheiden.**

- **Jouw cyclus** — je persoonlijke week-startdag. Bepaalt wanneer jouw weekdoelen
  resetten, wanneer punten tellen, wat "deze week" betekent in jouw app. Precies zoals
  PRD 4.2.
- **De huddledag van de groep** — één dag per week die de groep kiest. Dan verschijnt de
  weekafsluiting, dan telt de Ketting een schakel, dan komt het groepsoverzicht.

Sloot jij je week donderdag af en is de huddledag zondag? Dan draagt jouw afsluiting op
zondag bij aan de ketting.

Consequentie voor de architectuur: `shared/time` levert **twee** begrippen —
`currentUserCycle(userId)` en `currentGroupPeriod(groupId)` — en beide vanaf dag één.
Dit er achteraf in bouwen betekent elke week-afhankelijke query herschrijven, en dat is
exact het scenario waar `CLAUDE.md` voor waarschuwt.

*Alternatief dat ik niet aanraad:* de groep dicteert de week-start van alle leden.
Simpeler, maar het schrapt een P0-story uit je PRD en het is precies het soort ding waarop
iemand afhaakt ("mijn week begint op zaterdag, punt").

### 4.2 Bewijs verplicht of optioneel? — beslispunt 3

Verplicht bewijs (2.3) maakt goedkeuring betekenisvol, maar zet frictie op de
belangrijkste actie in de app.

**Mijn advies: instelbaar per groep, standaard "notitie verplicht, bijlage optioneel".**
Eén zin typen kost tien seconden en geeft de goedkeurder genoeg om iets zinnigs terug te
zeggen — wat de hele sociale lus in gang zet. Bijlagen zijn Fase 2 (Supabase Storage).

### 4.3 Bouwvolgorde — beslispunt 4

Niet epic voor epic; dan heb je pas in week acht iets dat werkt. In plaats daarvan de
dunste verticale doorsnede die de hele lus raakt:

| Slice | Inhoud | Wat je eraan hebt |
|---|---|---|
| **0 — Fundering** | Datamodel + RLS volledig, `shared/time` met beide klokken en tests, auth, CI, Sentry | Niets zichtbaars. Alles daarna. |
| **1 — Solo-lus** | Doel → handmatige mijlpalen → weekdoelen met vloer/plafond → afvinken → cyclus rolt om | **Jij kunt het zelf gebruiken.** |
| **2 — De buddy** | Groep, uitnodiging, doel aan groep koppelen, goedkeuring, punten, reeks | **Nu is het een accountability-app.** Jij + 2 vrienden kunnen beginnen — dat is je MVP-doel uit de PRD. |
| **3 — Het leven** | Chat + systeemberichten, weekafsluiting, Ketting, notificaties, Dagzet | De groep gaat leven. |
| **4 — De intelligentie** | Doelcoach, risico-radar, roadmap-bibliotheek | Het onderscheidende deel. |
| **5 — Afmaken** | Commitment device, weekpassen, adempauze, seizoenen, design-polish | MVP compleet per PRD. |

Vanaf slice 2 draait er iets echts, en alles daarna verbetert een systeem dat al leeft.

---

## 5. Ontwerprichting

Emerald blijft (PRD 10.1). Eén ding wil ik scherper stellen dan de PRD doet.

Habit Huddle ziet eruit als een spel: confetti, badges, felle kaarten. Dat past bij "10
squats per dag". GoalBuddies gaat over je bedrijf, je studie, je carrière, en de gebruiker
is een volwassene die aan iets echts werkt. **Als de app eruitziet als Duolingo, voelt het
doel kleiner dan het is.**

**Richting: rustig gereedschap met momenten van vreugde.** Standaard kalm, strak, veel
witruimte, serieuze typografie. De feestelijkheid bestaat wél, maar gedoseerd en precies
op de momenten waarop je hem verdiend hebt: een goedkeuring die binnenkomt, een mijlpaal
die valt, een doel dat af is.

Kleurenrollen — strak gescheiden, want kleur zonder betekenis is decoratie:

| Kleur | Betekent | Gebruik |
|---|---|---|
| Emerald `#10b981` | Voortgang, afgerond, goedgekeurd | De enige hero-kleur |
| Amber | Wacht op actie: goedkeuring pending, week nog niet gestart | Aandacht, geen alarm |
| Coral / rood | **Alleen** deadline-risico | Spaarzaam. Nooit voor een gemiste week — zie 1.4 |
| Neutraal | De rest | ±80% van elk scherm |

**Donkere modus vanaf de eerste component.** De PRD zet hem op P1; ik zou hem P0 maken.
Achteraf omzetten kost meer dan het meteen goed doen, en dit is een app die 's avonds
gebruikt wordt.

Vier kernschermen: **Vandaag** (jouw week + dagzet) · **Doel** (roadmap met mijlpalen) ·
**Groep** (leden, ketting, feed, chat) · **Profiel**.

---

## 6. Twee opmerkingen over de repository

1. **`CLAUDE.md` versus `CLAUDE.md.nieuw`.** De huidige `CLAUDE.md` bevat alleen de
   gstack-boilerplate; `CLAUDE.md.nieuw` bevat de echte projectgrondwet en is duidelijk
   het bedoelde bestand. Voorstel: samenvoegen tot één `CLAUDE.md` — de gstack-sectie
   behouden, de GoalBuddies-inhoud eronder — en `.nieuw` verwijderen. Ik doe dit bij
   akkoord, niet ongevraagd.

2. **De PRD blijft leidend.** Alles in dit voorstel is een aanvulling of een expliciet
   voorgelegde wijziging. Waar ik van de PRD afwijk staat dat er met reden bij
   (dark mode P1→P0, seizoenen maandelijks→per kwartaal, de twee klokken).

---

## 7. Wat ik doe zodra je akkoord bent

1. Linear-project met epics en issues, geordend volgens de slices uit 4.3.
2. Supabase-project in de EU-regio (`eu-west-3`, net als je bestaande projecten).
3. **Datamodel + RLS eerst op papier** in `docs/decisions/001-datamodel.md` — inclusief de
   twee klokken, de append-only voltooiingen en de goedkeuringsconstraints. Jouw review,
   dan pas migraties. Dat is wat `CLAUDE.md` voorschrijft en het is hier ook echt de
   goedkoopste volgorde.
4. Slice 0.
