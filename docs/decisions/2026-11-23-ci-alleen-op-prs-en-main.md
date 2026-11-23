# CI alleen op PR's en op `main` — QS8-819

Datum: 23-11-2026. Uitwerking van keuze A op QS8-126 (de repository gaat privé).
**Deze wijziging landt pas op de dag dat de repo privé gaat, en alleen op het sein
van Quinten.** Tot dan kost CI op een publieke repo niets, en dan wint "op elke tak
meten".

## Besluit van Quinten (23-11-2026, meerkeuze via de hoofdorchestrator)

Keuze A:

1. CI draait alleen nog op een PR naar `main` en op een push naar `main`, niet meer
   op elke push naar een tak.
2. Er komt een betaalmethode met een vast plafond. **Het bedrag kiest Quinten zelf**;
   het valt onder grens 1 van *Beslisbevoegdheid* (iets dat Quinten geld kost).

## De meting waar dit op rust

Gemeten op 23-11-2026 over 30 dagen (24-10 16:10 UTC t/m 23-11 16:10 UTC), uit de
GitHub-API. De volledige tabel en de aannames staan in de reactie van 16:20 UTC op
QS8-126; dit is de kern.

| Workflow | Runs / 30 d | Linux-equivalente minuten / 30 d |
|---|---|---|
| CI, push `main` | 169 | 2.750 |
| CI, push andere tak | 870 | 13.260 |
| CI, `pull_request` | 358 | 5.860 |
| **CI totaal** | **1.397** | **21.870** |
| Alle geplande workflows samen | | ±600 |

- **De gratis tier is $12 per maand**, op Linux precies 2.000 minuten ($0,006 per
  minuut). Een Windows-minuut kost $0,010 en telt dus 1,67 keer. Elke CI-run heeft één
  Windows-job.
- **Het tempo is in de laatste week verviervoudigd**: 1.251 van de 1.397 CI-runs vielen
  in de laatste 7 dagen. Op dat tempo is het ±84.600 minuten per maand.
- Zonder betaalmethode **blokkeert GitHub Actions** zodra het tegoed op is. Dan stopt
  ook de rollover, en dat is de stille storing waar de kop van `rollover.yml` voor
  waarschuwt.

| Scenario | Gemeten venster | Tempo laatste 7 dagen |
|---|---|---|
| Zoals nu | ±22.500 min, ±$123 boven de $12 | ±84.600 min, ±$496 |
| **Deze wijziging** | **±9.900 min, ±$47** | **±34.600 min, ±$196** |

⚠️ Geen enkel scenario past in de gratis tier, ook dit niet. Daarom hoort de
betaalmethode met plafond bij dezelfde dag als deze merge, en niet later.

## Wat er verandert

`.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

Daarvóór stond er `push: branches: ['**']`. Een push naar een tak mét PR draaide de
suite daardoor **twee keer**: één run voor `push`, één voor `pull_request`. Hoeveel
van de 870 tak-runs zo'n dubbele waren, is uit de meting niet te halen.

**Wat gelijk blijft:**

- De `concurrency`-groep en `cancel-in-progress` zijn ongewijzigd. Op `main` per
  commit en zonder afbreken (QS8-318, QS8-582); op een PR per ref en mét afbreken. Een
  PR heeft als ref `refs/pull/<n>/merge`, en daar gedraagt de expressie zich precies
  zoals op een tak.
- De push naar `main` blijft. Daar is elke commit een toestand die uitgerold wordt en
  een uitslag hoort te krijgen, en daar leunen `hoofdrun:controle` en
  `npm run hoofdrun:stand` op.
- Een draft-PR start CI ook: de standaardgebeurtenissen van `pull_request` (`opened`,
  `synchronize`, `reopened`) gelden ook voor een draft.

## Wat een sessie nu níet meer krijgt

**Een CI-uitslag op een tak zonder PR.** Dat raakt vooral het bouwbaanmodel van
`docs/PROMPT-SESSIE.md` §12: een bouwsessie pusht haar tak één keer aan het eind en
opent geen PR. Tot nu toe kreeg die tak bij die push een volledige CI-run. Na deze
wijziging is de eerste CI-uitslag over dat werk die van de batch-PR.

Wat daarvoor in de plaats staat, en wat het niet dekt:

- **`npm run poort` in de sessie zelf.** Die draait alles wat CI draait. ⚠️ Maar in een
  cloudsessie staan controles die een database nodig hebben op *ongemeten*, en de
  RLS-suite draait daar niet. De RLS-job is precies het deel dat CI wél deed en een
  cloudsessie niet kan. Een bouwsessie levert vanaf nu dus werk af waarvan de RLS-kant
  pas in de batch-PR gemeten wordt.
- **Een draft-PR** start CI wel. Of een bouwsessie die mag openen, regelt §12 van
  `docs/PROMPT-SESSIE.md`, en dat verandert hier niet.
- **Een conflict tussen banen** bleek al pas in de batch-PR, want een tak-run zag
  alleen zijn eigen tak. Dat verandert niet.

Bewust **niet** gebouwd: een `workflow_dispatch`-trigger om CI met de hand op een tak
te starten. Het issue vraagt `pull_request` en `push` naar `main`, en een extra trigger
is een eigen afweging (elke handmatige run kost dezelfde ±13 + 2 minuten).

**Een gevolg dat geen gedrag verandert.** `modusUit()` in `scripts/audit-controle.mjs`
kent een tak voor *push naar een andere tak* (modus `pr`). Die tak wordt in CI niet
meer bereikt. Hij is blijven staan: hij geeft de juiste modus als zo'n push er ooit
weer is, en de tests voeden hem los.

## De controles

- **`hoofdrun:controle`** las het push-blok al en herkent `branches: [main]` als "draait
  op `main`". De lezer is nu een eigen functie, `pushTakken()`, omdat er twee beloftes
  op dezelfde regel leunen: `main` moet erin staan (anders slaat de controle `ci.yml`
  over), en er mag niets anders in staan (anders draait CI weer op elke tak).
- **Die tweede belofte heeft een eigen toets** in `tests/scripts/hoofdrun-controle.test.ts`,
  tegen het echte bestand. Hij staat daar omdat `hoofdrun:controle` zelf groen blijft
  als iemand `'**'` terugzet: `**` dekt `main`.
- **`cidekking:controle`** leest welke controles in `ci.yml` draaien, niet wanneer. Hij
  leunt niet op het push-patroon en is ongewijzigd groen.

📏 **Met de hand geijkt op 23-11-2026**, elke mutatie apart op `ci.yml`:

| Mutatie | `hoofdrun:controle` | Wat er rood werd |
|---|---|---|
| `push: branches: ['**']` terug | groen | alleen de nieuwe toets |
| `push: branches: [develop]` (`main` valt weg) | groen | de bestaande kanarie *en de controle heeft daarbij echt iets gelezen*, plus de nieuwe toets |
| `pull_request:` weg | groen | alleen de nieuwe toets |

⚠️ De tweede rij laat zien dat `hoofdrun:controle` als los commando groen blijft als
`main` uit de trigger valt. Dat was al zo, en het wordt gevangen door de kanarie in de
testsuite, die in de poort en in CI draait. Dit issue verandert dat niet.

## Onderzocht, niet gebouwd: RLS en Windows alleen op PR's

Acceptatiecriterium 5 vraagt of de RLS-job (±60% van de tijd) en de Windows-job alleen op
PR's kunnen draaien en niet op de push naar `main`. De doorrekening staat ook op
QS8-819.

**Wat het zou besparen**, per run op `main`:

- RLS: gemiddeld 7,3 minuten, per job naar boven afgerond. Geschat ±7,8 Linux-minuten.
- Windows: gemeten 2,12 gefactureerde Windows-minuten per run op `main`, maal 1,67 is
  ±3,5 Linux-equivalent.
- Samen ±11,3 Linux-equivalente minuten per run.

| | Gemeten venster (169 runs op `main`) | Tempo laatste 7 dagen |
|---|---|---|
| Alleen RLS weg op `main` | ±1.300 min, ±$8 | ±5.000 min, ±$30 |
| Alleen Windows weg op `main` | ±600 min, ±$3,6 | ±2.200 min, ±$13 |
| **Allebei** | **±1.900 min, ±$11** | **±7.200 min, ±$43** |
| Deze wijziging met allebei erbij | ±8.000 min, ±$36 boven de $12 | ±27.400 min, ±$152 |

**Wat het zou kosten:**

1. **De RLS-job is de enige job die het schema uit álle migraties opbouwt** en daartegen
   de RLS-suite en de 16 database-controles draait. Op `main` is dat de meting van de
   combinatie van twee PR's die elk apart groen waren. Dat is precies de klasse van
   *"twee groene PR's samen rood"*
   (`docs/decisions/2026-09-09-twee-groene-prs-samen-rood.md`): de ene PR verandert een
   functie, de andere leunt erop, en alleen het geheel breekt. Zonder RLS op `main` ziet
   niemand dat tot de volgende PR, en die krijgt dan de rode uitslag van iemand anders.
2. **`Alles groen` moet `skipped` gaan accepteren.** De poort-job eist nu `success` van
   elke job in `needs`. Overslaan op `main` betekent dat hij `skipped` als goed leest.
   Dat is *ongemeten als groen*, de klasse waar dit project een grendel voor heeft
   (QS8-268, QS8-270). `hoofdrun:stand` zou `main` daarna groen melden zonder dat de
   RLS-kant gemeten is.
3. **Windows is het kleinere risico.** Dat twee PR's die elk op Windows starten samen
   niet meer starten, is onwaarschijnlijk. Maar het bedrag is ook klein: ±$3,6 tot ±$13
   per maand.

**Een doorrekening, geen advies.** RLS weghalen op `main` scheelt het meeste geld
en raakt het meeste aan wat `main` belooft. Windows weghalen scheelt weinig en raakt
weinig. Allebei laten staan kost ±$11 tot ±$43 per maand. De keuze is aan Quinten.

## Het klikpad voor de dag dat de repo privé gaat

Volgorde is belangrijk: **eerst betaalmethode en plafond, dan pas privé.** Zolang de repo
publiek is, kost Actions niets. Gaat hij eerst privé, dan blokkeert Actions zodra de $12
op is, en dan stopt de rollover.

De repo hoort bij het persoonlijke account `QS86-bot`. Alles hieronder doe je ingelogd
als dat account. Gecontroleerd tegen docs.github.com op 23-11-2026.

**1. Betaalmethode**

1. Profielfoto rechtsboven → **Settings**.
2. In de zijbalk, onder **Access**: **Billing & Licensing**.
3. **Payment information** → voeg een kaart of PayPal toe.

**2. Budget met plafond**

1. Open `https://github.com/settings/billing` → **Budgets and alerts** → **New budget**.
2. Budget Type: **Product-level budget**, product **Actions**.
3. Budget scope: het hele account of alleen `GoalBuddies`. ⚠️ Maak er één, niet
   allebei: GitHub telt gebruik mee in elk budget dat van toepassing is, en het eerste
   dat op is, blokkeert.
4. Budget: **[jouw bedrag]** per maand, bijvoorbeeld $75.
5. Vink **Stop usage when budget limit is reached** aan. ⚠️ Zonder dit vinkje krijg je
   alleen een e-mail en loopt het gebruik door.
6. Vink **Receive budget threshold alerts** aan (75%, 90% en 100%).
7. **Create budget**.

⚠️ Wat het plafond betekent: is het bedrag op, dan stopt **alle** Actions, ook de
rollover en de notificaties, tot de volgende maand of tot je het budget verhoogt. Met
dit plafond kies je dus ook hoe vroeg in de maand dat kan gebeuren. Bij het tempo van de
laatste week (±$196 per maand boven de $12 na deze wijziging) is $75 rond dag 12 op; dat is een extrapolatie, geen meting.

**3. Deze PR mergen**

Op het sein van Quinten, met een merge-commit. Daarna `npm run hoofdrun:stand`.

**4. Zichtbaarheid**

1. In de repo: **Settings** → **General** → helemaal onderaan **Danger Zone**.
2. **Change repository visibility** → **Make private** → bevestig.

**5. Daarna**

De controles die QS8-126 noemt: `rollover.yml` en `notificaties.yml` een keer met de
hand starten (`workflow_dispatch`) en kijken of ze draaien, en de geschiedenis één keer
op een sleutel controleren.

## Aannames

- **De jobduur van de steekproef geldt voor alle runs.** De RLS-job varieert van 4 tot 9
  minuten. De ±7,8 afgeronde minuten voor RLS zijn geschat uit het gemiddelde van 7,3,
  niet per job gemeten.
- **Het aantal PR-runs blijft gelijk** (±358 per 30 dagen). Gaan sessies vaker een
  draft-PR openen om CI te krijgen, dan stijgt dat.
- **Het tempo van de laatste 7 dagen voor runs op `main`** is niet apart gemeten. In de
  doorrekening hierboven is het gevonden met dezelfde factor als het totaal (84.600 /
  22.500 = 3,76).
- **Of GitHub een `schedule` op een privérepo net zo knijpt als nu** (±4 runs per dag in
  plaats van 24) is niet bekend. Levert het wel elk uur, dan kost het geplande deel
  ±3.500 minuten in plaats van ±600.
- Het klikpad is gecontroleerd tegen de documentatie, niet in de GitHub-interface zelf.
  Deze sessie heeft geen toegang tot de instellingen van het account.
