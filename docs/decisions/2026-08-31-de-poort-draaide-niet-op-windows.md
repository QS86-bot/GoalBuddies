# De poort draaide niet op Windows

**Datum:** 31-08-2026
**Aanleiding:** de poort werd voor het eerst met een lokale RLS-stack op een
Windows-machine gedraaid; drie tooling-bugs die op Linux/CI onzichtbaar zijn
kwamen tegelijk boven.
**Raakt:** `scripts/poort.mjs`, `scripts/kolomrechten-controle.mjs`,
`package.json` (`rls:lokaal` + `cross-env`),
`tests/scripts/kolomrechten-controle.test.ts`

## Wat er misging

Geen van de drie zit in de app. Alle drie zitten in de guard-tooling en
manifesteren zich uitsluitend op Windows — daar waar de poort tot nu toe nooit
met een database ernaast gedraaid was.

### 1. `poort.mjs` kon geen enkele stap starten

`draai()` gebruikte `spawnSync('npm', ['run', …])` zonder `shell`. Op Windows is
`npm` het bestand `npm.cmd`, en Node weigert sinds de mitigatie van
CVE-2024-27980 (24.x) een `.cmd` te spawnen zonder shell: `spawnSync('npm', …)`
geeft `ENOENT`, `spawnSync('npm.cmd', …)` geeft `EINVAL`. Elke stap viel dus om
met "kon niet starten" — 33 van de 33 rood, en geen daarvan omdat hij iets mat.

**Fix:** de opdracht als één string met `shell: true`. Bewust géén args-array
erbij, want args + `shell: true` levert DEP0190 op — een waarschuwing die anders
33 keer door de uitvoer zou lopen. `commando` is een vaste scriptnaam uit
`package.json`, geen invoer, dus er valt niets te injecteren.

**IJking:** de bestaande `draai()`-tests in `poort.test.ts` draaien echte
subprocessen (`poort:proef:overgeslagen`, `poort:proef:rood`,
`poort:proef:bestaat-niet`). Die faalden op Windows vóór de fix en slagen erna —
dat is de grendel. Ze draaien mee in `npm test`, dus op elk platform.

### 2. `kolomrechten-controle` gaf twaalf valse meldingen

`ontleedRechten()` splitste de psql-uitvoer op `\n`. psql schrijft op Windows
`\r\n`, dus de `\r` bleef aan het laatste veld van elke regel plakken — de
kolomlijst. De laatste kolom van elke tabel werd zo `id\r` in plaats van `id`,
en dan meldt de controle "geen leesrecht op `id`" voor élke `.select('id')` die
precies die laatste kolom terugvraagt. Twaalf meldingen op een schema waar niets
aan mankeerde; elke geflagde kolom was in werkelijkheid gewoon granted.

**Fix:** splitsen op `/\r?\n/`.

**IJking:** `kolomrechten-controle.test.ts` krijgt een geval met een
`\r\n`-regeleinde dat aantoont dat de laatste kolom zijn leesrecht niet verliest.
Breekt terug bij een terugval op `split('\n')`.

### 3. `rls:lokaal` startte niet onder cmd.exe

De npm-script luidde `RLS_DOEL=lokaal vitest run tests/rls`. Die Unix-env-prefix
snapt cmd.exe niet — en npm gebruikt op Windows cmd.exe als script-shell. De
poort-stap `rls:lokaal` viel daardoor ook na fix 1 nog om.

**Fix:** `cross-env` ervoor (dev-dependency, de-facto standaard voor precies dit).
Werkt op cmd, PowerShell en sh identiek. Het is de enige env-prefixed script in
`package.json`, dus één plek.

## De lokale stack op Windows

`scripts/lokale-stack.sh` en `schema-opbouwen.sh` werken op Windows via Git Bash,
mits:

- een lokale Postgres waar je superuser bent (hier via scoop, op poort 5433);
- de PostgREST-binary (`postgrest-vX-windows-x86-64.zip`) in de werkmap, of
  `POSTGREST_BIN` erheen gezet;
- `PGCLIENTENCODING=UTF8` — anders leest psql de UTF-8-migraties als WIN1252 en
  valt de shim om op het eerste niet-ASCII-teken;
- `PGHOST`/`PGPORT`/`PGUSER` in de omgeving, zodat zowel de psql-controles als de
  schema-opbouw de juiste lokale database raken.

## Wat hiermee níét opgelost is — open

Bij de eerste volledige poort-run op Windows crashten **`adviseur:controle`** en
**`wachtwoord:controle`** met exitcode 127 en de libuv-assertie
`!(handle->flags & UV_HANDLE_CLOSING)` (`src\win\async.c`). Ze printen hun
bevinding en aborten daarná, bij het afbreken van de async/HTTP-teardown — beide
zijn de controles die het échte project over HTTPS bevragen. Dat is een vierde
Windows-probleem, dieper dan deze drie, en het is hier **niet** aangepakt.

**Wordt zwaarder als:** de poort een verplichte Windows-CI-stap krijgt, of als
een tweede controle dezelfde teardown gaat gebruiken. Tot dan draaien deze twee
betrouwbaar op Linux/CI; op Windows zijn hun exitcodes niet te vertrouwen.

`register:controle` blijft lokaal *ongemeten* — die vergelijkt het
migratieregister met het gedeployde project en heeft daar de productie-secrets
voor nodig. Dat is bedoeld gedrag, geen bug.
