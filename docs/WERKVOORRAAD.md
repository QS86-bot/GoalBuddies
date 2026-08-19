# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 18-08-2026 (na EPIC 7 en de besluitenronde A3/A7/A15/A17/A18/A19)

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

**Database — af, en nu ook getest.** 26 tabellen. Migraties `0001` t/m `0035`
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
- `src/shared/ui` — 16 componenten, met de domeinregels erin gebakken
- `src/modules/auth` — sessie, profiel, Zod-schema's
- `src/modules/goals` — doelen, weekdoelen, cyclus
- `src/modules/buddies` — groepen, uitnodigingen, groepsklok, overzicht
- `src/modules/completions` — afronden, de Dagzet, peer-goedkeuring
- `src/modules/buddies/chat*` en `weekafsluiting*` — de chat en het huddleritueel
- `tests/rls` — 145 tests die de policies écht uitvoeren, met echte JWT's
- `npm run typecheck`, `lint` en `test` staan groen (331 tests)
- `npm run build` rendert 23 routes statisch

**Wat werkt in de app:** aanmelden met e-mail, de onboarding, doelen aanmaken en
bijhouden, weekdoelen met vloer en plafond, en sinds EPIC 5 de hele
groepskant — een groep aanmaken met deelbare link, toetreden met een code, het
groepsoverzicht, je doel aan een groep koppelen, de huddledag instellen en de
gastvrije uitnodigingspagina die ook zonder account werkt. Sinds EPIC 7 ook de
groepschat (realtime, met een cache voor een slechte verbinding), automatische
systeemberichten bij positieve gebeurtenissen, en de weekafsluiting: drie vragen
op de huddledag met alle antwoorden op één kaart en reacties eronder.

⚠️ **EPIC 7 heeft één acceptatiecriterium niet gehaald, en dat is een
afhankelijkheid en geen omissie.** Het systeembericht bij een ketting-mijlpaal
(QS8-70) is niet gebouwd: **niets schrijft `chain_links`**. Daardoor staat het
bolletje "deze week al afgesloten" op het groepsoverzicht ook altijd uit, want
`group_overview()` leest die tabel. De Ketting is QS8-80 in EPIC 8, en dat is de
eerstvolgende epic. Zet daar `chain_milestone` op de allowlist in
`chat_messages_system_event_bekend` (migratie 0025).

## 3. Wat een nieuwe sessie als eerste doet

1. Lees `CLAUDE.md`. Dat is de grondwet en die wint van alles hieronder.
2. Lees dit bestand.
3. Lees `docs/decisions/001-datamodel.md` vóór je iets met de database doet.
4. Haal de openstaande issues op uit Linear, project GoalBuddies.
5. Controleer of `.env` bestaat en gevuld is (zie §6).
6. Draai `npm install && npm run typecheck && npm test` om te zien dat je op een
   werkende basis begint.

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
| 9 | **EPIC 8 — Gamification** (QS8-13) | Ketting, weekpassen, adempauze | **hier verder** — begin bij QS8-80, De Ketting |
| 10 | **EPIC 11 — Notificaties** (QS8-16) | Heeft gebeurtenissen nodig om over te melden | open |
| 11 | **EPIC 3 — De Doelcoach** (QS8-8) | AI. Werkt pas zinvol als doelen en weekdoelen bestaan | open |
| 12 | **EPIC 12 — Risico-radar** (QS8-17) | Rekent op cyclusgeschiedenis, dus laat | open |
| 13 | **EPIC 9 — Commitment device** (QS8-14) | Laatste; raakt vertrouwen, dus niet haasten | open |

**Exit:** een groep van drie draait ≥4 opeenvolgende cycli.

#### Wat er van de afgeronde epics nog los ligt

Klein, maar het staat nergens anders opgeschreven:

| Wat | Waar | Waarom blijven liggen |
|---|---|---|
| Apple- en Google-login | QS8-25 | Provider moet aan in het Supabase-dashboard; op native vraagt het `expo-web-browser` — een dependency |
| Avatar uploaden | QS8-27 | Er is geen Storage-bucket en geen `storage.objects`-policy |
| Doorschuiven van een gemist weekdoel | QS8-47 | `schuifDoor()` staat in `modules/goals/weekly.ts`, er is nog geen scherm dat hem aanroept |
| ~~Een voltooiing corrigeren~~ | QS8-46 | ✅ opgelost in EPIC 6: de RPC `dien_opnieuw_in` doet het append-only en in één transactie |
| Rollover automatisch laten draaien | QS8-49 | De functie werkt en is getest, maar wordt door niets aangeroepen. Zie hieronder |
| Systeembericht bij een ketting-mijlpaal | QS8-70 | Niets schrijft `chain_links`. Hoort bij QS8-80 (De Ketting, EPIC 8); dan komt `chain_milestone` op de allowlist in migratie 0025 |
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
| GitHub-connector | Voor PR's vanuit een sessie. `gh` staat niet op de machine | niet gedaan — branches worden lokaal naar `main` gemerged |
| Branch protection op `main` | Maakt de CI-check "Alles groen" blokkerend | niet gedaan |
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

1. **Tijd buiten `shared/time`.** Er staat een lint-regel op die `new Date()` en
   `Date.now()` blokkeert buiten die map. Kom je hem tegen: los het niet op met
   een `eslint-disable`, maar breid `shared/time` uit.

2. **Kleuren buiten `shared/theme`.** Het stelsel is van Q-Projects en wordt
   gedeeld met de Status Tracker. Verzin geen tint bij. Twee vastgelegde grenzen:
   goud is nergens een kleur voor lopende tekst, en een goudvlak draagt in de
   lichte modus geen lopende tekst. Staat als test in `contrast.test.ts`.

3. **Falen is nooit publiek** (domeinregel 7). Bij élk nieuw ding dat de groep
   te zien krijgt: kan hier iemands gemiste week uit worden afgeleid? Zo ja, dan
   is het fout, ook als het technisch werkt.

4. **Punten zijn privé.** `points_ledger` en het puntentotaal zijn alleen voor de
   eigenaar. De groep ziet De Ketting en mijlpalen. Een dalend puntentotaal is
   zichtbaar bewijs van een gemiste week.

5. **Migraties.** Draaien voorlopig direct op het echte project — besluit van
   16-08, want er komen geen gebruikers voordat alle fases af zijn. **Zodra er
   één echte gebruiker is, geldt de oude regel weer:** nooit op remote zonder
   `pg_dump` vooraf en zonder repetitie op een lokale stack. De gratis tier heeft
   geen automatische backups. Houd tot die tijd elke migratie idempotent, met een
   rollback-pad in de kop van het bestand — dat is nu de enige bescherming.

6. **Geen Vercel-specifieke API's.** We draaien op Hostinger als statische host.

7. **Meer dan 15 bestanden in één keer** is volgens `CLAUDE.md` een moment om te
   overleggen, niet om door te pakken.

8. **In een `SECURITY DEFINER`-RPC overleeft niets een `raise exception`.**
   PostgREST draait elke RPC in zijn eigen transactie; gooien rolt die terug,
   inclusief alles wat je net wilde onthouden. Bouw je een rate limiter, een
   auditregel of een blokkade, zet die dan in de happy path en geef een resultaat
   terug in plaats van een exception. Dat is precies waar de uitnodigingslimiet
   op stukliep (migratie 0017), en het is niet te zien zonder een test die het
   uitprobeert.

9. **Domeinregel 7 is pas afgedwongen als de dátabase hem afdwingt.** De
   schermen van EPIC 5 waren zorgvuldig: geen gemiste weken, geen puntentotaal,
   een leeg vakje in plaats van een grijs kruisje. En toch stond de hele lijst
   gemiste weken van elk groepslid open via één API-verzoek, omdat
   `weekly_goals_select` de statuskolom meegaf. Bij élke nieuwe policy die
   groepsgenoten iets laat lezen: welke kolommen zitten er in die rij, en zegt
   een daarvan iets over falen? RLS kan geen kolommen beperken — dat betekent
   dat je de rij moet beperken, of een view met een expliciete kolomlijst moet
   bouwen zoals `group_visible_streaks`.

10. **Zet nooit `REPLICA IDENTITY FULL` op `completions` of `weekly_goals`.**
    Die twee staan sinds EPIC 6 in de realtime-publicatie voor de
    beoordelingswachtrij. Supabase past RLS toe op INSERT en UPDATE — daar lekt
    niets — maar **niet op DELETE**. Met de standaard replica identity gaat er
    bij een verwijdering alleen een uuid over de lijn; met `FULL` gaat de hele
    oude rij mee, inclusief `status = 'missed'` en de notitie, naar iedereen die
    zich abonneert. `publish` is een optie van de publicatie en niet per tabel in
    te stellen, dus dit is een afspraak en geen slot. Staat als A20 in
    `docs/Q-TODO.docx`, met het voorstel om hem in `CLAUDE.md` te zetten.

11. **Een nieuw type systeembericht vraagt een migratie, en dat is opzet.** De CHECK
    `chat_messages_system_event_bekend` (migratie 0025) is een allowlist van acht
    namen, en omdat het een CHECK is geldt hij ook voor `service_role` — de rol die
    alle policies overslaat. De kopie staat in
    `src/modules/buddies/chat-schemas.ts` als `SYSTEEM_GEBEURTENISSEN`, met
    `VERBODEN_GEBEURTENISSEN` ernaast en twee tests eromheen: de lijst is exact acht
    namen, en geen enkele verboden naam staat erin. Een tóevoeging is daar dus ook
    een rode test, niet alleen een verkeerde toevoeging. Dat is de bedoeling: de
    drempel dwingt de vraag af of de groep het mag zien.

12. **Een systeembericht noemt geen titels.** Persoon en gebeurtenis, nooit de
    doeltitel, weektitel, mijlpaaltitel, notitie of het gehaalde niveau. Een bericht
    is een onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt
    is: ontkoppelen trekt de toestemming in, maar wist geen chat. Onderbouwing in
    `docs/decisions/002-domeinregel7-oppervlakken.md` §3, met een test die de titels
    uit de fixture nergens in een systeembericht mag terugvinden.

13. **`npm run types:db` schreef ooit een leeg typesbestand.** De oude regel was
    `supabase gen types ... > src/lib/database.types.ts`, en de shell kapt het
    doelbestand af vóórdat het commando draait. Staat `supabase` niet op het PATH —
    en dat is hier het geval — dan is het resultaat een leeg bestand en een build die
    overal stukloopt zonder één foutmelding die naar de oorzaak wijst. Nu draait het
    via `scripts/db-types.mjs`, dat alleen bij een geslaagde generatie schrijft.
    **Werkt de CLI niet (die vraagt een access token, of Docker bij `--db-url`), dan
    is de MCP-tool `generate_typescript_types` de route.** Zo zijn de types van
    EPIC 7 gemaakt.

14. **⚠️ Draai de RLS-suite niet vaker dan een paar keer per uur.**
    `tests/rls/policies.test.ts` en `tests/rls/epic7.test.ts` maken samen zo'n tien
    echte accounts per volledige run, elk met een `signInWithPassword`. Supabase
    weigert dat na ongeveer dertig aanmeldingen per uur met "Request rate limit
    reached", en dan valt de suite om op een plek die niets met de policies te maken
    heeft. Dat is op één avond twee keer gebeurd, beide keren in een ánder bestand —
    dus het ziet er elke keer uit als een nieuw defect.

    **Zie je een opbouwfout, zoek dan eerst op "rate limit" in de melding.** Is het
    dat, dan is de suite niet stuk maar op. Structurele oplossing staat in
    `docs/ENGINEER-REVIEW.md` (18-08): één set gedeelde testgebruikers over beide
    bestanden, of de sessie hergebruiken in plaats van per gebruiker opnieuw
    inloggen. Zolang die er niet is, is dit een harde bovengrens op hoe vaak je kunt
    verifiëren — en dat is een tweede argument voor de lokale stack (Q-TODO A9).

15. **De repo en het echte project lopen uit elkaar en niets bewaakt dat.** Op één
   dag twee keer gevonden, allebei bij toeval: een migratie die wel op het
   project stond maar niet in de map, en een Edge Function waarvan de repo-versie
   een kapotte regex had terwijl de gedeployde versie klopte. Zolang migraties
   via een MCP-tool gaan in plaats van via `supabase db push`, is
   `supabase/migrations/` een verslag en geen bron. Vergelijk bij twijfel de
   migratielijst van het project met de bestanden in de map.

16. **Een `on delete set null` sneuvelt stil op een onveranderlijkheidstrigger.**
   Een referentiële actie is zélf een UPDATE op de kindtabel. Staat daar een
   BEFORE UPDATE-trigger die de kolom terugzet naar `old` — en die staan hier op
   `chat_messages` en `groups` — dan draait die de actie in dezelfde bewerking
   terug. Postgres controleert de sleutel daarna niet opnieuw: **geen fout, geen
   waarschuwing, wel een verwijzing naar een rij die niet meer bestaat.**

   Zo bleef een verwijderd account in de groepschat staan als afzender, terwijl
   de constraint keurig `on delete set null` zei en op INSERT gewoon afdwong.
   Gerepareerd in 0033 door precies één overgang toe te staan (afzender → leeg).
   `groups.created_by` ontsnapte er per ongeluk aan: `guard_group_update()`
   begint met een controle op `current_user`, en een referentiële actie draait
   als tabeleigenaar.

   **Bij elke nieuwe `on delete set null`: staat er een trigger op die kolom?**

17. **Een kolomgrant intrekken breekt de app stil, niet luid.** `revoke update
   (target_date) on goals` (0032) maakte `wijzigDoel()` kapot voor precies één
   veld; typecheck en lint bleven groen, want het type klopte nog. Alleen een
   test die de UPDATE écht uitvoert vangt dat. Trek je een kolomrecht in, zoek dan
   meteen elke `.update(` op die kolom in `src/`, `app/` **én `tests/`** — bij
   0035 (`goals.status`) was het de fixture van EPIC 7 die omviel, en dat was de
   enige waarschuwing die er kwam.

18. **Twee insluitingen zijn geen gelijkheid.** De allowlist van systeemberichten
   werd op twee plekken getoetst: "de app kent niets dat de database verbiedt" en
   "de lijst in de app is exact deze acht namen". Allebei groen, en tóch liepen
   database en app uit elkaar — migratie 0032 zette er een negende op de CHECK en
   de tweede test vergeleek de oude lijst met zichzelf. Er is nu één test die de
   twee verzamelingen gelijkstelt (`systeembericht_allowlist()`, migratie 0034).

   Dit is het slot dat `CLAUDE.md` met naam noemt en dat één keer geruisloos
   gefaald heeft. Bouw je een "twee kopieën die gelijk moeten blijven"-slot, toets
   dan de gelijkheid en niet twee keer een kant.

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
5. **Niets schrijft `chain_links`**, terwijl `group_overview()` er wel op leunt voor
   `closed_this_period` en de ketting-mijlpaal van QS8-70 erop wacht. Gevonden
   tijdens EPIC 7; hoort thuis bij QS8-80 in EPIC 8, en dat is de eerstvolgende epic.
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
