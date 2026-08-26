# Deploy en databasewerk

> Twee dingen staan in dit bestand: hoe je de app uitrolt, en hoe je veilig aan
> de database komt. Houd het actueel tíjdens het bouwen. Straks is dit ook de
> migratiehandleiding naar Vercel.

## Huidige omgeving

| | |
|---|---|
| Hosting | Hostinger, account `u349450154`, `public_html/goalbuddies` |
| Doeladres | **`goalbuddies.q-projects.tech` — live sinds 21-08-2026** (QS8-99) |
| Database | Supabase `goalbuddies`, ref `wehgocadxehottiiyvsc`, `eu-west-3`, **gratis tier** |
| Build | Expo web-export: statische bestanden, geen Node-server |

---

## 1. Environment variables

`.env` staat in `.gitignore` en komt dus nooit uit de repo. Kopieer
`.env.example` en vul aan.

| Naam | Waarvoor | Waar | Nodig vanaf |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase-endpoint | **client** (publiek) | nu |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Publieke key; draait volledig onder RLS | **client** (publiek) | nu |
| `EXPO_PUBLIC_SENTRY_DSN` | Foutrapportage | **client** (publiek) | QS8-24 |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Omzeilt RLS. Edge Functions en de RLS-testsuite | **server** | nu |
| `SUPABASE_DB_URL` | Directe verbinding, voor `pg_dump` | **server** | elke migratie |
| `ANTHROPIC_API_KEY` | De Doelcoach | **server** | EPIC 3 |
| `SENTRY_DSN` | Foutrapportage vanuit de Edge Functions | **server** | QS8-24 |

⚠️ **Alles met `EXPO_PUBLIC_` ervoor zit in de bundle die de browser downloadt.**
Dat is geen instelling maar een eigenschap van Expo. Een secret dat daar per
ongeluk terechtkomt, is publiek vanaf de eerste deploy — ook als je hem daarna
weghaalt, want de bundle staat dan al in caches.

De validatie staat in `src/lib/env.ts`: een ontbrekende variabele faalt bij het
opstarten, niet halverwege een gebruikersactie.

---

## 2. Databasewerk

### 2.1 De regel

**Elke migratie begint met een dump.** De gratis tier heeft geen automatische
backups; er is geen knop om op terug te vallen.

```bash
npm run db:dump
```

Het script weigert door te gaan bij een ontbrekende `SUPABASE_DB_URL`, een
ontbrekende `pg_dump`, of een dump die verdacht klein is. Een half bestand is
gevaarlijker dan geen bestand, want daar vertrouw je op.

### 2.2 Een migratie toepassen — QS8-122

**Er is één nummering en die staat in de bestandsnaam.** `0072_naam.sql` in de
repo hoort één op één bij versie `0072` in `supabase_migrations.schema_migrations`
op het project. Loopt dat uiteen, dan kan de map het schema nergens anders
opbouwen — en dan toetst een RLS-suite daar een ánder schema dan productie.

⚠️ **De MCP-tool kiest zelf een tijdstempel als versie, ongeacht hoe je het
bestand noemt.** Dat is de bron van de drift die dit issue kwam opruimen, en het
is geen instelling die je uit kunt zetten. Vandaar de derde stap hieronder.

Een migratie toepassen gaat zo:

1. **Schrijf het bestand** als `NNNN_korte_naam.sql`, met het volgende vrije
   nummer. `npm run migraties:controle` zegt of de nummering klopt.
2. **Speel hem eerst lokaal af** op een lege database. Dat kost een minuut en
   het is de enige manier om te merken dat een migratie niet op zichzelf staat:

   ```bash
   scripts/schema-opbouwen.sh
   ```

3. **Pas hem toe** (MCP `apply_migration`, of `npm run db:push`) en **trek het
   register meteen daarna gelijk**:

   ```bash
   npm run register:uitlijnen
   ```

   Dat zoekt elke registerrij met een tijdstempel op, koppelt hem op **naam** aan
   het bestand in de repo, en zet de versie op het nummer van dat bestand. Daarna
   meet hij zelf na; blijft er iets staan, dan eindigt hij rood.

4. **Controleer**:

   ```bash
   npm run register:controle   # repo en project zeggen hetzelfde
   npm run types:db            # databasetypes hergenereren — niet vergeten
   ```

⚠️ **Hier stond tot 24-08-2026 dat stap 3 een UPDATE met de hand was**, met als
geruststelling dat stap 4 het wel zou opmerken. Dat klopte, en het hielp niet:
diezelfde dag zijn er zes migraties toegepast zonder die UPDATE, terwijl deze
alinea er al stond. De controle wérd rood — alleen wordt de reparatie die een
rode controle voorschrijft net zo goed vergeten als de stap zelf.

**Een handeling die je bij élke migratie moet onthouden en die niets zichtbaars
kapotmaakt als je hem overslaat, hoort een commando te zijn en geen zin.**
Dezelfde les als bij regel 20 en de emoji-regel.

⚠️ **Uitlijnen repareert nooit een ontbrekend bestand.** Staat er iets op het
project waar geen `.sql` van bestaat — dat waren `0036`/`0037` en later `0057`
t/m `0061` — dan waarschuwt het script en laat het de rij met rust. Een nummer
verzinnen zou het register netjes maken en het gat onzichtbaar, en dat is precies
de verkeerde kant op: het bestand moet terug.

⚠️ **Een rij die al een nummer draagt wordt nooit aangeraakt**, ook niet als het
bestand inmiddels anders heet. Dat is geschiedenis die klopt; die herschrijven op
grond van een hernoemd bestand maakt het register onbetrouwbaar zonder dat het
opvalt. Migratie 0081 weigert het, en `tests/scripts/migratieregister-plan.test.ts`
breekt dat slot met de hand om te bewijzen dat het er is.

### 2.2a Het schema elders opbouwen

Dit is de proef onder alles hierboven: bouwen de bestanden hetzelfde schema als
productie?

```bash
scripts/schema-opbouwen.sh                       # lege database, alle migraties
psql -d goalbuddies_opbouw -f scripts/schema-vingerafdruk.sql
```

Draai diezelfde vingerafdrukquery op het echte project en vergelijk de negen
regels. Op 24-08-2026 waren ze alle negen gelijk: 255 kolommen, 155 constraints,
86 indexen, 65 policies, 87 functies, 31 triggers, 3395 rechten, 3
publicatieleden en 29 tabellen met RLS.

⚠️ Het vraagt een Postgres 16 waarop je superuser bent, en **niet** de Supabase
CLI of Docker. `supabase/shim/0000_supabase_shim.sql` zet neer wat een
Supabase-project vóór de eerste migratie al heeft: de rollen, `auth.uid()`,
`auth.users`, de realtime-publicatie — en de standaardrechten op `public`, die
de belangrijkste regel van dat bestand zijn. Zonder die laatste bouwt een lege
database een schema op dat *strenger* is dan productie, en dan bevestigt een
RLS-test iets wat daar niet waar is.

### 2.2b Met de Supabase CLI

```bash
npm run db:push        # dump eerst, dan supabase db push
npm run types:db       # databasetypes hergenereren — niet vergeten
```

Beide vragen de Supabase CLI. Die staat sinds 18-08-2026 op deze machine:
via scoop, v2.115.0, shim in `%USERPROFILE%\scoop\shims`. Installeren gaat met
`scoop install supabase`; `npm i -g supabase` werkt niet, dat blokkeert Supabase
zelf. Na een verse installatie moet je een nieuw terminalvenster openen — een
draaiende shell leest `PATH` niet opnieuw in, en dat is precies de fout die
eruitziet alsof de installatie mislukt is.

⚠️ **`CLAUDE.md`: nooit een migratie draaien op iets anders dan lokaal zonder
overleg.** Zolang er geen lokale stack is, is elke migratie een handeling op de
echte database van het echte project.

### 2.3 Wat een migratie moet hebben

Uit `CLAUDE.md`, procesregel 20 — elk bestand in `supabase/migrations/`:

1. **Idempotent.** `create table if not exists`, `create or replace`,
   `drop policy if exists` vóór `create policy`. Twee keer draaien mag niets
   kapotmaken.
2. **Rollback-pad in de kop**, als commentaar. Niet "dat verzin ik dan wel";
   op het moment dat je hem nodig hebt, heb je geen tijd om te verzinnen.
3. **Dump vooraf** zodra er data in staat.

### 2.4 Volgorde van de bestaande migraties

| Bestand | Wat | Toegepast |
|---|---|---|
| `0001_schema.sql` | 23 tabellen, constraints, indexen | ja |
| `0002_functions_triggers.sql` | RLS-hulpfuncties, `join_group_with_code`, triggers | ja |
| `0003_rls.sql` | 48 policies | ja |
| `0004_harden_functions.sql` | `search_path` vastgezet op de functies | ja |
| `0005_fix_group_visible_streaks.sql` | Repareert de gedeelde reeks | ja, 16-08 |
| `0006_close_rls_gaps.sql` | Vijf RLS-gaten uit de security-review | ja, 16-08 |
| `0007_weekly_goals_points_bounded.sql` | Bovengrens op het puntenmodel | ja, 16-08 |
| `0008_join_group_rate_limit.sql` | 20 join-pogingen per dag; moderatie-bypass weg | ja, 16-08 |
| `0009_create_group_rpc.sql` | `create_group` — groep aanmaken kán weer | ja, 16-08 |
| `0010_chat_message_immutable_fields.sql` | Bericht hoort bij zijn gesprek | ja, 16-08 |

### 2.5 De RLS-tests

**Draai ze lokaal. Dat is sinds QS8-119 de standaard.**

```bash
npm run rls:stack      # schema opbouwen + PostgREST starten
npm run rls:lokaal     # de suite ertegenaan — ongeveer vijf seconden
npm run rls:stack:stop
```

Geen credentials, geen netwerk, en het echte project wordt niet aangeraakt. De
suite praat tegen een **echte PostgREST** op een database die uit
`supabase/migrations/` is opgebouwd — aantoonbaar hetzelfde schema als productie
(§2.2a).

#### Wat je lokaal niet toetst

Het platform. Er draait geen GoTrue, dus er is geen bewijs dat een echte sessie de
claims draagt die de policies verwachten. Eén test in `token.test.ts` doet die
vergelijking en slaat zichzelf lokaal over.

⚠️ **Draai vóór een merge die auth, RLS, goedkeuring of commitments raakt dus
beide** — lokaal voor het snelle bewijs, productie voor de bevestiging:

```bash
npm test                        # slaat de RLS-suite over zonder .env
npx vitest run tests/rls        # tegen productie, mét .env
```

Tegen productie maakt de suite echte gebruikers aan en ruimt ze op met de
service-role-key. Daar staat een slot op (`RLS_TEST_ALLOW_PROD=1` in `.env`) en
dat blijft staan: er is nog één goede reden om er te draaien, en zolang die
bestaat kan de héle suite er per ongeluk heen.

#### In CI

**Ze draaien sinds 24-08 in CI**, in een eigen job (`rls` in `.github/workflows/ci.yml`)
met een `postgres:16`-service en de PostgREST-binary. **Geen secrets**, en dat hoort
zo te blijven: komt er ooit een `secrets.` in die job, dan draait CI weer tegen
iets echts en is de reden daarvoor het opschrijven waard.

De binary is vastgepind op versie én sha256. Een binary die in CI draait haal je
niet blind uit een release.

⚠️ Wat er **niet** in CI draait is de variant tegen productie. `SUPABASE_SERVICE_ROLE_KEY`
omzeilt RLS en hoort niet in een runner die op elke push van elke branch draait.

### 2.6 De lokale opstelling — wat er precies draait

Twee processen, allebei de échte software:

1. **Postgres 16**, met het schema uit `scripts/schema-opbouwen.sh`.
2. **PostgREST**, de binary van
   [github.com/PostgREST/postgrest/releases](https://github.com/PostgREST/postgrest/releases).
   Zet hem in `$TMPDIR/goalbuddies-lokale-stack/` of wijs hem aan met
   `POSTGREST_BIN`.

⚠️ **Geen** `supabase start`**, en dat is een omstandigheid en geen principe.**
Die haalt de volledige stack binnen (Postgres, PostgREST, GoTrue, Realtime,
Storage, Studio, een mailserver) en is de betere keus als hij het doet — meer
platform voor minder eigen gedoe. Op de machine waar dit gebouwd is, kon het niet:
Docker Hub was achter de proxy niet bereikbaar. Werkt `supabase start` bij jou wel,
gebruik dat dan en wijs `RLS_LOKAAL_URL` naar de API van die stack.

⚠️ `supabase/shim/0000_supabase_shim.sql` vult aan wat het platform normaal
meebrengt: de rollen, `auth.uid()`, `auth.users`, de realtime-publicatie, de
standaardrechten, en twee functies die de rol van GoTrue overnemen bij het
aanmaken en verwijderen van een testgebruiker.

**Die twee functies horen nooit op productie.** `supabase/shim/` zit niet in
`supabase/migrations/`, dus `db push` neemt ze niet mee — en
`tests/scripts/steiger.test.ts` wordt rood zodra een migratiebestand `shim_`
noemt.

---

## 2.7 Verbindingen en pooling

**`max_connections` staat op 60**, nagemeten op 24-08-2026. Dat is voor de héle
database: PostgREST, de Auth-server, de realtime-server, `pg_dump` en alles wat
Supabase zelf draait, delen dat budget. Het is geen instelling van de gratis tier
die je kunt ophogen zonder te betalen.

### Wie er vandaag verbindingen opent

| Wie | Hoe | Verbindingen |
|---|---|---|
| De app (web en native) | `supabase-js` → PostgREST over HTTPS | **geen** — PostgREST houdt zijn eigen pool |
| De Edge Functions | idem, met de service-role-key | **geen** |
| `npm run db:dump` | `pg_dump` op `SUPABASE_DB_URL` | één, kortdurend |
| `scripts/lokale-stack.sh` | een lokale database die het script zelf maakt | raakt productie niet |

⚠️ **Er zit geen Postgres-driver in `package.json`**, en dat is de eigenlijke
reden dat "connection pooling vanaf dag één" (CLAUDE.md, gratis tier) vandaag
klopt. Niet een instelling, maar de afwezigheid van iets dat een socket kan
openen. `npm run verbindingen:controle` houdt dat vast en draait mee in `/audit`.

### De dag dat dit verandert

`CLAUDE.md` schrijft die dag zelf voor: *"Server-side code als gewone
langdraaiende Node-server"* op Hostinger. Zodra zo'n proces er is en het praat
rechtstreeks met Postgres, gelden drie dingen:

1. **De transactiepooler, poort 6543** — niet de directe poort 5432. De directe
   poort is voor `pg_dump` en voor migraties; een langdraaiend proces dat daar
   een pool van tien op zet, gebruikt een zesde van het hele budget.
2. **`prepare: false`** (of `statement_cache_size: 0`, afhankelijk van de
   driver). Supavisor draait in transactiemodus, en daarin overleeft een
   prepared statement de transactie niet — de tweede aanroep faalt dan met
   *"prepared statement already exists"*. Dat is een fout die pas onder belasting
   verschijnt.
3. **Een kleine pool.** Twee tot vijf verbindingen per proces. Meer helpt niet:
   de pooler multiplext ze toch, en het budget is gedeeld.

⚠️ **De pooler is géén oplossing voor de app zelf.** Die praat met PostgREST en
hoort dat te blijven doen — dat is waar RLS wordt toegepast. Een Node-server die
rechtstreeks op de database zit, draait als de databasegebruiker en heeft dus
geen RLS boven zich; alles wat daar binnenkomt, moet zijn eigen autorisatie
dragen. Dat is een andere afweging dan pooling en hij weegt zwaarder.

---

## 2.8 Wat kost de Doelcoach?

QS8-42, laatste acceptatiecriterium. Elke AI-call wordt geboekt in `ai_jobs`
met model, tokens en kosten; dit is de plek waar je het optelt.

```sql
select * from ai_kosten_per_week(8);
```

Geeft per week: aantal jobs, aantal unieke gebruikers, in- en uitvoertokens en
de kosten in centen. Draai hem als `service_role` — in de SQL-editor van
Supabase, of via de MCP-tool.

⚠️ **Bewust niet aanroepbaar door een ingelogde gebruiker.** Dit gaat over alle
gebruikers samen, want het is één rekening bij Anthropic. Het totaal zou een
gebruiker vertellen hoeveel andere mensen de coach gebruiken.

⚠️ Het dagplafond per gebruiker staat in `ai_dag_limiet()` en **alleen daar**.
`vraag_ai_job()` en `ai_verbruik()` lezen het allebei op. Wil je het verhogen,
dan is dat één regel SQL en geen release:

```sql
create or replace function public.ai_dag_limiet()
returns integer language sql immutable set search_path to 'public', 'pg_temp'
as $$ select 20; $$;
```

Tot migratie 0056 stond dat getal op twee plekken — zie de kop van die migratie
voor waarom dat een probleem was.

### Een indicatie van de kosten

Eén generatie van twaalf mijlpalen kostte op 21-08-2026 ongeveer **1,3 cent**
(704 invoertokens, 1149 uitvoertokens, `claude-sonnet-5`). Met het plafond van
tien per gebruiker per dag is de bovengrens dus ruwweg dertien cent per
gebruiker per dag — maar in de praktijk gebruikt niemand zijn plafond, en de
cache vangt herhaalde vragen af.

---

## 3. Build en uitrollen

**Eén commando** — QS8-100:

```bash
npm run deploy
```

Dat doet, in deze volgorde: env controleren, bouwen, de `.htaccess` schrijven,
**de bundel op geheimen scannen**, inpakken, uploaden en live zetten op
`goalbuddies.q-projects.tech`.

Alleen kijken wat er zóu vertrekken, zonder iets live te zetten:

```bash
npm run deploy:droog
```

### Wat je eenmalig nodig hebt

`HOSTINGER_API_TOKEN` in `.env`. Maak er een in hpanel → Account → API.

⚠️ **Dit token hoort nóóit in de bundel.** Het begint niet met `EXPO_PUBLIC_`,
dus de scan hieronder slaat erop aan zodra het er ooit in belandt.

### ⚠️ De secret-scan is de belangrijkste stap, en hij staat vóór de upload

Een statische webbundel is publiek: alles wat erin zit, kan iedereen lezen. Expo
neemt uitsluitend `EXPO_PUBLIC_*` mee, maar dat is een belofte van de bundler en
geen controle. Het script leest `.env`, pakt élke variabele die níét met
`EXPO_PUBLIC_` begint, en zoekt zijn wáárde terug in de gebouwde bestanden — niet
de naam, want een bundler die iets inlijnt zet de sleutel erin en niet de
variabelenaam.

Vindt hij er één, dan stopt de deploy en gaat er niets naar buiten.

**Deze controle is aantoonbaar werkend**: er is een keer met opzet een
service-role-key in `dist/` gezet, en de deploy sloeg af met de melding waar hij
stond. Een controle die nog nooit rood is geweest, is een aanname.

Gaat hij af, dan is de sleutel **gelekt** zodra hij in een build heeft gezeten —
ook als je hem een minuut later weghaalt. Ververs hem.

### Diepe links: de `.htaccess` wordt gegenereerd

⚠️ `expo export` met `output: "static"` schrijft een dynamische route weg als een
bestand mét de haakjes in de naam: `groep/[id].html`. Apache zoekt bij
`/groep/abc-123` naar een bestand dat zo heet en vindt niets. **Zonder rewrite
geeft élke uitnodigingslink een 404** (QS8-59).

Het script leidt de regels af uit wat er écht in `dist/` staat en schrijft ze in
`dist/.htaccess`. Een route erbij betekent dus alleen opnieuw deployen; een
handgeschreven lijst zou stilletjes achterlopen en dat merk je pas als iemand een
link deelt die niet werkt.

⚠️ **Bewerk `dist/.htaccess` niet met de hand** — hij wordt bij elke deploy
overschreven.

⚠️ Er is géén pad-voorvoegsel meer. Het subdomein heeft een eigen documentroot
(`public_html/goalbuddies`), dus de app staat in de root van dat adres. De oude
versie van dit document ging uit van `/goalbuddies/` als voorvoegsel; dat klopte
niet en zou elke absolute asset-verwijzing gebroken hebben.

Geverifieerd na de eerste deploy, alle vier `200`:

| Pad | Wat het bewijst |
|---|---|
| `/` | de app zelf |
| `/aanmelden` | een statische route zonder parameter |
| `/groep/<uuid>` | een dynamische route — zou zonder rewrite 404 geven |
| `/uitnodiging/ABC123` | de uitnodigingslink uit QS8-59 |

### Rollback

De vorige versie terugzetten is dezelfde weg met een oudere bundel:

```bash
git checkout <vorige-commit>
npm ci
npm run deploy
```

⚠️ **Er is geen versiegeschiedenis op de host.** `static-deploy` overschrijft de
map; Hostinger bewaart geen vorige uitrol. De repo ís het rollback-pad, en dat
werkt alleen als wat je deployt ook gecommit is. Deploy daarom nooit vanuit een
vuile werkboom.

### Supabase Auth: de URL's — QS8-99

✅ **Gezet op 25-08-2026.** Dit hoeft niet met de hand:

```bash
npm run auth:urls       # laat zien wat er nu staat, wijzigt niets
npm run auth:urls:zet   # zet het goed en leest het terug
```

Wat er staat:

| | |
|---|---|
| **Site URL** | `https://goalbuddies.q-projects.tech` |
| **Redirect URLs** | `https://goalbuddies.q-projects.tech/**`, `http://localhost:8081/**`, `goalbuddies://**` |

⚠️ **Hier stond tot 25-08-2026 dat dit niet via een API of de CLI kon en een
dashboardhandeling was.** Dat gold toen het opgeschreven werd en niet meer sinds
`scripts/auth-urls.mjs` bestaat — en dat is precies de vorm die dit project vaker
gekost heeft: een document dat je naar de handmatige weg stuurt terwijl er een
vastgelegde is. De Site URL bepaalt waar de bevestigingslink in élke aanmeldmail
heen wijst; die hoort niet van een muisklik af te hangen die niemand kan nalezen.

⚠️ **Dit vraagt een personal access token en niet de service-role-key.** De
Management API is een ander systeem dan je project. Maak er een op
<https://supabase.com/dashboard/account/tokens> en zet hem in `.env` als
`SUPABASE_ACCESS_TOKEN`. Die token geeft toegang tot je hele Supabase-account:
nooit in de client, nooit in een commit. `.gitignore` vangt `.env` en `.env.*` af,
en `scanOpGeheimen()` in `scripts/deploy-web.mjs` slaat aan als hij ooit in de
bundel belandt.

⚠️ **Een vierde adres hoort in het script en niet in het dashboard.** Het script
doet een PATCH met de héle `uri_allow_list`, dus wat je in het dashboard toevoegt
is weg zodra `--zet` opnieuw draait — en je ziet dat niet gebeuren, want het
script vergelijkt de uitkomst met zíjn eigen lijst en die klopt dan gewoon. Zet
een nieuw adres dus bij `REDIRECTS` in `scripts/auth-urls.mjs`, met de reden
erbij.

⚠️ **Wat er kapot was zolang dit niet stond:** de bevestigingslink in een
aanmeldmail wees naar het oude adres. De app gebruikt `signUp` met
e-mailbevestiging, dus dat raakte élke nieuwe gebruiker. OAuth breekt er ook op,
maar dat staat sowieso stil op QS8-25.

⚠️ Het script leest terug na het schrijven en vergelijkt, in plaats van op HTTP
200 te vertrouwen: de API accepteert een veld dat hij niet kent zonder te klagen.
Je bent klaar als er "Goed gezet en teruggelezen" staat.

### Push-notificaties: wat waar hoort

`expo-notifications` staat sinds 21-08-2026 in `package.json` en is ingeplugd via
één `zetPushBron(expoPush)` in `app/_layout.tsx`.

⚠️ **Er wordt vandaag nog niets bezorgd**, en dat heeft twee losse oorzaken:

| Platform | Wat ontbreekt | Waar het hoort |
|---|---|---|
| **native** (iOS/Android) | Een EAS-project met FCM- en APNs-sleutels | In de **build**, niet op de server. Zonder `projectId` geeft Expo geen token uit; `expo-bron.ts` stopt daar met een begrijpelijke reden in het logboek |
| **web** | Een VAPID-sleutelpaar in `.env` | QS8-114/QS8-124. De service worker en het manifest stáán (zie hieronder); wat ontbreekt is de sleutel. **Dit is vandaag de belangrijkste**, want de app draait alleen op het web |

⚠️ **Tot 25-08-2026 stond hier dat de Edge Function hier níéts voor nodig heeft.
Dat klopte alleen omdat het verzendpad voor web nooit gebouwd was.** De functie
kende één bestemming — de Expo-push-API — en een webabonnement is een
endpoint-URL van de browserleverancier; daar kan Expo niets mee. `webpush-crypto.ts`
stond compleet en getoetst in `_shared/notificaties/` en werd door geen enkel
bestand geïmporteerd.

Sinds 25-08 splitst `stuur()` op platform. Voor **native** verandert er niets: het
token ís het adres en Apple- en Google-sleutels zitten in de build. Voor **web**
heeft de Edge Function het VAPID-sleutelpaar in zijn eigen omgeving nodig:

| Variabele | Waar |
|---|---|
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | in de bundel **en** in de Edge Function-omgeving |
| `VAPID_PRIVATE_KEY` | **alleen** in de Edge Function-omgeving — nooit in `.env` van de webbuild |
| `VAPID_SUBJECT` | idem; een `mailto:`- of `https:`-adres |

Zet ze met `npx supabase secrets set` op het project, niet in de repo. Ontbreken
ze, dan gaan native meldingen gewoon door en worden web-abonnementen overgeslagen
met een regel in het log — geen storing, wel stilte.

⚠️ Een abonnement dat 404 of 410 geeft, wordt uit `push_tokens` verwijderd (RFC
8030 §7: de gebruiker heeft de toestemming ingetrokken). Elke andere fout laat de
rij staan; een storing van dit moment mag geen dataverlies worden.

### ⚠️ Controleer dat er draait wat je denkt — QS8-24, 26-08-2026

```bash
npm run edge:gedeployd
```

Haalt de gedeployde bundel van elke Edge Function op en legt de modulelijst
naast wat de repo er transitief in zou stoppen. Vraagt `SUPABASE_ACCESS_TOKEN`
in `.env` — de personal access token van de Management API, niet de
service-role-key.

**Waarom dit er is.** Op 26-08-2026 bleek dat alle drie de functies gedeployd
waren vanuit een lokale werkmap. De gedeployde `notificaties` importeerde
`_shared/sentry/index.ts`, een module die op `main` niet bestond en op geen
enkele remote branch stond. Er draaide dus productiecode die niemand kon
uitchecken — en die de schoonmaaklaag miste waar QS8-24 criterium 3 om draait:
`fout.message` en `fout.stack` gingen ongeschoond naar Sentry, met in het
commentaar precies de aanname die op 24-08 al onjuist bleek.

Datzelfde deployde bovendien een `notificaties` van vóór het web-push-werk van
25-08: één bestemming, en `p256dh` en `auth` werden niet uitgelezen. Een
VAPID-sleutelpaar kan daar niets mee.

⚠️ **Deployen doe je vanaf een gecommitte tak, nooit vanaf een werkboom.** Dat
was hier de eigenlijke fout, en hij is niet zichtbaar zolang er niets misgaat.

⚠️ **Wat de controle níét ziet:** dezelfde bestandsnamen met andere inhoud. De
bundel is een ESZip en de inhoud is er niet betrouwbaar uit te lezen zonder een
parser die zelf onder test zou moeten staan. Hij vindt een andere bóóm, niet een
andere regel. Wil je dat laatste ook, dan is een herkomststempel in de deploy —
het commit-id dat `edge:sync` erin schrijft — de volgende stap.

### Foutrapportage vanuit de Edge Functions — QS8-24

De drie functies vangen hun fouten af en geven daarna een 200 terug. Dat is
bewust: een mislukte job is geen kapotte functie. Het gevolg is dat **niemand het
merkt** — de Doelcoach schrijft de reden in `ai_jobs.error`, de rollover en de
notificatiejob roepen `console.error`, en beide plekken leest niemand uit
zichzelf.

⚠️ Dat is geen theorie. In de reviewronde van 25-08 bleek de Doelcoach bij élke
aanroep om te vallen met een `ReferenceError`, met HTTP 200 erop. Hoe lang dat al
zo was, is niet meer vast te stellen.

Zet één variabele en dat is voorbij:

```bash
npx supabase secrets set SENTRY_DSN='https://<sleutel>@<host>/<project-id>'
npm run edge:sync && npx supabase functions deploy rollover notificaties doelcoach
```

**Zonder `SENTRY_DSN` gebeurt er niets.** `meldEdgeFout()` doet dan geen enkele
netwerkaanroep en geeft `'geen-dsn'` terug; dat is vandaag de toestand en er is
niets stuk. Een onbruikbare DSN levert één regel in het log op en verder niets —
stilletjes niet werken zou erger zijn dan geen DSN, want dan denk je dat je
bewaakt wordt.

⚠️ **Het is dezelfde schoonmaak als in de app, met dezelfde code.** `scrub.ts`
gaat via `npm run edge:sync` mee naar `_shared/observability/`. Een tweede versie
zou betekenen dat de app en de jobs een verschillende opvatting krijgen van wat
een persoonsgegeven is. De naadtest die bewijst dat er niets persoonlijks over de
lijn gaat, staat in `src/lib/observability/edge-rapport.test.ts` — en die toetst
wat de sink daadwerkelijk krijgt, niet wat een onderdeel belooft.

#### Controleer dat er daadwerkelijk iets aankomt

```bash
npm run sentry:proef            # bouwt de envelope en verstuurt hem
npm run sentry:proef -- --droog # alleen bouwen en afdrukken
```

Het script leest `SENTRY_DSN` uit `.env` of uit de omgeving, bouwt de envelope
met **de code die de Edge Function zelf draait** (`_shared/observability/`), en
drukt af wat er over de lijn gaat. De proeffout draagt met opzet een e-mailadres,
een token, een geciteerde Postgres-waarde en een notitie, dus de run is meteen een
lekcontrole op de échte bytes. Komt er een 2xx uit, dan noemt hij het event-id om
in Sentry op te zoeken.

⚠️ **Draai hem vanaf je eigen machine.** De omgeving waarin dit gebouwd wordt
laat het ingest-adres niet door en geeft 403 — een grens van de werkplek, niet
van Sentry.

✅ **De ingest heeft déze envelope geaccepteerd — 26-08-2026, HTTP 200**, met
event-id `4dff823071264594bafc6f4222b40565`. Daarmee is de laatste aanname van dit issue dicht: de
draadvorm is niet meer beredeneerd maar gemeten, en in dezelfde run is op de
échte bytes vastgesteld dat er geen e-mailadres, token, geciteerde waarde of
notitie in zit.

⚠️ **Dat maakt de controle niet overbodig.** Draai hem opnieuw na elke wijziging
aan de envelope, de DSN of het project — het is de enige stap die het verschil
ziet tussen "de code lijkt te kloppen" en "er is iets aangekomen".

⚠️ **En dat ene echte verzoek vond meteen een gat.** `fetch()` verwerpt alleen
bij een netwerkfout, dus een 403 was een geslaagde belofte en `meldEdgeFout()`
meldde `'verstuurd'` terwijl er niets aankwam. Sinds 26-08 geeft het vervoer de
HTTP-status terug en is een niet-2xx een eigen uitkomst `'geweigerd'` met een
regel in het log. Achttien groene tests zagen dat niet; één echt verzoek wel.

### De service worker en het manifest — QS8-124

⚠️ **De SPA-rewrite hierboven is níét het probleem, en dat is een correctie op
wat QS8-114 en QS8-124 vermoedden.** `RewriteCond %{REQUEST_FILENAME} !-f` laat
elk bestaand bestand ongemoeid, dus `/sw.js`, `/manifest.json` en de iconen
komen gewoon door. Nagelopen op de regels zoals ze er staan.

Wat er wél moet, en waarom:

```apache
# De service worker mag nooit uit de cache komen: een browser die een oude
# sw.js vasthoudt, blijft die draaien tot hij vanzelf verloopt. Dan levert een
# nieuwe versie van de app meldingen af via code van vorige week.
<Files "sw.js">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
</Files>

# Sommige Apache-installaties kennen .webmanifest/manifest.json niet en sturen
# text/plain. Safari negeert het manifest dan stil, en dan is er op iOS geen
# "zet op beginscherm" en dus geen push.
<Files "manifest.json">
  Header set Content-Type "application/manifest+json"
</Files>
```

⚠️ **De scope van een service worker is zijn eigen map.** `public/sw.js` komt
als `/sw.js` in de root te staan en bedient daarmee de hele app — dat is wat
`src/modules/notifications/webpush-registratie.ts` registreert, en het klopt met
`start_url: "/"` en `scope: "/"` in `public/manifest.json`.

✅ **Uitgezocht op 25-08-2026: er is geen spanning.** Deze alinea waarschuwde
voor een `RewriteBase /goalbuddies/` "hierboven", en die staat er niet meer —
`scripts/deploy-web.mjs` schrijft alleen `RewriteEngine On`, zonder voorvoegsel.
`goalbuddies.q-projects.tech` is een subdomein met een eigen documentroot, dus de
app staat in de root van dat adres en `scope: "/"` klopt. Zie ook de alinea over
het pad-voorvoegsel in §3.

⚠️ **`public_html/goalbuddies` is het pad op de schíjf, niet in de URL.** Dat
onderscheid heeft één meting in `docs/ENGINEER-REVIEW.md` al fout gelezen; het
staat daar rechtgezet.

⚠️ **Verhuist de app ooit tóch naar een pad**, dan verhuizen het manifest, de
iconen en de servicewormer mee — anders werkt alles behalve de meldingen. Dat is
sinds 25-08 geen oplettendheid meer maar `npm run pwa:controle`, die het manifest
tegen `EXPO_PUBLIC_APP_URL` legt en meedraait in CI. En de deploy zelf trekt na
het live zetten `/manifest.json` en `/sw.js` na op status én content-type — een
200 met `application/octet-stream` laat een browser de wormer weigeren, stil.

De herhaalbare deploy zelf is QS8-100 en staat nog open.

---

## 4. Vercel-blockers

Alles wat nu Hostinger-specifiek is en straks aangepast moet worden:

- [ ] De gegenereerde `.htaccess`. Op Vercel vervangt `vercel.json` met rewrites
      dat — en let op: de regels zijn per dynamische route en niet één
      SPA-fallback, want `output: "static"` levert een bestand per route.
      `scripts/deploy-web.mjs` leidt ze af uit `dist/`; die afleiding is
      herbruikbaar, het formaat niet.
- [ ] `scripts/deploy-web.mjs` zelf: de TUS-upload en `static-deploy` zijn
      Hostinger-API's. De secret-scan en de `.htaccess`-generatie zijn dat níét
      en horen te blijven — de scan hoort dan in de CI-stap vóór `vercel deploy`.
- [x] ~~Het pad-voorvoegsel `/goalbuddies/`~~ — vervallen. Het subdomein heeft een
      eigen documentroot, dus de app staat al in de root van zijn adres.
- [ ] Edge Functions draaien nu bij Supabase (Deno), niet bij Hostinger. Dat
      blijft bij Vercel ongewijzigd — geen blocker, wel goed om te weten.

Geen Vercel-specifieke API's of packages gebruiken (`CLAUDE.md`). De omgekeerde
weg is duurder dan hij lijkt.
