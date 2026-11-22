# Klikpakket — de issues die op Quinten wachten (22-11-2026)

> Gemaakt door de pakketsessie van week 47 (QS8-788). Dit is een **gedateerde
> momentopname** en geen stand: de stand staat in `docs/WERKVOORRAAD.md`.
>
> Gemeten op 22-11-2026 tegen `origin/main` = `97ae7169` en productie
> `wehgocadxehottiiyvsc` (alleen gelezen: `select`, `list_migrations`,
> `list_edge_functions`). Productie staat op migratie `0337`, Postgres 17.6.

## Hoe je dit leest

Per issue staat er één van drie vormen:

- **a — een keuze.** Een meerkeuzevraag; ze staan gebundeld in §4.
- **b — een klikpad.** Een dashboardhandeling, genummerd.
- **c — een lokale prompt.** Een tekst om in een lokale Claude-sessie te plakken.

Elk issue sluit af met **Bewijs dat het af is**: de meting waarmee een
statussessie het issue daarna op Done kan zetten. Geen van de issues is door
deze sessie op Done gezet.

## 0. Overzicht

| Issue | Waar het pakket staat | Vorm | Vandaag af? |
|---|---|---|---|
| QS8-126 | §1 | geen handeling vandaag; keuze in §4 | nee, en hoort nog open |
| QS8-25 stap A | §2 (samen met QS8-197) | b | nee |
| QS8-197 | §2 (samen met QS8-25) | b | nee |
| QS8-559 | §3.1 | a | het werk is af: het besluit "blijft staan" is genomen |
| QS8-780 | §3.2 | a, met prompt c | nee |
| QS8-781 | §3.3 | a | het besluit is genomen; het issue is een wachtpost |
| QS8-141, 216, 25 (rate limits) | klikpaden week 48, ronde 3 | — | toets in §5 |
| QS8-677 | klikpaden week 48, ronde 2 | — | toets in §5, **twee correcties** |
| QS8-240, 581 | klikpaden week 48, ronde 4 | — | toets in §5, **correcties** |
| QS8-124, 117 | klikpaden week 48, ronde 5 | — | toets in §5 |
| QS8-142, 143 | lopen lokaal in een sessie van week 48 | — | niet onderzocht |

⚠️ **Het bestand "klikpaden-ma-23-11 (week 48)" staat niet in de repo en is
door deze sessie niet gelezen.** De toets in §5 vergelijkt de gemeten stand met
de voorwaarden waarop zo'n klikpad rust: de reacties op het issue en wat de
orchestrator van week 48 per ronde noemde. Het is geen vergelijking met de tekst
zelf.

---

## 1. QS8-126 — De repository staat publiek en moet privé

**Stand (gemeten 22-11):**

- De repo is nog publiek: `gh api repos/QS86-bot/GoalBuddies` geeft
  `"private": false, "visibility": "public"`.
- Productie telt **2** rijen in `auth.users`: de eerste van 25-08, de laatste van 05-10.
- Er draaien nu **vier** uurlijkse workflows en niet twee, zoals het issue zegt:
  `rollover.yml` (`0 * * * *`), `notificaties.yml` (`30 * * * *`),
  `advisories.yml` (`31 * * * *`) en `uurjobs.yml` (`47 * * * *`).

**Laatste besluit in de reacties:** 22-11-2026. De tweede gebruiker is een
testaccount van Quinten. Het besluit van 22-09 blijft staan: de repo gaat privé
**op de dag dat de eerste gebruiker die niet Quinten is een account aanmaakt**.

**Vorm:** vandaag geen handeling. Op die dag volg je het klikpad hieronder. Eén
keuze moet er vóór die dag liggen: vraag 1 in §4.

**Wat Quinten doet:** vandaag niets. Dit issue blijft open en is **geen
kandidaat voor Done**.

⚠️ **Eerst de minuten.** Vier uurjobs kosten minstens 4 × 730 = **2.920
Actions-minuten per maand**, want GitHub rekent minstens één minuut per job. Een
privérepo op de gratis tier krijgt er **2.000**. Raken de minuten op, dan stoppen
de geplande workflows en draait de rollover niet meer. Dat is precies de stille
storing waar de kop van `rollover.yml` voor waarschuwt.

Klikpad voor die dag:

1. Voer eerst het besluit uit op vraag 1 in §4. Bij optie A of C laat je een
   sessie de cron-regels aanpassen en mergen vóór stap 2.
2. Op GitHub, in `QS86-bot/GoalBuddies`: **Settings** → **General** → helemaal
   onderaan **Danger Zone** → **Change repository visibility** → **Change to
   private**. Bevestig met de reponaam.
3. Open **Actions** → kies de workflow *rollover* → **Run workflow** → **Run
   workflow**. Wacht tot de run groen is. Doe hetzelfde voor *notificaties*.
4. Bekijk na een dag het verbruik onder je profiel: **Settings** → **Billing and
   licensing** → **Usage**, gefilterd op Actions.
5. Laat dezelfde dag een sessie de volledige geschiedenis afzoeken op sleutels
   (zie de reactie van 22-09). Vindt die iets, dan is **roteren** de reparatie.
   Privé zetten repareert dat niet.

**Bewijs dat het af is:**

```bash
gh api repos/QS86-bot/GoalBuddies --jq '{private,visibility}'
# verwacht: {"private":true,"visibility":"private"}
gh run list -R QS86-bot/GoalBuddies -w rollover.yml -L 3 --json conclusion,createdAt
# verwacht: de nieuwste run na het omzetten heeft "conclusion":"success"
```

De trigger zelf meet je zo: `select count(*) from auth.users;` → **3 of meer**
betekent dat de dag gekomen is.

**Aanname:**

- Dat het testaccount de enige tweede rij is. Dat heeft Quinten op 22-11 gezegd;
  het is niet gemeten.
- De namen van de Billing-schermen in GitHub zijn niet gezien.
- Wat CI per maand aan minuten kost, is niet gemeten.

---

## 2. QS8-25 stap A en QS8-197 — Google aanzetten en het officiële logo aanleveren

Dit is **één handeling voor twee issues**. Stap A van QS8-25 (Google aanzetten
plus het brandingpakket) is precies stap 1 en de merkbestanden van QS8-197. Daarom
staan ze hier één keer.

**Stand (gemeten 22-11):**

- In `auth.identities` staat alleen de provider `email`. Niemand heeft ooit via
  Google ingelogd.
- De trigger `on_auth_user_created` staat op `auth.users` en staat aan.
- `signInWithOAuth()` in `src/modules/auth/api.ts` geeft geen `redirectTo` mee.
  Na Google komt de gebruiker dus uit op de **Site URL** van Supabase.
- `app/aanmelden.tsx` heeft nog twee tekstknoppen (Apple en Google). Er staat
  nergens een merkbestand van Google in de repo.
- Op QS8-197 staat geen commit en geen tak.

**Laatste besluit in de reacties:** 22-09-2026, op QS8-25: **A, alleen Google.**
Apple komt pas weer ter sprake bij een App Store-inzending. Dat besluit vervangt
de beschrijving van QS8-197, die nog van Apple én Google uitgaat.

⚠️ **Wat daaruit volgt en nog nergens staat:** de Apple-knop blijft daarna een
knop die `auth.oauth.mislukt` geeft. De bouwronde van QS8-197 moet hem verbergen.
Dat is werk voor een sessie, niet voor Quinten.

**Vorm:** b

**Wat Quinten doet:**

⚠️ **Doe eerst stap 1 van QS8-141** (de Site URL op
`https://goalbuddies.q-projects.tech`, klikpaden week 48, ronde 3). Anders komt de
gebruiker na Google uit op een verkeerd adres.

*Deel 1 — Google Cloud (ongeveer 15 minuten)*

1. Open `https://console.cloud.google.com`. Kies bovenaan in de projectkiezer
   **New project**, noem het `GoalBuddies` en kies **Create**.
2. Ga in het menu naar **Google Auth Platform**. In een oudere console heet dat
   **APIs & Services → OAuth consent screen**.
   - **Branding:** appnaam `GoalBuddies`, je eigen adres als support-e-mail en
     als ontwikkelaarscontact, en `q-projects.tech` bij de geautoriseerde domeinen.
     Upload **geen** logo; dat kan bij Google een verificatieronde uitlokken.
   - **Audience:** kies **External**. Zet je eigen Google-adres onder **Test
     users**, of kies **Publish app** als ook anderen moeten kunnen inloggen.
   - **Data access / Scopes:** alleen de standaard (`openid`, `email`, `profile`).
3. Ga naar **Clients** → **Create client**. In een oudere console is dat
   **Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**, naam `GoalBuddies web`.
   - **Authorized JavaScript origins:** `https://goalbuddies.q-projects.tech`
   - **Authorized redirect URIs:** `https://wehgocadxehottiiyvsc.supabase.co/auth/v1/callback`
   - Kies **Create** en kopieer de **Client ID** en het **Client secret**. Plak ze
     alleen in stap 4.

*Deel 2 — Supabase (ongeveer 3 minuten)*

4. Open het Supabase Dashboard, project **goalbuddies**. Ga naar
   **Authentication** → **Sign In / Providers** → **Google** en zet **Enable**
   aan. Vul **Client IDs** en **Client Secret** in uit stap 3. Controleer dat de
   getoonde Callback URL gelijk is aan de redirect URI uit stap 3, en kies **Save**.
5. Ga naar **Authentication** → **URL Configuration** en controleer twee dingen:
   **Site URL** is `https://goalbuddies.q-projects.tech`, en **Redirect URLs**
   bevat `https://goalbuddies.q-projects.tech/**`.
6. Doe een proef. Open de app in een privévenster → **Aanmelden** → **Google** →
   log in met je testaccount. Verwacht: je komt terug in de app, ingelogd, in de
   onboarding.

*Deel 3 — Het brandingpakket (ongeveer 5 minuten)*

7. Download op `https://developers.google.com/identity/branding-guidelines` het
   officiële pakket met de knopbestanden voor **Sign in with Google**, licht én
   donker. Een cloudsessie kan die site niet bereiken; daarom moet jij dit doen.
8. Hang de zip **ongewijzigd** als bijlage aan **QS8-197** in Linear, met de zin
   *"officieel pakket, gedownload op <datum> van <URL>"*. Een sessie zet hem
   daarna in de repo en bouwt QS8-197 in één ronde: de Google-knop met het logo,
   de Apple-knop weg, en het native pad.

**Bewijs dat het af is:**

```sql
select i.provider, (p.id is not null) as heeft_profiel
from auth.identities i
left join public.profiles p on p.id = i.user_id
where i.provider = 'google';
```

Verwacht: minstens één rij met `heeft_profiel = true`. Dat is het eigenlijke
criterium, want het OAuth-pad door `handle_new_user` is nog nooit gelopen. Verder
staat er een zip-bijlage op QS8-197.

- **QS8-25 stap A** is af zodra deze query een rij geeft en de zip op QS8-197 staat.
- **QS8-197** is pas af na de bouw-PR met de merkbestanden in de repo. Dit klikpad
  maakt hem bouwbaar, niet af.

**Aanname:**

- De schermnamen in Google Cloud en in het Supabase-dashboard zijn niet gezien;
  ze wisselen per versie.
- Dat **Publish app** met alleen de standaardscopes zonder verificatie lukt, is
  kennis en geen meting.
- Of Google vandaag al aanstaat in het dashboard, is niet gemeten. `auth.identities`
  laat alleen zien dat het nooit gebruikt is.

---

## 3. De drie keuzes

### 3.1 QS8-559 — De afgeschreven wrapper `maak_straffen_verschuldigd(uuid, date)`

**Stand (gemeten 22-11):** productie heeft nog beide vormen, gemeten met
`select oid::regprocedure from pg_proc where proname='maak_straffen_verschuldigd'`:
`maak_straffen_verschuldigd(uuid)` en `maak_straffen_verschuldigd(uuid,date)`.

- `rollover` draait op **v29** (22-11, 12:29 UTC). De voorwaarde uit het issue is
  dus ingetreden.
- In de repo staat geen aanroep met twee argumenten.
- `tests/rls/de-afgeschreven-wrapper.test.ts` bestaat nog.

**Laatste besluit in de reacties:** 22-11-2026, 18:43 UTC, met QS8-783 als bron:
**"de wrapper blijft staan, geen drop."** Dat vervangt het stappenplan van 17-11.
Het issue zegt nu "mag weg" en het besluit zegt "blijft". Dat zijn twee bronnen
die elkaar tegenspreken.

**Vorm:** a. Dit is vraag 2 in §4.

**Bewijs dat het af is:**

- Optie A: de status in Linear is Canceled, en
  `select count(*) from pg_proc where proname='maak_straffen_verschuldigd'` → **2**.
- Optie C: dezelfde query → **1**, en het migratienummer staat in `list_migrations`.

**Aanname:** het gebruik van de wrapper sinds de uitrol is niet te meten
(`track_functions = none`, volgens QS8-783). Een aanroeper buiten de repo die
`service_role` gebruikt, is niet te zien.

### 3.2 QS8-780 — Lokale RLS-stack op Windows: PG16 werkend krijgen (fout 487)

**Stand (gemeten 22-11):** Backlog, zonder reacties, commit of tak.

- Wat dit issue zou blokkeren staat op Done: QS8-715, QS8-703 en QS8-704.
- CI draait de suite op `postgres:16` (`.github/workflows/ci.yml`).
- ⚠️ Productie draait **17.6**, en `scripts/pg-versie.mjs` pint major 17. Een
  lokale PG16 is dus gelijk aan CI, maar `pg-versie` noemt hem ongemeten ten
  opzichte van productie.

**Laatste besluit in de reacties:** geen.

**Vorm:** a, en bij optie A de prompt hieronder (c). Dit is vraag 3 in §4.

Prompt bij optie A (plak in een lokale Claude-sessie op Windows, Git Bash):

```text
git worktree add ../GoalBuddies-werk/qs8-780 origin/main --detach

Werk vanaf nu in ../GoalBuddies-werk/qs8-780. Dit is QS8-780. Er komt geen code
tot de oorzaak van fout 487 gemeten is. Je schrijft NIETS naar productie.

1. Lees SUPABASE_DB_URL expliciet uit <hoofdmap>/.env en druk alleen de host af,
   nooit het wachtwoord. Is de host *.supabase.co, of bevat hij de ref
   wehgocadxehottiiyvsc (eu-west-3), dan gebruik je die URL in dit hele werk
   NIET. Controleer ook dat RLS_DOEL en RLS_TEST_ALLOW_PROD niet in .env staan.
   Controleer vóór ELK commando dat iets schrijft dat de host 127.0.0.1 of
   localhost is. Is dat niet zo, stop dan.
2. npm ci in de worktree.
3. Meet de oorzaak van fout 487 en verander nog niets:
   - de PG18-logregels met "could not reserve shared memory region" en
     "error code 487", met tijdstip;
   - Get-ProcessMitigation -Name postgres.exe (ASLR);
   - Get-MpPreference | select Exclusion*, en de actieve virusscanner;
   - draaiende DLL-injectors of overlays (tasklist /m).
4. Toets per vermoedelijke oorzaak één variabele tegelijk, en meet 487 vóór en
   na. Vraag mij vóór ELKE systeemwijziging om akkoord, en zet elke wijziging
   daarna terug, tenzij ik zeg dat hij mag blijven.
5. Installeer PostgreSQL 16 naast 18 op poort 5433. Zoek de pakket-id met
   `winget search PostgreSQL` en vraag mij om akkoord voor de installatie.
   Controle: psql -h 127.0.0.1 -p 5433 -tAc "show server_version" → 16.x.
6. export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres RLS_DOEL=lokaal
   npm run rls:stack && npm run rls:lokaal ; node scripts/pg-versie.mjs
   (verwacht: pg-versie ONGEMETEN, want productie is 17 en lokaal 16).
7. Zet een reactie op QS8-780, gesplitst in "gemeten" en "aanname": de oorzaak
   van 487 met de logregel, het vóór/na-resultaat, de PG16-versie en de uitslag
   van rls:lokaal (geslaagd, gefaald, overgeslagen). Zet een korte reactie op
   QS8-715 en QS8-703. Commit en push niets.
8. Ruim op: git worktree remove ../GoalBuddies-werk/qs8-780
```

**Bewijs dat het af is:**

- `psql -h 127.0.0.1 -p 5433 -tAc "show server_version"` → `16.x`.
- `npm run rls:lokaal` → 0 gefaald, en de suite meldt zich niet als OVERGESLAGEN.
- Op QS8-780 staat een reactie die de oorzaak van 487 noemt, met de logregel en
  het vóór/na-resultaat.

**Aanname:**

- Dat `npm run rls:stack` (bash plus de PostgREST-binary) onder Git Bash op
  Windows draait. `docs/DEPLOY.md` noemt Windows niet.
- Welke van de drie vermoedelijke oorzaken het is, is niet gemeten.
- De winget-pakket-id is niet gecontroleerd.

### 3.3 QS8-781 — Juridische toets zakelijk gebruik

**Stand (gemeten 22-11):**

- Migratie 0337 (`een_organisatie_aanmaken_vraagt_toelating`) staat op productie.
- `maak_organisatie(text)` bevat de toets `niet_toegelaten`.
- `organisatie_aanmakers` en `organizations` tellen allebei **0** rijen.
- De vragenlijst voor de jurist staat op main:
  `docs/research/vragen-voor-de-jurist-organisaties-en-teamdoelen.md`.

**Laatste besluit in de reacties:** 22-11-2026, via QS8-785: **geen datum.** De
allowlist blijft leeg tot een eerste klant zich meldt; pas dan gaat de juridische
toets aan. De vraag uit de beschrijving ("wie en wanneer") is daarmee beantwoord.

**Vorm:** a. Wat overblijft is wat er met het issue gebeurt; dit is vraag 4 in §4.

**Bewijs dat het af is:** zolang het een wachtpost is:

```sql
select (select count(*) from public.organisatie_aanmakers) as aanmakers,
       (select count(*) from public.organizations) as orgs;
```

Verwacht `0 | 0`; vandaag is dat ook gemeten. Het issue sluit pas als er een
reactie staat met de uitslag van de jurist, vóórdat `aanmakers` boven 0 komt.

**Aanname:** een klant die zich buiten de app meldt, is niet te meten. De
wachtpost werkt alleen zolang niemand met de hand een rij in
`organisatie_aanmakers` zet zonder eerst dit issue te lezen.

---

## 4. De meerkeuzevragen

**Vraag 1 — QS8-126.** Bij een privérepo kosten de vier uurjobs minstens 2.920
Actions-minuten per maand, terwijl de gratis tier er 2.000 geeft. Wat doen we op
de dag dat de repo privé gaat?

- **A (aanbevolen): rollover en notificaties elke twee uur, advisories en
  uurjobs elke zes uur.** Dat is ongeveer 970 minuten plus CI, en het kost niets.
  Een nudge komt hoogstens twee uur later. Een sessie past de cron-regels aan
  vóór het omzetten.
- **B: betaalde minuten.** Er verandert niets aan de schema's, en je stelt een
  uitgavenlimiet in voor Actions. Dat kost geld; het bedrag hangt af van CI en is
  niet gemeten.
- **C: alle vier elke twee uur.** Dat is ongeveer 1.460 minuten. Er blijft
  weinig ruimte over voor CI, dus de kans is groot dat de minuten alsnog opraken.

**Vraag 2 — QS8-559.** Het besluit van 22-11 is dat de wrapper blijft staan. Wat
gebeurt er met het issue?

- **A (aanbevolen): Canceled, met verwijzing naar QS8-783.** De statussessie zet
  hem dicht. De wrapper blijft staan en de ER-rij bewaakt hem. Er komt geen
  migratie.
- **B: geparkeerd laten in Backlog.** Er verandert niets, maar het issue blijft
  "mag weg" zeggen terwijl het besluit "blijft" is.
- **C: toch droppen.** Een sessie schrijft de migratie met rollback, ruimt de
  test op en draait `security-reviewer`. Toepassen gebeurt pas na jouw "backup
  gedaan" (grens 2).

**Vraag 3 — QS8-780.** Hoe maken we de lokale RLS-stack op Windows rond?

- **A (aanbevolen): eerst de oorzaak van 487 meten, dan PG16 naast PG18 op
  poort 5433.** Je volgt de prompt in §3.2 en haalt de criteria zoals ze er staan,
  op dezelfde major als CI.
- **B: hetzelfde, maar met PG17.** De versie is dan gelijk aan productie en
  `pg-versie` wordt groen, maar je wijkt af van CI en van het criterium.
- **C: WSL2 met `postgresql-16` uit apt.** Fout 487 wordt omzeild, en het
  criterium "oorzaak benoemd en gemeten" vervalt.
- **D: Canceled.** Alles wat 780 zou blokkeren is af, en CI meet de suite al op
  elke PR.

**Vraag 4 — QS8-781.** De datum voor de jurist is losgelaten. Wat gebeurt er met
het issue?

- **A (aanbevolen): open laten in Backlog als wachtpost.** Het issue blijft de
  herinnering "vóór de eerste rij in `organisatie_aanmakers` eerst de jurist". Het
  kost niets.
- **B: op Done zetten.** De herinnering staat dan alleen nog in de kop van 0337
  en in de reactie.
- **C: op Canceled zetten.** Dat leest als "de toets vervalt", en dat klopt niet
  met besluit 33.

---

## 5. Toets van de klikpaden van week 48

Per issue: de gemeten stand, of het klikpad volgens die stand nog klopt, en het
bewijs dat het af is.

### QS8-141 — Auth-URL's, leaked-password protection en een uitgavenplafond (ronde 3)

**Stand:** Todo. Het zijn drie dashboardinstellingen en geen ervan is via SQL of
MCP te lezen.

**Klopt nog: ja**, mits ronde 3 vier dingen doet:

- stap 1 (de Site URL) als eerste, want die blokkeert ook de Google-login uit §2;
- het plafond van $20 per maand toepassen (besluit 22-09);
- `password_min_length` op 8 zetten (QS8-216);
- weten dat de adviseur van 18-11 die de schakelaar niet meer meldde, **geen**
  bewijs is dat hij aanstaat.

**Bewijs:**

- `npm run auth:urls` met `SUPABASE_ACCESS_TOKEN` → "Staat al goed".
- `npm run wachtwoord:controle` → gemeten groen, niet OVERGESLAGEN.
- Een zin of een schermafdruk van het plafond bij Anthropic op het issue.

### QS8-216 — Het wachtwoordminimum van twaalf naar acht (ronde 3)

**Stand:** de code is af. `WACHTWOORD_MINIMUM = 8` staat in
`src/modules/auth/schemas.ts`. Open is alleen `password_min_length` in het
dashboard, volgens de reacties nog op 6; dat is niet gemeten.

**Klopt nog: ja.** Het is hetzelfde scherm als stap 2 van QS8-141, en 216 sluit
pas als ook leaked-password protection aanstaat.

**Bewijs:** `npm run wachtwoord:controle` → gemeten groen. Een registratie met
zeven tekens wordt geweigerd, en de melding noemt 8.

### QS8-25 — De rate limits aflezen (ronde 3)

**Klopt nog: ja.** Ze staan onder **Authentication → Rate Limits** en zijn niet
via SQL of MCP te lezen.

**Bewijs:** de afgelezen waarden staan als reactie op QS8-25. Stap A staat in §2.

### QS8-677 — Het planpad en drie productiemetingen (ronde 2)

**Stand:** geen van de drie criteria is gehaald.

- ⚠️ **Er is vandaag rond 12:30 UTC opnieuw gedeployd:** `doelcoach` v22,
  `notificaties` v24 en `rollover` v29. Het issue gaat nog uit van v21/v21/v24.
- `ai_jobs` telt 2 rijen, allebei van vóór de deploy.
- ⚠️ De job die vastzat, `7674e871…`, **bestaat niet meer**. Wie of wat hem
  weghaalde, is niet gemeten.

**Klopt nog: ja, met twee correcties.**

1. De meetgrens moet **2026-11-22 12:30 UTC** worden en niet 09-11. Anders telt
   een job mee die door de oude versie geboekt is.
2. De stap "wat is er met job 7674e871 gebeurd" vervalt.

**Bewijs:**

```sql
select kind, status, input_tokens, output_tokens, cost_cents,
       round((input_tokens/1e6*200 + output_tokens/1e6*1000)::numeric, 4) as verwacht
from ai_jobs where created_at > '2026-11-22T12:30:00Z' order by created_at;
```

Verwacht: minstens één rij met `kind='plan'` en `status='done'`, waarin
`cost_cents = verwacht`. Daarnaast een rij in `notifications_sent` voor het
getuige-account nadat het commitment `due` werd, `npm run uurjobs:controle` groen,
en een reactie op het issue met het doorlopen planpad.

**Aanname:** of v22 gelijk is aan de repo-versie, is niet nagerekend
(`npm run edge:gedeployd` niet gedraaid).

### QS8-240 — Twee oude branches opruimen (ronde 4)

**Stand:** gemeten na `git fetch --prune --unshallow`. Beide takken bestaan nog.

- `quintenstrijdonk/qs8-122-…` heeft **0** eigen bestanden.
- `wip/werkboom-26-08` heeft precies de **6** bestanden uit het issue. Weg mag dus.
- Er staan nu **137** remote takken naast `main`.

**Klopt nog: ja, maar onvolledig.**

- Alle 28 takken uit de reactie van 22-11 zitten volledig in `main` (28 van de 28,
  gemeten met `git merge-base --is-ancestor`).
- Volledig in `main` zitten nu **49** takken, dus 21 meer dan de lijst. Waarschijnlijk
  telde de lijst op een ondiepe kloon. Ze erbij nemen kost niets; of dat gebeurt,
  is aan de orchestrator.
- ⚠️ **`fundering-16-08` is wél een voorouder van `main`** (merge `fd705066`). De
  zin in het issue *"géén gemeenschappelijke voorouder"* is dus onwaar. De afspraak
  om hem te laten staan blijft, maar de reden klopt niet meer.

**Bewijs:**

```bash
git fetch --prune origin
git branch -r | grep -cE "qs8-122-het-migratieregister|wip/werkboom-26-08"
# verwacht: 0
```

### QS8-581 — De `copy`-route en de trigger (ronde 4)

**Stand:** de meting is niet gedaan. `storage.objects` telt 0 rijen, en er staan
8 eigen triggers op, plus de 2 van Supabase.

**Klopt nog: nee, als ronde 4 het curl-recept van 22-09 volgt.** Twee redenen:

1. Dat recept uploadt `text/plain` naar `chatdocs`, maar die emmer laat alleen
   `application/pdf` toe. De upload wordt geweigerd voordat er iets te kopiëren valt.
2. Een rij achteraf lezen kan "gevuld bij de INSERT" niet onderscheiden van
   "na de INSERT bijgewerkt", en dat is precies de vraag.

Wat wel werkt: een tijdelijke BEFORE INSERT-trigger op `storage.objects` die
`NEW.metadata` logt, met een geldig bestandstype voor beide emmers (bijvoorbeeld
een kleine png van `bewijsfotos` naar `chatfotos`) en een pad in de mapvorm die de
aantal-triggers verwachten. Ruim de trigger daarna op. Gebruikt ronde 4 dat al,
dan klopt hij.

**Bewijs:**

- De gelogde `size` en `mimetype` bij de INSERT staan, met datum, in
  `docs/decisions/2026-09-21-de-copy-route-blijft-open-en-dat-is-besloten.md`.
- Na het opruimen:
  `select count(*) from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal;`
  → **10**.

### QS8-124 — De service worker registreren (ronde 5)

**Stand:** de code is af en `notificaties` is ACTIVE op v24. Open is alleen het
bewijs: `push_tokens` en `notifications_sent` tellen allebei **0** rijen.

**Klopt nog: ja.** Voeg vooraf een controle van de VAPID-secrets toe: 0 tokens
zegt niets over of de sleutels er staan, en QS8-690 liet open of de fout
"decoding private key" van het abonnement komt of van de sleutel. Opnieuw
genereren kan vandaag zonder schade, want er zijn 0 tokens.

**Bewijs:**

```sql
select platform, p256dh is not null as heeft_p256dh, auth is not null as heeft_auth
from public.push_tokens;
select count(*) from public.notifications_sent;
```

Verwacht: minstens één rij `web` met twee keer `true`, en een telling van minstens 1.
Daarnaast meldt Quinten dat de melding op zijn scherm verscheen.

### QS8-117 — iOS-push via de installeerbare PWA (ronde 5)

**Stand:** de code-criteria zijn af. Open is alleen "één echte melding op een
iPhone", en daar is een fysiek toestel voor nodig. `push_tokens` telt 0 rijen.

**Klopt nog: ja.** De volgorde 124 → iPhone → melding is ongewijzigd.

**Bewijs:** `select count(*) from push_tokens where platform='web';` → minstens 1.
Daarnaast een schermafdruk van de melding op het vergrendelscherm van de iPhone,
en een schermafdruk van de app zonder Safari-balk, als reactie op QS8-117.

---

## 6. Wat deze sessie niet gemeten heeft

- De tekst van de klikpaden van week 48 (zie §0).
- Elke dashboardinstelling in Supabase, Google Cloud, GitHub Billing en Anthropic.
  Geen daarvan is via SQL of MCP te lezen.
- De secrets op de Edge Functions (VAPID) en of de gedeployde bundels gelijk zijn
  aan de repo.
- Het aantal Actions-minuten dat CI per maand kost.
