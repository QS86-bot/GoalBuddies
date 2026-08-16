# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 16-08-2026 (late avond, na EPIC 5)

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

**Database — af, en nu ook getest.** 23 tabellen. Migraties `0001` t/m `0017`
staan in `supabase/migrations/` en zijn toegepast. Het datamodel is vastgesteld
in `docs/decisions/001-datamodel.md`; dat document is leidend, niet de losse SQL.

⚠️ **De RLS-suite (QS8-98) vond zeven gaten en die zijn alle zeven gedicht** in
migraties 0005 t/m 0011. Twee waren ernstig: elk groepslid kon zichzelf beheerder
maken, en elk groepslid kon een vals systeembericht plaatsen. De rode draad: RLS
kan geen kolommen beperken — overal waar de eis is "deze kolom mag je niet
veranderen" is een trigger nodig. Zie `docs/ENGINEER-REVIEW.md`.

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
- `src/shared/ui` — 15 componenten, met de domeinregels erin gebakken
- `src/modules/auth` — sessie, profiel, Zod-schema's
- `src/modules/goals` — doelen, weekdoelen, cyclus
- `src/modules/buddies` — groepen, uitnodigingen, groepsklok, overzicht
- `tests/rls` — 56 tests die de policies écht uitvoeren, met echte JWT's
- `npm run typecheck`, `lint` en `test` staan groen (203 tests)
- `npm run build` rendert 20 routes statisch

**Wat werkt in de app:** aanmelden met e-mail, de onboarding, doelen aanmaken en
bijhouden, weekdoelen met vloer en plafond, en sinds EPIC 5 de hele
groepskant — een groep aanmaken met deelbare link, toetreden met een code, het
groepsoverzicht, je doel aan een groep koppelen, de huddledag instellen en de
gastvrije uitnodigingspagina die ook zonder account werkt.

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
| 7 | **EPIC 6 — Peer-goedkeuring** (QS8-11) | Hangt op groepen én weekdoelen | **hier verder** |
| 8 | **EPIC 7 — Chat & weekafsluiting** (QS8-12) | Hangt op groepen | open |
| 9 | **EPIC 8 — Gamification** (QS8-13) | Ketting, weekpassen, adempauze | open |
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
| Een voltooiing corrigeren | QS8-46 | `completions` heeft bewust geen UPDATE-policy; `superseded_by` zetten hoort een Edge Function te doen. De app geeft nu een eerlijke melding |
| Rollover automatisch laten draaien | QS8-49 | De functie werkt en is getest, maar wordt door niets aangeroepen. Zie hieronder |
| Hetzelfde doel aan meerdere groepen koppelen | QS8-56 | `phase:v2`. `goal_group_links` kan het vanaf dag één en `koppelDoelAanGroep()` ook; er is alleen nog geen scherm dat één doel aan twee groepen hangt |
| Een groep verlaten | QS8-57 | `phase:v2`. De policy staat het toe (`group_members_delete`), maar de overdracht van het laatste beheerderschap is niet geregeld en dat is geen detail |
| Rollover opnieuw deployen | Q-TODO A13 | De functie roept nu ook `slaap_stille_groepen()` aan, en in de repo stond een kapotte regex. Deployen vraagt een access token dat een sessie niet heeft |

⚠️ **De rollover draait nog niet vanzelf.** `supabase/functions/rollover` is
gedeployd en werkt, maar er staat geen planning op. Tot die er is, gebeurt er bij
een cyclusovergang niets: geen minpunten, geen `missed`, geen reeksbreuk. Aanroepen
kan met:

```bash
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/rollover" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Inplannen gaat via Supabase Cron in het dashboard, of via `pg_cron` + `pg_net`.
Dat laatste vraagt de service-role-key in de database (Vault), en dat is een
beslissing die niet stilzwijgend genomen moet worden.

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
| PostgreSQL client tools | `pg_dump` vóór elke migratie op gevulde data | **niet geïnstalleerd** — vraagt beheerdersrechten |
| Docker + WSL2 | Voor een lokale Supabase-stack. Bewust uitgesteld, zie §5 | uitgesteld tot vóór de eerste echte gebruiker |
| Supabase CLI | Voor `db reset`, `db diff` en de lokale stack | ✅ werkt via `npx supabase` (v2.114), installatie niet nodig |
| GitHub-connector | Voor PR's vanuit een sessie. `gh` staat niet op de machine | niet gedaan — branches worden lokaal naar `main` gemerged |
| Branch protection op `main` | Maakt de CI-check "Alles groen" blokkerend | niet gedaan |
| Leaked password protection | Staat uit in Supabase Auth. Eén schakelaar in het dashboard | niet gedaan |
| Apple/Google OAuth | Providers aanzetten in het Supabase-dashboard | niet gedaan |
| Storage-bucket | Voor avatars en later bijlagen. Geen bucket én geen `storage.objects`-policy | niet gedaan |
| Rollover inplannen | De Edge Function werkt maar wordt door niets aangeroepen. Zie §4 | niet gedaan |
| Rollover opnieuw deployen | Hij roept nu ook `slaap_stille_groepen()` aan (QS8-60), en de repo-versie had een kapotte `Bearer`-regex. `supabase functions deploy rollover` vraagt een access token | niet gedaan — Q-TODO A13 |
| `EXPO_PUBLIC_APP_URL` invullen | Voedt de uitnodigingslink. Leeg betekent: terugval op het productieadres, dus een testomgeving deelt links naar productie | niet gedaan — Q-TODO A14 |

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

9. **De repo en het echte project lopen uit elkaar en niets bewaakt dat.** Op één
   dag twee keer gevonden, allebei bij toeval: een migratie die wel op het
   project stond maar niet in de map, en een Edge Function waarvan de repo-versie
   een kapotte regex had terwijl de gedeployde versie klopte. Zolang migraties
   via een MCP-tool gaan in plaats van via `supabase db push`, is
   `supabase/migrations/` een verslag en geen bron. Vergelijk bij twijfel de
   migratielijst van het project met de bestanden in de map.

---

## 8. Openstaande onzekerheden

Staan in `docs/ENGINEER-REVIEW.md`, met datum, risico en uitleg. Dat bestand is
de agenda voor de engineer-review in november. **Vul het aan tijdens het bouwen**,
niet achteraf — een onzekerheid die je nu niet opschrijft, ben je in november kwijt.

De zwaarste op dit moment: de RLS-testdekking (§5), de `SECURITY DEFINER`-
hulpfuncties die RLS omzeilen, en het feit dat niets bewaakt dat de repo en het
echte project hetzelfde bevatten (§7.9).

**Twee productbeslissingen liggen bij Quinten en staan in `docs/Q-TODO.docx`:**
mag de groep je reeks zien (A15 — een reeks die naar nul valt is net zo goed
bewijs van een gemiste week als een dalend puntentotaal), en mag een
uitnodigingslink de doeltitels van je leden tonen aan iedereen die hem heeft
(A16). Allebei gebouwd zoals de issue het vraagt; allebei een keuze die anders
kan uitvallen.

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
