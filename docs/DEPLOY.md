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

Beide vragen de Supabase CLI. Die staat nog niet op deze machine; zie
`docs/Q-TODO.docx` C3.

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
| `0005_fix_group_visible_streaks.sql` | Repareert de gedeelde reeks | **nee — zie Q-TODO A1/A2** |

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
