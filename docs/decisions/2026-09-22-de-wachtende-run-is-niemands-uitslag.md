# De wachtende run is niemands uitslag

**22-09-2026 · QS8-582 · `scripts/hoofdrun-controle.mjs`, `scripts/hoofdrun-stand.mjs`, `.github/workflows/ci.yml`**

## Wat er gebeurde

Op 21-09-2026 landden drie merges op `main` binnen vijftien seconden. Geen van de
drie commits heeft een CI-uitslag.

📏 Gemeten op 22-09-2026 tegen `origin/main` = `1ab4abc0`, uit de GitHub-API
(`/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100`):

```
20:28:42  run 2962  152c0321  LOOPT tot 20:36:36
20:33:23  run 2965  e6cc6e2e  wacht  → afgebroken om 20:33:32 door 2966
20:33:31  run 2966  339f6530  wacht  → afgebroken om 20:33:40 door 2967
20:33:38  run 2967  28542c7c  wacht  → afgebroken om 20:36:37 door 2969
```

Alle drie op `run_attempt: 1`, dus er is geen herstart geweest. Drie toestanden
die uitgerold zijn hebben geen uitslag: niet groen, niet rood, er niet.

📏 Het is niet bij die drie gebleven en het is ook niet nieuw: in de laatste 100
push-runs op `main` staan er **zes** op `cancelled` — naast deze drie ook
`b5f8851e`, `9b674c16` en `3920db87` van 17-09-2026.

## Waarom de bestaande grendel dit niet ving, en waarom dat terecht was

`hoofdrun:controle` toetst sinds QS8-318 dat `cancel-in-progress` een run op
`main` niet afbreekt. Die regel stond goed en staat nog goed:

```yaml
cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Op `main` is die expressie `false`, en een **lopende** run wordt dus niet
afgebroken. Run 2962 liep van 20:28 tot 20:36 en is inderdaad netjes afgerond.

Wat er gebeurde is iets anders: **GitHub houdt per concurrency-groep maar één run
in de wachtrij.** Arriveert er een derde, dan annuleert die de wachtende. In het
schema hierboven is dat precies te zien — elke run wordt afgebroken op de seconde
waarop zijn opvolger binnenkomt, en de laatste van de rij op de seconde waarop de
lópende run klaar is en run 2969 aankomt.

`cancel-in-progress` zegt niets over de wachtrij. De grendel dekte de lopende run;
de wachtende was zijn blinde vlek.

⚠️ **Dat is vraag 3 van onwrikbare regel 18 in zijn zuiverste vorm:** kan deze
toets groen blijven terwijl de belofte breekt? De toets ging over
`cancel-in-progress`; de belofte eronder is *elke toestand van `main` krijgt een
uitslag*. De toets bleef groen en is ook nooit onwaar geweest.

## Wat er nu staat

### 1. Preventie — de groep is op `main` per commit

```yaml
group: ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}
```

Op `main` krijgt elke commit zijn eigen groep, dus er staat niets in een wachtrij
om uit geduwd te worden. Buiten `main` blijft de groep per ref, want daar moet
`cancel-in-progress` juist kunnen afbreken — een nieuwe push maakt de vorige
commit daar achterhaald.

⚠️ **Dit kost serialisatie op `main`, en dat is de prijs.** Twee merges binnen
acht minuten draaiden hiervóór achter elkaar en draaien nu naast elkaar. Dat mag
hier omdat `ci.yml` niets uitrolt: de vijf jobs zijn `controle`, `rls`, `edge`,
`scripts_windows` en de samenvattende `poort`, en geen daarvan raakt een gedeelde
toestand buiten de runner. Komt er ooit een deploy-job bij, dan is dit besluit het
eerste dat opnieuw gewogen moet worden — en dan hoort de serialisatie op díé job
te zitten en niet op de hele workflow.

### 2. Detectie op de regel — `hoofdrun:controle`, tweezijdig

Hij toetst nu naast `cancel-in-progress` ook de `group:`, en aan twee kanten:

| kant | eis | wat er misgaat zonder |
| --- | --- | --- |
| op `main` | twee commits krijgen **verschillende** groepen | de wachtrij van QS8-582 |
| daarbuiten | twee commits krijgen **dezelfde** groep | `cancel-in-progress` is dode letter |

⚠️ **Eén kant toetsen laat de andere vrij.** Dat is dezelfde rateleigenschap als
in `regel15:controle`: repareer je de eerste door overal per commit te splitsen,
dan draait elke achterhaalde featurebranch-commit vanaf dat moment zijn volle
suite uit, en niets wordt daar rood van.

⚠️⚠️ **Hij rékent de expressie uit en herkent hem niet op een woord.** Een regel
als *"de groep moet `github.sha` noemen"* is één regel code en laat dit door:

```yaml
group: ci-${{ github.ref != 'refs/heads/main' && github.sha || '' }}
```

Die noemt `github.sha` en splitst precies overál behalve op `main` — exact
verkeerd om. Dat is geen bedacht randgeval: die `!=` staat in `ci.yml` één regel
lager, en de meest waarschijnlijke misverbetering van een expressie is de buurman
ervan. Daarom staat er een kleine evaluator voor de deelverzameling die hier
voorkomt (`github.*`, `==`, `!=`, `&&`, `||`, tekstliteralen, `format()`), die de
groep voor twee verzonnen commits uitrekent en de uitkomsten vergelijkt.

⚠️ **Die evaluator faalt dicht.** Een expressie die hij niet kan lezen, is een
bevinding en geen groen — dezelfde vorm als `sleutelzetters()`. Een groep waarvan
niemand kan zeggen of hij de wachtrij dichthoudt, houdt hem niet aantoonbaar
dicht.

### 3. Detectie op de stand — `hoofdrun:stand` leest een venster

Hij haalde `per_page=1` op en beoordeelde de nieuwste run. Dat beantwoordt *"staat
`main` nu groen"*, en dat is niet dezelfde vraag als *"heeft elke toestand van
`main` een uitslag gekregen"*. Op 21-09 was de run ná de drie afgebroken runs
groen, dus het script zei groen — niet onwaar, wel onvolledig.

Hij leest nu de laatste 20 runs en meldt elke commit waarvan geen enkele run een
afgeronde uitslag heeft. `cancelled`, `skipped`, `stale` en `action_required`
tellen niet als uitslag; een commit waarvan nog een run **draait** telt niet als
verlies, want die kan er nog een krijgen.

⚠️ **Een venster en geen geschiedenis, en dat is een keuze met een prijs.** Een
commit die ouder is dan twintig runs valt uit het zicht zonder dat er iets rood
wordt. Dat is bewust — een alarm over een commit van dertig merges terug is niet
meer te beantwoorden met een herstart die iets betekent, en een alarm dat je niet
kunt beantwoorden leer je negeren. **Maar het is wél de drift die zichzelf
herstelt uit QS8-411**, en die hoort opgeschreven te staan in plaats van
weggepoetst. De drie van 17-09 vallen er vandaag al buiten.

## Een bijvangst die deze ronde zelf opleverde

📏 `cancelRegel()` las het **hele bestand**: `/cancel-in-progress:\s*(.+)/` over
`ci.yml`. Toen deze ronde een kop bijzette die die sleutel uitlégt, werd de
controle rood op zijn eigen uitleg — hij las

```
`cancel-in-progress: false` beschermt de **lopende** run; de
```

als de instelling. Dat is de knip-klasse van QS8-412: de knip die een controle
scherp houdt, is zelf een grendel. Hij leest nu het `concurrency:`-blok en slaat
de commentaarregels daarbinnen over.

⚠️ De richting was veilig — een vals alarm, geen stil doorlaten — en dat is het
enige geruststellende eraan. De grendel die dit vasthoudt staat in
`tests/scripts/hoofdrun-controle.test.ts` (*trapt niet in een comment die de
sleutel noemt*).

## De ijking

📏 Gemeten op 22-09-2026. **Ervóór: 54 geslaagd, 0 rood** over
`tests/scripts/hoofdrun-controle.test.ts` en `tests/scripts/hoofdrun-stand.test.ts`
samen, op commit `8c131717`. Eén mutatie per grendel, telkens teruggedraaid, en na
afloop opnieuw 54/0.

| # | mutatie | rood |
| --- | --- | --- |
| 1 | `ci.yml`: groep terug naar `ci-${{ github.ref }}` | *de echte workflows — geen enkele breekt een run op main af* |
| 2 | `ci.yml`: groep naar `ci-${{ github.sha }}` (splitst overal) | idem |
| 3 | `deeltGroepOpMain` zoekt op het wóórd `github.sha` | *vindt een expressie die juist buiten main splitst* |
| 4 | `splitstGroepBuitenMain` keurt alles goed | *vindt een groep die overal per commit splitst* + *vindt een onleesbare expressie* |
| 5 | `cancelRegel` leest weer het hele bestand | *trapt niet in een comment die de sleutel noemt* + *de echte workflows* |
| 6 | `isUitslag` telt `cancelled` als uitslag | *vindt de drie van 21-09-2026* + *en dan weigert de exitcode nul* |
| 7 | `exitcode` negeert de verloren commits | *en dan weigert de exitcode nul* |
| 8 | `looptNog` geeft altijd `false` | *laat een sha met rust waarvan nog een run draait* |

⚠️ Mutatie 1 en 2 worden allebei door dezelfde toets gevangen — dat is de toets
die de bewering over de échte bestanden draagt, en die kán niet per kant
onderscheiden. De twee kanten staan daarom apart onder hun eigen unit-toets
(mutatie 3 en 4).

⚠️⚠️ **Wat deze ronde zelf over ijken leerde.** De eerste ijkronde draaide op een
boom waar het werk nog níét in gecommit stond, en `git checkout --` om een mutatie
terug te draaien gooide toen het hele werk weg. De metingen die daaruit kwamen
waren niet onwaar maar wel over een andere boom dan ze beweerden — precies
QS8-411: *een rood is niet vanzelf jouw rood*. **Commit vóór je ijkt.**

## De drie commits van 21-09

Ze zijn alsnog van een uitslag voorzien door hun runs te herstarten, **één voor
één** — drie herstarts tegelijk zouden elkaar opnieuw uit de wachtrij duwen,
want een herstart draait onder de workflow van zijn eigen commit en die draagt de
oude groep. Uitkomsten:

- `e6cc6e2e` — run 2965, poging 2: **success**
- `339f6530` — run 2966, poging 2: **success**
- `28542c7c` — run 2967, poging 2: **success**

⚠️ **Drie keer groen is hier een uitkomst en geen bevestiging vooraf.** Was er
één rood geweest, dan had `main` een dag lang een gebroken toestand gedragen
waarvan niemand wist. Dat dit meeviel, is precies wat je niet kunt weten zolang de
uitslag er niet is — en dat is het hele argument van deze rij.

De drie van 17-09 (`b5f8851e`, `9b674c16`, `3920db87`) zijn **niet** herstart. Ze
liggen ruim tweehonderd commits terug; een uitslag daarover zegt niets meer over
een toestand die iemand nog kan repareren, en ze vallen buiten het venster van
`hoofdrun:stand`. Dat is de prijs van dat venster, hier voor het eerst betaald.

## Wat dit niet is

Geen wijziging aan `cancel-in-progress` — die stond goed. Geen voorstel voor
GitHubs *"Require branches to be up to date"*; die afweging staat in
`docs/decisions/2026-09-09-twee-groene-prs-samen-rood.md` en kost serialisatie van
het mergen zelf.

En geen afschaffing van de afspraak *minstens acht minuten tussen twee merges op
`main`* uit `docs/PROMPT-SESSIE.md` §9. De gemeten grond onder die afspraak is
hiermee weg, maar dat is een voorspelling tot iemand twee merges binnen acht
minuten heeft gedaan en heeft vastgesteld dat beide commits een uitslag hielden.
Tot die meting er is, blijft de afspraak staan — een aanname als aanname, met de
meting die haar zou sluiten erbij.
