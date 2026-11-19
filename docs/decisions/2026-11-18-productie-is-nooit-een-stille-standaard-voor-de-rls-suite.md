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

⚠️⚠️ **Wat deze test níet sluit, en wat dat sinds QS8-703 wél doet.** Het
incident liep via vitest: `src/lib/test-env.ts` laadt `.env`, daarna laadt de
harness. Dit kindproces draait kaal `node` zonder `test-env.ts` en omzeilt
precies die naad. De ER-rij *"Geen test start vitest als kindproces met een
echte `.env`"* bleef daardoor open tot QS8-703; zie hieronder.

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

## QS8-703 — het tweede slot, ook uit `.env` en ook voor psql

De security-review van PR #690 vond drie plekken waar het slot zwakker was dan
de documenten zeiden. De eerste (het slot hing aan een hoofdlettergevoelige
substring van de URL) is in QS8-702 zelf gesloten; de andere twee zijn
QS8-703. Gebouwd op Quintens besluit van 18-11-2026, vóór QS8-692: het bouwen
vraagt geen productierun.

| # | wat | waar | besluit |
| -- | -- | -- | -- |
| 1 | `RLS_DOEL` en `RLS_TEST_ALLOW_PROD` komen alleen uit de procesomgeving | `src/lib/test-env.ts`, `src/lib/test-env-slot.ts` | dotenv laadt `.env` in een eigen object. Zet dat het slot (`RLS_TEST_ALLOW_PROD` met een waarde, of `RLS_DOEL=productie`), dan **werpt** de setup en wordt elke test rood. Een onschuldige waarde (`RLS_DOEL=lokaal`, een lege vlag) wordt overgeslagen. `.env.example` biedt de vlag niet meer als invulveld aan. |
| 2 | het psql-pad weigert een niet-lokale host | `psqlDoelFout()` in `tests/rls/psql-stack.ts` | een **allowlist**: loopback of een Unix-socket, en verder niets. `PGHOSTADDR` wordt ook getoetst (hij gaat in libpq voor), `PGSERVICE` wordt geweigerd (het bestand is hier niet te lezen). De grendel staat in `basisArgumenten()`, waar elke psql-aanroep in de testboom doorheen gaat, én vóór de `try` in `stackBeschikbaarOfFaal()`. |
| 3 | de naad in vitest zelf | `tests/beloftes/dotenv-opent-het-slot-niet.test.ts` | start de echte vitest met de echte config, met een eigen `.env` via `GOALBUDDIES_DOTENV` — een test mag de `.env` van de machine nooit aanraken. Drie gevallen, alle drie exit 1: sleutels zonder doel (harness), het slot in `.env` (setup), en `PGHOST` naar de pooler met `RLS_DOEL=lokaal` per run (psql). |

⚠️ **Waarom werpen en niet stil overslaan.** Een slot dat zich laat negeren is
geen slot: wie het in `.env` zet, bedoelde iets, en stil weglaten laat hem in de
waan dat het werkt. Dat maakt de hele suite rood op een machine met de vlag in
`.env` — op Quintens machine staat hij sinds 18-11 uitgecommentarieerd (QS8-700).

⚠️ **Waarom de grendel vóór de `try` staat.** `stackBeschikbaarOfFaal()` vangt
elke fout van de proef op en meldt hem als *"geen database"*. Een geweigerde
host daarin laten verdwijnen is de klasse van QS8-268 (de verkeerde oorzaak).
📏 Gemeten: met de grendel alleen in `basisArgumenten()` kwam de weigering wél in
de uitvoer, maar achter *"psql zei:"* en onder de kop *"geen database op…"*. De
toets eist nu dat die kop er niet staat.

⚠️ **`src/lib/test-env.ts` staat in de uitzonderingslijst** van de regel tegen
`process.env` in `src/` (`eslint.config.js`): hij is de vitest-setup en komt in
geen bundel. Verhuizen naar `tests/` was zuiverder, maar het pad staat in vijf
documenten en een verhuizing is hier de duurste beweging.

**Geijkt per grendel; ervoor en erna 30/30 groen** (de twee nieuwe testbestanden):

| mutatie | wat omviel |
| -- | -- |
| de setup werpt niet meer bij het slot in `.env` | *het slot in .env … de setup weigert* |
| de setup neemt `.env` weer volledig over (de oude vorm) | idem |
| de psql-grendel overal uit | *PGHOST in .env naar de pooler … psql wordt geweigerd* |
| de grendel alleen nog in `basisArgumenten()`, niet vóór de `try` | idem, op *"geen database op"*. Bleef eerst groen; zie hierboven |
| de allowlist hoofdlettergevoelig | *{"PGHOST":"LOCALHOST"} mag* |
| `PGHOSTADDR` niet meer getoetst | *… "PGHOSTADDR":"3.14.15.92" wordt geweigerd* |
| `doel.ts` weer de oude standaard (geen doel → productie) | *productiesleutels in .env, geen RLS_DOEL …* — de vitest-naad ziet hem ook |

**De security-review van QS8-703 vond drie zijdeuren, en die zijn dicht**
(elk geijkt; de toets die omviel staat tussen haakjes):

- `PGDATABASE` gaat als `-d` mee, en daar leest psql ook een verbindingsstring,
  een URI of `service=…`, met een eigen host. Alleen een kale naam mag nu
  (*"…PGDATABASE is geen kale naam"*, drie vormen).
- Een hostlijst met komma's die met een socketpad begint, kwam erdoor; libpq
  probeert de hosts op volgorde. Elk deel wordt nu apart getoetst, ook in
  `PGHOSTADDR` (*"/var/run/postgresql,db.… wordt geweigerd"*).
- Op Windows is `process.env` hoofdletterongevoelig: `rls_test_allow_prod=1` in
  `.env` opende het slot. `slotInDotenv()` en `overTeNemen()` vergelijken nu
  zonder hoofdletters (*"{"rls_test_allow_prod":"1"} wordt geweigerd"*, *"ook
  niet in kleine letters"*).

**Wat hier niet gebouwd is** — en sinds QS8-715 wél (zie de sectie daaronder).
Twee lage punten uit dezelfde review:
een controle ná het verbinden (`current_database()` en `inet_server_addr()`,
zoals `scripts/rls-dekking.mjs` die doet), die ook een tunnel naar productie op
loopback zou zien; en een allowlist op de host van `RLS_LOKAAL_URL` in plaats
van de blocklist op de ref (schrijven vraagt daar ook het productiegeheim in
`RLS_LOKAAL_JWT_SECRET`). `tests/rls/globaal.ts` draait in het hoofdproces
van vitest en ziet `.env` niet (geen `setupFiles` daar); zijn psql-aanroepen
gaan wel door dezelfde grendel. Een `PGHOST` in de **shell** van de gebruiker
wordt net zo geweigerd als een in `.env`. Niet gemeten: de echte RLS-suite
tegen een lokale stack met deze grendel (geen stack in de cloudsessie); de
allowlist laat `127.0.0.1` op poort 5433 toe, dus de stack van
`scripts/lokale-stack.sh` en de CI-job `rls` vallen erbinnen.

## QS8-715 — nameten waar psql uitkwam, en loopback voor een lokaal doel

Besluit van Quinten, 18-11-2026: de twee lage restpunten van de security-review
van QS8-703 meteen bouwen. Gestapeld op QS8-703.

| # | wat | waar |
| -- | -- | -- |
| 1 | één keer per proces, vóór de eerste psql-meting: `select coalesce(host(inet_server_addr()), 'unix-socket') \|\| '\|' \|\| current_database()`. Alleen loopback of een socket, en de gekozen database (`PSQL_DB`), zijn goed; anders werpt hij *"weigert te meten"*. Geen poort: CI draait op 5432, de lokale stack op 5433. | `bestemmingFout()`, `eisBestemming()` in `tests/rls/psql-stack.ts` |
| 2 | bij `RLS_DOEL=lokaal` een loopback-allowlist op de host van `RLS_LOKAAL_URL` (`localhost`, `127.0.0.1`, `[::1]`), zonder vlag die hem opent. De stack van `scripts/lokale-stack.sh` en die van `supabase start` vallen erbinnen. | `eisLoopback()` in `tests/rls/harness.ts` |

⚠️⚠️ **Niet kunnen meten is stoppen** (security-review van QS8-715). De eerste
versie zweeg bij elke meetfout, en dan liep de eigenlijke aanroep ongemeten door:
een tunnel die de meetverbinding één keer weigerde (*too many clients*), kreeg
de volgende `psqlMetInvoer` met DML gewoon binnen. Nu:

- alleen psql-exitcode **2** heet *"geen verbinding"*; elke andere fout, ook een
  time-out (10 s), is *"niet vast te stellen"* en werpt;
- *"geen verbinding"* is alleen in `stackBeschikbaarOfFaal()` een uitkomst — de
  proef draait dan niet meer, en het oordeel meldt *"geen database"* of
  *"overslaan"* zoals altijd; elke andere aanroep werpt en voert niets uit;
- een verkeerde bestemming werpt buiten de `try` van `stackBeschikbaarOfFaal()`,
  anders heet hij weer *"geen database"* (QS8-268).

⚠️ **En de database heet `goalbuddies_rls`, hard** (dezelfde review). Achter een
tunnel naar een pooler op de servermachine meldt ook productie zich als
loopback, en `PGDATABASE=postgres` is voor een dump heel gewoon. De lokale stack
en CI bouwen alleen die naam op (`scripts/lokale-stack.sh`).

**Geijkt per grendel; ervoor en erna 80/80 groen** (de vier toetsbestanden van
het slot):

| mutatie | wat omviel |
| -- | -- |
| de loopback-toets op de bestemming weg | drie gevallen van `bestemmingFout`, `eisBestemming`, en in de naad *"een tunnel … psql() weigert"* en *"stackBeschikbaarOfFaal: een tunnel heet weigert te meten"* |
| de databasetoets op de bestemming weg | *"een andere database op loopback"* en het `bestemmingFout`-geval |
| `eisLokaleDatabase()` vraagt de bestemming niet | de drie naadtoetsen in `tests/beloftes/psql-meet-waar-hij-uitkwam.test.ts` |
| de harness bij `lokaal` weer op de blocklist | de twee kindprocesgevallen *"RLS_LOKAAL_URL naar een IP-adres / eigen domein"* |
| elke meetfout heet weer *"geen verbinding"* | *"een meting die mislukt met iets anders …: de echte vraag draait niet"* en de twee *"niet vast te stellen"*-gevallen |
| *"geen verbinding"* laat een gewone aanroep door | *"geen verbinding bij een gewone aanroep: werpt, en er wordt niets uitgevoerd"* |
| de database niet hard op `goalbuddies_rls` | `PGDATABASE=postgres` en `goalbuddies_rls_2` |

De time-out op de meting staat onder geen toets: een verbinding die nooit
antwoordt is zonder echte server niet na te bootsen.

⚠️ **Niet gemeten: een echte database.** De naadtoets gebruikt een nagemaakte
`psql` (`vi.mock` op `node:child_process`). Een tijdelijk Postgres-cluster in de
cloudsessie was niet toegestaan. Dat `inet_server_addr()` bij een tunnel het
adres van de server aan de overkant geeft en bij een socket `null`, is de
documentatie van Postgres en hier niet nagemeten; `scripts/rls-dekking.mjs` leunt
sinds QS8-497 op dezelfde vraag.

**Wat open blijft (Laag, als ER-rij).** Een tunnel naar een server die óók een
database `goalbuddies_rls` heeft, gaat door de nameting; een merkteken dat alleen
de lokale stack zet (een `current_setting` of een markeertabel uit
`scripts/lokale-stack.sh`) zou dat sluiten. En de REST-kant meet niet ná het
verbinden: een HTTP-tunnel op `127.0.0.1:3010` naar productie-PostgREST, samen
met het productiegeheim in `RLS_LOKAAL_JWT_SECRET`, gaat door `eisLoopback()`.

### QS8-715, tweede ontwerp (19-11-2026): de CI-servicecontainer

📏 **Gemeten in CI** (run 44525677655, job 135565480115): de eerste versie van
`bestemmingFout()` weigerde elke RLS-test, want daar draait Postgres als
servicecontainer en `inet_server_addr()` is `172.18.0.2`, het adres op de
dockerbrug. "Loopback" is wat de server van zichzelf ziet; dat bewijst niet dat
hij op deze machine staat. De afleverregel noemde dit zelf als ongemeten aanname.

**Eisen:** (a) een lokaal doel blijft loopback eisen of gelijkwaardig bewijs
leveren; (b) de servicecontainer werkt zonder een vlag die ook buiten CI gezet
kan worden; (c) productie blijft dicht (de sloten van QS8-702/703 zijn niet
aangeraakt).

| optie | oordeel |
| -- | -- |
| `CI=true` / `GITHUB_ACTIONS=true` laat het containeradres toe | **afgewezen**: iedereen kan dat overal zetten, en dan is de grendel een instelling (eis b) |
| elk privé-adres (RFC1918) toestaan | **afgewezen**: een VPN- of bastion-tunnel naar een server aan de overkant meldt zich ook zo |
| een merkteken in de database (alleen `lokale-stack.sh`/CI zet het) | **niet gebouwd**: besluit Quinten 19-11, blijft een ER-rij |
| **een tweede getuige: wat de server van *ons* ziet** | **gekozen** |

**Gekozen.** De vraag geeft nu `adres|database|clientadres` terug
(`inet_client_addr()`). Goed is:

1. serveradres `127.0.0.1`, `::1` of een socket (de lokale stack, native Postgres), óf
2. het **clientadres** ligt in `172.16.0.0/12`, is een adres van een
   netwerkinterface van déze machine (`os.networkInterfaces()`, de bruggateway
   `172.18.0.1`), en het serveradres ligt in hetzelfde /16-net.

De server ziet bij een container achter de dockerbrug de gateway van díe brug als
client; bij een tunnel naar een server aan de overkant ziet hij het NAT-adres of
de tunneluitgang, en dat staat op geen interface van deze machine. De database
moet in beide gevallen `goalbuddies_rls` heten. Een ontbrekend clientadres
(oudere vorm) is geweigerd. Conservatiefste optie die eis a, b en c haalt: geen
nieuwe omgevingsvariabele, geen nieuw geheim, en alles wat vroeger werd geweigerd
blijft geweigerd behalve precies dit ene geval.

**Geijkt per grendel** (`tests/beloftes/het-productieslot-komt-niet-uit-een-bestand.test.ts`,
`tests/beloftes/psql-meet-waar-hij-uitkwam.test.ts`): ⚠️ de eerste ijking liet
**vier van de vijf mutaties overleven**, want de grendels dekten elkaar; daarom
is de serverkant-toets (volgt uit client-in-ruimte plus hetzelfde /16) weggehaald
en zijn er gevallen bijgekomen die elke grendel alleen raken.

| mutatie | wat omviel |
| -- | -- |
| de toets "clientadres is een eigen interface" weg | *client in het net van de container maar niet van ons (172.18.0.5)* |
| hetzelfde /16 weg | *client in een ander /16* en *een publiek adres met een eigen client* |
| de toets "client in 172.16/12" weg | *server en eigen client buiten 172.16/12* en *172.32* |
| bovengrens `<= 31` te ruim | *server net buiten 172.16/12 (172.32)* |
| ondergrens `>= 16` te ruim | *server net onder 172.16/12 (172.15)* |
| databasetoets weg | drie gevallen op `postgres` |
| loopbacktoets weg | acht gevallen, waaronder *lokaal en de goede database* |

**Wat een aanname is, en niet gemeten:** (1) dat de server de gateway van de brug
als `inet_client_addr()` ziet bij Docker's poortdoorsturen (docker-proxy of
masquerade); (2) dat `os.networkInterfaces()` in de CI-runner dat gatewayadres
toont. Beide kunnen alleen de CI-run op de exacte head-sha bevestigen; zie het
Linear-comment voor die uitslag. Een echte Postgres draaide in de bouwsessie niet.

**ER-rij (Laag) erbij:** een tunnel waarvan de uitgang op een eigen interface in
`172.16.0.0/12` staat (een VPN-adapter) naar een server die `goalbuddies_rls`
heet, komt door. **Wordt zwaarder als:** iemand productie of een andere gedeelde
server bereikbaar maakt via zo'n adapter. Past bij de twee bestaande rijen
(merkteken, REST-tunnel), die Quinten op 19-11 bewust niet bouwt.
