# Sentry in de Edge Functions — dependency-vrij, via `fetch`

*26-08-2026*

## Wat

De drie Edge Functions (`rollover`, `notificaties`, `doelcoach`) melden hun
fouten nu aan Sentry. De secret `SENTRY_DSN` stond al gezet maar werd door niets
geconsumeerd: een fout in een job verdween in de function-logs en de
`ai_jobs.error`-kolom, nooit in een dashboard dat je actief waarschuwt.

## Beslissingen

### 1. Geen `@sentry/deno`, maar één `fetch` naar de ingest-API
CLAUDE.md rekent een dependency toevoegen tot een afweging die je zelf neemt maar
verantwoordt. De rest van deze functies doet externe calls al met kale `fetch` en
zegt daar expliciet waarom: doelcoach ("Geen npm-SDK maar `fetch`") tegen
Anthropic, notificaties tegen de Expo-pushdienst. Sentry's ingest is óók één POST
(het envelope-endpoint). Een SDK zou een dependency, een grotere bundel en een
cold-start kosten voor precies dat ene verzoek, zonder dat we de bredere
SDK-functionaliteit (breadcrumbs, tracing, integraties) hier gebruiken.

De helper staat in `supabase/functions/_shared/sentry/index.ts`.

### 2. Edge-only, niet via `edge:sync`
De app heeft haar eigen weg naar Sentry via `src/lib/observability` (`ErrorSink`)
en gebruikt de client-side variabele `EXPO_PUBLIC_SENTRY_DSN`. De Edge-helper is
Deno-code die niets met de app deelt, dus er is geen origineel in `src/` om uit te
synchroniseren. `sync-edge-shared.mjs` beheert alleen `_shared/time` en
`_shared/notificaties`; `_shared/sentry` valt daar bewust buiten en wordt
rechtstreeks bewerkt.

### 3. Twee verschillende DSN's, met opzet
- `SENTRY_DSN` — server-side secret, gelezen door de Edge Functions (deze wijziging).
- `EXPO_PUBLIC_SENTRY_DSN` — client-side, voor de app wanneer die op Sentry
  wordt aangesloten.

Het zijn losse sleutels omdat het losse projecten/kanten zijn; verwar ze niet.

### 4. Wat er wél en niet naar buiten gaat — domeinregel 7
Naar Sentry gaat uitsluitend: het fout-type, de foutmelding, de stack en een paar
niet-gevoelige tags (`function`, `runtime`). **Nooit** `ai_jobs.input`, een
doeltitel, een notitie of iets waaruit een gemiste week is af te leiden. De
meegegeven `extra` wordt in de helper geknepen tot primitieven — objecten en
arrays vallen weg, zodat een aanroeper niet per ongeluk een hele database-rij
meestuurt. doelcoach geeft als context alleen `job_id` (een UUID) mee.

### 5. Een top-level vangnet, geen wijziging aan de foutsemantiek
`rollover` en `notificaties` draaien hun body nu in een top-level `try/catch`
(via `draaiRollover`/`draaiNotificaties`, zodat de bestaande body op exact
dezelfde inspringing bleef staan). De zachte, verwachte per-profiel fouten
(onbruikbare `tz`, mislukte deelquery's) blijven loggen zoals ze deden — die zijn
afgehandeld. Gevangen wordt het onverwachte: een afgewezen `rpc`, een
platformhapering, die tot nu toe geruisloos een 500 werden.

doelcoach behoudt zijn bestaande semantiek (een mislukte job is een nette 200 met
`ok:false`); de melding gaat naar Sentry vanuit het bestaande `catch` en vanuit de
twee config-500's.

Melden gebeurt met `await` **vóór** de Response, omdat Supabase een functie kan
bevriezen zodra het antwoord verstuurd is — een niet-afgewachte `fetch` wordt dan
afgekapt.

### 6. De verificatie — en de probe die weer weg is
Sentry is op 26-08-2026 end-to-end geverifieerd op twee manieren:
- **`npm run sentry:proef`** (`scripts/sentry-proef.mjs`) — stuurt lokaal een
  testevent met de `SENTRY_DSN` uit `.env`, spiegelt de transport van de helper.
  Blijft staan als snelle rooktest zonder deploy.
- **Een tijdelijke `sentry-selftest`-Edge-Function** — gooide op verzoek een
  synthetische fout via dezelfde `meldFout`, gated op `service_role`. Gaf
  `verstuurd_naar_sentry: true`. **Op 26-08-2026 weer verwijderd** (remote én
  lokaal) nu de keten bewezen werkt; hij stond los van de drie echte functies.

Wil je later opnieuw door een gedeployde functie heen testen, dan is `meldFout`
er nog — een nieuwe wegwerp-probe is zo terug.

## Wat dit niet doet
- De app op Sentry aansluiten (`@sentry/react-native` + `ErrorSink`-implementatie)
  — dat is een aparte keuze en een aparte dependency.
- De zachte per-item fouten in rollover/notificaties doorsturen. Kan later als
  waarschuwing-niveau, maar is nu bewust bij `console.error` gelaten.
