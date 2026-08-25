# Linear-archief — GoalBuddies

> Een volledige kopie van elk issue in het Linear-project GoalBuddies, zodat de
> werkruimte opgeruimd kan worden zonder dat er iets verdwijnt.

⚠️ **Dit bestand is een momentopname en geen vervanging van Linear.** Linear is
de plek waar het werk loopt; dit is het vangnet eronder. Wordt een issue
gearchiveerd, dan staat het nog steeds in Linear zelf — wordt het *verwijderd*,
dan is dit alles wat er nog van over is. Zie `docs/WERKVOORRAAD.md` §opruimen
voor de afweging.

⚠️ **Wat hier níét in staat: de reacties.** De Linear-API geeft opmerkingen niet
mee in een lijstopvraging, en juist in dit project draagt de commentaarstroom een
groot deel van de onderbouwing — de besluiten A41 tot en met A49 staan als
reactie onder hun issue, niet in de beschrijving. **Dat is de reden dat
verwijderen wordt afgeraden en archiveren niet.**

⚠️ Regenereren doe je met de Linear-MCP: `list_issues` over het team
`QS86-bot Linear` met de velden hieronder, daarna hetzelfde script.

**Momentopname:** 137 issues — Done 100, Backlog 13, In Review 11, In Progress 8, Todo 5.

---

## Inhoud

| Issue | Status | Titel |
|---|---|---|
| [QS8-1](#qs8-1) | Todo | Get familiar with Linear |
| [QS8-2](#qs8-2) | Todo | Connect your tools |
| [QS8-3](#qs8-3) | Todo | Import your data |
| [QS8-4](#qs8-4) | Todo | Set up your teams |
| [QS8-5](#qs8-5) | In Progress | EPIC 0 — Fundering |
| [QS8-6](#qs8-6) | In Progress | EPIC 1 — Auth & Onboarding |
| [QS8-7](#qs8-7) | Done | EPIC 2 — Hoofddoelen |
| [QS8-8](#qs8-8) | Done | EPIC 3 — De Doelcoach (AI-mijlpalen) |
| [QS8-9](#qs8-9) | Done | EPIC 4 — Weekdoelen & cyclus |
| [QS8-10](#qs8-10) | Done | EPIC 5 — Buddy-groepen |
| [QS8-11](#qs8-11) | Done | EPIC 6 — Peer-goedkeuring |
| [QS8-12](#qs8-12) | Done | EPIC 7 — Groepschat & weekafsluiting |
| [QS8-13](#qs8-13) | Done | EPIC 8 — Gamification |
| [QS8-14](#qs8-14) | Done | EPIC 9 — Commitment device |
| [QS8-15](#qs8-15) | Done | EPIC 10 — Design system |
| [QS8-16](#qs8-16) | In Progress | EPIC 11 — Notificaties |
| [QS8-17](#qs8-17) | Done | EPIC 12 — De Risico-radar |
| [QS8-18](#qs8-18) | Done | 0.1 — Git-repo initialiseren |
| [QS8-19](#qs8-19) | Done | 0.2 — Datamodel + RLS als beslisdocument |
| [QS8-20](#qs8-20) | Done | 0.3 — shared/time met twee klokken |
| [QS8-21](#qs8-21) | Done | 0.4 — Repo-scaffold: Expo + TypeScript strict |
| [QS8-22](#qs8-22) | In Review | 0.5 — Supabase koppelen + migratie-workflow |
| [QS8-23](#qs8-23) | Done | 0.6 — CI: typecheck, lint, test |
| [QS8-24](#qs8-24) | In Progress | 0.7 — Sentry |
| [QS8-25](#qs8-25) | In Progress | 1.1 — Aanmelden met e-mail, Apple of Google |
| [QS8-26](#qs8-26) | Done | 1.2 — Uitleg van het concept vóór het eerste doel |
| [QS8-27](#qs8-27) | In Review | 1.3 — Profiel: naam, avatar, tijdzone |
| [QS8-28](#qs8-28) | Done | 1.4 — Eigen week-startdag kiezen |
| [QS8-29](#qs8-29) | Done | 1.5 — Standaard herinneringstijd en -toon |
| [QS8-30](#qs8-30) | Done | 1.6 — Aanmelden als buddy zonder eigen doel |
| [QS8-31](#qs8-31) | Done | 2.1 — Hoofddoel aanmaken |
| [QS8-32](#qs8-32) | Done | 2.2 — Doel bewerken of archiveren |
| [QS8-33](#qs8-33) | Done | 2.3 — Dashboard met alle actieve doelen |
| [QS8-34](#qs8-34) | Done | 2.4 — Beloning instellen bij een doel |
| [QS8-35](#qs8-35) | Done | 2.5 — Straf instellen en begunstigde groep kiezen |
| [QS8-36](#qs8-36) | Done | 2.6 — De identiteitsvraag bij een doel |
| [QS8-37](#qs8-37) | Done | 3.1 — Het zes-vragen-interview |
| [QS8-38](#qs8-38) | Done | 3.2 — Mijlpalen genereren via Edge Function |
| [QS8-39](#qs8-39) | Done | 3.3 — Mijlpalen bewerken, herordenen, verwijderen, toevoegen |
| [QS8-40](#qs8-40) | Done | 3.4 — Suggesties opnieuw laten genereren |
| [QS8-41](#qs8-41) | Backlog | 3.5 — Weekdoelen laten genereren per mijlpaal |
| [QS8-42](#qs8-42) | Done | 3.6 — Rate limiting, quota en kostenlogging op AI |
| [QS8-43](#qs8-43) | Done | 4.1 — Weekdoelen toevoegen onder een mijlpaal |
| [QS8-44](#qs8-44) | Done | 4.2 — Vloer & Plafond op een weekdoel |
| [QS8-45](#qs8-45) | Done | 4.3 — "Deze week" volgt mijn eigen week-startdag |
| [QS8-46](#qs8-46) | Done | 4.4 — Weekdoel afronden, met bewijs |
| [QS8-47](#qs8-47) | Done | 4.5 — Onvoltooide weekdoelen bij rollover markeren |
| [QS8-48](#qs8-48) | Done | 4.6 — Punten, minpunten en lopende reeks |
| [QS8-49](#qs8-49) | Done | 4.7 — Cycle-rollover job (scheduled Edge Function) |
| [QS8-50](#qs8-50) | Done | 4.8 — De Dagzet |
| [QS8-51](#qs8-51) | Done | 4.9 — Coulanceperiode na rollover |
| [QS8-52](#qs8-52) | Done | 5.1 — Groep aanmaken met deelbare uitnodigingslink |
| [QS8-53](#qs8-53) | Done | 5.2 — Groep joinen via uitnodigingscode |
| [QS8-54](#qs8-54) | Done | 5.3 — Eigen doel aan een groep koppelen |
| [QS8-55](#qs8-55) | Done | 5.4 — Groepsoverzicht met leden en hun voortgang |
| [QS8-56](#qs8-56) | Backlog | 5.5 — Hetzelfde doel aan meerdere groepen koppelen |
| [QS8-57](#qs8-57) | Backlog | 5.6 — Groep verlaten zonder andere groepen te raken |
| [QS8-58](#qs8-58) | Done | 5.7 — De huddledag van de groep |
| [QS8-59](#qs8-59) | Done | 5.8 — Gastvrije uitnodigingslinks |
| [QS8-60](#qs8-60) | Done | 5.9 — Slapende groepen |
| [QS8-61](#qs8-61) | Done | 5.10 — Rate limiting op uitnodigingen |
| [QS8-62](#qs8-62) | Done | 6.1 — Melding als een buddy iets afrondt |
| [QS8-63](#qs8-63) | Done | 6.2 — Goedkeuren of "vertel me meer" |
| [QS8-64](#qs8-64) | Done | 6.3 — Eén goedkeuring is genoeg (MVP-regel) |
| [QS8-65](#qs8-65) | Backlog | 6.4 — Goedkeuringsregel instelbaar (meerderheid) |
| [QS8-66](#qs8-66) | Done | 6.5 — Bewijseisen per groep instellen |
| [QS8-67](#qs8-67) | Done | 6.6 — Punten voor de goedkeurder |
| [QS8-68](#qs8-68) | Done | 6.7 — Autorisatiegrens hard afdwingen |
| [QS8-69](#qs8-69) | Done | 7.1 — Realtime groepschat |
| [QS8-70](#qs8-70) | Done | 7.2 — Systeemberichten bij belangrijke gebeurtenissen |
| [QS8-71](#qs8-71) | Backlog | 7.3 — Foto's delen in de chat |
| [QS8-72](#qs8-72) | Backlog | 7.4 — Documenten delen in de chat |
| [QS8-73](#qs8-73) | Done | 7.5 — De Weekafsluiting |
| [QS8-74](#qs8-74) | Done | 7.6 — Ontwerpregel: falen is nooit publiek |
| [QS8-75](#qs8-75) | Done | 8.1 — Reeks en punten op het dashboard |
| [QS8-76](#qs8-76) | Done | 8.2 — Feestelijk moment bij een goedkeuring |
| [QS8-77](#qs8-77) | Done | 8.3 — Dagelijkse nudge bij stilstand |
| [QS8-78](#qs8-78) | Backlog | 8.4 — Badges en prestaties |
| [QS8-79](#qs8-79) | Backlog | 8.5 — Seizoenen per groep met recap |
| [QS8-80](#qs8-80) | Done | 8.6 — De Ketting |
| [QS8-81](#qs8-81) | Done | 8.7 — Weekpassen |
| [QS8-82](#qs8-82) | Done | 8.8 — Adempauze |
| [QS8-83](#qs8-83) | Done | 9.1 — Beloning vrijgeven bij het halen van een doel |
| [QS8-84](#qs8-84) | Done | 9.2 — Straf verschuldigd bij een gemiste deadline |
| [QS8-85](#qs8-85) | Done | 9.3 — Commitments blijven informeel in de MVP |
| [QS8-86](#qs8-86) | Backlog | 9.4 — Echte-geld-commitments via een betaalprovider |
| [QS8-87](#qs8-87) | Done | 10.1 — Design tokens: het Q-Projects navy-stelsel |
| [QS8-88](#qs8-88) | Done | 10.2 — Componentbibliotheek |
| [QS8-89](#qs8-89) | Done | 10.3 — Donkere modus |
| [QS8-90](#qs8-90) | Done | 10.4 — De vier kernschermen |
| [QS8-91](#qs8-91) | In Progress | 11.1 — Push-notificaties voor de kerngebeurtenissen |
| [QS8-92](#qs8-92) | Backlog | 11.2 — Notificatietypes zelf aan- en uitzetten |
| [QS8-93](#qs8-93) | Done | 12.1 — Haalbaarheidsberekening per doel |
| [QS8-94](#qs8-94) | Done | 12.2 — De vier standen in de UI |
| [QS8-95](#qs8-95) | Done | 12.3 — "Vraag je groep om hulp" |
| [QS8-96](#qs8-96) | Done | 12.4 — Herplanning bij een onhaalbare deadline |
| [QS8-97](#qs8-97) | Done | 4.10 — Puntenplafond per doel |
| [QS8-98](#qs8-98) | Done | 0.8 — RLS-testsuite met echte JWT's |
| [QS8-99](#qs8-99) | In Progress | 0.9 — Subdomein goalbuddies.q-projects.tech |
| [QS8-100](#qs8-100) | Done | 0.10 — Herhaalbare deploy naar Hostinger |
| [QS8-101](#qs8-101) | Done | Besluitenronde Q-TODO: A3, A7, A18, A19 uitgevoerd |
| [QS8-102](#qs8-102) | Done | Wanneer is een doel afgerond? Er is nu geen pad naar 'completed' |
| [QS8-103](#qs8-103) | Done | weekly_goals op slot bij aanmaken en verwijderen (A35, A36) |
| [QS8-104](#qs8-104) | Done | Doorschuiven en afsluiten: de laatste twee routes naar een weggepoetste week (A39, A40) |
| [QS8-105](#qs8-105) | Done | Bedenktijd: een per ongeluk aangemaakt weekdoel of doel mag weg |
| [QS8-106](#qs8-106) | Done | De schermen laten inlopen op de datalaag |
| [QS8-107](#qs8-107) | Done | Vertaalinfrastructuur, vóór het duurder wordt |
| [QS8-108](#qs8-108) | Backlog | Spraak naar tekst in de grote tekstvelden |
| [QS8-109](#qs8-109) | Backlog | Een gezicht voor de Doelcoach — mascotte kiezen en tekenen |
| [QS8-110](#qs8-110) | In Review | Wat krijg je bij een gehaalde week? De beloning invullen |
| [QS8-111](#qs8-111) | Done | Emoji: vastleggen wie ze mag gebruiken, en waar |
| [QS8-112](#qs8-112) | Done | Een weekdoel aanmaken kan niet — er is geen scherm |
| [QS8-113](#qs8-113) | In Review | Vertaalbibliotheek en berichtencatalogus (rest van QS8-107) |
| [QS8-114](#qs8-114) | Done | 11.3 — Web push: VAPID-sleutels en een service worker |
| [QS8-115](#qs8-115) | In Review | Schermteksten naar de catalogus (~54 bestanden) |
| [QS8-116](#qs8-116) | Done | 🔴 A47 — de RLS-suite bewijst niets meer in een volle run |
| [QS8-117](#qs8-117) | In Progress | 11.4 — iOS krijgt geen push zonder installeerbare PWA |
| [QS8-118](#qs8-118) | Done | Gebruikerstekst wordt op UTF-16-grenzen geknipt en rendert kapotte tekens |
| [QS8-119](#qs8-119) | Done | De RLS-suite draait tegen productie — richting B uit QS8-116 |
| [QS8-120](#qs8-120) | Done | deadlineVerzoekSchema is niet te testen — het schema zit vast aan de Supabase-client |
| [QS8-121](#qs8-121) | Done | Drie modules meer met een Zod-schema vast aan de Supabase-client |
| [QS8-122](#qs8-122) | Done | Het migratieregister kent twee onverenigbare nummeringen — `supabase/migrations/` kan het schema niet opbouwen |
| [QS8-123](#qs8-123) | Done | Hoe merken we dat een als "Laag" weggelegde bevinding zwaarder wordt door iets dat we er later op bouwen? |
| [QS8-124](#qs8-124) | In Review | 11.5 — De service worker registreren: web push is gebouwd maar wordt nooit aangezet |
| [QS8-125](#qs8-125) | Done | Dezelfde stand staat in drie documenten en loopt uiteen — vier keer op één dag |
| [QS8-126](#qs8-126) | Todo | De repository staat publiek en moet privé — bewust uitgesteld tot de software af is |
| [QS8-127](#qs8-127) | Done | Besluit A37 — telt een week mee zodra één weekdoel erin af is? |
| [QS8-128](#qs8-128) | Done | Besluit A41 + A42 + A44 — mag de groep tegenslag zien, blijven punten privé, en is zakelijk de koers? |
| [QS8-129](#qs8-129) | Done | Besluit A43 — minpunten bij een deadline verschuiven zonder akkoord? |
| [QS8-130](#qs8-130) | Done | Besluit A46 — mag TRUNCATE en TRIGGER ingetrokken worden op alle tabellen? |
| [QS8-131](#qs8-131) | Done | Land de branch qs8-83-91 — 21 commits staan buiten main en blokkeren QS8-115 |
| [QS8-132](#qs8-132) | In Review | EPIC 13 — Open of beschermde groepen (besluit A41) |
| [QS8-133](#qs8-133) | In Review | EPIC 13 — oppervlak 1: het groepsoverzicht in een open groep |
| [QS8-134](#qs8-134) | In Review | EPIC 13 — oppervlak 2: best_streak in een open groep |
| [QS8-135](#qs8-135) | In Review | EPIC 13 — oppervlak 13: De Ketting in een open groep |
| [QS8-136](#qs8-136) | In Review | Besluit A49 — moet toetreden tot een open groep om toestemming vragen? |
| [QS8-137](#qs8-137) | Backlog | A48 variant 2 — de Doelcoach-tip per mijlpaal, bovenop de vaste set |

---

## QS8-1

**Get familiar with Linear**

| | |
|---|---|
| Status | Todo |
| Prioriteit | No priority |
| Labels | — |
| Aangemaakt | 2026-07-17 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-1/get-familiar-with-linear |

Welcome to Linear! 

Watch an introductory video and access a list of resources below.

<linear-embed node-type="video">{"uploadState":"finished","uploadId":"upload-1768557254876-t6pc6wu","src":"https://uploads.linear.app/fe63b3e2-bf87-46c0-8784-cd7d639287c8/a044fb03-9b84-470c-ab6f-8eae613e2529/98d7274d-de7f-4910-b3f3-f72e8e286a98","title":"LinearH264Version_1.mp4","size":75734656,"controls":true,"height":2160,"width":3840,"metadataId":null,"mim… (truncated, use `get_issue` for full description)

---

## QS8-2

**Connect your tools**

| | |
|---|---|
| Status | Todo |
| Prioriteit | No priority |
| Labels | — |
| Aangemaakt | 2026-07-17 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-2/connect-your-tools |

Integrations turn Linear into your source of truth around product development. Keep data in sync, and eliminate manual updates between tools.

![](https://uploads.linear.app/fe63b3e2-bf87-46c0-8784-cd7d639287c8/c2eae035-37e2-4754-adcb-b8305431aa1f/c92d70c7-e6d0-4fa2-a0fd-78f6e780993a)

### **Key integrations**

* [**Slack**](<https://linear.app/settings/integrations/slack>)
  Create issues from Slack messages and sync threads
* **[GitHub](<https… (truncated, use `get_issue` for full description)

---

## QS8-3

**Import your data**

| | |
|---|---|
| Status | Todo |
| Prioriteit | No priority |
| Labels | — |
| Aangemaakt | 2026-07-17 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-3/import-your-data |

Sync data between Linear and your other tools.

![](https://uploads.linear.app/fe63b3e2-bf87-46c0-8784-cd7d639287c8/80d7e050-dd1f-4d4f-8257-b29c16087017/65c16454-30f3-4f4a-8f25-c2428d64ff57)

Whether you're exploring Linear, running a pilot, or ready for full migration, we’ve got you covered. 

### **Exploring Linear:**

* [**Pitch Linear**](<https://linear.app/switch/pitch-guide>)
  Build your business case and get organizational buy-in
* [**Ru… (truncated, use `get_issue` for full description)

---

## QS8-4

**Set up your teams**

| | |
|---|---|
| Status | Todo |
| Prioriteit | No priority |
| Labels | — |
| Aangemaakt | 2026-07-17 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-4/set-up-your-teams |

This workspace is a container for your organization’s work. 

* [Learn more about Workspaces](<https://linear.app/docs/workspaces>)
  How to configure settings and workflows 

Teams are how you organize people and work in Linear.

* [Learn about Teams](<https://linear.app/docs/teams>)
  How to structure teams and configure workflows

Teams are made of members with defined roles (Admin, Member, Guest).

* [Learn more about Members](<https://linea… (truncated, use `get_issue` for full description)

---

## QS8-5

**EPIC 0 — Fundering**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | Urgent |
| Labels | epic, area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-5/epic-0-fundering |

Alles waar de rest op staat. Staat niet in de PRD, maar `CLAUDE.md` schrijft het voor: **datamodel eerst, volledig, met RLS, op papier vóór in code.**

Dit epic levert niets zichtbaars op en is daarom precies het epic dat overgeslagen wordt. Niet doen — dit is greenfield, en deze keuzes gaan jaren mee.

**Bevat**

* Repo-scaffold: Expo + TypeScript strict, mappenstructuur volgens `CLAUDE.md`
* Volledig datamodel + RLS-policies, eerst als beslisd… (truncated, use `get_issue` for full description)

---

## QS8-6

**EPIC 1 — Auth & Onboarding**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | High |
| Labels | epic, area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-6/epic-1-auth-and-onboarding |

*Een nieuwe gebruiker kan zich aanmelden, begrijpt het concept, en heeft binnen twee minuten zijn eerste doel staan.*

PRD sectie 3, Epic 1.

**Ontwerpnotitie uit het voorstel:** een buddy hoeft **geen eigen doel** te hebben om te kunnen goedkeuren en aanmoedigen. De onboarding mag iemand die alleen komt helpen dus niet door een verplichte doel-trechter duwen.

---

## QS8-7

**EPIC 2 — Hoofddoelen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-7/epic-2-hoofddoelen |

*Gebruikers kunnen vastleggen wat ze willen bereiken en wanneer het klaar moet zijn.*

PRD sectie 3, Epic 2.

**Toevoeging uit het voorstel:** naast het doel staat de identiteitsvraag — **"wie word ik als dit lukt?"** Bij een doel van zes maanden is identiteit de enige brandstof die zo lang meegaat. Overgenomen van Habit Huddle, die deze vraag tot de kop van de habit-card heeft gepromoveerd.

---

## QS8-8

**EPIC 3 — De Doelcoach (AI-mijlpalen)**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-8/epic-3-de-doelcoach-ai-mijlpalen |

*Een vaag groot doel wordt een concrete, bewerkbare roadmap.*

PRD sectie 3, Epic 3 — maar met een andere insteek dan "tik op genereer, krijg een lijst". Zie voorstel §2.4.

**De Doelcoach stelt zes vragen vóór hij één mijlpaal genereert:**

1. Wat wil je bereiken, en waaraan zie je dat het gelukt is? *(dwingt meetbaarheid af)*
2. Wie word je als dit lukt? *(identiteit)*
3. Wanneer moet het klaar zijn, en waarom die datum? *(echte deadline of we… (truncated, use `get_issue` for full description)

---

## QS8-9

**EPIC 4 — Weekdoelen & cyclus**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-9/epic-4-weekdoelen-and-cyclus |

*De wekelijkse eenheid van actie, draaiend op ieders eigen week-startdag.*

PRD sectie 3, Epic 4 — plus de drie belangrijkste toevoegingen uit het voorstel.

**Vloer & Plafond** (voorstel §1.1) — elk weekdoel krijgt bij het aanmaken twee versies: wat je ook in een rotweek haalt, en waar je voor gaat. Vloer halen betekent dat de week telt; alleen de punten verschillen. Dit is de belangrijkste import uit Habit Huddle en lost het grootste faalpunt … (truncated, use `get_issue` for full description)

---

## QS8-10

**EPIC 5 — Buddy-groepen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-10/epic-5-buddy-groepen |

*Sociale containers waarin leden onafhankelijke doelen nastreven.*

PRD sectie 3, Epic 5.

**Toevoegingen uit het voorstel**

* **De huddledag** — één dag per week die de groep kiest; het gedeelde raster voor weekafsluiting, De Ketting en het groepsoverzicht (beslispunt 2).
* **Gastvrije uitnodigingslinks** — de ontvanger ziet de échte groep vóór signup, en na aanmelden landt hij precies waar hij heen wilde, groep al gejoined. Habit Huddle's cha… (truncated, use `get_issue` for full description)

---

## QS8-11

**EPIC 6 — Peer-goedkeuring**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-11/epic-6-peer-goedkeuring |

*Zelfgerapporteerde voltooiingen worden sociaal geverifieerd.*

PRD sectie 3, Epic 6 — plus de aanscherping uit voorstel §2.3.

De PRD noemt goedkeuringsmisbruik als open risico. Het probleem is niet de goedkeuringsregel, maar dat er niets te beoordelen valt: een duim omhoog op een bewering is een sociale formaliteit, en dat weten beide partijen.

**Aanpak**

* **Afronden vereist een spoor** — instelbaar per groep, standaard notitie verplicht en… (truncated, use `get_issue` for full description)

---

## QS8-12

**EPIC 7 — Groepschat & weekafsluiting**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-12/epic-7-groepschat-and-weekafsluiting |

*Alle accountability-activiteit blijft binnen de app.*

PRD sectie 3, Epic 7 — plus **De Weekafsluiting** (voorstel §2.2), het ritueel dat echte accountability-groepen draaien en dat geen enkele app asynchroon doet.

Op de huddledag krijgt elk lid drie vragen: **wat heb je gedaan · wat zat in de weg · wat is je volgende week.** De antwoorden verschijnen sámen als één kaart in de groep — niet druppelsgewijs, maar als een vergadering die je in je … (truncated, use `get_issue` for full description)

---

## QS8-13

**EPIC 8 — Gamification**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-13/epic-8-gamification |

*Het proces moet als een spel voelen, niet als administratie.*

PRD sectie 3, Epic 8 — plus de vergevingsmechanismen uit voorstel §1.2/§1.3, die bij Habit Huddle de reden zijn dat gebruikers reeksen van 200+ dagen halen.

| Habit Huddle | GoalBuddies |
| -- | -- |
| Checkin Chain | **De Ketting** — één schakel per lid dat zijn cyclus afsloot |
| Streak freezes | **Weekpas** — een gemiste week verbruikt een pas, niet je reeks. Eén per 6 voltooide… (truncated, use `get_issue` for full description)

---

## QS8-14

**EPIC 9 — Commitment device**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-14/epic-9-commitment-device |

*Skin in the game, sociaal afgehandeld.*

PRD sectie 3, Epic 9. In de MVP **informeel en alleen bijgehouden** — er wordt geen echt geld verwerkt (PRD 9.3).

⚠️ `CLAUDE.md` domeinregel 5: alles wat een consequentie oplegt — inzet, verlies, publieke zichtbaarheid — moet **expliciet bevestigd** zijn, **auditeerbaar**, en **nooit stilzwijgend geactiveerd**.

## Echt geld is Fase 3 en vereist juridische toetsing vóór de fase begint.

## Af voor de MVP… (truncated, use `get_issue` for full description)

---

## QS8-15

**EPIC 10 — Design system**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-15/epic-10-design-system |

*Hetzelfde design als de Q-Projects Status Tracker: navy en wit.*

**Gewijzigd 15-08-2026.** De emerald-richting uit PRD 10.1 en productvoorstel §5 vervalt. GoalBuddies deelt het design van `tracker.q-projects.tech`, thema's `navy` en `navy-licht`. **Alleen Q-Projects-kleurstellingen** — er komen geen zelfbedachte kleuren bij.

Volledige tokenset in <issue id="12c1334b-b5d6-46ff-8cf5-3efe8b386bab" href="https://linear.app/qs86-bot-linear/issue/Q… (truncated, use `get_issue` for full description)

---

## QS8-16

**EPIC 11 — Notificaties**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | High |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-16/epic-11-notificaties |

*De groep duwt zichzelf — niet één persoon.*

PRD sectie 3, Epic 11.

Habit Huddle's framing, en die van hun gebruikers, is raak: *"I don't want to be the streak cop."* Dagelijkse signalen, reminders en De Ketting doen het duwwerk; de leden hoeven alleen te juichen. Accountability faalt zodra het afhangt van één persoon die eraan denkt te vragen.

Met de Dagzet (beslispunt 1) heeft een dagelijkse notificatie ook echt bestaansrecht, in plaats van… (truncated, use `get_issue` for full description)

---

## QS8-17

**EPIC 12 — De Risico-radar**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | epic, area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-17/epic-12-de-risico-radar |

*Het antwoord op de vraag waarom iemand dit zou kiezen boven Habit Huddle.*

Nieuw epic, uit voorstel §2.1. Staat niet in de PRD.

Habit Huddle's groep is **reactief**: je juicht als iemand incheckt. Bij een doel met een deadline is dat te laat. Een gemiste week merk je wel. Drie weken achterstand op een mijlpaal, met nog vijf weken tot je deadline, merkt níemand — jijzelf het minst, want je zit er te dicht op.

GoalBuddies berekent per doel con… (truncated, use `get_issue` for full description)

---

## QS8-18

**0.1 — Git-repo initialiseren**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-15 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-18/01-git-repo-initialiseren |

De projectmap was geen git-repo. Alle procesregels in `CLAUDE.md` gaan uit van versiebeheer: PR's, code-critic vóór merge, rollback-paden bij migraties.

**Afgerond 15-08-2026**

- [X] `git init` op `main`, identiteit repo-lokaal gezet (niet globaal)
- [X] `.gitignore` uitgebreid: `node_modules`, `.env*`, `.expo`, `.firecrawl`, build-output, `*.dump`, `backup-*.sql`
- [X] Remote `https://github.com/QS86-bot/GoalBuddies.git` gekoppeld, vier commi… (truncated, use `get_issue` for full description)

---

## QS8-19

**0.2 — Datamodel + RLS als beslisdocument**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-15 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-19/02-datamodel-rls-als-beslisdocument |

`CLAUDE.md`: *"Datamodel eerst, volledig, met RLS. Op papier vóór in code."* Dit issue is dat papier. Geen migratie draait voordat dit door Quinten is goedgekeurd.

**Acceptatiecriteria**

- [ ] `docs/decisions/001-datamodel.md` met alle tabellen, kolommen, types en relaties
- [ ] Per tabel: policies voor SELECT, INSERT, UPDATE **én** DELETE, default deny
- [ ] Index op elke foreign key en elke kolom in WHERE/ORDER BY
- [ ] Vloer/plafond, Dagzet… (truncated, use `get_issue` for full description)

---

## QS8-20

**0.3 — shared/time met twee klokken**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-20/03-sharedtime-met-twee-klokken |

**Afgerond, wacht op review** — branch `quintenstrijdonk/qs8-21-04-repo-scaffold-expo-typescript-strict`

De enige bron van waarheid voor tijd. `CLAUDE.md`: geen enkele query, streak-berekening of UI-component rekent dit zelf uit.

**Acceptatiecriteria**

- [X] `userCycle(clock, at)` — persoonlijke week-startdag in de tijdzone van de gebruiker
- [X] `groupPeriod(clock, at)` — de huddledag van de groep, in de tijdzone van de groep
- [X] Alles in … (truncated, use `get_issue` for full description)

---

## QS8-21

**0.4 — Repo-scaffold: Expo + TypeScript strict**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-21/04-repo-scaffold-expo-typescript-strict |

**Afgerond, wacht op review** — branch `quintenstrijdonk/qs8-21-04-repo-scaffold-expo-typescript-strict`

**Acceptatiecriteria**

- [X] Expo-project, draait op web én native (SDK 57, React 19.2, RN 0.86)
- [X] TypeScript strict, geen `any`, geen `@ts-ignore` zonder reden
- [X] Mappenstructuur exact volgens `CLAUDE.md`, met een barrel per module
- [X] Module-communicatie alleen via `modules/<naam>/index.ts`
- [X] `npm run dev|typecheck|lint|test|… (truncated, use `get_issue` for full description)

---

## QS8-22

**0.5 — Supabase koppelen + migratie-workflow**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Urgent |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-22/05-supabase-koppelen-migratie-workflow |

Project bestaat: `goalbuddies`, ref `wehgocadxehottiiyvsc`, regio `eu-west-3`.

**Gedaan op 15-08-2026**

- [X] Migraties 0001–0004 toegepast: 23 tabellen, 48 policies, 0 tabellen zonder RLS
- [X] Security advisor gedraaid en bevindingen opgelost (0004)
- [X] Migratiebestanden in `supabase/migrations/`, elk met rollback-pad in de kop

**Bijgewerkt 18-08-2026 — vier van de vijf open punten zijn weg**

- [X] `pg_dump`-script in `docs/DEPLOY.md` — … (truncated, use `get_issue` for full description)

---

## QS8-23

**0.6 — CI: typecheck, lint, test**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-23/06-ci-typecheck-lint-test |

`CLAUDE.md`, solo-fase: *"Tests zijn de enige review die bestaat. Niet optioneel."*

**Acceptatiecriteria**

- [X] Pipeline draait typecheck, lint en tests op elke push — `.github/workflows/ci.yml`, op elke branch en op elke PR naar `main`
- [ ] **Rood is blokkerend voor merge — bewust uitgesteld tot november, zie hieronder**
- [X] Testrunner opgezet met een voorbeeldtest die daadwerkelijk faalt als de code stuk is — Vitest, 331 tests

---

## W… (truncated, use `get_issue` for full description)

---

## QS8-24

**0.7 — Sentry**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | Medium |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-24/07-sentry |

Habit Huddle's changelog noemt een "reliability sweep" waarbij ze elk scherm op stille fouten hebben doorgelicht en foutmelding-rapportage hebben aangezet. Beter meteen goed.

**Acceptatiecriteria**

- [ ] Sentry op web én native
- [ ] Source maps geüpload
- [X] Geen persoonsgegevens in events
- [ ] Edge Functions rapporteren ook

---

## Stand — bijgewerkt 24-08-2026

**Criterium 3 is af, en dat is bewust het eerste geweest.** De reden staat in… (truncated, use `get_issue` for full description)

---

## QS8-25

**1.1 — Aanmelden met e-mail, Apple of Google**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-25/11-aanmelden-met-e-mail-apple-of-google |

*Als nieuwe gebruiker kan ik me aanmelden met e-mail, Apple of Google.* — PRD 1.1

**Acceptatiecriteria**

- [ ] E-mail/wachtwoord werkt, plus minstens één OAuth-provider — **e-mail werkt; OAuth wacht op Quinten**
- [X] Geverifieerde sessie blijft bestaan via Supabase Auth
- [X] Een nieuw account maakt automatisch een `profiles`-rij aan
- [ ] Rate limiting op auth-endpoints — **dashboardinstelling, wacht op Quinten**

---

## Stand 19-08-2026

*… (truncated, use `get_issue` for full description)

---

## QS8-26

**1.2 — Uitleg van het concept vóór het eerste doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-26/12-uitleg-van-het-concept-voor-het-eerste-doel |

*Als nieuwe gebruiker zie ik een korte uitleg (3–4 schermen) van hoe de app werkt, voordat ik mijn eerste doel aanmaak.* — PRD 1.2

**Acceptatiecriteria**

- [ ] 3–4 schermen, overslaan mogelijk
- [ ] Legt de kernloop uit: doel → mijlpalen → weekdoelen → buddy keurt goed
- [ ] Legt vloer en plafond uit — dit is het minst voor de hand liggende concept in de app
- [ ] Doel aanmaken lukt binnen twee minuten na aanmelden

---

## QS8-27

**1.3 — Profiel: naam, avatar, tijdzone**

| | |
|---|---|
| Status | In Review |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-27/13-profiel-naam-avatar-tijdzone |

*Als gebruiker kan ik mijn weergavenaam, avatar en tijdzone instellen.* — PRD 1.3

**Acceptatiecriteria**

- [X] Tijdzone standaard uit het apparaat, **handmatig te overschrijven**
- [X] Avatar valt terug op nette initialen als de afbeelding ontbreekt of stuk is (leerpunt uit Habit Huddle's changelog)
- [X] Tijdzone wordt gebruikt door `shared/time`, nergens anders opnieuw bepaald

---

## Stand — bijgewerkt 24-08-2026

**Twee van de drie zijn a… (truncated, use `get_issue` for full description)

---

## QS8-28

**1.4 — Eigen week-startdag kiezen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-28/14-eigen-week-startdag-kiezen |

*Als gebruiker kies ik op welke weekdag mijn week begint (0–6), later aanpasbaar in instellingen.* — PRD 1.4

**Acceptatiecriteria**

- [ ] Keuze bij onboarding, aanpasbaar in instellingen
- [ ] Wijzigen midden in een cyclus doet geen punten of reeks verdwijnen — gedrag expliciet vastgelegd en getest
- [ ] Voedt `currentUserCycle(userId)` uit `shared/time`

---

## QS8-29

**1.5 — Standaard herinneringstijd en -toon**

| | |
|---|---|
| Status | Done |
| Prioriteit | Low |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-29/15-standaard-herinneringstijd-en-toon |

*Als gebruiker stel ik een standaard herinneringstijd in en een toon (zacht/streng).* — PRD 1.5

**Acceptatiecriteria**

- [ ] Tijdkiezer met een **aan/uit-schakelaar ernaast** — uit blijft uit (leerpunt uit Habit Huddle's changelog)
- [ ] Toon beïnvloedt de tekst van de nudge, niet de frequentie

---

## QS8-30

**1.6 — Aanmelden als buddy zonder eigen doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-30/16-aanmelden-als-buddy-zonder-eigen-doel |

*Als iemand die via een uitnodiging binnenkomt om een vriend te helpen, kan ik meedoen zonder zelf een doel aan te maken.*

Nieuw, uit voorstel §2.5. De PRD-persona "The Buddy" heeft expliciet niet per se een eigen doel — dat moet ook zo gebouwd worden. Een verplichte doel-trechter voor iemand die alleen komt helpen is precies de drempel die uitnodigingen laat mislukken.

**Acceptatiecriteria**

- [ ] Onboarding via uitnodigingslink slaat de doe… (truncated, use `get_issue` for full description)

---

## QS8-31

**2.1 — Hoofddoel aanmaken**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-31/21-hoofddoel-aanmaken |

*Als gebruiker maak ik een hoofddoel aan met titel, beschrijving, categorie (business/studie/overig) en streefdatum.* — PRD 2.1

**Acceptatiecriteria**

- [ ] Streefdatum moet in de toekomst liggen
- [ ] Doel verschijnt direct op het dashboard in de staat "nog geen mijlpalen"
- [ ] Alle invoer servergevalideerd met Zod

---

## QS8-32

**2.2 — Doel bewerken of archiveren**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-32/22-doel-bewerken-of-archiveren |

*Als gebruiker kan ik een hoofddoel bewerken of archiveren.* — PRD 2.2

**Acceptatiecriteria**

- [ ] Archiveren is omkeerbaar, verwijderen niet — en dat verschil is duidelijk in de UI
- [ ] Een gearchiveerd doel verdwijnt uit groepsoverzichten maar behoudt zijn geschiedenis
- [ ] Deadline verzetten is een expliciete, gelogde handeling (voedt de Risico-radar, EPIC 12)

---

## QS8-33

**2.3 — Dashboard met alle actieve doelen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-33/23-dashboard-met-alle-actieve-doelen |

*Als gebruiker zie ik een dashboard met al mijn actieve doelen en hun totale voortgang.* — PRD 2.3

**Acceptatiecriteria**

- [ ] Voortgang per doel, berekend uit afgeronde mijlpalen en weekdoelen
- [ ] Gepagineerd — geen ongepagineerde lijstquery's
- [ ] Geen N+1: voortgang in één query, niet per doel opnieuw
- [ ] Loading-, error- én lege staat

---

## QS8-34

**2.4 — Beloning instellen bij een doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-34/24-beloning-instellen-bij-een-doel |

*Als gebruiker stel ik een beloning in (tekst + optionele afbeelding) die vrijkomt als ik dit doel haal.* — PRD 2.4

---

## QS8-35

**2.5 — Straf instellen en begunstigde groep kiezen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-35/25-straf-instellen-en-begunstigde-groep-kiezen |

*Als gebruiker stel ik een straf in en kies ik welke van mijn groepen ervan profiteert als ik faal.* — PRD 2.5

⚠️ `CLAUDE.md` domeinregel 5: expliciet bevestigd, auditeerbaar, nooit stilzwijgend geactiveerd.

**Acceptatiecriteria**

- [ ] Aparte bevestigingsstap met de consequentie letterlijk uitgeschreven
- [ ] Instellen en wijzigen worden gelogd met tijdstempel
- [ ] Alleen groepen waar de gebruiker daadwerkelijk lid van is, zijn kiesbaar (RLS-afgedwongen)

---

## QS8-36

**2.6 — De identiteitsvraag bij een doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-36/26-de-identiteitsvraag-bij-een-doel |

*Als gebruiker leg ik naast mijn doel vast wie ik word als het lukt.*

Nieuw, uit voorstel §1.5. Habit Huddle draagt bij elke gewoonte twee vragen — "wat wil ik bereiken" en "wie wil ik worden" — en heeft die tweede tot de kop van de kaart gepromoveerd in plaats van hem in een veld weg te stoppen.

Bij een doel van zes maanden is identiteit de enige brandstof die zo lang meegaat.

**Acceptatiecriteria**

- [ ] Optioneel veld, maar prominent in d… (truncated, use `get_issue` for full description)

---

## QS8-37

**3.1 — Het zes-vragen-interview**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-37/31-het-zes-vragen-interview |

*Als gebruiker beantwoord ik zes vragen voordat de Doelcoach mijlpalen voorstelt.* — nieuw, voorstel §2.4

De vragen: meetbaarheid · identiteit · deadline en waarom die datum · **beschikbare uren per week** · wat is er al gedaan · **waar liep het eerder vast**.

**Acceptatiecriteria**

- [ ] Zes stappen, elk overslaanbaar, antwoorden bewaard bij het doel
- [ ] Antwoorden vormen de context voor 3.2
- [ ] Beschikbare uren per week wordt als getal … (truncated, use `get_issue` for full description)

---

## QS8-38

**3.2 — Mijlpalen genereren via Edge Function**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-38/32-mijlpalen-genereren-via-edge-function |

*Als gebruiker tik ik op "Genereer mijlpalen" en krijg ik een geordende lijst met streefdata.* — PRD 3.1

**Acceptatiecriteria**

- [ ] AI-call server-side via Supabase Edge Function; API-key nooit client-side
- [ ] Retourneert gestructureerde JSON, gevalideerd met Zod vóór opslag
- [ ] **Draait nooit synchroon in de request** — job-tabel + realtime/polling (`CLAUDE.md` regel 8)
- [ ] Elke externe call heeft een timeout
- [ ] Faalt de call, dan … (truncated, use `get_issue` for full description)

---

## QS8-39

**3.3 — Mijlpalen bewerken, herordenen, verwijderen, toevoegen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-39/33-mijlpalen-bewerken-herordenen-verwijderen-toevoegen |

*Als gebruiker kan ik mijlpalen bewerken, herordenen, verwijderen of handmatig toevoegen.* — PRD 3.2

**Acceptatiecriteria**

- [ ] Volledig handmatig pad, ook als er nooit AI gebruikt is
- [ ] Herordenen past `order_index` consistent aan
- [ ] `ai_generated` blijft zichtbaar als herkomst, ook na bewerken

---

## QS8-40

**3.4 — Suggesties opnieuw laten genereren**

| | |
|---|---|
| Status | Done |
| Prioriteit | Low |
| Labels | area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-40/34-suggesties-opnieuw-laten-genereren |

*Als gebruiker kan ik opnieuw laten genereren als de suggesties me niet bevallen.* — PRD 3.3

**Acceptatiecriteria**

- [ ] Telt mee in het quotum uit 3.6
- [ ] Waarschuwt vóór het overschrijven van handmatige bewerkingen

---

## QS8-41

**3.5 — Weekdoelen laten genereren per mijlpaal**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:ai, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-41/35-weekdoelen-laten-genereren-per-mijlpaal |

*Als gebruiker tik ik op "Genereer weekdoelen" bij een mijlpaal en krijg ik voorgestelde weekstappen.* — PRD 3.4

**Acceptatiecriteria**

- [ ] Elk voorgesteld weekdoel komt mét vloer en plafond — anders is de suggestie half werk
- [ ] Zelfde async-, validatie- en quotumeisen als 3.2

---

## QS8-42

**3.6 — Rate limiting, quota en kostenlogging op AI**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:ai, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-42/36-rate-limiting-quota-en-kostenlogging-op-ai |

`CLAUDE.md` regel 6: *"Elke AI-call kost geld: cache, dedupliceer, quota per gebruiker, log kosten per user-id."* De PRD noemt AI-kosten en latency ook als open risico.

**Acceptatiecriteria**

- [ ] Quotum per gebruiker per dag, met een begrijpelijke melding bij overschrijding
- [ ] Rate limiting op de Edge Function
- [ ] Identieke input binnen een venster wordt gededupliceerd of gecachet
- [ ] Kosten per call gelogd met user-id, model en token… (truncated, use `get_issue` for full description)

---

## QS8-43

**4.1 — Weekdoelen toevoegen onder een mijlpaal**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-43/41-weekdoelen-toevoegen-onder-een-mijlpaal |

*Als gebruiker voeg ik weekdoelen toe onder een mijlpaal, of los onder een hoofddoel.* — PRD 4.1

**Acceptatiecriteria**

- [ ] Weekdoel kan aan een mijlpaal hangen óf direct aan het hoofddoel
- [ ] Koppeling aan de juiste cyclus via `shared/time`, nooit handmatig een datum uitrekenen

---

## QS8-44

**4.2 — Vloer & Plafond op een weekdoel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-44/42-vloer-and-plafond-op-een-weekdoel |

*Als gebruiker geef ik bij een weekdoel aan wat ik ook in een rotweek haal (vloer) en waar ik voor ga (plafond).*

Uit voorstel §1.1. De belangrijkste import uit Habit Huddle. Een weekdoel dat je woensdag al niet meer haalt, negeer je — en daarna negeer je de app. Met een vloer is er tot zondagavond altijd nog een winnende zet.

> Weekdoel: *3 klantgesprekken voeren*
> Vloer: *1 gesprek ingepland* — Plafond: *3 gesprekken gevoerd*

**Review 15-0… (truncated, use `get_issue` for full description)

---

## QS8-45

**4.3 — "Deze week" volgt mijn eigen week-startdag**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-45/43-deze-week-volgt-mijn-eigen-week-startdag |

*Als gebruiker weerspiegelt mijn "deze week"-overzicht altijd mijn gekozen week-startdag, niet de kalenderweek.* — PRD 4.2

**Acceptatiecriteria (PRD)**

- [ ] Cyclusgrenzen komen uit `currentUserCycle(userId)`, nergens anders berekend
- [ ] **Geverifieerd met gebruikers op verschillende week-startdagen tegelijk**
- [ ] Correct rond middernacht in de tijdzone van de gebruiker
- [ ] Correct over een DST-overgang heen

---

## QS8-46

**4.4 — Weekdoel afronden, met bewijs**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-46/44-weekdoel-afronden-met-bewijs |

*Als gebruiker markeer ik een weekdoel als gedaan, met een notitie.* — PRD 4.3, aangevuld met beslispunt 3.

**Acceptatiecriteria**

- [ ] Keuze tussen vloer en plafond bij het afronden
- [ ] Notitie standaard verplicht; per groep instelbaar (zie 6.5)
- [ ] Status wordt `pending` — nooit direct `approved`
- [ ] In solomodus: status `afgerond, niet geverifieerd`; telt voor voortgang, niet voor punten
- [ ] Append-only: een correctie maakt een correctie-record, geen overschrijving

---

## QS8-47

**4.5 — Onvoltooide weekdoelen bij rollover markeren**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-47/45-onvoltooide-weekdoelen-bij-rollover-markeren |

*Als gebruiker worden onvoltooide weekdoelen bij cyclusovergang duidelijk gemarkeerd, niet stilletjes weggegooid.* — PRD 4.4

**Acceptatiecriteria**

- [X] Onvoltooid weekdoel blijft zichtbaar met de reden "niet afgerond in cyclus X"
- [X] Gebruiker kan het doorschuiven naar de nieuwe cyclus of afsluiten — *de datalaag wel, het scherm nog niet*
- [X] ⚠️ Dit is **privé**. Onvoltooide doelen verschijnen nooit in de groepsfeed (EPIC 7-ontwerpregel)
… (truncated, use `get_issue` for full description)

---

## QS8-48

**4.6 — Punten, minpunten en lopende reeks**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-48/46-punten-minpunten-en-lopende-reeks |

*Als gebruiker verdien ik punten voor een goedgekeurd weekdoel, verlies ik een punt bij een gemiste week, en zie ik een lopende reeks.* — PRD 4.5, uitgebreid bij de review van 15-08-2026.

| Uitkomst van een cyclus | Punten | Reeks |
| -- | -- | -- |
| Plafond gehaald, goedgekeurd | `+2` | loopt door |
| Vloer gehaald, goedgekeurd | `+1` | loopt door |
| Niet gehaald | `−1` | breekt, tenzij een weekpas hem redt |
| Adempauze | `0` | wacht |

**D… (truncated, use `get_issue` for full description)

---

## QS8-49

**4.7 — Cycle-rollover job (scheduled Edge Function)**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-49/47-cycle-rollover-job-scheduled-edge-function |

De job die de cyclus laat draaien. PRD 4.2 acceptatiecriterium en non-functionele eis uit 4.4.

**Acceptatiecriteria — alle zes gehaald**

- [X] Berekent per gebruiker de cyclusgrenzen uit `week_start_day` en tijdzone — via `closableUserCycle()` uit de gedeelde `shared/time`, niet in SQL
- [X] **Tijdzone- én week-startdag-bewust**, getest met verschillende configuraties tegelijk — `cycle.test.ts` dekt `Europe/Amsterdam`, `America/New_York` en `A… (truncated, use `get_issue` for full description)

---

## QS8-50

**4.8 — De Dagzet**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-50/48-de-dagzet |

*Als gebruiker log ik in tien seconden waar ik vandaag aan gewerkt heb.*

Beslispunt 1 (akkoord). Zie voorstel §3.

**Review 15-08-2026: standaard privé.** De Dagzet is standaard alleen voor jezelf zichtbaar, met een deelknop per zet en een voorkeursinstelling voor wie standaard wil delen.

Dat kost één van de vier oorspronkelijke argumenten — de groepsfeed krijgt niet vanzelf dagelijks inhoud. De andere drie blijven: een dagelijkse reden om de … (truncated, use `get_issue` for full description)

---

## QS8-51

**4.9 — Coulanceperiode na rollover**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-51/49-coulanceperiode-na-rollover |

*Als gebruiker kan ik tot twaalf uur ná mijn cyclusovergang de vorige week nog afsluiten.*

Nieuw, uit voorstel §1.2 — de vertaling van Habit Huddle's "Night Owl Checkins" (tot 08:00 telt gisteren nog). Zondagavond klaar, maandagochtend gelogd: niets verloren.

**Acceptatiecriteria**

- [ ] Venster van 12 uur, als expliciet begrip in `shared/time`
- [ ] Afronden binnen het venster telt voor de vórige cyclus
- [ ] De UI zegt duidelijk voor welke … (truncated, use `get_issue` for full description)

---

## QS8-52

**5.1 — Groep aanmaken met deelbare uitnodigingslink**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-52/51-groep-aanmaken-met-deelbare-uitnodigingslink |

*Als gebruiker maak ik een groep aan en krijg ik een deelbare uitnodigingscode of -link.* — PRD 5.1

**Acceptatiecriteria**

- [ ] Elke groep krijgt bij aanmaken automatisch een geldige uitnodigingscode
- [ ] Code is niet raadbaar en intrekbaar
- [ ] Aanmaker wordt beheerder
- [ ] Link unfurlt netjes met groepsnaam en ledenaantal bij delen in WhatsApp/Slack

---

## QS8-53

**5.2 — Groep joinen via uitnodigingscode**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-53/52-groep-joinen-via-uitnodigingscode |

*Als gebruiker kan ik een groep joinen via een uitnodigingscode.* — PRD 5.2

**Acceptatiecriteria**

- [ ] Werkt voor nieuwe accounts **én voor mensen die al een account hebben** — dit was bij Habit Huddle een bug die stil elke uitnodiging killde
- [ ] Eén knop "Deelnemen aan deze groep"
- [ ] Al lid? Dan gewoon naar de groep, geen foutmelding
- [ ] Ingetrokken of verlopen code geeft een begrijpelijke uitleg, geen generieke fout

---

## QS8-54

**5.3 — Eigen doel aan een groep koppelen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-54/53-eigen-doel-aan-een-groep-koppelen |

*Als gebruiker koppel ik een van mijn doelen aan een groep waar ik lid van ben.* — PRD 5.3

**Acceptatiecriterium (PRD):** een doel kan in de ledenlijst van groep A staan zonder in die van groep B te staan, ook voor dezelfde gebruiker, tot het expliciet gekoppeld is.

- [ ] Koppelen is expliciet — niets wordt automatisch gedeeld
- [ ] Ontkoppelen kan, zonder de geschiedenis te wissen
- [ ] RLS bepaalt wie het doel ziet, niet de UI

---

## QS8-55

**5.4 — Groepsoverzicht met leden en hun voortgang**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-55/54-groepsoverzicht-met-leden-en-hun-voortgang |

*Als gebruiker zie ik in een groep het gekoppelde doel van elk lid en hun huidige voortgang.* — PRD 5.4

**Acceptatiecriteria**

- [ ] Per lid: gekoppeld doel, voortgang, reeks, en of deze cyclus al afgesloten is
- [ ] ⚠️ **Klassieke N+1-valkuil.** Eén query voor het hele overzicht, expliciet getest met 10+ leden
- [ ] Gepagineerd bij grotere groepen
- [ ] ⚠️ Toont **nooit** gemiste weken van anderen — alleen wat er wél staat (ontwerpregel EPIC 7)
- [ ] Loading-, error- én lege staat

---

## QS8-56

**5.5 — Hetzelfde doel aan meerdere groepen koppelen**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:backend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-56/55-hetzelfde-doel-aan-meerdere-groepen-koppelen |

*Als gebruiker kan ik hetzelfde doel aan meer dan één losse groep koppelen.* — PRD 5.5

Via `goal_group_links`. Het datamodel (0.2) moet dit vanaf dag één aankunnen, ook al komt de UI pas in fase 2.

---

## QS8-57

**5.6 — Groep verlaten zonder andere groepen te raken**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:backend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-57/56-groep-verlaten-zonder-andere-groepen-te-raken |

*Als gebruiker kan ik een groep verlaten zonder dat mijn doel uit andere groepen verdwijnt.* — PRD 5.6

**Acceptatiecriteria**

- [ ] Vertrek wist niemands voortgang — niet die van de vertrekker, niet die van de groep
- [ ] Openstaande goedkeuringen van de vertrekker worden netjes afgehandeld
- [ ] Laatste beheerder kan niet zomaar weg zonder overdracht

---

## QS8-58

**5.7 — De huddledag van de groep**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-58/57-de-huddledag-van-de-groep |

*Als groep kiezen we één dag per week waarop we samenkomen.*

Nieuw, beslispunt 2 (akkoord). De tweede klok. Leden hebben ieder hun eigen week-startdag; de groep heeft daarnaast één gedeeld raster voor de weekafsluiting, De Ketting en het groepsoverzicht.

**Acceptatiecriteria**

- [ ] Beheerder kiest de huddledag; standaard zondag
- [ ] Voedt `currentGroupPeriod(groupId)` uit `shared/time`
- [ ] Sloot een lid zijn eigen week op donderdag af en … (truncated, use `get_issue` for full description)

---

## QS8-59

**5.8 — Gastvrije uitnodigingslinks**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-59/58-gastvrije-uitnodigingslinks |

*Als genodigde zie ik de échte groep voordat ik een account maak.*

Nieuw, uit voorstel §1.5. Habit Huddle heeft hier veel werk in gestoken en het staat prominent in hun changelog: check-in-, huddle- en habit-links stoppen bezoekers niet meer bij een loginmuur, en signup dropt je precies waar je heen wilde.

Dit is de goedkoopste retentie-ingreep die er is: een uitnodiging die op een loginscherm eindigt, is een verloren buddy.

**Acceptatiecrite… (truncated, use `get_issue` for full description)

---

## QS8-60

**5.9 — Slapende groepen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Low |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-60/59-slapende-groepen |

*Als lid van een stilgevallen groep krijg ik geen zinloze herinneringen meer.*

Nieuw, uit voorstel §1.5. Habit Huddle: een huddle zonder check-ins gaat na 30 dagen slapen, post één afscheidsbericht en stopt met schema's en updates. Eén check-in wekt hem.

Een app die blijft duwen bij een dode groep wordt gedempt of verwijderd.

**Acceptatiecriteria**

- [ ] 30 dagen zonder activiteit → groep slaapt, één afsluitend bericht
- [ ] Geen notificatie… (truncated, use `get_issue` for full description)

---

## QS8-61

**5.10 — Rate limiting op uitnodigingen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-61/510-rate-limiting-op-uitnodigingen |

`CLAUDE.md` regel 5: *"Uitnodigingen zijn een spam-vector; bouw een limiet per gebruiker per dag."*

**Acceptatiecriteria**

- [ ] Limiet op aangemaakte uitnodigingen per gebruiker per dag
- [ ] Limiet op aangemaakte groepen per gebruiker per dag
- [ ] Serverside afgedwongen, niet in de client
- [ ] Overschrijding geeft een begrijpelijke melding met wanneer het weer kan

---

## QS8-62

**6.1 — Melding als een buddy iets afrondt**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-62/61-melding-als-een-buddy-iets-afrondt |

*Als groepslid krijg ik een melding om te beoordelen zodra een buddy een weekdoel afrondt.* — PRD 6.1

**Acceptatiecriteria**

- [ ] Alle andere groepsleden krijgen de melding, de indiener niet
- [ ] Realtime in de app binnen 2 seconden onder normale omstandigheden
- [ ] Melding bevat het weekdoel én het bewijs, zodat beoordelen direct kan
- [ ] Al goedgekeurd door iemand anders? Dan verdwijnt het verzoek netjes

---

## QS8-63

**6.2 — Goedkeuren of "vertel me meer"**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-63/62-goedkeuren-of-vertel-me-meer |

*Als groepslid kan ik de voltooiing van een buddy goedkeuren of om verduidelijking vragen.* — PRD 6.2, met de aanpassing uit voorstel §2.3.

De PRD noemt dit "request changes". Dat woord maakt van een vraag een afwijzing. Het wordt **"Vertel me meer"** — een gelijkwaardige, vriendelijke actie naast Goedkeuren, want de meeste ongemakkelijke gevallen zijn geen fraude maar onduidelijkheid.

**Acceptatiecriteria**

- [ ] Twee even prominente acties,… (truncated, use `get_issue` for full description)

---

## QS8-64

**6.3 — Eén goedkeuring is genoeg (MVP-regel)**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-64/63-een-goedkeuring-is-genoeg-mvp-regel |

*Als gebruiker wordt mijn weekdoel "goedgekeurd" zodra één groepslid het goedkeurt.* — PRD 6.3

**Acceptatiecriteria (PRD)**

- [ ] Punten en reeks lopen **alleen op bij goedkeuring**, nooit bij zelf afvinken
- [ ] Goedkeuring gelogd met beoordelaar en tijdstempel in `completion_approvals`
- [ ] Hele afhandeling in één transactie
- [ ] Dubbele goedkeuring onmogelijk via unieke constraint — geen dubbele punten

---

## QS8-65

**6.4 — Goedkeuringsregel instelbaar (meerderheid)**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:backend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-65/64-goedkeuringsregel-instelbaar-meerderheid |

*Als groep kunnen we goedkeuring later instellen op een meerderheid in plaats van één buddy.* — PRD 6.4

De PRD noemt het risico: één-buddy-goedkeuring is snel maar manipuleerbaar als een groep samenspant. Monitoren vóór verharden.

**Acceptatiecriteria**

- [ ] Regel per groep instelbaar: één lid, meerderheid, of quorum
- [ ] Wijzigen raakt lopende goedkeuringen niet met terugwerkende kracht

---

## QS8-66

**6.5 — Bewijseisen per groep instellen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-66/65-bewijseisen-per-groep-instellen |

*Als beheerder stel ik in hoeveel bewijs mijn groep verwacht bij het afronden van een weekdoel.*

Nieuw, beslispunt 3 (akkoord). Standaard: **notitie verplicht, bijlage optioneel.**

Een duim omhoog op een bewering is een sociale formaliteit. Eén zin typen kost tien seconden en geeft de goedkeurder iets om zinnig op te reageren — dat is wat de sociale lus in gang zet.

**Acceptatiecriteria**

- [ ] Drie standen: notitie verplicht (standaard) · n… (truncated, use `get_issue` for full description)

---

## QS8-67

**6.6 — Punten voor de goedkeurder**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-67/66-punten-voor-de-goedkeurder |

*Als groepslid verdien ik punten door het werk van een buddy te beoordelen.*

Nieuw, uit voorstel §2.3. Reviewen is een bijdrage aan de groep, geen klusje — en dit is de goedkoopste manier om de succesmetriek uit de PRD te halen: **≥80% van de afgeronde weekdoelen goedgekeurd binnen 48 uur.**

**Acceptatiecriteria**

- [ ] Punten voor zowel goedkeuren als "vertel me meer" — het gaat om betrokkenheid, niet om ja zeggen
- [ ] Minder punten dan het… (truncated, use `get_issue` for full description)

---

## QS8-68

**6.7 — Autorisatiegrens hard afdwingen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-68/67-autorisatiegrens-hard-afdwingen |

`CLAUDE.md` domeinregel 3: *"Peer-goedkeuring is een autorisatiegrens. Alleen een lid van dezelfde buddy-groep mag een voltooiing goedkeuren. Nooit jezelf. Test dit expliciet."*

**Acceptatiecriteria**

- [ ] RLS-policy: goedkeuren mag alleen als de beoordelaar lid is van een groep waaraan het doel gekoppeld is
- [ ] Database-constraint: `approver_user_id <> owner_id` — niet alleen een check in de applicatie
- [ ] Unieke constraint op (weekdoel,… (truncated, use `get_issue` for full description)

---

## QS8-69

**7.1 — Realtime groepschat**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-18 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-69/71-realtime-groepschat |

*Als groepslid kan ik in real time tekstberichten sturen en ontvangen binnen mijn groep.* — PRD 7.1

**Acceptatiecriteria (PRD)**

- [ ] Via Supabase Realtime; berichten bewaard in `chat_messages`
- [ ] RLS beperkt zichtbaarheid tot `group_members` van díé groep
- [ ] Aflevering binnen 2 seconden onder normale omstandigheden
- [ ] Gepagineerde geschiedenis, geen volledige lijst inladen
- [ ] Leest ook bij een slechte verbinding uit de cache van … (truncated, use `get_issue` for full description)

---

## QS8-70

**7.2 — Systeemberichten bij belangrijke gebeurtenissen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-70/72-systeemberichten-bij-belangrijke-gebeurtenissen |

*Als groepslid zie ik automatische systeemberichten bij belangrijke gebeurtenissen.* — PRD 7.2

**Welke gebeurtenissen wél**

* Voltooiing wacht op goedkeuring · voltooiing goedgekeurd · mijlpaal gehaald · doel afgerond · beloning vrijgekomen · straf verschuldigd · nieuw lid · ketting-mijlpaal

**Welke uitdrukkelijk niet**

* ⚠️ Gemiste week · verbroken reeks · achterstand · verlopen deadline. Zie 7.6.

---

**Opgeleverd 18-08-2026 — zeven van de… (truncated, use `get_issue` for full description)

---

## QS8-71

**7.3 — Foto's delen in de chat**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:frontend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-71/73-fotos-delen-in-de-chat |

*Als groepslid kan ik foto's delen in de chat, en als bewijs bij een voltooiing.* — PRD 7.3

**Acceptatiecriteria**

- [ ] Supabase Storage met RLS op groepsniveau
- [ ] Bestandstype- en groottevalidatie op de server
- [ ] AVG: bewaartermijn en verwijderpad vastgelegd vóór livegang
- [ ] `// TODO(paid-tier)` waar de gratis opslaglimiet knelt

---

## QS8-72

**7.4 — Documenten delen in de chat**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:frontend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-72/74-documenten-delen-in-de-chat |

*Als groepslid kan ik documenten delen in de chat.* — PRD 7.4

Zelfde opslag-, validatie- en AVG-eisen als 7.3.

---

## QS8-73

**7.5 — De Weekafsluiting**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-18 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-73/75-de-weekafsluiting |

*Als groepslid beantwoord ik op de huddledag drie vragen, en verschijnen onze antwoorden samen als één kaart.*

Nieuw, uit voorstel §2.2. Het ritueel dat elke werkende mastermind-groep draait, en dat geen enkele app asynchroon doet.

1. **Wat heb je gedaan?**
2. **Wat zat in de weg?**
3. **Wat is je volgende week?**

**Acceptatiecriteria**

- [ ] Getriggerd op de huddledag van de groep (`currentGroupPeriod`), niet op ieders eigen cyclus
- [ ] An… (truncated, use `get_issue` for full description)

---

## QS8-74

**7.6 — Ontwerpregel: falen is nooit publiek**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-18 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-74/76-ontwerpregel-falen-is-nooit-publiek |

Geen feature maar een regel die over de hele app geldt. Uit voorstel §1.4, de subtielste vondst van het Habit Huddle-onderzoek.

Habit Huddle toont **nooit** gemiste dagen. Hun feed bevat uitsluitend positieve signalen. Wie afhaakt gaat stil op inactief. Dat is de reden dat kleine vriendengroepen het daar volhouden — **in een groep van drie doodt één schaamtemoment de hele groep.**

**Acceptatiecriteria**

- [ ] Inventarisatie van elk oppervlak … (truncated, use `get_issue` for full description)

---

## QS8-75

**8.1 — Reeks en punten op het dashboard**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-75/81-reeks-en-punten-op-het-dashboard |

*Als gebruiker zie ik mijn huidige reeks en totale punten op mijn dashboard.* — PRD 8.1

**Acceptatiecriteria**

- [X] Huidige reeks, langste reeks, totale punten
- [X] Reeks in **cycli**, niet in dagen — en de UI zegt dat ook ("6 weken op rij")
- [X] Resterende weekpassen zichtbaar (8.7)

---

## Gebouwd 19-08-2026

Branch `quintenstrijdonk/qs8-13-epic-8-gamification`.

Onderaan het scherm "Vandaag" staat het blok **"Je stand"**: per doel de lo… (truncated, use `get_issue` for full description)

---

## QS8-76

**8.2 — Feestelijk moment bij een goedkeuring**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-76/82-feestelijk-moment-bij-een-goedkeuring |

*Als gebruiker krijg ik een feestelijke animatie of boodschap wanneer een weekdoel wordt goedgekeurd.* — PRD 8.2

⚠️ Zie de ontwerprichting in EPIC 10: **gedoseerd.** De app is standaard kalm; de vreugde zit op de verdiende momenten — goedkeuring binnen, mijlpaal gehaald, doel afgerond. Niet bij elke tik.

**Acceptatiecriteria**

- [ ] Drie niveaus van intensiteit: weekdoel goedgekeurd < mijlpaal gehaald < doel afgerond
- [ ] Respecteert `prefers… (truncated, use `get_issue` for full description)

---

## QS8-77

**8.3 — Dagelijkse nudge bij stilstand**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-77/83-dagelijkse-nudge-bij-stilstand |

*Als gebruiker krijg ik een dagelijkse nudge als ik nog niets gedaan heb aan mijn huidige weekdoel(en).* — PRD 8.3

**Acceptatiecriteria**

- [ ] Op de ingestelde tijd in de tijdzone van de gebruiker
- [ ] Slaat over als er al een Dagzet of afronding is
- [ ] Toon volgt de voorkeur uit 1.5 (zacht of streng)
- [ ] Maximaal één per dag, ook bij meerdere doelen
- [ ] Niets vanuit slapende groepen (5.9)

---

## Afgerond — nagekeken en afgevinkt 21-… (truncated, use `get_issue` for full description)

---

## QS8-78

**8.4 — Badges en prestaties**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:frontend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-78/84-badges-en-prestaties |

*Als gebruiker verdien ik badges voor mijlpalen als "4 weken op rij" of "eerste doel afgerond".* — PRD 8.4

---

## QS8-79

**8.5 — Seizoenen per groep met recap**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:backend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-79/85-seizoenen-per-groep-met-recap |

*Als groep zien we een seizoensoverzicht met een recap en een reset.* — PRD 8.5, aangepast in voorstel §1.5.

Habit Huddle draait seizoenen per maand, expliciet tegen *"week 3 is where groups go quiet."* Bij ons **per kwartaal** — met weekcycli is een maand maar vier datapunten.

**Acceptatiecriteria**

- [ ] Cadans instelbaar per groep, standaard per kwartaal
- [ ] Recap als **één** bericht met de cijfers en de eindstand — niet meerdere losse b… (truncated, use `get_issue` for full description)

---

## QS8-80

**8.6 — De Ketting**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-80/86-de-ketting |

*Als groep bouwen we samen een ketting: één schakel per lid dat zijn cyclus afsloot.*

Nieuw, uit voorstel §1.3. De vertaling van Habit Huddle's Checkin Chain — hun sterkste groepsmechanisme, en het past precies op onze groepsvorm waarin doelen juist níét gedeeld zijn. Je hebt een gezamenlijke score terwijl iedereen aan iets anders werkt.

**Acceptatiecriteria — alle zes gehaald**

- [X] Eén schakel per lid dat in de huidige groepsperiode zijn c… (truncated, use `get_issue` for full description)

---

## QS8-81

**8.7 — Weekpassen**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-81/87-weekpassen |

*Als gebruiker verbruikt een gemiste week een weekpas in plaats van mijn reeks.*

Nieuw, uit voorstel §1.2 — de vertaling van Habit Huddle's streak freezes. Dat mechanisme is de reden dat hun gebruikers reeksen van 200+ dagen halen: één slechte periode hoeft niet alles te wissen.

**Acceptatiecriteria**

- [X] Eén weekpas per zes voltooide cycli, met een maximum voorraad
- [X] Automatisch ingezet bij een gemiste week, met een melding achteraf da… (truncated, use `get_issue` for full description)

---

## QS8-82

**8.8 — Adempauze**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-82/88-adempauze |

*Als gebruiker pauzeer ik tot twee cycli zonder mijn reeks te verliezen.*

Nieuw, uit voorstel §1.2 — Habit Huddle's Vacation Mode. Vakantie, ziekte, een piek op het werk. Een reis hoort je niet terug naar nul te zetten.

**Acceptatiecriteria**

- [ ] Maximaal twee cycli, vooraf aangekondigd aan de groep
- [ ] Reeks wacht; geen nudges tijdens de pauze
- [ ] Aftellen in de tijdzone van de gebruiker
- [ ] Blijft zichtbaar in het groepsoverzicht — … (truncated, use `get_issue` for full description)

---

## QS8-83

**9.1 — Beloning vrijgeven bij het halen van een doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-83/91-beloning-vrijgeven-bij-het-halen-van-een-doel |

*Als gebruiker wordt mijn vooraf ingestelde beloning "vrijgekomen" en in mijn groep(en) gepost zodra ik mijn doel op tijd haal.* — PRD 9.1

**Acceptatiecriteria**

- [ ] Getriggerd op het afronden van het doel binnen de deadline
- [ ] Bericht in elke groep waaraan het doel gekoppeld is
- [ ] Gebeurtenis gelogd en auditeerbaar

---

**Afgerond 21-08-2026** — migratie `0057_commitments_afwikkelen.sql`.

⚠️ **Het trigger-moment bestond niet.** `goal… (truncated, use `get_issue` for full description)

---

## QS8-84

**9.2 — Straf verschuldigd bij een gemiste deadline**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-84/92-straf-verschuldigd-bij-een-gemiste-deadline |

*Als gebruiker wordt mijn vooraf ingestelde straf "verschuldigd" en gepost in de begunstigde groep als ik mijn deadline mis.* — PRD 9.2

**Review 15-08-2026, bevestigd:** een straf treedt **uitsluitend** in werking wanneer de deadline van het doel verstreken is. Een gemiste week kost een minpunt (4.6), meer niet. De begunstigde groep krijgt pas leesrecht op het commitment op het moment dat het verschuldigd wordt — daarvóór is de inzet alleen voo… (truncated, use `get_issue` for full description)

---

## QS8-85

**9.3 — Commitments blijven informeel in de MVP**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-85/93-commitments-blijven-informeel-in-de-mvp |

*Als gebruiker zijn commitments in de MVP informeel en alleen bijgehouden — er wordt geen echt geld verwerkt.* — PRD 9.3

**Acceptatiecriteria**

- [ ] Geen enkele betaalintegratie, geen bedragen die als transactie kunnen worden gelezen
- [ ] De UI is expliciet: dit wordt bijgehouden, niet afgerekend
- [ ] Datamodel laat een latere echte-geld-uitbreiding toe zonder herbouw

---

## QS8-86

**9.4 — Echte-geld-commitments via een betaalprovider**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:backend, phase:v3 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-86/94-echte-geld-commitments-via-een-betaalprovider |

*Als gebruiker kan ik in een latere fase echte straffen laten verwerken via een vergunninghoudende betaalprovider.* — PRD 9.4

⚠️ **Geblokkeerd tot juridische toetsing.** De PRD noemt dit expliciet: echt geld vereist juridische en compliance-review vóórdat fase 3 begint. Escrow van geld tussen particulieren is in de EU gereguleerd.

**Vóór er één regel code komt**

- [ ] Juridisch advies over of dit een vergunningplichtige activiteit is
- [ ] Keu… (truncated, use `get_issue` for full description)

---

## QS8-87

**10.1 — Design tokens: het Q-Projects navy-stelsel**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-87/101-design-tokens-het-q-projects-navy-stelsel |

**Gewijzigd 15-08-2026 op verzoek van Quinten.** GoalBuddies krijgt hetzelfde design als de Status Tracker (`tracker.q-projects.tech`), in navy en wit. **Alleen Q-Projects-kleurstellingen** — geen eigen kleuren erbij verzinnen.

Dit vervangt de emerald-richting uit PRD 10.1 en het productvoorstel §5.

Tokens hieronder zijn letterlijk uit `tracker.q-projects.tech/assets/index-*.css` gehaald, thema `navy` en `navy-licht`. Prefix blijft `--bp-`, zo… (truncated, use `get_issue` for full description)

---

## QS8-88

**10.2 — Componentbibliotheek**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-88/102-componentbibliotheek |

*Kerncomponenten die op alle schermen hergebruikt worden.* — PRD 10.2

**Acceptatiecriteria**

- [ ] Kaarten, knoppen, reekstellers, voortgangsbalken, lege staten, ledenrijen
- [ ] **Vloer/plafond-component** als een bereik, niet als twee losse taken — dit is het meest eigen visuele idee van de app
- [ ] Elke async view heeft een loading-, error- én lege staat (`CLAUDE.md` regel 16)
- [ ] Toetsenbordfocus zichtbaar; `prefers-reduced-motion` gere… (truncated, use `get_issue` for full description)

---

## QS8-89

**10.3 — Donkere modus**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-89/103-donkere-modus |

*Donkere modus op alle schermen.* — PRD 10.3

**Afwijking van de PRD:** daar staat P1, hier P0. Achteraf omzetten kost meer dan het meteen goed doen, en dit is een app die 's avonds gebruikt wordt. Zie voorstel §5.

**Acceptatiecriteria**

- [ ] Vanaf de eerste component meegenomen, niet erna toegevoegd
- [ ] Volgt systeeminstelling, handmatig te overschrijven
- [ ] Emerald blijft leesbaar op beide ondergronden — niet simpelweg inverteren
- [ ] Contrast AA in beide modi

---

## QS8-90

**10.4 — De vier kernschermen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-90/104-de-vier-kernschermen |

De navigatiestructuur van de app, uit voorstel §5.

| Scherm | Inhoud |
| -- | -- |
| **Vandaag** | Jouw huidige cyclus, weekdoelen met vloer/plafond, de Dagzet |
| **Doel** | Roadmap met mijlpalen, voortgang, risicostand |
| **Groep** | Leden, De Ketting, feed, chat, weekafsluiting |
| **Profiel** | Reeks, punten, weekpassen, instellingen |

**Acceptatiecriteria**

- [ ] Navigatie werkt identiek op web en native
- [ ] Elk scherm heeft een zinvo… (truncated, use `get_issue` for full description)

---

## QS8-91

**11.1 — Push-notificaties voor de kerngebeurtenissen**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-91/111-push-notificaties-voor-de-kerngebeurtenissen |

*Als gebruiker krijg ik push voor: dagelijkse nudge, goedkeuringsverzoek, ontvangen goedkeuring, en het cyclusoverzicht.* — PRD 11.1

**Acceptatiecriteria**

- [ ] Via Expo push notifications, web én native
- [ ] Alle vier de types, elk met een diepe link naar de juiste plek
- [ ] Verstuurd in de tijdzone van de ontvanger
- [ ] Niets vanuit slapende groepen (5.9) of tijdens adempauze (8.8)
- [ ] Geen dubbele notificaties bij meerdere groepen of … (truncated, use `get_issue` for full description)

---

## QS8-92

**11.2 — Notificatietypes zelf aan- en uitzetten**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Low |
| Labels | area:frontend, phase:v2 |
| Aangemaakt | 2026-08-15 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-92/112-notificatietypes-zelf-aan-en-uitzetten |

*Als gebruiker bepaal ik welke soorten notificaties ik krijg.* — PRD 11.2

**Acceptatiecriteria**

- [ ] Per type een schakelaar; uit blijft uit
- [ ] Een stille-uren-instelling

---

## QS8-93

**12.1 — Haalbaarheidsberekening per doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-93/121-haalbaarheidsberekening-per-doel |

De motor onder de Risico-radar. Begin **zonder AI** — dit is rekenwerk, geen taalmodel.

**Signalen**

* Resterende mijlpalen tegenover resterende cycli
* Werkelijk tempo van de laatste 4 cycli tegenover benodigd tempo
* Beschikbare uren per week uit het Doelcoach-interview (3.1)
* Aandeel vloer versus plafond — structureel alleen de vloer halen is een vroeg signaal

**Acceptatiecriteria**

- [ ] Vier standen: op koers · oppassen · achterstand ·… (truncated, use `get_issue` for full description)

---

## QS8-94

**12.2 — De vier standen in de UI**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-94/122-de-vier-standen-in-de-ui |

*Als gebruiker zie ik in één oogopslag of mijn doel nog haalbaar is.*

**Acceptatiecriteria**

- [ ] Stand zichtbaar op de doelkaart en op het doelscherm
- [ ] Vorm én kleur dragen de betekenis, niet kleur alleen — coral is de enige plek waar rood gebruikt wordt
- [ ] ⚠️ Uitsluitend zichtbaar voor de eigenaar. De groep ziet niets (7.6)
- [ ] "Waarom?" toont de onderliggende berekening in gewone taal

---

## QS8-95

**12.3 — "Vraag je groep om hulp"**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-95/123-vraag-je-groep-om-hulp |

*Als gebruiker met achterstand kan ik met één tik mijn groep om hulp vragen.*

Het scharnierpunt van het hele epic. Zie voorstel §2.1.

> Quinten loopt 3 weken achter op "website live". Nog 5 weken te gaan. Wie heeft een idee?

**Acceptatiecriteria**

- [ ] ⚠️ **Nooit automatisch.** De kaart verschijnt alleen als de gebruiker er zelf op tikt
- [ ] Het privé-signaal met deze knop verschijnt bij stand "achterstand"
- [ ] De gebruiker ziet de exacte… (truncated, use `get_issue` for full description)

---

## QS8-96

**12.4 — Herplanning bij een onhaalbare deadline**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-96/124-herplanning-bij-een-onhaalbare-deadline |

*Als gebruiker met een onhaalbare deadline biedt de app me een uitweg in plaats van stilte.*

Uit voorstel §2.1. Dit is precies het moment waarop mensen apps als deze weggooien: het doel is dood, de app blijft herinneringen sturen, en de gebruiker verwijdert hem.

**Acceptatiecriteria**

- [ ] Drie opties: deadline verzetten · mijlpalen schrappen · scope verkleinen
- [ ] Expliciete boodschap dat bijstellen beter is dan een doel stilletjes laten … (truncated, use `get_issue` for full description)

---

## QS8-97

**4.10 — Puntenplafond per doel**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-17 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-97/410-puntenplafond-per-doel |

*Als gebruiker weet ik vooraf hoeveel punten er bij dit doel te halen zijn, en dat plafond stijgt als ik taken toevoeg.*

Vastgesteld bij de review van 15-08-2026:

> *"Per doel is een vooraf bepaald maximaal aantal punten te behalen, tenzij je extra taken toevoegt aan jouw doel."*

**Acceptatiecriteria**

- [ ] `goals.max_points` = som van `points_ceiling` over alle weekdoelen van het doel
- [ ] Herberekend bij elke toevoeging, wijziging of ver… (truncated, use `get_issue` for full description)

---

## QS8-98

**0.8 — RLS-testsuite met echte JWT's**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-15 |
| Afgerond | 2026-08-16 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-98/08-rls-testsuite-met-echte-jwts |

⚠️ **Blokkeert de eerste feature.** Acceptatiecriterium van <issue id="f7525c75-1a9b-43ee-87b6-df5eab970a9c" href="https://linear.app/qs86-bot-linear/issue/QS8-19/02-datamodel-rls-als-beslisdocument">QS8-19</issue>.

De rooktest van 15-08-2026 draaide als `service_role` en raakte daarmee alleen constraints en triggers. **De policies zelf zijn nog nooit uitgevoerd.** Tot deze suite draait is niet bewezen dat de 48 policies doen wat de matrix in `d… (truncated, use `get_issue` for full description)

---

## QS8-99

**0.9 — Subdomein goalbuddies.q-projects.tech**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | High |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-16 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-99/09-subdomein-goalbuddiesq-projectstech |

*De app krijgt een echt adres.*

Hostinger-account `u349450154`, hoofddomein `q-projects.tech`. De Status Tracker draait al als subdomein op dezelfde structuur (`tracker.q-projects.tech` → `public_html/tracker`), dus dit is hetzelfde patroon.

**Acceptatiecriteria**

- [ ] Subdomein `goalbuddies.q-projects.tech` aangemaakt, root `public_html/goalbuddies`
- [ ] HTTPS actief met een geldig certificaat
- [ ] DNS gecontroleerd; geen conflict met de … (truncated, use `get_issue` for full description)

---

## QS8-100

**0.10 — Herhaalbare deploy naar Hostinger**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-16 |
| Afgerond | 2026-08-22 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-100/010-herhaalbare-deploy-naar-hostinger |

*Eén commando, of één push. Geen handmatig gesleep met bestanden.*

`npm run build` levert een statische Expo-webbuild (`expo export --platform web`, output `dist/`). Die moet naar `public_html/goalbuddies`.

**Acceptatiecriteria**

- [ ] Deploy in één stap, gedocumenteerd in `docs/DEPLOY.md`
- [ ] Env vars van de build vastgelegd: welke `EXPO_PUBLIC_*` waarden in welke omgeving
- [ ] ⚠️ Controle dat er geen secrets in de bundle terechtkomen — al… (truncated, use `get_issue` for full description)

---

## QS8-101

**Besluitenronde Q-TODO: A3, A7, A18, A19 uitgevoerd**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-18 |
| Afgerond | 2026-08-18 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-101/besluitenronde-q-todo-a3-a7-a18-a19-uitgevoerd |

Quinten beantwoordde op 18-08-2026 zes openstaande punten in `docs/Q-TODO.docx`. Vier daarvan vroegen om code; twee waren "blijft zoals gebouwd".

**Migraties 0029 t/m 0035**, alle toegepast op het echte project.

## A18 — een inactief lid verliest toegang, geschiedenis blijft

*"Een inactief lid mag de groep nooit verwijderen. De geschiedenis van een uitgezet lid blijft behouden."*

Er bleken **drie** routes terug naar binnen te zijn in plaats … (truncated, use `get_issue` for full description)

---

## QS8-102

**Wanneer is een doel afgerond? Er is nu geen pad naar 'completed'**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-18 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-102/wanneer-is-een-doel-afgerond-er-is-nu-geen-pad-naar-completed |

**Q-TODO A31.** Een gat dat in de besluitenronde van 18-08 ontstaan is, bewust en met open ogen, maar het moet dicht.

## Wat er gebeurd is

De security-review vond dat `goals.status` wagenwijd openstond voor de client. Alle vier de CHECK-waarden waren met één PATCH te zetten, en twee daarvan deden iets:

* `completed` liet `meld_doel_af()` afgaan en plaatste **"X heeft een doel afgerond"** in élke gekoppelde groep — zonder dat er ook maar één w… (truncated, use `get_issue` for full description)

---

## QS8-103

**weekly_goals op slot bij aanmaken en verwijderen (A35, A36)**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-19 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-103/weekly-goals-op-slot-bij-aanmaken-en-verwijderen-a35-a36 |

Twee autorisatiegaten in `weekly_goals`, gevonden door de security-review op <issue id="62ac9aa2-d95a-43be-8193-c3f25285cbb4" href="https://linear.app/qs86-bot-linear/issue/QS8-81/87-weekpassen">QS8-81</issue> (19-08-2026) en dezelfde dag gedicht in **migratie 0043** na akkoord van Quinten. Allebei ouder dan EPIC 8.

## A35 — je kon je eigen weekdoel aanmaken mét `status = 'approved'`

`weekly_goals_write` was `for all` met alleen een eigenaarst… (truncated, use `get_issue` for full description)

---

## QS8-104

**Doorschuiven en afsluiten: de laatste twee routes naar een weggepoetste week (A39, A40)**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-19 |
| Afgerond | 2026-08-19 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-104/doorschuiven-en-afsluiten-de-laatste-twee-routes-naar-een-weggepoetste |

Vervolg op <issue id="4cfeb687-4c0c-460b-ae28-26de5d8d9fe8" href="https://linear.app/qs86-bot-linear/issue/QS8-103/weekly-goals-op-slot-bij-aanmaken-en-verwijderen-a35-a36">QS8-103</issue>. Toen 0043 de directe routes sloot, vond de security-review op díé migratie er nog twee. Beide beslist door Quinten op 19-08-2026 en gedicht in **migratie 0045**.

## A39 — doorschuiven repareerde de reeks gratis

`markeer_doorgeschoven()` (0023) zette een gem… (truncated, use `get_issue` for full description)

---

## QS8-105

**Bedenktijd: een per ongeluk aangemaakt weekdoel of doel mag weg**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-105/bedenktijd-een-per-ongeluk-aangemaakt-weekdoel-of-doel-mag-weg |

Besluit van Quinten (19-08-2026), gebouwd in **migratie 0046**.

<issue id="e5e8b50a-7d3b-4797-a539-2d48eaf63aa7" href="https://linear.app/qs86-bot-linear/issue/QS8-104/doorschuiven-en-afsluiten-de-laatste-twee-routes-naar-een-weggepoetste">QS8-104</issue> verving het verwijderen van een weekdoel door afsluiten. Voor het gat waar het om ging was dat juist, maar het gooide ook de gewone reden om iets weg te gooien overboord: je typt een weekdoel … (truncated, use `get_issue` for full description)

---

## QS8-106

**De schermen laten inlopen op de datalaag**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-106/de-schermen-laten-inlopen-op-de-datalaag |

**Dit is geen feature maar een achterstand, en op 20-08-2026 is het het grootste praktische knelpunt van het project.**

Er zijn inmiddels vier datalaagfuncties die gebouwd, getest en van nette Nederlandse foutmeldingen voorzien zijn — en door **geen enkel scherm** worden aangeroepen:

| Functie | Waar | Wat het zou moeten doen |
| -- | -- | -- |
| `schuifDoor()` | `modules/goals/weekly.ts` | Een gemiste week doorschuiven naar deze week (<issue … (truncated, use `get_issue` for full description)

---

## QS8-107

**Vertaalinfrastructuur, vóór het duurder wordt**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | 2026-08-21 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-107/vertaalinfrastructuur-voor-het-duurder-wordt |

Komt uit een groene notitie in `docs/GoalBuddies — spelregels en motivatie.docx` (p149): "Maak de GoalBuddies app ook in het Engels, Duits, Frans, Spaans, Pools, Portugees."

Volledige analyse en talenadvies staan in `docs/GROENE-NOTITIES.md` §3c.

## De stand vandaag

Er is **geen enkele vertaalinfrastructuur**. Geen `i18n`, geen `i18next`, geen `lingui`, geen berichtencatalogus. Nagemeten op 20-08-2026:

* **56 bestanden** met Nederlandse teks… (truncated, use `get_issue` for full description)

---

## QS8-108

**Spraak naar tekst in de grote tekstvelden**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:frontend, phase:v2 |
| Aangemaakt | 2026-08-20 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-108/spraak-naar-tekst-in-de-grote-tekstvelden |

Komt uit een groene notitie in `docs/GoalBuddies — spelregels en motivatie.docx` (p148):

> "Bij tekstvelden waar je de gelegenheid hebt om toelichting te geven (grotere tekst te schrijven) wil ik de mogelijkheid om deze tekst in te spreken en dat die omgezet wordt naar geschreven tekst."

## Waar dit over gaat

De velden waar iemand meer dan een regel schrijft:

* De Dagzet (`completions`)
* De twee vragen van de weekafsluiting (`week_reviews`)… (truncated, use `get_issue` for full description)

---

## QS8-109

**Een gezicht voor de Doelcoach — mascotte kiezen en tekenen**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:design, phase:v2 |
| Aangemaakt | 2026-08-20 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-109/een-gezicht-voor-de-doelcoach-mascotte-kiezen-en-tekenen |

Komt uit een groene notitie in `docs/GoalBuddies — spelregels en motivatie.docx` (p147):

> "Doelencoach — Bedenk 3 unieke ideeën van een mascotte/avatar van hoe die doelencoach eruit kan zien. Het moet bij deze app passen. Mogelijk dat hij/zij jou ook tips en tricks kan geven tijdens het gebruik van de app?"

**De drie ideeën zijn uitgewerkt in** `docs/GROENE-NOTITIES.md` **§3b.** Dit issue is de uitvoering; de keuze is nog aan Quinten.

## De … (truncated, use `get_issue` for full description)

---

## QS8-110

**Wat krijg je bij een gehaalde week? De beloning invullen**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Medium |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-110/wat-krijg-je-bij-een-gehaalde-week-de-beloning-invullen |

Komt uit twee groene notities in `docs/GoalBuddies — spelregels en motivatie.docx` (p75, p76):

> "Wat zijn de cadeaus? Extra punten en een goede business tip die bij jouw doel hoort?"
> "En wat krijg je bij het behalen van je week? Een wijze quote van een legendarisch persoon zoals Einstein, Marcus Aurelius ofzo?"

Volledige onderbouwing in `docs/GROENE-NOTITIES.md` §3a.

## Wat er vandaag echt is

Eén weekpas na je eerste voltooide week, daarn… (truncated, use `get_issue` for full description)

---

## QS8-111

**Emoji: vastleggen wie ze mag gebruiken, en waar**

| | |
|---|---|
| Status | Done |
| Prioriteit | Low |
| Labels | area:design, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-111/emoji-vastleggen-wie-ze-mag-gebruiken-en-waar |

Komt uit een groene notitie in `docs/GoalBuddies — spelregels en motivatie.docx` (p150):

> "Emoticons — In de teksten kan men ook emoticons gebruiken. Worden er op andere plaatsen ook emoticons gebruikt?"

## Het antwoord op de vraag: nergens

Nagemeten op 20-08-2026 over het volledige emoji-bereik in `src/` en `app/`: **er staat geen enkele emoji in de app.** Niet in knoppen, niet in statuslabels, niet in systeemberichten, niet in de zeventien… (truncated, use `get_issue` for full description)

---

## QS8-112

**Een weekdoel aanmaken kan niet — er is geen scherm**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-20 |
| Afgerond | 2026-08-20 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-112/een-weekdoel-aanmaken-kan-niet-er-is-geen-scherm |

**Gevonden op 20-08-2026 tijdens** <issue id="92026bc3-a90c-49d6-9d8c-47abbcee19bb" href="https://linear.app/qs86-bot-linear/issue/QS8-106/de-schermen-laten-inlopen-op-de-datalaag">QS8-106</issue>**, en het is groter dan waar dat issue over ging.**

`maakWeekdoel()` staat in `src/modules/goals/weekly.ts`, is getest, en wordt door **geen enkel scherm** aangeroepen.

## De route loopt dood

1. Op *Vandaag* staat de knop "Weekdoel toevoegen" → die … (truncated, use `get_issue` for full description)

---

## QS8-113

**Vertaalbibliotheek en berichtencatalogus (rest van QS8-107)**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-21 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-113/vertaalbibliotheek-en-berichtencatalogus-rest-van-qs8-107 |

Afgesplitst van <issue id="19c42c3d-3e40-4567-a826-8769c2d7a99e" href="https://linear.app/qs86-bot-linear/issue/QS8-107/vertaalinfrastructuur-voor-het-duurder-wordt">QS8-107</issue> op 21-08-2026, op aanraden van dat issue zelf: *"Stap 2 is dringend en de rest niet. Overweeg stap 2 los te trekken als er niet meteen aan de hele meertaligheid begonnen wordt."*

**Stap 2 is af** (migratie 0059): systeemberichten dragen hun parameters als kolommen e… (truncated, use `get_issue` for full description)

---

## QS8-114

**11.3 — Web push: VAPID-sleutels en een service worker**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-21 |
| Afgerond | 2026-08-23 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-114/113-web-push-vapid-sleutels-en-een-service-worker |

Afgesplitst van <issue id="38dfc987-69a3-4f67-a77d-007d60cbcf08" href="https://linear.app/qs86-bot-linear/issue/QS8-91/111-push-notificaties-voor-de-kerngebeurtenissen">QS8-91</issue> op 21-08-2026. Dat issue vraagt push "web **én** native"; de native kant staat, de web-kant niet.

## Waarom dit los staat en waarom het tóch dringend is

`src/modules/notifications/expo-bron.ts` geeft op web bewust `null` terug. Web push is geen variant van hetzel… (truncated, use `get_issue` for full description)

---

## QS8-115

**Schermteksten naar de catalogus (~54 bestanden)**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-22 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-115/schermteksten-naar-de-catalogus-54-bestanden |

Afgesplitst van <issue id="a2992f89-6d80-4040-b6c5-38a67d0bbfd7" href="https://linear.app/qs86-bot-linear/issue/QS8-113/vertaalbibliotheek-en-berichtencatalogus-rest-van-qs8-107">QS8-113</issue> op 22-08-2026. Mechanisch werk zonder open vragen — de conventie ligt vast, de infrastructuur staat, en er is een referentie-implementatie.

## Wat er al is

* `src/shared/i18n/` — `t(sleutel, params)`, catalogi `nl` en `en`, met een test die rood wordt … (truncated, use `get_issue` for full description)

---

## QS8-116

**🔴 A47 — de RLS-suite bewijst niets meer in een volle run**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:infra, phase:mvp |
| Aangemaakt | 2026-08-22 |
| Afgerond | 2026-08-23 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-116/a47-de-rls-suite-bewijst-niets-meer-in-een-volle-run |

**Q-TODO A47**, geëscaleerd op 22-08-2026 van "vraagt een keuze" naar kritiek.

## Wat er gebeurt

De RLS-suite maakt ongeveer **veertig aanmeldingen**; Supabase weigert na ongeveer dertig. Eén schone run per uur lukt, twee niet.

Op 22-08 gaven twee volle runs achter elkaar **1 respectievelijk 5 falende bestanden — elke keer andere**. Élk betrokken bestand bleek in isolatie groen: `epic3`, `epic7`, `epic8`, `epic9`, `policies`, `weekpassen` en … (truncated, use `get_issue` for full description)

---

## QS8-117

**11.4 — iOS krijgt geen push zonder installeerbare PWA**

| | |
|---|---|
| Status | In Progress |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-22 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-117/114-ios-krijgt-geen-push-zonder-installeerbare-pwa |

Afgesplitst van <issue id="e22f1a74-3fe7-40ad-9c21-0d2c252da2fe" href="https://linear.app/qs86-bot-linear/issue/QS8-114/113-web-push-vapid-sleutels-en-een-service-worker">QS8-114</issue> op 22-08-2026, tijdens het onderzoek naar web push.

## Waarom dit een eigen issue is

<issue id="e22f1a74-3fe7-40ad-9c21-0d2c252da2fe" href="https://linear.app/qs86-bot-linear/issue/QS8-114/113-web-push-vapid-sleutels-en-een-service-worker">QS8-114</issue> gaat… (truncated, use `get_issue` for full description)

---

## QS8-118

**Gebruikerstekst wordt op UTF-16-grenzen geknipt en rendert kapotte tekens**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-22 |
| Afgerond | 2026-08-23 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-118/gebruikerstekst-wordt-op-utf-16-grenzen-geknipt-en-rendert-kapotte |

Gevonden op 22-08-2026 tijdens het onderzoek voor <issue id="13d01d26-4658-493a-92fb-cb71f224da7b" href="https://linear.app/qs86-bot-linear/issue/QS8-111/emoji-vastleggen-wie-ze-mag-gebruiken-en-waar">QS8-111</issue>. Twee bugs, één oorzaak.

## De oorzaak

JavaScript telt en snijdt in **UTF-16-eenheden**, niet in tekens. Alles buiten het basisbereik — elke pictografische emoji, maar ook veel schriften — kost er twee. Snijd je op zo'n grens, dan… (truncated, use `get_issue` for full description)

---

## QS8-119

**De RLS-suite draait tegen productie — richting B uit QS8-116**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:infra |
| Aangemaakt | 2026-08-22 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-119/de-rls-suite-draait-tegen-productie-richting-b-uit-qs8-116 |

Afgesplitst van <issue id="2ac4be8f-9cd8-4d76-923d-30c54ab1d78a" href="https://linear.app/qs86-bot-linear/issue/QS8-116/a47-de-rls-suite-bewijst-niets-meer-in-een-volle-run">QS8-116</issue> op 22-08-2026. Dat issue is opgelost met richting C (zelfgetekende tokens); dit blijft daarnaast staan en is er nooit door geraakt.

## Wat het probleem is

`tests/rls/harness.ts` maakt echte accounts aan in het **productieproject** `wehgocadxehottiiyvsc` en … (truncated, use `get_issue` for full description)

---

## QS8-120

**deadlineVerzoekSchema is niet te testen — het schema zit vast aan de Supabase-client**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend |
| Aangemaakt | 2026-08-22 |
| Afgerond | 2026-08-23 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-120/deadlineverzoekschema-is-niet-te-testen-het-schema-zit-vast-aan-de |

Gevonden op 22-08-2026 tijdens <issue id="c3283a1c-5347-4290-80bc-2b5e9f1b83fc" href="https://linear.app/qs86-bot-linear/issue/QS8-118/gebruikerstekst-wordt-op-utf-16-grenzen-geknipt-en-rendert-kapotte">QS8-118</issue>.

## Wat er aan de hand is

`src/modules/goals/deadline.ts` bevat twee dingen die niet bij elkaar horen: het Zod-schema `deadlineVerzoekSchema` én de API-aanroepen. Dat bestand importeert `lib/supabase`, en die trekt de Supabase-c… (truncated, use `get_issue` for full description)

---

## QS8-121

**Drie modules meer met een Zod-schema vast aan de Supabase-client**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:frontend |
| Aangemaakt | 2026-08-22 |
| Afgerond | 2026-08-23 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-121/drie-modules-meer-met-een-zod-schema-vast-aan-de-supabase-client |

Gevonden op 22-08-2026, met de grep uit <issue id="b3f6c692-93a4-4b19-a8b1-1e087f5f97ac" href="https://linear.app/qs86-bot-linear/issue/QS8-120/deadlineverzoekschema-is-niet-te-testen-het-schema-zit-vast-aan-de">QS8-120</issue>. `deadline.ts` was niet de enige.

## De drie

```
grep -rln "lib/supabase" src/modules/ | xargs grep -ln "z\.object\|z\.string()"
```

| bestand | schema's |
| -- | -- |
| `src/modules/completions/api.ts` | `afrondSchema… (truncated, use `get_issue` for full description)

---

## QS8-122

**Het migratieregister kent twee onverenigbare nummeringen — `supabase/migrations/` kan het schema niet opbouwen**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:infra |
| Aangemaakt | 2026-08-23 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-122/het-migratieregister-kent-twee-onverenigbare-nummeringen |

Gevonden op 22-08-2026 tijdens het onderzoek voor <issue id="8d65dab8-e2f0-4ec7-aabf-d2ba36f25295" href="https://linear.app/qs86-bot-linear/issue/QS8-119/de-rls-suite-draait-tegen-productie-richting-b-uit-qs8-116">QS8-119</issue>. Volledige onderbouwing in `docs/decisions/2026-08-22-rls-suite-tegen-productie.md`.

## Wat er aan de hand is

De migratiegeschiedenis van het project gebruikt **twee nummeringen die niet op elkaar aansluiten**:

| soo… (truncated, use `get_issue` for full description)

---

## QS8-123

**Hoe merken we dat een als "Laag" weggelegde bevinding zwaarder wordt door iets dat we er later op bouwen?**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:proces |
| Aangemaakt | 2026-08-23 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-123/hoe-merken-we-dat-een-als-laag-weggelegde-bevinding-zwaarder-wordt |

Aanleiding: de security-review van 23-08-2026 op de branch van PR #1.

## De gebeurtenis

Op **17-08** staat in `docs/ENGINEER-REVIEW.md` de rij *"Bewijseis te omzeilen met ontkoppelen"*:

> `enforce_evidence_policy` kijkt naar de groepskoppelingen op het moment van invoegen, en de eigenaar mag `goal_group_links` zelf verwijderen en aanmaken. **Bewust niet gerepareerd:** dit is zelfbedrog en geen autorisatiegrens; wie dit doet, ontneemt zijn eig… (truncated, use `get_issue` for full description)

---

## QS8-124

**11.5 — De service worker registreren: web push is gebouwd maar wordt nooit aangezet**

| | |
|---|---|
| Status | In Review |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-23 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-124/115-de-service-worker-registreren-web-push-is-gebouwd-maar-wordt-nooit |

Afgesplitst van <issue id="e22f1a74-3fe7-40ad-9c21-0d2c252da2fe" href="https://linear.app/qs86-bot-linear/issue/QS8-114/113-web-push-vapid-sleutels-en-een-service-worker">QS8-114</issue> op 23-08-2026, na de merge van PR #1.

## Wat er aan de hand is

Web push is van nul gebouwd en werkt aantoonbaar — behalve dat niemand hem aanzet.

```
grep -rn "serviceWorker" src/ app/
→ geen enkele treffer
```

Er staat **nergens een** `navigator.serviceWork… (truncated, use `get_issue` for full description)

---

## QS8-125

**Dezelfde stand staat in drie documenten en loopt uiteen — vier keer op één dag**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:proces |
| Aangemaakt | 2026-08-23 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-125/dezelfde-stand-staat-in-drie-documenten-en-loopt-uiteen-vier-keer-op |

Gevonden op 23-08-2026 bij het bijwerken van de overdracht na PR #1.

## Wat er aan de hand is

`CLAUDE.md`, `docs/WERKVOORRAAD.md` §0 en `docs/VOLGENDE-SESSIE.md` beschrijven alle drie **dezelfde stand van zaken**. Er is geen bron en geen afgeleide: het zijn drie handgeschreven kopieën. Werk je er één bij, dan liegen de andere twee.

Op één dag zijn er **vier** uiteengelopen paren gevonden, en drie daarvan alleen doordat iemand het hele bestand… (truncated, use `get_issue` for full description)

---

## QS8-126

**De repository staat publiek en moet privé — bewust uitgesteld tot de software af is**

| | |
|---|---|
| Status | Todo |
| Prioriteit | High |
| Labels | area:infra |
| Aangemaakt | 2026-08-24 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-126/de-repository-staat-publiek-en-moet-prive-bewust-uitgesteld-tot-de |

Gevonden op 24-08-2026 op verzoek van Quinten om te controleren of het project afgeschermd is. Dat was het niet.

```
"private": false,  "visibility": "public"
```

`QS86-bot/GoalBuddies` staat publiek sinds de aanmaak op **15-08-2026**.

⚠️ **Quinten heeft besloten dit pas te doen zodra de software af is** (24-08). Dit issue legt vast wat er dan moet gebeuren en wat er tot dat moment openstaat. Het is bewust geen blokkade voor het bouwen; het is… (truncated, use `get_issue` for full description)

---

## QS8-127

**Besluit A37 — telt een week mee zodra één weekdoel erin af is?**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-127/besluit-a37-telt-een-week-mee-zodra-een-weekdoel-erin-af-is |

Overgenomen uit `docs/Q-TODO.docx` sectie A37 op 24-08-2026, zodat het besluit op het bord staat in plaats van alleen in een Word-bestand.

## De vraag

**Telt een week mee zodra er één weekdoel in af is, ja of nee?**

## Waarom het nu dringender is dan toen het opgeschreven werd

Heeft iemand in dezelfde week twee weekdoelen op hetzelfde doel en krijgt hij er één af, dan is het **toeval** of zijn reeks doorloopt of op nul springt — de twee rije… (truncated, use `get_issue` for full description)

---

## QS8-128

**Besluit A41 + A42 + A44 — mag de groep tegenslag zien, blijven punten privé, en is zakelijk de koers?**

| | |
|---|---|
| Status | Done |
| Prioriteit | High |
| Labels | area:proces |
| Aangemaakt | 2026-08-24 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-128/besluit-a41-a42-a44-mag-de-groep-tegenslag-zien-blijven-punten-prive |

Overgenomen uit `docs/Q-TODO.docx` A41, A42 en A44 op 24-08-2026.

⚠️ **Eén issue en niet drie, omdat Q-TODO ze zelf aan elkaar knoopt.** A42 heet daar letterlijk *"het directe gevolg van A41, geen losse keuze"*, en bij A41 staat: *"Neem dit besluit samen met A44."* Los beslist geven ze een tegenstrijdig product.

---

## A41 — mag de groep zien wat er fout gaat? (ZWAAR)

Je schrijft het twee keer in het spelregels-document (p9 en p129): de groep… (truncated, use `get_issue` for full description)

---

## QS8-129

**Besluit A43 — minpunten bij een deadline verschuiven zonder akkoord?**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-129/besluit-a43-minpunten-bij-een-deadline-verschuiven-zonder-akkoord |

Overgenomen uit `docs/Q-TODO.docx` A43 op 24-08-2026. Het is exact **A29** uit sectie E, opnieuw gesteld — en dat is de reden dat het serieus genomen wordt: er is nu een tweede stem voor variant 2.

## De vraag

Uit p57: reken je minpunten wanneer je een deadline **zonder** goedkeuring verschuift, en houd je het gratis als je buddy's akkoord zijn?

Dat is variant (2) uit A29. Gebouwd is destijds variant (1): verschuiven kán alleen mét akkoord, e… (truncated, use `get_issue` for full description)

---

## QS8-130

**Besluit A46 — mag TRUNCATE en TRIGGER ingetrokken worden op alle tabellen?**

| | |
|---|---|
| Status | Done |
| Prioriteit | Medium |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-130/besluit-a46-mag-truncate-en-trigger-ingetrokken-worden-op-alle |

Overgenomen uit `docs/Q-TODO.docx` A46 op 24-08-2026, **en opnieuw nagemeten tegen de gedeployde database op diezelfde dag** — niet tegen een migratiebestand:

```
truncate_op: 29    trigger_op: 29    tabellen_totaal: 29
```

De rol `authenticated` heeft dus nog steeds `TRUNCATE` én `TRIGGER` op **alle 29 tabellen** in `public`. (Q-TODO noemde er 28; er is er sindsdien één bijgekomen.)

## Waarom dat erg genoeg is om te vragen

⚠️ **TRUNCATE is n… (truncated, use `get_issue` for full description)

---

## QS8-131

**Land de branch qs8-83-91 — 21 commits staan buiten main en blokkeren QS8-115**

| | |
|---|---|
| Status | Done |
| Prioriteit | Urgent |
| Labels | area:infra |
| Aangemaakt | 2026-08-24 |
| Afgerond | 2026-08-24 |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-131/land-de-branch-qs8-83-91-21-commits-staan-buiten-main-en-blokkeren-qs8 |

Gevonden op 24-08-2026 bij het oppakken van de laatste map van <issue id="47878fe6-4edd-4817-8b8b-20a6bb5e9ca6" href="https://linear.app/qs86-bot-linear/issue/QS8-115/schermteksten-naar-de-catalogus-54-bestanden">QS8-115</issue>. Volledige analyse in `docs/WERKVOORRAAD.md` **§2a**.

`origin/quintenstrijdonk/qs8-83-91-beloning-vrijgeven-bij-het-halen-van-een-doel` draagt werk dat nergens anders bestaat.

|  |  |
| -- | -- |
| Vóór op `main` | **2… (truncated, use `get_issue` for full description)

---

## QS8-132

**EPIC 13 — Open of beschermde groepen (besluit A41)**

| | |
|---|---|
| Status | In Review |
| Prioriteit | High |
| Labels | epic, area:backend, phase:mvp |
| Aangemaakt | 2026-08-24 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-132/epic-13-open-of-beschermde-groepen-besluit-a41 |

Uitvoering van besluit **A41**, genomen door Quinten op 24-08-2026 (<issue id="da549bf7-a722-4193-943b-51a293bf8fe3" href="https://linear.app/qs86-bot-linear/issue/QS8-128/besluit-a41-a42-a44-mag-de-groep-tegenslag-zien-blijven-punten-prive">QS8-128</issue>, variant 2).

Bij het aanmaken kiest een groep tussen **beschermd** (zoals nu, en de standaard) en **open** (de groep ziet ook tegenslag).

⚠️ **Dit raakt domeinregel 7, de regel die** `CLAUDE… (truncated, use `get_issue` for full description)

---

## QS8-133

**EPIC 13 — oppervlak 1: het groepsoverzicht in een open groep**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Medium |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-133/epic-13-oppervlak-1-het-groepsoverzicht-in-een-open-groep |

Oppervlak 1 uit `docs/decisions/002-domeinregel7-oppervlakken.md`, onder besluit A41.

`group_overview()` geeft vandaag geen weekstatus en geen `last_cycle_start` terug — dat is de bescherming, en die zit in de projectie van de functie en niet in een policy. In een **open** groep mag dat wél.

⚠️ **Dit is geen policy maar een tweede projectie**, en dat is de moeilijkheid. Een functie met een vaste kolomlijst kan niet "een beetje meer" teruggeven;… (truncated, use `get_issue` for full description)

---

## QS8-134

**EPIC 13 — oppervlak 2: best_streak in een open groep**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Low |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-134/epic-13-oppervlak-2-best-streak-in-een-open-groep |

Oppervlak 2 uit `docs/decisions/002-domeinregel7-oppervlakken.md`, onder besluit A41.

`group_visible_streaks` geeft `current_streak` en bewust **niet** `best_streak`: een `best` die groter is dan `current` is sluitend bewijs van een verbroken reeks (migratie 0019). In een **open** groep mag dat wél.

⚠️ **Dit is de lastigste van de drie, en niet omdat het veel werk is.** De bescherming is hier de **kolomlijst van een view** met `security_invoker… (truncated, use `get_issue` for full description)

---

## QS8-135

**EPIC 13 — oppervlak 13: De Ketting in een open groep**

| | |
|---|---|
| Status | In Review |
| Prioriteit | Medium |
| Labels | area:backend |
| Aangemaakt | 2026-08-24 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-135/epic-13-oppervlak-13-de-ketting-in-een-open-groep |

Oppervlak 13 uit `docs/decisions/002-domeinregel7-oppervlakken.md`, onder besluit A41.

`chain_links_select` is sinds migratie 0037 `user_id = auth.uid() or (is_group_member(group_id) and group_period_start >= current_date - 8)`: je eigen geschiedenis blijft van jou, van een ander zie je alleen de lopende periode — waarin een ontbrekende schakel "nog niet" betekent en niet "gemist". `group_overview()` geeft `closed_this_period` alleen binnen dat… (truncated, use `get_issue` for full description)

---

## QS8-136

**Besluit A49 — moet toetreden tot een open groep om toestemming vragen?**

| | |
|---|---|
| Status | In Review |
| Prioriteit | High |
| Labels | area:frontend, phase:mvp |
| Aangemaakt | 2026-08-25 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-136/besluit-a49-moet-toetreden-tot-een-open-groep-om-toestemming-vragen |

Gevonden door de critical-user-ronde op EPIC 13 (24-08-2026). Staat als **Middel** in `docs/ENGINEER-REVIEW.md`.

## Wat er gebeurt

`Uitnodigingswacht` in `app/_layout.tsx` bewaart de uitnodigingscode zodra iemand een link opent — **vóór hij iets gelezen heeft** — en verzilvert hem met `neemDeel()` zodra de onboarding klaar is. Er is geen "nee, bedankt" op het uitnodigingsscherm en de bewaarde code verloopt nooit.

Het scenario dat de reviewer … (truncated, use `get_issue` for full description)

---

## QS8-137

**A48 variant 2 — de Doelcoach-tip per mijlpaal, bovenop de vaste set**

| | |
|---|---|
| Status | Backlog |
| Prioriteit | Medium |
| Labels | area:ai, phase:v2 |
| Aangemaakt | 2026-08-25 |
| Afgerond | — |
| Linear | https://linear.app/qs86-bot-linear/issue/QS8-137/a48-variant-2-de-doelcoach-tip-per-mijlpaal-bovenop-de-vaste-set |

De tweede helft van besluit A48 (<issue id="52b48c2d-de3a-4c32-a99c-de9698080e93" href="https://linear.app/qs86-bot-linear/issue/QS8-110/wat-krijg-je-bij-een-gehaalde-week-de-beloning-invullen">QS8-110</issue>). Quinten koos op 25-08-2026 het gefaseerde advies: **variant 3 nu, variant 2 erbovenop zodra er mijlpalen zijn.**

Variant 3 is gebouwd — een vaste set van vijf regels per doelcategorie (`business`, `study`, `other`), deterministisch op d… (truncated, use `get_issue` for full description)

---

