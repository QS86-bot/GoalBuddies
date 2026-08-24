# 005 — De RLS-suite draait lokaal

**Datum:** 24-08-2026
**Issue:** QS8-119 (afgesplitst van QS8-116, geblokkeerd door QS8-122)
**Status:** doorgevoerd

## Het probleem

`tests/rls/harness.ts` maakte echte accounts aan in het **productieproject** en
ruimde ze op met de service-role-key — een key die RLS volledig omzeilt. Er stond
een slot op (`RLS_TEST_ALLOW_PROD=1`), maar dat was een herinnering en geen
bescherming: het staat aan het begín van de run en zegt niets over wat er aan het
eind verwijderd wordt.

Daarbovenop: zonder credentials sloeg de suite zichzelf over. **Groen in CI zei
dus niets over domeinregel 7**, de regel die `CLAUDE.md` de belangrijkste van dit
product noemt.

## Het besluit: een lokale opstelling, en die is de standaard

`RLS_DOEL=lokaal npm test` praat tegen een **echte PostgREST** op een database die
uit `supabase/migrations/` is opgebouwd. Geen credentials, geen productie, geen
netwerk.

Drie richtingen lagen op tafel; dit is waarom het deze werd.

| Richting | Waarom niet / wel |
|---|---|
| **Tweede cloudproject** | Kost geld en dus een besluit van Quinten (beslisbevoegdheid, grens 1). Gratis projecten pauzeren na inactiviteit, en een testproject is per definitie inactief tussen runs. Lost bovendien het schema-synchronisatieprobleem niet op maar verdubbelt het |
| **`supabase start`** | De volledige stack, en als het werkt is het de betere keus: meer platform voor minder eigen gedoe. Werkte hier niet — Docker Hub is achter de proxy niet bereikbaar (403 op de blob-CDN, 429 op de registry). Op een machine waar het wél kan, gebruik het |
| **Postgres + PostgREST, zonder Docker** ✅ | Twee processen, allebei de échte software. Dit is wat er gebouwd is |

### Waarom dit pas nu kon

QS8-122. Zolang de migratiebestanden het schema niet konden opbouwen, leverde
elke lokale omgeving een ánder schema dan productie — en dan toetst de suite daar
een verzinsel. Sinds 24-08 is dat gemeten in plaats van aangenomen: negen
vingerafdrukken, alle negen gelijk.

## Wat er draait

```bash
npm run rls:stack     # schema opbouwen + PostgREST starten
npm run rls:lokaal    # de suite ertegenaan
npm run rls:stack:stop
```

`scripts/lokale-stack.sh` bouwt de database op met `schema-opbouwen.sh` en start
PostgREST erop. Meer is het niet.

### Wat de steiger overneemt van het platform

`supabase/shim/0000_supabase_shim.sql` zet neer wat een Supabase-project vóór de
eerste migratie al heeft — bewust minimaal, geteld en niet geraden. Sinds dit
issue staan er drie dingen bij:

* **`authenticator`**, de rol waarmee PostgREST verbindt en die daarna naar
  `anon`, `authenticated` of `service_role` schakelt op grond van het JWT. Zonder
  die rol staat er wel een schema, maar praat er niets mee.
* **`shim_maak_gebruiker()`** en **`shim_verwijder_gebruiker()`** — wat GoTrue op
  productie doet: een rij in `auth.users`, waarna `handle_new_user` het profiel
  aanmaakt.

⚠️ **Die twee functies horen nooit op productie**, en dat is nu een controle en
geen aanname. `tests/scripts/steiger.test.ts` wordt rood zodra een migratiebestand
`shim_` noemt. Nagemeten door het met de hand te breken.

## Wat je lokaal níét toetst

**Het platform.** Geen GoTrue, dus geen bewijs dat een echte sessie de claims
draagt die de policies verwachten. Dat is dezelfde grens als bij QS8-116, en hij
wordt op dezelfde manier bewaakt: `token.test.ts` heeft één test die tegen het
échte project draait en de claims vergelijkt. Lokaal slaat die zichzelf over —
groen worden op een vergelijking die niet gemaakt is, zou van een controletest het
tegenovergestelde maken.

**Draai vóór een merge die auth, RLS, goedkeuring of commitments raakt dus beide:**
lokaal voor het snelle bewijs, productie voor de bevestiging.

⚠️ `guardProductie()` en `RLS_TEST_ALLOW_PROD` **blijven staan**, en het commentaar
dat zei dat ze konden verdwijnen zodra er een lokale stack was, is herzien. Er is
nog precies één goede reden om tegen productie te draaien; zolang die bestaat,
bestaat ook de mogelijkheid om per ongeluk de héle suite daarheen te sturen.

## Wat het opleverde, behalve veiligheid

**Snelheid.** De volle suite doet er lokaal **vijf seconden** over. Tegen
productie waren dat minuten, met een netwerkronde per assertie.

**Drie stille fouten, meteen gevonden.**

1. `notificaties.test.ts` verwachtte `ok` op een web-registratie **zonder
   websleutels**. Migratie 0062 zet daar een CHECK op en 0067 weigert het netjes
   met `geen_websleutels` — de test stond dus rood en niemand zag het, want zonder
   credentials sloeg hij zichzelf over.
2. `epic7.test.ts` riep `admin.auth.admin.deleteUser()` rechtstreeks aan. Dat werkt
   maar op één van de twee doelen, terwijl wat de test bewíjst (migratie 0060 laat
   een systeembericht zijn onderwerp loslaten) in de database gebeurt. Nu via de
   harnas.

3. `epic7.test.ts` toetste een volgorde die de database niet belooft — zie A47
   hieronder. Hij was rood in ongeveer twee van de vijf runs.

⚠️ **Alle drie zijn gevonden door de suite ergens anders te draaien.** Dat is het
argument voor deze opstelling dat niet in de issue stond: een suite die maar op
één plek kan draaien, is een suite waarvan je de aannames niet ziet.

## A47 — wat er wel en niet bewezen is

QS8-116 beschrijft de volle run als onbetrouwbaar: twee runs achter elkaar gaven
1 respectievelijk 5 falende bestanden, elke keer andere.

**A47 reproduceerde lokaal, en er zat één concrete oorzaak onder.**

⚠️ **Eerst een correctie op mezelf.** De eerste meting hier waren 17 schone runs,
en die telden niet: `lokale-stack.sh` stopte PostgREST pas ná het herbouwen van de
database, dus `drop database` weigerde — er stonden nog elf sessies op — en de
suite draaide zeventien keer tegen dezélfde database. Groen op een schema dat niet
opnieuw was opgebouwd. **Precies het faalbeeld dat deze hele opstelling moet
uitsluiten, en ik liep er zelf in.** De volgorde in het script is omgedraaid en er
staat nu een merkteken-controle op dat de database echt vervangen wordt.

Met een écht verse database per ronde was het beeld anders: **twee van de vijf
rondes rood**, elke keer dezelfde test — *"haalt een verdwenen aankondiging in bij
de volgende schakel"* in `epic7.test.ts`.

De oorzaak, en het is geen policyfout: het inhalen gebeurt in **één**
trigger-aanroep, dus beide aankondigingen komen uit dezelfde transactie. `now()`
staat binnen een transactie stil, dus ze dragen exact dezelfde `created_at` — en de
test sorteerde daarop. Een volgorde die de database nergens belooft.

De test sorteert nu op de drempel in de tekst. De twee tests ernaast toetsen de
volgorde wél, en daar mag dat: die plaatsen de schakels één voor één, dus in aparte
transacties.

Daarna: **10 rondes achter elkaar schoon, elk met een verse database.**

⚠️ **Dat is bewijs en geen zekerheid.** Tien schone runs weerleggen A47 niet voor
productie; ze laten zien dat er hier één aanwijsbare oorzaak was en dat die weg is.
Wat er wél gewonnen is: het is nu goedkoop om na te meten — vijf seconden per ronde
in plaats van minuten tegen een gedeeld project. Blijft A47 tegen productie
bestaan, dan is dat vanaf nu een verschil tussen twee omgevingen en niet langer een
mysterie.

## Wat er nog niet is

* **CI draait de suite nog niet.** Dat kan nu wél zonder secrets — het vraagt een
  Postgres-service en de PostgREST-binary in de runner. Bewust niet in dit issue
  meegenomen: dat is een wijziging aan de pijplijn en verdient een eigen ronde.
* **Realtime en Storage** draaien niet lokaal. Geen enkele RLS-test gebruikt ze;
  `realtime_bewaking()` (migratie 0027) toetst de publicatie in SQL en werkt dus
  gewoon.
