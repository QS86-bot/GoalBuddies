# De echte-browsertest draait 's nachts en op verzoek (QS8-808)

Datum: 23-11-2026. Issue: QS8-808, vervolg op QS8-804.

## Probleem

De spatiebalktest van QS8-804 drukt een toets in een echte Chromium. jsdom maakt van
een spatie geen klik en scrolt niet. Een test in jsdom bewijst dus alleen dat er een
handler bestaat. `playwright` stond niet in `package.json`, dus in CI sloeg de
browserhelft zich over. De belofte van 804 was in CI **ongemeten**.

## Besluiten

### Quinten (23-11-2026, 11:07 UTC, optie 1)

De echte-browsertest draait **'s nachts en via `workflow_dispatch`**, in een eigen
workflow. **Niet bij push of PR.** De CI voor push en PR (`ci.yml`,
`scripts/ci-controles.mjs`) verandert niet.

### De orchestrator (23-11-2026, technische keuzes, meerkeuze)

| Vraag | Keuze |
| --- | --- |
| V1 welk pakket | `playwright@1.63.0`, exact |
| V2 waar draait `tests/browser/` | een eigen vitest-groep `browser`, en een grendel die rood wordt als het weer in `unit` valt |
| V3 de poort | niet in deze PR; vervolgissue QS8-809 |
| V4 de installatiemeting | als aanname, met de 404 als reden; de eerste dispatch na de merge levert het getal, via een eigen kleine PR. 📏 Gedaan: 4 s, run 45179652334 |
| V5 hoe vaak | één cron om 03:17 UTC, best-effort als bekende rest; hartslag in vervolgissue QS8-810 |
| geen `--trace off` | akkoord, zie hieronder |
| `--only-shell` zonder `--with-deps` | akkoord, zie hieronder |

## Wat er gebouwd is

| Onderdeel | Wat |
| --- | --- |
| `package.json` | `playwright` **1.63.0 exact** als devDependency, en het script `test:browser` (`BROWSER_TEST=1 vitest run --project browser`) |
| `vitest.config.mts` | `tests/browser/**` gaat uit de groep `unit` naar een eigen groep `browser`, één bestand tegelijk |
| `.github/workflows/browsertest.yml` | `schedule` 03:17 UTC en `workflow_dispatch`; `npm ci`, `npx playwright install --only-shell chromium`, `npm run test:browser` |
| `tests/browser/rook.test.ts` | de kleinste test die de baan bewijst: een spatie op een gefocuste `<button>` is in Chromium een klik |

### Waarom deze dependency, en waarom deze versie

* **`playwright` en niet `@playwright/test`.** De test van 804 laadt `playwright` met
  `require()` en draait onder vitest. `@playwright/test` is een tweede testrunner naast
  vitest, en dan moet de test van 804 eerst om.
* **1.63.0 exact.** Dat is de versie die in de cloudsessie bij `chromium-1243` in
  `/opt/pw-browsers` hoort. Een andere versie vindt die browser niet. Exact, omdat de
  workflow de browser installeert die bij de bibliotheek uit de lockfile hoort. Een
  bereik laat die twee uit elkaar lopen zodra de lockfile ververst wordt.

  ⚠️ **Wie de versie ophoogt, hoogt de browser mee op.** De workflow doet dat vanzelf:
  `npx playwright install` neemt de browserrevisie van de versie uit de lockfile. De
  cloudsessie doet het níet: daar staat `chromium-1243` vast in `/opt/pw-browsers`, en
  een nieuwere bibliotheek vindt die revisie niet. Ophogen zonder nieuwe image betekent
  dat `npm run test:browser` in de cloudsessie rood wordt met `Executable doesn't exist`.
* **Grootte.** 📏 `node_modules/playwright` 5,1 MB, `node_modules/playwright-core`
  14 MB. Twee pakketten, geen verdere afhankelijkheden. 📏 Het pakket heeft **geen
  install-script**: `npm ci` downloadt geen browser, ook niet in de push-CI. De browser
  komt alleen in de nachtelijke workflow binnen.

### Waarom een eigen vitest-groep, en geen kleinere wijziging

Zodra `playwright` installeerbaar is, slaagt `require('playwright')` ook in de
push-CI. Daar installeert niemand een browser, dus `chromium.launch()` valt om en
`npm test` wordt rood. 📏 Nagebootst met `PLAYWRIGHT_BROWSERS_PATH=/tmp/geen-browser`:
`Executable doesn't exist at …/chromium_headless_shell-1243/…`, exitcode 1.

De andere weg, de tests in `unit` laten en ze laten overslaan als de browser ontbreekt,
is stil overslaan. Een suite die zegt te meten en niets meet, is precies de klasse van
QS8-270.

⚠️ **Gevolg: `npm run poort` draait de browsertests niet meer.** De poort draait alleen
`unit`. In een cloudsessie mat de poort de test van 804 eerder wel, omdat Playwright
daar globaal staat. Hem in de poort terugzetten zonder dat de poort op elke machine
zonder Chromium rood wordt, is een eigen vraag (zie *Volgende stap*).

### De grendel op de groepsindeling

`tests/beloftes/browsertests-buiten-unit.test.ts` leest `vitest.config.mts` en elk
`*.test.ts` in `tests/browser/`. Per bestand vraagt hij wat vitest zelf vraagt: valt het
in `include` en niet in `exclude`? Hij wordt rood als een browsertest in `unit` valt, en
ook als hij buiten `browser` valt. Die tweede kant is de gevaarlijke: dan draait de
nachtelijke workflow hem niet, en wordt er niets rood. De grendel draait in `unit`, dus
in elke push-CI.

### Waarom `--only-shell` en geen `--with-deps`

* `chromium.launch()` start in headless-modus de `chromium_headless_shell`. 📏 In de
  cloudsessie op schijf: headless shell 277 MB, volledige Chromium 372 MB. De volledige
  browser downloaden is dus overbodig.
* `--with-deps` draait `apt-get update`. Dat eindigt met exitcode 100 zodra één
  APT-bron van een derde partij op de runner inconsistent is. Dat maakte `main` al eens
  rood zonder dat een commit iets veranderde (QS8-400, `tests/scripts/ci-apt.test.ts`).
  `ubuntu-latest` levert Google Chrome mee, en dus de bibliotheken die de shell nodig
  heeft. Ontbreekt er toch één, dan valt `chromium.launch()` luid om. 📏 **Gemeten op
  23-11-2026** (run 45179652334): de shell start op `ubuntu-latest` zonder `--with-deps`,
  en 13 van de 14 tests draaiden er groen in.

### Waarom geen `--trace off`

Dat is een vlag van de testrunner `@playwright/test`. Hier draait vitest met de
bibliotheek, en die neemt alleen een trace op na `context.tracing.start()`. Geen enkele
test roept dat aan. Tracing staat dus uit zonder vlag.

## Kosten

De metingen komen uit de reactie van 23-11-2026 07:14 op QS8-808, behalve waar anders
vermeld.

| Wat | Getal | Bron |
| --- | --- | --- |
| spatiebalktest 804, warm | 8,1–8,4 s wandklok | 📏 808 |
| rooktest alleen | 1,7 s wandklok, test 0,76 s | 📏 23-11-2026, cloudsessie |
| groep `browser` met rooktest en de test van 804 | 9,2 s wandklok, 14/14 groen | 📏 23-11-2026, cloudsessie, een worktree van de 804-tak met de config van deze tak |
| `npm ci` in CI | 37–58 s | 📏 808 |
| `npm ci` in de browserworkflow, eerste run zonder npm-cache | 53 s | 📏 run 45179652334 |
| `npx playwright install --only-shell chromium` op `ubuntu-latest` | **4 s**: 114,3 MiB headless shell plus 2,3 MiB ffmpeg | 📏 run 45179652334 |
| de stap Browsertests | 10 s (vitest 9,74 s) | 📏 run 45179652334 |
| een run | **73 s** job (77 s van aanmaken tot klaar), gefactureerd 2 min | 📏 run 45179652334 |
| per maand, nachtelijk | ~60 min als elke nacht vuurt, 3 % van de 2.000 gratis minuten van een privérepo; best-effort maakt het minder | afgeleid uit de run |
| per maand, vandaag | **0**: de repo is publiek | 📏 808 |

### De installatietijd: eerst een aanname, daarna gemeten

De opdracht was haar één keer echt te meten via `workflow_dispatch` op de eigen tak.
📏 Dat kan niet: `POST /repos/…/actions/workflows/browsertest.yml/dispatches` met de
tak als `ref` gaf **404 Not Found**. GitHub dispatcht een workflow pas als het bestand
op de standaardtak staat. Een tijdelijke `push`-trigger voor één meetrun gaat in tegen
het besluit (nooit bij push). Installeren in de cloudsessie is uitgesloten en meet
bovendien een ander netwerk.

Daarom stond hier eerst de schatting van 30–90 s. 📏 **De eerste dispatch op `main`
(run 45179652334, 23-11-2026 13:00 UTC, op `44fae34a`) mat 4 s.** De schatting was
dus te ruim. De download van de CDN van Playwright is op een runner snel, en zonder
`--with-deps` is er geen apt-stap.

### De eerste run was rood, en dat is een echte bevinding

📏 Run 45179652334: 13 van 14 groen. De rooktest en alle gedragstests van QS8-804
(spatie, enter, ingedrukt gehouden, Ctrl+spatie, uitgeschakeld) slaagden in Chromium op
de runner. Rood was de **stijltoets** van de spatiebalktest: de momentopname van tag,
bounding box en computed style. Alleen de breedte en x van de twee `Choice`-knoppen
verschilden (Optie A 78,09 verwacht, 77,27 gemeten). De rest was gelijk.

De oorzaak: het harnas laadt geen lettertype. `"Times New Roman"` valt op de runner
terug op een ander lettertype dan in de cloudsessie, en de breedte van een tekstknop
volgt het lettertype. De kop van die test noemt de meting al een *momentopname op deze
harnas, zonder geladen lettertype*. Wat de nachtrun hier vindt, is dat die momentopname
machinegebonden is. Dat is precies wat een tweede machine hoort te vinden. Wat ermee
gebeurt, beslist de orchestrator (V6). Tot dan is de nachtrun rood, en dat is eerlijk:
het is geen ongemeten groen.

### Bekende rest: nachtelijk is best-effort

`schedule:` is best-effort. 📏 Een dagelijkse cron vuurde in deze repo gemiddeld eens
in de ~5 dagen (`advisories.yml`;
`docs/decisions/2026-10-05-schedule-is-best-effort-en-de-hartslag-is-de-runlijst.md`).
Een run die niet loopt, is niet rood en wordt niet gemaild. Niets bewaakt deze
workflow met een hartslag; dat is QS8-810. Wie het zeker wil weten, start hem met de
hand.

## Vervangen en afgewezen opties

Dit zijn de vier varianten uit de meting van 808. Quinten koos (c).

| Variant | Extra min/maand bij privé | Waarom niet |
| --- | --- | --- |
| (a) eigen job bij elke push | ~4.200–6.300 | 105–315 % van de gratis minuten, alleen voor deze baan |
| (b) alleen op `main` | ~510–765 | een breuk zie je toch pas na de merge, voor tien keer de kosten van (c) |
| **(c) nachtelijk en `workflow_dispatch`** | **~60–90** | **gekozen** |
| (d) niet in CI, alleen in de poort | 0 | in CI blijft de belofte ongemeten, en dat was het probleem |

Ook afgewezen, binnen (c):

* `@playwright/test` in plaats van `playwright`, zie hierboven.
* De browsers cachen: Playwright raadt het af (playwright.dev/docs/ci), en de winst is
  hooguit de download.
* `--with-deps`: de apt-val van QS8-400, zie hierboven.

## IJking

Met de hand, 23-11-2026, één mutatie tegelijk. De uitslag is wat er werkelijk omviel.

| Mutatie | Grendel | Uitslag |
| --- | --- | --- |
| `press('Space')` → `press('a')` in de rooktest | de test meet een echte browserklik | 📏 rood: `expected +0 to be 1` |
| `playwright` onvindbaar (`node_modules/playwright` weg, `NODE_PATH` leeg), met `BROWSER_TEST=1` | ongemeten is rood | 📏 rood: `BROWSER_TEST=1 maar playwright is niet te laden` |
| idem, zonder `BROWSER_TEST` | luid overslaan buiten de baan | 📏 1 skipped, met de melding ONGEMETEN |
| `PLAYWRIGHT_BROWSERS_PATH` naar een lege map (de push-CI nagebootst) | zonder browser is de groep rood | 📏 exitcode 1, `Executable doesn't exist` |
| `vitest run --project unit tests/browser` | `unit` raakt `tests/browser/` niet | 📏 `exclude` toont `tests/browser/**`, geen bestanden |
| `'tests/browser/**'` weg uit de `exclude` van `unit` | grendel: niet in `unit` | 📏 1 rood: `tests/browser/rook.test.ts valt niet in de groep unit`; de andere toets blijft groen |
| `include` van `browser` versmald naar `tests/browser/x/*.test.ts` | grendel: wel in `browser` | 📏 1 rood: `tests/browser/rook.test.ts valt in de groep browser`; de andere toets blijft groen |

⚠️ **Valkuil bij het ijken in de cloudsessie:** daar staat Playwright óók globaal
(`NODE_PATH=/usr/local/lib/node_modules_global`). Wie alleen `node_modules/playwright`
weghaalt, ziet de test groen blijven. De tweede rij werd pas rood met een lege
`NODE_PATH`.

`cidekking:controle` en `hoofdrun:controle` hoeven de workflow niet te kennen. De
workflow noemt geen `npm run …:controle` als stap, en hij draait niet op `main`.
📏 Beide zijn groen met de workflow erbij.

## Volgende stap

1. ~~Na de merge één `workflow_dispatch` op `main`.~~ Gedaan: run 45179652334. De
   installatie kost 4 s en de shell start zonder `--with-deps`. De stijltoets van 804 is
   op de runner rood; zie hierboven en V6.
2. QS8-809: krijgt `npm run poort` een browserstap die ongemeten en groen uit elkaar
   houdt? Tot dan wordt de spatiebalktest van QS8-804 in een cloudsessie niet meer
   vanzelf meegemeten.
3. QS8-810: een hartslag voor deze workflow in `uurjobs:controle`.
4. Kandidaten voor de groep `browser` uit 808: de hydratatie (#418,
   `src/shared/ui/useGehydrateerd.ts`) en de focus- en toetsenbordpaden van
   `src/shared/ui/Taakbalk.tsx`.
