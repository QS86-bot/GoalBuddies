# Een tijdzone die Intl weigert is geen tijdzone (QS8-763, migratie 0328)

## Wat er aan de hand was

`bewaak_tijdzone()` (0119) toetst `profiles.tz` en `groups.tz` tegen
`pg_timezone_names`. De rollover rekent in TypeScript met `Intl`, een andere
zonedatabase. Een naam die Postgres kent en `Intl` weigert, komt langs de trigger;
`afsluitbareCyclus()` vangt de `RangeError` en slaat het hele profiel over: geen
weekafsluiting, geen minpunt, geen doelstraf `due`, geen beslissing over een
weekbelofte (0313). Eén PATCH op PostgREST volstaat.

📏 Gemeten (lokale stack, Postgres 16, Node ICU 78.3, alle 499 namen): `Factory`,
`localtime` en `posixrules` worden door `Intl` geweigerd. De laatste twee bestaan
op productie niet en worden al bewaakt door `ALLEEN_LOKAAL`.

## Besluit

1. `bewaak_tijdzone()` weigert `Factory`, en op voorvoegsel `posix/` en `right/` (productie kent 598 `posix/`-namen die Intl allemaal weigert; gevonden door de security-review, lokaal niet te voeden) (hoofdletterongevoelig (Postgres vergelijkt exact; dit is hardening)), voor elke rol.
2. Bestaande rijen met die waarde gaan terug naar de kolomdefault
   `Europe/Amsterdam`. Ze werden al overgeslagen; elke andere zone zou een gok zijn.
3. `scripts/tijdzones-controle.mjs` vergelijkt de lokale zonelijst met wat `Intl`
   weigert en wordt rood als de weigerlijst (`ZONES_DIE_INTL_WEIGERT`) en `Intl`
   uiteenlopen, in beide richtingen. De lijst in de migratie is een afschrift van
   die meting, want SQL kan `Intl` niet vragen.

## Afgewezen

* **De rollover laten terugvallen op een standaardzone.** Dat sluit een week af in
  een zone die de gebruiker niet koos en kan een minpunt of een straf veroorzaken:
  grens 1 (beloofd of in rekening gebracht). Overslaan en melden blijft.

## Aannames, niet gemeten

* Of productie-Postgres meer namen kent die `Intl` weigert, en of `Factory` daar
  bestaat. De Sentry-melding `cyclus_onbepaalbaar` is de vangst; wie hem ziet,
  voegt de naam toe in een nieuwe migratie en in `ZONES_DIE_INTL_WEIGERT`.
* Of Deno's ICU in de Edge-runtime dezelfde namen weigert als Node's.
* De RLS-suite (`tests/rls/tijdzone.test.ts`, nieuwe gevallen `Factory` en
  `factory`) is hier niet gedraaid: PostgREST ontbreekt in deze omgeving. De
  trigger is wel met de hand getoetst als `authenticated` op de opgebouwde
  database.
