# Deploy en databasewerk

> Twee dingen staan in dit bestand: hoe je de app uitrolt, en hoe je veilig aan
> de database komt. Houd het actueel tíjdens het bouwen. Straks is dit ook de
> migratiehandleiding naar Vercel.

## Huidige omgeving

| | |
|---|---|
| Hosting | Hostinger, account `u349450154`, `public_html/goalbuddies` |
| Doeladres | `goalbuddies.q-projects.tech` (bestaat nog niet — QS8-99) |
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

### 2.2 Een migratie draaien

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

```bash
npm test                        # slaat ze over zonder .env
npx vitest run src/lib/testing  # alleen de RLS-suite
```

Ze maken drie echte gebruikers aan in het project, doen hun werk en ruimen
zichzelf op. Ze draaien **niet** in CI: `SUPABASE_SERVICE_ROLE_KEY` omzeilt RLS
en hoort niet in een runner die op elke push van elke branch draait.

Draai ze lokaal vóór elke merge die auth, RLS, goedkeuring of commitments raakt.

---

## 2.6 Wat kost de Doelcoach?

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

```bash
npm ci
npm run build          # expo export --platform web
```

Output: `dist/` — statische bestanden. Uploaden naar
`public_html/goalbuddies` op Hostinger.

⚠️ **Expo Router draait client-side.** Een directe aanvraag op bijvoorbeeld
`/doelen/123` moet daarom door de webserver naar `index.html` gestuurd worden,
anders krijg je een 404 op elke pagina behalve de startpagina. Op Hostinger
(Apache) is dat een `.htaccess` in de map:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /goalbuddies/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /goalbuddies/index.html [L]
</IfModule>
```

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

⚠️ **Dat staat op gespannen voet met de `RewriteBase /goalbuddies/` hierboven.**
Draait de app onder een pad in plaats van op een eigen domein, dan komt de worker
op `/goalbuddies/sw.js` te staan, kan hij alleen `/goalbuddies/` bedienen, en
klopt geen van de absolute paden in `manifest.json` en `+html.tsx` meer. Op
`goalbuddies.q-projects.tech` als eigen (sub)domein is de root het goede
uitgangspunt en is er niets aan de hand. **Controleer bij de eerste echte deploy
welke van de twee het is** — dit is precies het soort verschil dat niets
zichtbaars stukmaakt behalve meldingen. Hoort bij QS8-99/QS8-100.

De herhaalbare deploy zelf is QS8-100 en staat nog open.

---

## 4. Vercel-blockers

Alles wat nu Hostinger-specifiek is en straks aangepast moet worden:

- [ ] De `.htaccess` hierboven. Op Vercel vervangt `vercel.json` met een rewrite
      naar `/index.html` dat, of Next.js doet het zelf.
- [ ] Het pad-voorvoegsel `/goalbuddies/`. Op een eigen domein staat de app in
      de root, en dan klopt elke absolute asset-verwijzing niet meer.
- [ ] Edge Functions draaien nu bij Supabase (Deno), niet bij Hostinger. Dat
      blijft bij Vercel ongewijzigd — geen blocker, wel goed om te weten.

Geen Vercel-specifieke API's of packages gebruiken (`CLAUDE.md`). De omgekeerde
weg is duurder dan hij lijkt.
