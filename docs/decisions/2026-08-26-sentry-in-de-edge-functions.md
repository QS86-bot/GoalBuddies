# Sentry in de Edge Functions — dependency-vrij, geschoond, en één implementatie

*26-08-2026 — QS8-24*

Dit document vervangt geen eerder besluit; het legt vast wat er op één dag in
**twee** implementaties tegelijk is bedacht, en waarom er één van overblijft.

## Wat er die dag gebeurde

Twee sessies losten dezelfde dag onafhankelijk hetzelfde issue op. De ene landde
via PR #14 en #16 op `main`; de andere stond lokaal in
`supabase/functions/_shared/sentry/index.ts` en werd **gedeployd** zonder ooit in
een branch te staan.

Dat leverde drie dingen op die het opschrijven waard zijn:

1. Er draaide productiecode die niemand kon uitchecken.
2. Die code schoonde niet — `fout.message` en `fout.stack` gingen rauw naar
   Sentry, met in het commentaar precies de aanname die op 24-08 al onjuist bleek.
3. Er was geen enkele controle die dat kon zien. Dat is inmiddels
   `npm run edge:gedeployd` (PR #17).

## Beslissingen

### 1. Geen SDK, maar één `fetch` naar de ingest

`@sentry/deno` meeslepen zou een dependency, een grotere bundel en een cold-start
kosten voor precies één POST, zonder dat we breadcrumbs, tracing of integraties
gebruiken. De rest van deze functies doet zijn externe calls al met kale `fetch`
en zegt daar expliciet waarom: `doelcoach` tegen Anthropic, `notificaties` tegen
de Expo-pushdienst. Sentry's envelope-endpoint is dezelfde vorm.

CLAUDE.md rekent een dependency toevoegen tot een afweging die je zelf neemt maar
verantwoordt. Dit is die verantwoording.

### 2. Eén implementatie, en het is de geschoonde

Van de twee blijft die op `main` over. Niet omdat hij eerder was, maar om één
reden: hij haalt persoonsgegevens uit de melding **en uit de stack** voordat er
iets verstuurd wordt. De andere deed dat niet, en zijn commentaar zei:

> De stack draagt bestandsnamen en regelnummers, geen gebruikersdata.

Dat is woordelijk de aanname die op 24-08 onjuist bleek en die daarom in
CLAUDE.md bij regel 18 staat: **de eerste regel van een stack ís de melding.**
`scrubStack()` bouwt de kop daarom opnieuw op uit de naam en de al geschoonde
melding, in plaats van hem een tweede keer te schonen — twee keer hetzelfde
schoonmaken zijn twee plekken die uit elkaar kunnen lopen.

Dat criterium (QS8-24, nummer 3: geen persoonsgegevens in events) is het hele
punt van dit issue. Een implementatie die het niet haalt, kan niet de blijver
zijn, hoe goed de rest ervan ook is.

### 3. Wat er uit de andere implementatie wél is overgenomen

Drie dingen, en het eerste was een echt gat:

- **Een top-level vangnet in `rollover` en `notificaties`.** De body draait nu in
  `draaiRollover()` / `draaiNotificaties()` binnen een `try/catch`. De zachte
  fouten per profiel melden zoals ze deden — die zijn verwacht en afgehandeld.
  Wat hier gevangen wordt is het ónverwachte: een afgewezen `rpc`, een
  platformhapering. Dat werd tot nu toe geruisloos een 500 zónder enig spoor,
  en dat is precies het geval waarvoor dit issue bestaat.
- **`await` vóór de Response is verplicht.** Supabase kan een Edge Function
  bevriezen zodra het antwoord verstuurd is; een `fetch` die dan nog loopt wordt
  afgekapt en de melding komt nooit aan. De code deed dit op alle vijf de
  aanroepen al goed, maar het commentaar erboven zei het tegenovergestelde.
  Rechtgezet.
- **`SENTRY_ENVIRONMENT`.** Optioneel; ontbreekt hij, dan blijft het veld weg in
  plaats van dat er `'production'` verzonnen wordt. Een verzonnen omgeving maakt
  een fout uit een proefdeploy niet te onderscheiden van een echte, precies op
  het moment dat je erop vertrouwt.

### 4. Twee DSN's, met opzet

| Variabele | Waar |
|---|---|
| `SENTRY_DSN` | server-side secret, gelezen door de Edge Functions |
| `EXPO_PUBLIC_SENTRY_DSN` | client-side, voor de app |

Losse sleutels omdat het losse kanten zijn. Verwar ze niet, en zet de
server-sleutel nooit in een bundel die je publiceert.

### 5. `_shared/observability/` komt uit `src/` en wordt niet met de hand bewerkt

`scrub.ts` en `edge-rapport.ts` gaan via `npm run edge:sync` mee vanuit
`src/lib/observability/`. Een tweede versie van de schoonmaakregels zou betekenen
dat de app en de jobs een verschillende opvatting krijgen van wat een
persoonsgegeven is — en dat is niet theoretisch, want dat is precies wat er op
26-08 gebeurd is.

`_shared/melden.ts` is de uitzondering en wordt wél met de hand geschreven: dat
is de Deno-laag eromheen (`Deno.env`, `crypto.randomUUID()`, `new Date()`), en
die drie kunnen niet in `src/` staan.

### 6. Wat er bewezen is, en wat niet

Op 26-08 is er met een tijdelijke `sentry-selftest`-functie aangetoond dat de
ingest een envelope van de **andere** implementatie accepteerde. Die functie is
daarna weer verwijderd.

⚠️ **Dat bewijst de vorm op `main` niet.** De twee envelopes verschillen in de
itemkop:

| | Itemkop |
|---|---|
| de andere | `{"type":"event"}` |
| `main` | `{"type":"event","length":N,"content_type":"application/json"}` |

Allebei geldig volgens de specificatie, maar alleen de eerste is langs een echte
ingest geweest. `npm run sentry:proef` sluit dat gat voor de vorm die we houden —
en dát is de controle die gedraaid moet zijn voordat iemand zegt dat de bewaking
staat.

## Wat dit niet doet

- De app op Sentry aansluiten (`@sentry/react-native` plus een `ErrorSink`) —
  aparte keuze, aparte dependency, en criterium 1 en 2 van QS8-24.
- De zachte fouten per profiel doorsturen. Die blijven bij een melding met hun
  eigen `waar`-tag; ze zijn verwacht en afgehandeld.
