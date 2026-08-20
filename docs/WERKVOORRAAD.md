# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 20-08-2026 (na de groene notities en QS8-106)

---

## 0. De stand in tien regels

Lees dit eerst; de rest is naslag.

* **Fase 1 is voor het grootste deel af.** EPIC 0, 1, 2, 4, 5, 6, 7 en 10 staan;
  van EPIC 8 zijn De Ketting, de weekpassen en het dashboard af, EPIC 3 is deels
  gebouwd buiten de volgorde om. Open: EPIC 11, 12, 9 en de rest van 8
  (QS8-76, QS8-77, QS8-82).
* **Er zijn nog geen echte gebruikers**, en dat is de aanname onder elke
  afspraak hieronder. Migraties mogen daarom rechtstreeks op productie. **Dat
  vervalt op de dag dat de eerste gebruiker zich aanmeldt.**
* **De database loopt soms vóór op de repo.** Migraties gaan via een MCP-tool en
  niet via `supabase db push`, dus `supabase/migrations/` is een verslag en geen
  bron. Vergelijk bij twijfel `list_migrations` met de map — dat is deze week
  twee keer misgegaan (valkuil 15).
* **De rollover draait sinds 19-08 elk uur** via GitHub Actions. Daarmee is de
  puntenkant van EPIC 4 en 8 voor het eerst echt in bedrijf.
* **De echte poort is de RLS-suite en die draait niet in CI.** Zie §3b. Groen in
  GitHub zegt niets over domeinregel 7.
* **⚠️ Eén ding is nog gebouwd en nooit gedraaid:** de Doelcoach-keten van
  EPIC 3 — poort, Edge Function en datalaag staan, maar er is geen scherm en er
  is nooit een echte AI-call gedaan. Het weekpas-pad in `herbereken_reeks()`
  stond ook in dit rijtje en is er sinds 19-08 uit: het wordt nu gevuld én is
  end-to-end tegen het echte project gedraaid.
* ✅ **De reeks is niet meer te verzinnen en een gemiste week niet meer weg te
  poetsen** (migraties 0043 t/m 0045, A35/A36/A39/A40). Vier routes, alle vier
  dicht: je eigen weekdoel op `approved` zetten, een gemiste week verwijderen,
  hem doorschuiven (`carried` breekt de reeks nu, tenzij er een weekpas op
  staat), en de `todo`-rij wissen vóór de rollover (verwijderen is nu
  **afsluiten** — de rij blijft als `cancelled` staan en de rollover veegt hem
  bij het verstrijken van de cyclus mee naar `missed`).
* **De les van deze ronde, en hij is duurder dan de bug.** 0023 dichtte dit voor
  *wijzigen*, niemand keek naar *aanmaken* en *verwijderen*, en in
  `ENGINEER-REVIEW.md` stond het als opgelost afgevinkt. En toen 0043 die twee
  sloot, bleken er nog twee deuren te zijn. **Vier migraties voor één gat, en
  elke ronde vond de vorige reparatie te smal.** Bij het volgende slot: zoek eerst
  álle routes naar het effect, niet de route die je net gevonden hebt.
* ✅ **De vier functies zonder scherm hebben er een** (QS8-106, 20-08).
  `schuifDoor()`, `sluitWeekdoelAf()`, `verwijderWeekdoel()` en `verwijderDoel()`
  worden nu aangeroepen: afsluiten en weggooien staan op de weekdoelkaart, het
  blok "Nog open van eerdere weken" op *Vandaag* neemt een gemiste week mee, en
  weggooien-binnen-de-bedenktijd staat onder archiveren op het doelscherm. Elk
  met een bevestiging die zegt wát het kost.
* **⚠️ Maar er bleek een vijfde te zijn, en die is erger: `maakWeekdoel()` wordt
  door geen enkel scherm aangeroepen.** "Weekdoel toevoegen" stuurt je naar de
  doelenlijst, die naar een doel, en op het doelscherm staat geen formulier.
  **Er is dus geen route om een weekdoel aan te maken** — de kernlus van de app
  is niet met de hand te doorlopen. Doorschuiven werkt wel, want `schuifDoor()`
  roept `maakWeekdoel()` intern aan. Dit is geen bedrading maar een scherm: het
  is de UI van QS8-43/QS8-44. **Dit is nu het grootste knelpunt.**
* De Doelcoach-keten van EPIC 3 staat er nog steeds zonder scherm bij, en er is
  nog steeds geen echte AI-call gedaan.
* **Wat op Quinten wacht** staat in `docs/Q-TODO.docx`: A16, A22 t/m A45. Twee
  dringende: **A45** (mag `excused` bij de afgeschermde statussen — zie §2, het
  zet een lek op scherp zodra QS8-82 gebouwd wordt) en **A41 t/m A44** uit de
  groene notities, waarvan A41 en A42 een besluit over domeinregel 7 vragen.
  A37 staat er ook nog. Geen van alle blokkeert het bouwen van andere issues.

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

**Database — af, en nu ook getest.** 26 tabellen. Migraties `0001` t/m `0038`
staan in `supabase/migrations/` en zijn toegepast. Het datamodel is vastgesteld
in `docs/decisions/001-datamodel.md`; dat document is leidend, niet de losse SQL.
De 24e tabel is `week_review_replies` (EPIC 7, migratie 0026); daarna kwamen
`approval_withdrawals` (0030) en `deadline_requests` (0032) erbij.

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
- `tests/rls` — 164 tests die de policies écht uitvoeren, met echte JWT's
- `npm run typecheck`, `lint` en `test` staan groen (383 tests)
- `npm run build` rendert 23 routes statisch

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

⚠️ **Wat van QS8-70 nog openstaat is alleen het systeembericht bij een
ketting-mijlpaal.** Er is nog geen definitie van wat een mijlpaal ín de ketting
is (drie perioden op rij? voltallig? een rond getal?), dus `chain_milestone`
staat nog niet op de allowlist in `chat_messages_system_event_bekend`. Zet je
hem erbij, dan moet `SYSTEEM_GEBEURTENISSEN` in
`src/modules/buddies/chat-schemas.ts` mee — er staat sinds 18-08 een test op die
de twee verzamelingen gelijkstelt (valkuil 18).

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

**Wanneer deze stap kan vervallen:** zodra er een lokale of aparte Supabase-stack
is (Q-TODO **A9**). Nu draaien die tests tegen productie, maken ze echte accounts
aan en lopen ze tegen de aanmeldlimiet (valkuil 14) — daarom staan ze niet in CI
en daarom is dit handwerk. Het automatiseren van deze stap is meer waard dan elke
instelling op GitHub.

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
| 8 | **EPIC 7 — Chat & weekafsluiting** (QS8-12) | Hangt op groepen | ✅ af, m.u.v. de twee `phase:v2`-issues en de ketting-mijlpaal (zie §2) |
| 9 | **EPIC 8 — Gamification** (QS8-13) | Ketting, weekpassen, adempauze | **hier verder, ná het scherm om een weekdoel aan te maken.** ⚠️ Lees vóór QS8-82 de opmerking erbij in Linear: de adempauze zet een domeinregel-7-lek op scherp (A45). QS8-80 (De Ketting), QS8-81 (weekpassen) en QS8-75 (dashboard) zijn af; open zijn QS8-77 (nudge, hoog), QS8-82 (adempauze) en QS8-76 (feestmoment) |
| 10 | **EPIC 11 — Notificaties** (QS8-16) | Heeft gebeurtenissen nodig om over te melden | open |
| 11 | **EPIC 3 — De Doelcoach** (QS8-8) | AI. Werkt pas zinvol als doelen en weekdoelen bestaan | **deels gebouwd, buiten de volgorde om.** De poort (`vraag_ai_job`, 0038), de Edge Function `doelcoach` en de datalaag van het interview staan op `main`. **Geen schermen, en niet één keer end-to-end gedraaid** |
| 12 | **EPIC 12 — Risico-radar** (QS8-17) | Rekent op cyclusgeschiedenis, dus laat | open |
| 13 | **EPIC 9 — Commitment device** (QS8-14) | Laatste; raakt vertrouwen, dus niet haasten | open |

**Exit:** een groep van drie draait ≥4 opeenvolgende cycli.

#### Wat er van de afgeronde epics nog los ligt

Klein, maar het staat nergens anders opgeschreven:

| Wat | Waar | Waarom blijven liggen |
|---|---|---|
| Apple- en Google-login | QS8-25 | Provider moet aan in het Supabase-dashboard; op native vraagt het `expo-web-browser` — een dependency |
| Avatar uploaden | QS8-27 | Er is geen Storage-bucket en geen `storage.objects`-policy |
| ~~Doorschuiven van een gemist weekdoel~~ | QS8-47 | ✅ aangesloten in QS8-106: het blok "Nog open van eerdere weken" op *Vandaag* |
| **Een weekdoel aanmaken** | QS8-43, QS8-44 | ⚠️ `maakWeekdoel()` wordt door geen enkel scherm aangeroepen. Gevonden tijdens QS8-106. Zonder dit scherm is de kernlus niet met de hand te doorlopen |
| ~~Een voltooiing corrigeren~~ | QS8-46 | ✅ opgelost in EPIC 6: de RPC `dien_opnieuw_in` doet het append-only en in één transactie |
| Rollover automatisch laten draaien | QS8-49 | De functie werkt en is getest, maar wordt door niets aangeroepen. Zie hieronder |
| Systeembericht bij een ketting-mijlpaal | QS8-70 | `chain_links` wordt sinds 19-08 gevuld (QS8-80), dus de blokkade is weg. Wat ontbreekt is de definítie: wanneer is iets een mijlpaal in de ketting? Daarna `chain_milestone` op de allowlist, én in `SYSTEEM_GEBEURTENISSEN` — de test eist gelijkheid |
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

15. **⚠️ Draai de RLS-suite niet vaker dan een paar keer per uur.** De suites
    maken samen zo'n tien echte accounts per volledige run, en Supabase weigert na
    ongeveer dertig aanmeldingen per uur met **"Request rate limit reached"** —
    waarna de suite omvalt op een plek die niets met de policies te maken heeft.
    Een tweede gezicht hiervan is **"JWT issued at future"**: klokverschil, ook
    geen policyfout.

    **Zie je een opbouwfout, zoek dan eerst op "rate limit" in de melding.** Is
    het dat, dan is de suite niet stuk maar op. Dit is een harde bovengrens op hoe
    vaak je kunt verifiëren; de structurele oplossing (gedeelde testgebruikers, of
    een lokale stack — Q-TODO **A9**) is meer waard dan welke instelling op GitHub
    ook.

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

1. ~~**`goals.risk_status` en `risk_reason` lekken naar groepsgenoten.**~~ **Geen
   lek meer maar een besluit:** Quinten heeft op 18-08 geantwoord dat de groep je
   risicostatus mag zien (A17). ⚠️ Wel herbevestigen vóór EPIC 12: de Risico-radar
   leidt `behind` en `unreachable` zélf af uit gemiste weken, dus vanaf die dag ís
   die kolom een afgeleide van andermans tegenslag. Schrijven kan de client hem
   sinds 0032 niet meer.
2. ~~**`inactive` ontneemt niets.**~~ Opgelost in 0029. Er bleken drie routes terug
   naar binnen te zijn in plaats van één; de andere twee herstelden het
   lidmaatschap zelfs (eigen status terugzetten, eigen rij weggooien en opnieuw
   toetreden).
3. **De RLS-suite draait niet in CI** (§5). Groen in GitHub zegt niets over
   groepen, rate limiting of domeinregel 7. **Dit is nu de zwaarste van de lijst**,
   want er staan sinds 18-08 141 RLS-tests die niemand automatisch draait.
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

7. **⚠️ Een doel kan niet meer op `completed` komen.** `goals.status` stond open
   voor de client, en `completed` liet `meld_doel_af()` afgaan — "X heeft een doel
   afgerond" in elke gekoppelde groep, zonder dat er iets afgerond was. Dicht sinds
   0035: archiveren loopt via `zet_doelstatus()`, dat alleen `active` en
   `archived` toestaat. Maar er is nu **geen enkel** pad naar `completed`: geen
   trigger zet hem, `meld_doel_af()` reageert er alleen op. Wanneer een doel af is,
   is een productbeslissing (alle mijlpalen? de eigenaar? een buddy die bevestigt?)
   en staat als **A31** in `docs/Q-TODO.docx` en als **QS8-102** in Linear.

8. **Een onveranderlijkheidstrigger sloopt stil een `on delete set null`.** Een
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
