# Productie is nooit een stille standaard voor de RLS-suite (QS8-702)

**Rollback:** `git revert` van de commits van QS8-702; geen migratie.

> Besluit onder *Beslisbevoegdheid* in `CLAUDE.md`. Hoort bij QS8-702 en de
> oorzaak-analyse in QS8-700. Het opruimen van de testaccounts op productie staat
> hier **niet** in: dat is in QS8-700 gedaan, op Quintens eigen opdracht.
>
> Dit document voegt twee versies samen die op 18-11-2026 naast elkaar ontstonden:
> **A**, de cloudversie (`claude/qs8-702-rls-doel`, `a910ce63`, op `main` geland
> via batch #690 met de nawerk-commit `449ee0c2`), en **B**, Quintens lokale WIP
> (`claude/qs8-702-lokaal-wip`, `e7d19290`, nooit gemerged). B's eigen
> beslisdocument (`…-de-suite-raakt-productie-alleen-als-je-het-zegt.md`) is hierin
> opgegaan en komt niet op `main`.

## Wat er was

📏 Gemeten op 18-11-2026; de metingen staan voluit in QS8-700 en zijn reacties.

- Op productie stonden **1.865** `rls-…@example.com`-accounts, in vier
  aanmaakclusters (09-11 20:23, 16-11 18:51 en 21:14, 18-11 13:09 UTC).
- De keten, uit de code (geen run gedaan):
  1. `tests/rls/harness.ts` had `RLS_DOEL === 'lokaal' ? 'lokaal' : 'productie'`.
     **Productie was de standaard**, ook bij een afwezige variabele.
  2. `src/lib/test-env.ts` (vitest `setupFiles`) laadt `.env` bij elke run.
  3. `guardProductie()` liet productie door bij `RLS_TEST_ALLOW_PROD=1`, en dat
     stond in Quintens `.env` en in gekopieerde `.env`'s van werkbomen.
  4. `"test": "vitest run"` draaide **beide** vitest-projecten, dus een kale
     `npm test` draaide 111 RLS-bestanden — en `scripts/poort.mjs` stap `tests`
     roept `npm test` aan.
  5. `removeTestUsers()` zette een mislukte verwijdering om in een
     `console.warn` (verwijderen faalde op productie, QS8-692), dus elke run
     bleef groen en liet ~170 accounts achter.
- Dat de clusters van 16-11 21:14 en 18-11 13:09 uit twee poort-runs van een
  lokale sessie komen is **zeer waarschijnlijk** (timing); welke sessie de andere
  twee maakte is niet vastgesteld.

Geen vergissing van één sessie maar een **standaard**: elke poort-run op een
machine met de sleutels maakte opnieuw accounts aan.

## Besluit

| # | eis | waar | uitvoering |
| -- | -- | -- | -- |
| a | productie nooit stil | `tests/rls/doel.ts`, `guardProductie()` | alleen `RLS_DOEL=productie` **én** `RLS_TEST_ALLOW_PROD=1`. Bij `productie` vraagt het slot de vlag **altijd**, los van de URL; bij `lokaal` als de hostnaam (kleine letters) de projectref draagt |
| b | sleutel zonder doel faalt luid | `tests/rls/doel.ts` | `SUPABASE_SERVICE_ROLE_KEY` gezet en geen `RLS_DOEL` → het laden van de harness werpt |
| c | teardown rood | `removeTestUsers()` + `achtergeblevenMelding()` | de suite eindigt rood met het aantal achtergebleven accounts |
| d | `npm test` = unit | `package.json`, `scripts/poort.mjs` | `vitest run --project unit`; de poortstap `tests` erft dat, de RLS-suite heeft een eigen stap `rls:lokaal`; CI-job `rls` ongewijzigd |
| e | gedrag in een kindproces | `tests/beloftes/rls-doel-raakt-productie-niet-vanzelf.test.ts` | zie *De grendel en zijn ijking* |

Zonder doel én zonder service-role-key slaat de suite stil over, zoals altijd:
niemand beweerde iets te meten. De publieke URL en anon-key tellen niet, anders
werd elke app-`.env` rood.

## Per punt: wat uit A, wat uit B, en waarom

| punt | A (op `main`) | B (lokale WIP) | gekozen |
| -- | -- | -- | -- |
| **Waar de doelkeuze woont** | eigen bestand `doel.ts`, pure functie `bepaalDoel(env)` | inline ternary in `harness.ts` | **A.** Eén keuze in één bestand, met de hand te voeden zonder module-herlading. B's ternary verdwijnt; er is geen tweede variant. |
| **Geen doel mét sleutels** | `geweigerd`: het laden werpt | `geen`: alles slaat stil over, pas `requireEnv()` werpt | **A.** Eis (b) is *luid*. Bij B was een `npm test` met sleutels groen-met-overgeslagen — de stand die niemand opmerkt. |
| **Onbekende waarde** (`staging`, `''`) | geweigerd | `geen` | **A**, zelfde reden; een getypte `RLS_DOEL` is een bewering. |
| **`requireEnv()` bij `geen`** | werpt | werpt | gelijk; staat al op `main`. |
| **Productiecommando** | `npx cross-env RLS_DOEL=productie RLS_TEST_ALLOW_PROD=1 vitest run tests/rls/<bestand>` | nieuw script `rls:token` | **A.** Werkt in cmd, PowerShell en bash, en zet de vlag per run in plaats van in `.env`. `rls:token` zou een tweede ingang zijn die `RLS_TEST_ALLOW_PROD` uit de omgeving moet halen — precies de plek waar hij vandaan moest. Niet overgenomen. |
| **`npm test`** | `vitest run --project unit` | idem | gelijk; op `main`. |
| **`scripts/poort.mjs`** | niet aangeraakt | kopcommentaar bij `STAPPEN` | **B's bedoeling, korter.** De stap verandert niet (hij erft van `npm test`); het commentaar noemt de keten en de grendel die hem bewaakt. |
| **Gedragstest** | in-proces, `vi.stubEnv` + `vi.resetModules` (`rls-doel.test.ts`) | kindproces (`rls-doel-kindproces.mjs` + `los-ts-op.mjs`) | **Beide.** Ze toetsen iets anders: in-proces wat de harness *werpt*, het kindproces *waar hij heen praat*, met een kale omgeving zonder de `.env` van de ouder. B's driver is herschreven op A's doelmodel en meet nu verzoek-adressen (zie hieronder). |
| **Vorm-grendel `npm test`** | geen | toets op `scripts.test` | **B**, plus `rls:lokaal` zet zijn doel zelf. De poortstap zelf legt `tests/scripts/poort.test.ts` al vast; die wordt niet gedubbeld. |
| **`CLAUDE.md`** | geen | ⚠️-alinea bij *Commando's* | **B, ingekort** tot één alinea, mits `npm run docs:controle` groen blijft. |
| **`DEPLOY.md`, `.env.example`** | bijgewerkt | eigen tekst met `rls:token` | **A.** B's tekst noemt een script dat niet komt. |
| **Beslisdocument** | dit bestand | eigen bestand | **samengevoegd hier.** |

## De grendel en zijn ijking (onwrikbare regel 18, vraag 3)

`tests/beloftes/rls-doel-raakt-productie-niet-vanzelf.test.ts` laadt de harness
in een **kindproces** (`node --experimental-strip-types`, met de resolve-hook
`tests/beloftes/los-ts-op.mjs` omdat de harness `./doel` en `./wezen` zonder
extensie importeert; daarom `engines` nu `>=22.6`). De omgeving is kaal en nep:
de productieref in een `.invalid`-adres, betekenisloze sleutels. De driver
vervangt `fetch` door een **spion die nooit verbindt**: hij legt de host van elk
verzoek vast en antwoordt zelf met `[]`. Daarna `adminDb()` en `anonDb()` met
een `select`, en `createTestUser()` — de route waarlangs de accounts kwamen.

| geval | belofte (eerste toets) | verder |
| -- | -- | -- |
| geen `RLS_DOEL`, sleutels + `RLS_TEST_ALLOW_PROD=1` | geen verzoek naar de productieref | laden faalt met *RLS_DOEL is niet gezet* |
| `RLS_DOEL=productie`, zonder vlag | geen verzoek naar de productieref | client geweigerd met *geblokkeerd* |
| idem, URL in hoofdletters / eigen domein zonder ref | **geen enkel** verzoek | geblokkeerd (security-review, M2) |
| `RLS_DOEL=lokaal`, sleutels + vlag | geen verzoek naar de productieref | alle verzoeken naar `127.0.0.1` |
| `RLS_DOEL=lokaal`, `RLS_LOKAAL_URL` naar productie in hoofdletters, zonder vlag | geen verzoek naar de productieref | geblokkeerd |
| ijkpunt: `RLS_DOEL=productie` + vlag | de spion zíet een verzoek naar de productieref | zonder dit punt kon "geen verzoek" altijd groen zijn |

⚠️ De spion antwoordt in plaats van te weigeren: supabase-js probeert een
mislukt verzoek opnieuw met wachttijd (📏 ~7 s per geval, boven de 5 s-grens van
vitest). Hij ziet alleen `fetch`: geen psql, geen realtime-WebSocket.

**Geijkt met de hand, per grendel, op de eindstand.** Ervóór groen: **53/53**
over `rls-doel.test.ts` (15), deze test (7 kindproces + 2 vorm, samen 9 —
`it.each` telt per rij) en `tests/scripts/poort.test.ts` (29). Elke mutatie
daarna teruggezet; erna weer 53/53.

| mutatie | wat omviel |
| -- | -- |
| M1 — de oude standaard terug (`doel.ts`: geen doel → `productie`) | kindproces *"zonder RLS_DOEL…"* op **`expected [ …(3) ] to deeply equal []`**: drie verzoeken naar de productieref. Plus vijf toetsen in `rls-doel.test.ts`. |
| M2 — `guardProductie()` laat alles door | de vier kindprocesgevallen zonder vlag, op het verzoek; plus twee in-proces-toetsen op *to throw*. |
| M3 — lokaal leest `EXPO_PUBLIC_SUPABASE_URL` | kindproces *"RLS_DOEL=lokaal, mét sleutels…"* op het verzoek; plus de in-proces-toets voor `RLS_LOKAAL_URL` (bijvangst: de mutatie negeert die variabele). |
| M6 — productie-tak weer alleen op de ref | alleen *"…een eigen domein zonder projectref"*. |
| M7 — hoofdlettergevoelige `includes` terug | alleen *"RLS_DOEL=lokaal met RLS_LOKAAL_URL … in hoofdletters"*. (Vóór dat geval erbij kwam bleef M7 groen: na M6 telt de hoofdlettervergelijking alleen nog in de lokale tak.) |
| M4 — `"test": "vitest run"` | alleen *"`npm run test` is beperkt tot de unit-groep"*. |
| M5 — poortstap `tests` → een ander script | alleen `poort.test.ts` *"draait de twee suites én de basis"* — die toets bestond al. |

Bij M1–M3 en M6–M7 viel het kindproces om op de **belofte** (een verzoek naar
productie) en niet op een eigenschap van het onderdeel; daarom staat die toets
in elk geval vooraan. M4 en M5 bewaken de vórm van twee commando's, niet het
gedrag.

⚠️⚠️ **Wat deze test níet sluit: ER-rij *"Geen test start vitest als kindproces
met een echte `.env`"*.** Het incident liep via vitest: `src/lib/test-env.ts`
laadt `.env`, daarna laadt de harness. Dit kindproces draait kaal `node`
zonder `test-env.ts` en omzeilt precies die naad. Wat hij bewijst is dat de
harness onder een gegeven omgeving niet naar productie praat; dát de `.env` die
omgeving wordt, staat nog altijd alleen met de hand gemeten (code-critic,
PR #690). De rij blijft open.

## Wat níet veranderd is

- **De productie-route zelf.** `token.test.ts` (echt GoTrue-token tegen een
  zelfgetekend token) is de reden dat hij bestaat; hij blijft, achter twee sloten.
- **CI.** `ci.yml` draait `npm test` (nu unit) en de job `rls` draait
  `npm run rls:lokaal` tegen een eigen Postgres. 📏 In CI sloegen de RLS-tests
  onder `npm test` zichzelf al over (geen `RLS_DOEL`, geen sleutels); er gaat
  geen dekking verloren.
- **De `ongemeten`-semantiek** van de poort en `stackBeschikbaarOfFaal()`.
- **`.env` op Quintens machine**: de vlag is daar met de hand uitgezet (QS8-700).

## Wat niet gemeten is

- De echte RLS-suite: geen lokale stack in de cloudsessie die dit samenvoegde.
- De productietak van `verwijderAuthGebruiker()` (`deleteUser`).
- Of de kindprocestest op Windows draait: `process.execPath` en
  `--experimental-strip-types` zijn platformonafhankelijk en `OS_SLEUTELS`
  draagt `Path`, `SystemRoot` en `windir` (niet `USERPROFILE`, `APPDATA`),
  maar gedraaid is hij alleen op Linux (Node 22.23).

## Wat de security-review vond en hier níet gebouwd is

Allebei staan ze al als rij in `docs/ENGINEER-REVIEW.md` (PR #690); deze ronde
bevestigt ze en voegt een faalscenario toe:

- **Het psql-pad** (`tests/rls/psql-stack.ts`): `stackOordeel()` meet zodra de
  probe slaagt, ook zonder `RLS_DOEL`, tegen wat `PG*` aanwijst (ook uit `.env`).
  Wijst `PG*` naar de pooler van productie, dan schrijven de psql-tests daar als
  `postgres` — via `npx vitest` of `npm run test:watch`, niet via `npm test`.
- **`.env` als keuze per run**: `test-env.ts` laadt ook `RLS_DOEL` en
  `RLS_TEST_ALLOW_PROD`. "Per run, nooit in `.env`" is een afspraak, geen slot.

Beide raken `src/lib/test-env.ts` en het psql-pad buiten de REST-harness; ze
horen bij een vervolgissue en niet in de samenvoeging van twee versies.
- AC4 van QS8-702: of het aantal `rls-%@example.com`-accounts op productie na de
  merge niet meer groeit. Twee tellingen met een uur ertussen, alleen lezen.
