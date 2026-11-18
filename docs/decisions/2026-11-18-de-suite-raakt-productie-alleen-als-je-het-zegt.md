# De RLS-suite raakt productie alleen als je het zegt — 18-11-2026

> Besluit onder *Beslisbevoegdheid* in `CLAUDE.md`. Hoort bij QS8-700,
> acceptatiecriterium 1 en 3. Criterium 4 en 5 (het opruimen van de 1865
> testgebruikers) staan hier **niet** in: dat is een `delete` op productie en
> wacht op een eigen akkoord van Quinten.

## De meting

📏 Gemeten op 18-11-2026 (de metingen staan voluit in QS8-700 en zijn reacties;
hier de kern):

- Op productie staan **1865** `rls-…@example.com`-testgebruikers, met rijen in
  dertien tabellen (`profiles` 1865, `daily_moves` 1523, `invite_events` 987,
  …), 59 `push_tokens` waarvan 21 web. De waarden zijn de testvectoren uit
  `tests/rls/pushtokengrens.test.ts`. Vier aanmaakclusters: 09-11 20:23, 16-11
  18:51 en 21:14, 18-11 13:09 UTC.
- De keten die productie bereikte, uit de code (geen run gedaan):
  1. `tests/rls/harness.ts` had `doelsoort = RLS_DOEL === 'lokaal' ? 'lokaal' :
     'productie'`. **Productie was de standaard.**
  2. `rlsTestsConfigured` was waar zodra de vier productiesleutels er stonden.
  3. `src/lib/test-env.ts` (vitest `setupFiles`) laadt `.env` altijd in
     `process.env`.
  4. `guardProductie()` liet productie door bij `RLS_TEST_ALLOW_PROD=1`, en dat
     staat in de `.env` van Quinten en in de gekopieerde `.env` van werkbomen.
  5. `package.json` had `"test": "vitest run"`, dat **beide** vitest-projecten
     draait (`unit` én `rls`). Daardoor draaide een kale `npm test` 111
     RLS-bestanden tegen productie.
  6. `scripts/poort.mjs` draait als stap `tests` dat kale `npm test`, én als stap
     `RLS-suite` nog eens `rls:lokaal`. De eerste was dus dubbel én gevaarlijk.

Het is geen vergissing van één sessie maar een **standaard**: elke poort-run op
een machine met de sleutels maakte opnieuw testgebruikers aan op productie.

## De keuze

De standaard omgedraaid, zó dat productie nooit meer de uitkomst van een
ontbrekende variabele is. `doelsoort` heeft nu **drie** standen in plaats van
twee:

| `RLS_DOEL` | `doelsoort` | gevolg |
| -- | -- | -- |
| `lokaal` | `lokaal` | zoals altijd: lokale PostgREST, geen credentials |
| `productie` | `productie` | **plus** `guardProductie()` met `RLS_TEST_ALLOW_PROD=1` — twee uitdrukkelijke schakelaars |
| ontbreekt / iets anders | `geen` | `rlsTestsConfigured` is `false`; elke `describe.skipIf(!rlsTestsConfigured)` slaat over; `requireEnv()` wérpt |

De afweging tegenover het voorstel in de reactie van 18-11 (*"ontbreekt →
lokaal"*): een ontbrekend doel valt nu op `geen` en niet op `lokaal`. Dat is
strenger en eerlijker. `lokaal` als stille standaard zou een kale `npm test`
tegen een lokale stack laten praten die er misschien niet is, en belangrijker:
het verbergt dat er geen keuze gemaakt is. `geen` dwingt de keuze af en houdt de
veiligheidsbelofte zuiver: **zonder een uitdrukkelijk doel praat geen RLS-test
met iets.** Drie schakels dragen dat, met opzet naast elkaar (verdediging in de
diepte):

1. `url` en `jwtSecret` zijn `undefined` bij `geen` — geen terugval op de
   productie-URL.
2. `rlsTestsConfigured` is `false` bij `geen` — de `skipIf`-blokken slaan over.
3. `requireEnv()` wérpt bij `geen`, vóór `createClient()` — een test die de
   gate omzeilt door `adminDb()`/`anonDb()` buiten een blok aan te roepen, krijgt
   een worp in plaats van een client naar productie.

Daarnaast:

- `package.json`: `"test": "vitest run --project unit"`. `npm test` raakt nooit
  meer een database. De RLS-bestanden draaien alleen via `rls:lokaal` of, voor de
  controletest, via het nieuwe `rls:token` (`RLS_DOEL=productie vitest run
  tests/rls/token.test.ts` — met `RLS_TEST_ALLOW_PROD=1` als tweede schakelaar).
- `scripts/poort.mjs`: de stap `tests` is daarmee unit-only; de stap `RLS-suite`
  blijft `database: true` en meldt `ongemeten` zonder stack. Aan de
  ongemeten-semantiek is niets veranderd.

## De grendel en zijn ijking (onwrikbare regel 18, vraag 3)

De belofte — *"zonder `RLS_DOEL` raakt geen RLS-test productie, ook niet met de
sleutels en `RLS_TEST_ALLOW_PROD=1` in de omgeving"* — staat onder test in
`tests/beloftes/rls-doel-raakt-productie-niet-vanzelf.test.ts`. Hij toetst het
**gedrag**, niet de bronregel: hij laadt `tests/rls/harness.ts` in een
**kindproces** (`tests/beloftes/rls-doel-kindproces.mjs` + de resolve-hook
`tests/beloftes/los-ts-op.mjs`) met een kale omgeving van nepsleutels — een URL
die de productieref `wehgocadxehottiiyvsc` draagt maar op `.invalid` eindigt — en
`RLS_TEST_ALLOW_PROD=1`, zónder `RLS_DOEL`. Dan is `rlsTestsConfigured` `false` en
werpt `requireEnv()` vóór er een client bestaat (`clientGebouwd: false`). Een
kindproces en niet in-proces, omdat de vitest-ouder de échte `.env` al geladen
heeft; alleen een eigen omgeving bewijst dat het slot óók met de sleutels present
dichtblijft. Twee andere gevallen bewijzen dat de uitdrukkelijke routes blijven
werken: `RLS_DOEL=productie` wijst naar productie, `RLS_DOEL=lokaal` naar de
stack.

De tweede helft — `npm test` blijft unit-only — staat in hetzelfde bestand als
een vorm-grendel op `scripts.test`. ⚠️ Eerlijk opgeschreven: die bewaakt dat het
besluit niet stíl teruggezet wordt, niet het gedrag; het gedrag draagt de
harness-grendel hierboven.

**Geijkt met de hand, en "ervoor" was groen (6/6):**

1. De oude standaard teruggezet (`RLS_DOEL === 'lokaal' ? 'lokaal' :
   'productie'`). Rood werden precies *"zonder RLS_DOEL: geen doel, …"* en *"een
   onbekende RLS_DOEL telt óók als geen doel"* — beide op `doelsoort: verwacht
   'geen', kreeg 'productie'`. De vier andere toetsen bleven groen. Daarna
   teruggezet.
2. `"test": "vitest run"` (beide projecten) teruggezet. Rood werden precies
   *"beperkt vitest tot de unit-groep"* en *"draait niet de RLS-groep en niet de
   kale suite mee"*. De vier harness-toetsen bleven groen. Daarna teruggezet.

Elke mutatie brak de grendel die hij noemt, en geen andere.

## Wat níet veranderd is

- **`token.test.ts` en de productie-route.** De enige legitieme reden om tegen
  productie te draaien — een echt GoTrue-token vergelijken met een zelfgetekend
  token (`echteSessieBeschikbaar = doelsoort === 'productie'`) — blijft bestaan,
  nu via `npm run rls:token` plus `RLS_TEST_ALLOW_PROD=1`. `guardProductie()` is
  ongewijzigd.
- **`removeTestUsers()` en zijn `console.warn`.** Niet aangeraakt — dat is QS8-701
  (de hypothese dat `deleteUser()` op productie op `storage.protect_delete`
  faalt). Deze sessie bouwt daar niets van.
- **De `ongemeten`-semantiek** van de poort en `stackBeschikbaarOfFaal()`.
- **`.env` en de omgeving van Quinten.** Niet gewijzigd. Het weghalen van
  `RLS_TEST_ALLOW_PROD=1` uit `.env` is stap 1 uit de reactie van 18-11 en is
  handwerk van Quinten; het valt buiten deze bouwsessie.
- **CI.** `.github/workflows/ci.yml` regel ~136 draait nog `npm test`. Dat is nu
  unit-only; de RLS-suite draait in de eigen job (`rls`, `npm run rls:lokaal`,
  regel ~318) tegen de lokale stack. 📏 In CI sloegen de RLS-tests onder `npm
  test` zichzelf al over (geen `RLS_DOEL`, geen sleutels), dus de job verliest
  geen dekking.

## Wat niet gemeten is

- De database-baan van `npm run poort` zonder stack blijft **ongemeten** (de
  `*:controle` die `pg_get_functiondef()` lezen, en de RLS-suite zelf). Deze
  sessie draaide geen lokale stack.
- Het opruimen van de 1865 testgebruikers (criterium 4 en 5) en de tellingen
  vóór/na. Dat wacht op "backup gedaan" van Quinten en op de meting van QS8-701.
- Wat de 49 AI-jobs kostten (onwrikbare regel 6), en de tabellen buiten `public`.
- Welke sessie of welk commando de vier clusters precies maakte.
