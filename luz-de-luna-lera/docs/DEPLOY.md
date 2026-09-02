# Deploy en databasewerk

> Twee dingen staan in dit bestand: hoe je uitrolt, en hoe je veilig aan de
> database komt. Houd het actueel tíjdens het bouwen. Wat nog niet bekend is,
> staat als `[in te vullen]` — vul het in zodra het er is, en niet ergens anders.

## Huidige omgeving

| | |
|---|---|
| Hosting site | Hostinger, `[account]`, `[map]` — `[in te vullen bij LDL-4]` |
| Adres | `[in te vullen]` |
| Database | Supabase `[projectnaam]`, ref `[ref]`, regio `[eu-…]`, **gratis tier** — `[LDL-2]` |
| n8n | `[cloud of zelf gehost]` — `[LDL-3]`, adres `[in te vullen]` |
| Build | statische export van de Bolt-frontend; geen Node-server |

---

## 1. Environment variables

`.env` staat in `.gitignore`. Kopieer `.env.example` en vul aan. Elke variabele
daar heeft een commentaar dat zegt of hij **publiek** (mag in de webbundel) of
**server** is.

⚠️ **Alles wat de frontend inleest, zit in de bundel die de browser downloadt.**
Een secret dat daar terechtkomt is publiek vanaf de eerste deploy, ook als je
het daarna weghaalt. De service-role key, de AI-sleutel, de betaalsleutel en
het webhook-geheim komen alleen in n8n en in serverfuncties.

Valideer env vars bij het opstarten (één module die gooit als er iets
ontbreekt), niet halverwege een gebruikersactie.

---

## 2. Databasewerk

### 2.1 De regel

Geen migratie op een **gevulde** tabel zonder `pg_dump` vooraf. De gratis tier
heeft geen automatische backups. Zolang er geen echte bezoekers zijn, mogen
migraties rechtstreeks op het project; **dat vervalt op de dag van de eerste
echte zelftest.**

### 2.2 Een migratie toepassen

1. `npm run migratie:nieuw -- "korte_naam"` — kiest een nummer dat geen branch
   claimt (fetcht eerst), zet het rollback-pad in de kop.
2. Schrijf de migratie idempotent tegen de toestand waarvoor hij geschreven is.
3. `npm run poort` — de migratiecontrole en (zodra hij er is) de RLS-suite.
4. Toepassen op het project — zie 2.2b. Gebruik je de Supabase-MCP-tool, dan
   zet die een **tijdstempel** als versie in `schema_migrations`, ongeacht de
   bestandsnaam. Lijn dat daarna uit, anders lopen repo en project uit elkaar:

   ```sql
   update supabase_migrations.schema_migrations
      set version = '0007', name = '0007_korte_naam'
    where version = '<de tijdstempel>';
   ```
5. Meet dat het klopt: `pg_get_functiondef()` voor functies, `pg_policy` voor
   policies — niet het bestand, niet de aanname.

### 2.2b Toepassen met `psql`

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public > backups/$(date +%F)-voor-0007.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0007_korte_naam.sql
```

⚠️ Niet met `supabase db push` zodra er een migratie met een letter
(`0007a_…`) bestaat: sommige CLI-versies slaan die stil over.
`migraties:controle` bewaakt die tegenspraak.

### 2.3 Wat een migratie moet hebben

- Nummer en naam in de eerste regel (het sjabloon doet dat).
- `-- ROLLBACK-PAD:` in de kop, ook als het "n.v.t. — voegt alleen toe" is.
- Voor elke tabel: RLS aan, policies voor SELECT/INSERT/UPDATE/DELETE, index op
  elke foreign key.
- Voor elke functie: `revoke … from public, anon, authenticated` en daarna
  alleen de grant die bedoeld is; bij `security definer` een `auth.uid() is
  null`-tak als eerste regel.

### 2.4 De RLS-suite `[in te vullen bij LDL-12]`

Draait tegen een lokale Postgres met PostgREST, opgebouwd uit
`supabase/migrations/`, zonder credentials van het echte project. Zet hem in
`scripts/poort.mjs` als stap met `database: true`, zodat "geen database"
ongemeten telt en niet groen.

### 2.7 Verbindingen en pooling

`max_connections` is **60** voor de héle database, inclusief PostgREST en Auth.
Vandaag opent niemand zelf een verbinding: de site en n8n praten via de
REST-API. `npm run verbindingen:controle` wordt rood zodra dat verandert. Komt
er ooit een langdraaiende Node-server: transactiepooler op poort 6543,
`prepare: false`, een kleine pool.

---

## 3. n8n uitrollen

- **Export is de bron.** Elke workflow staat als JSON in `n8n/workflows/`;
  importeren in de instantie is de deploy. Andersom nooit: een wijziging in de
  instantie die niet geëxporteerd is, bestaat voor de repo niet.
- Controleer vóór het committen dat een export **geen credentials** bevat
  (n8n exporteert verwijzingen, geen sleutels — maar een Code-node met een
  sleutel erin wél).
- Elke workflow die mail verstuurt heeft een proefpad: een testadres en een
  vlag die de echte verzending uitzet. De vlag gaat pas om na akkoord van
  Evianne (grens 1).
- Error-workflow aan; executielogs zonder PII; bewaartermijn van executies
  ingesteld volgens `docs/research/privacy-avg.md`.

---

## 4. De site uitrollen naar Hostinger `[LDL-4]`

1. `npm run build` in `web/` — een statische export.
2. **Secret-scan vóór de upload**: zoek in de export naar elke waarde uit
   `.env` die server-only is. Deze stap moet minstens één keer rood zijn
   geweest, anders is hij een aanname.
3. Upload naar `[map]` via `[FTP/SFTP]`; `.htaccess` voor diepe links.
4. Open de site op een telefoon en doorloop de zelftest tot en met de mail.

### Rollback

De vorige export staat in `[map]-vorige`; terugzetten is één kopie. Voor de
database: het rollback-pad in de kop van de migratie, en de dump van 2.2b.

---

## 5. E-mail: aflevering

Zonder dit komt de spiegel in spam en is de hele reis dood:

- SPF, DKIM en DMARC op het verzenddomein, gecontroleerd met een echte
  testmail naar een Gmail- en een Outlook-adres.
- Double opt-in; een werkende afmeldlink (`List-Unsubscribe`-header erbij);
  bounces terug naar n8n en de database.
- Een verzendkanaal met reputatie (volgt uit `privacy-avg`); nooit vanaf een
  gedeelde Hostinger-mailserver.

---

## 6. Wat nog niet bepaald is

| Onderwerp | Wacht op |
|---|---|
| Adres en map op Hostinger | LDL-4 |
| Supabase-ref en regio | LDL-2 |
| n8n cloud of zelf gehost | `n8n-hosting` (kostenbesluit) |
| Verzendkanaal voor mail | `privacy-avg` |
| Betaalprovider en webhook-adres | `betalen-mollie` |
| Foutrapportage | LDL-5 |
