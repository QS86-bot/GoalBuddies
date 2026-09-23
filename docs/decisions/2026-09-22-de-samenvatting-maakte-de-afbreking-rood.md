# De samenvatting maakte de afbreking rood

**Datum:** 22-09-2026
**Issue:** QS8-589 (geschreven door baan A, gebouwd door baan B)
**Status:** gebouwd
**Raakt:** `.github/workflows/ci.yml`, `scripts/hoofdrun-controle.mjs`,
`tests/scripts/hoofdrun-controle.test.ts`

## 1. Wat er aan de hand was

De samenvattende job van `ci.yml` — `poort`, met de naam **Alles groen** —
droeg `if: always()`. Dat is de vorm die je schrijft omdat je wilt dat de
samenvatting ook bij een rode job draait; anders verbergt één rode controle de
uitslag van de rest.

Hij draait dan echter óók als de **run** is afgebroken. De jobs in `needs`
dragen op dat moment `result = cancelled`, de samenvattingsstap vergelijkt met
`"success"`, en de job faalt. GitHub markeert de run zelf netjes als
`cancelled`; het was déze job die daar een **failure** van maakte.

📏 Gemeten op 22-09-2026 over de laatste 100 CI-runs: **78** `success`,
**19** `cancelled`, **3** `failure`. Afbreken is dus bijna een vijfde van alle
runs, en dat is geen incident maar inherent: `cancel-in-progress` staat sinds
QS8-582 aan voor alles behalve `main`, dus elke tweede push binnen een paar
minuten levert er een op.

📏 Het zuiverste gevolg staat op PR #583: op één commit (`ae82974f`) stonden
**twee** `Alles groen`-checks met tegengestelde uitslag — de afgebroken run had
er rood neergezet, de herstarte groen. De PR is zo gemerged.

## 2. Dat dit QS8-582 één laag hoger is

De les van QS8-582 was dat een afgebroken run **niemands uitslag** is: de
wachtende run werd uit de rij geduwd en de commit hield niets over. De
reparatie daar was de concurrency-groep per commit op `main`.

Hier is het dezelfde vorm op jobniveau. Een afgebroken run heeft niets
gemeten, en dus hoort er geen uitslag uit te komen — geen groene en zeker geen
rode. Een rode is de gevaarlijkste van de twee, want hij leest als een
bevinding: wie hem op een PR ziet staan, gaat zoeken naar een fout die er niet
is, en wie dat twee keer heeft gedaan leert de check te negeren. Dat laatste is
de klasse waar dit hele project op let — een controle die vals alarm geeft,
leer je overslaan.

## 3. De reparatie, en waarom hij zo smal is

```yaml
if: always() && !cancelled()
```

`!cancelled()` slaat alleen aan op een afgebroken **run**. Dan wordt de job
overgeslagen, en dat klopt: er is niets gemeten, dus er valt niets samen te
vatten.

⚠️ **Wat er met opzet níet onder valt.** Loopt een afzonderlijke **job** op
zijn eigen `timeout-minutes`, dan komt díé terug als `cancelled` terwijl de run
gewoon doorloopt. `cancelled()` is dan onwaar, de samenvatting draait wél, en
de uitslag wordt rood. Dat is het gewenste gedrag en geen gat: er ís gemeten,
en de meting liep vast. Het geval is ook geen theorie — de kop van de RLS-job
in `ci.yml` beschrijft twee runs van QS8-433 waar precies dat gebeurde
(QS8-518). Dat is acceptatiecriterium 3 van het issue, en het antwoord is
"dit geval blijft onverkort rood" en niet "dit geval kan niet voorkomen".

## 4. De vraag die het issue blokkeerde, en waarom er niet gevraagd is

Acceptatiecriterium 5 vroeg of `Alles groen` een **required check** is. Zo ja,
dan zou een `skipped` een merge kunnen blokkeren en is de reparatie duurder dan
de fout. Dat is een vraag met een meetbaar antwoord, en dus geen grens 1.

📏 Gemeten via de API op 22-09-2026:
`GET /repos/QS86-bot/GoalBuddies/branches/main` geeft
`"protection": {"enabled": true, "required_status_checks": {"enforcement_level": "off", "contexts": [], "checks": []}}`.
`Alles groen` is dus **geen** required check, en een `skipped` blokkeert niets.

📏 Bevestigd uit de praktijk, want een leeg lijstje is ook wat je krijgt als je
het verkeerde veld leest: PR #583 is gemerged terwijl deze check op zijn head
**rood** stond. Een check die rood mag zijn bij een merge, is geen required
check.

⚠️ **De grens van die meting hoort erbij.** Het uitgebreide
`/branches/main/protection`-endpoint geeft HTTP 403 _"Resource not accessible
by integration"_ onder de rechten van deze sessie. Het antwoord hierboven komt
dus uit het samengevatte veld op de branch plus het bewijs uit de praktijk, en
niet uit de volledige instelling. Zet iemand `enforcement_level` ooit aan, dan
verandert dit antwoord zonder dat hier iets rood van wordt.

## 5. De grendel, en dat hij groen was omdat hij niets vond

`hoofdrun:controle` bewaakte tot nu toe drie eigenschappen van een workflow op
`main`. Er is er een vierde bij: een samenvattende job — een job met `needs:`
én een eigen `if:` — mag geen `always()` dragen zonder `!cancelled()`.

De eerste versie van de lezer knipte de jobs met één reguliere expressie:

```js
/\n {2}([\w-]+):\n((?: {4}[^\n]*\n|\n)*)/g;
```

Die at de lege regel op die de **volgende** `\n  naam:` nodig had. 📏 Gevolg op
de echte `ci.yml`: vier jobs gevonden — `controle`, `rls`, `edge`,
`scripts_windows` — en `poort` niet, want die staat als laatste. De controle
meldde "geen workflow verliest een uitslag op main" omdat hij de enige job die
hem aanging nooit gezien had.

⚠️ **Dat is niet gevonden door erover na te denken, maar door de kanarie.** De
toets die eiste dat `samenvattendeJobs(ci)` de naam `poort` oplevert, werd rood
in dezelfde ronde als de toets over twee opeenvolgende jobs — één bug, twee
symptomen. Zonder die kanarie was de lege bevindingenlijst groen geweest en had
niets dat tegengesproken. Dat is de les van QS8-323, hier voor de tweede keer
betaald: **een lege uitkomst is ook wat je krijgt als de lezer nooit iets
vond.**

De lezer is daarom een regelscanner geworden en geen tweede reguliere
expressie, met twee grenzen die er los in staan: hij begint pas bij `jobs:`
(anders zijn `push:` en `schedule:` uit het `on:`-blok ook jobs), en hij slaat
commentaarregels over (anders sluit een `#` op kolom 0 het blok).

## 6. De ijking, en de twee mutaties die niets rood maakten

Stand ervóór gemeten: **53 groen, 0 rood**. Eén mutatie per grendel, en
gekeken wélke toets omvalt.

| #   | Mutatie                                                | Wat er rood werd                                                       |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | `ci.yml` terug naar het kale `if: always()`            | `geen enkele breekt een run op main af`, en `hoofdrun:controle` exit 1 |
| 2   | `afbrekingWordtRood()` kijkt niet meer naar `always()` | de drie must-finds                                                     |
| 3   | de `if:`-lezer accepteert ook inspringing 8            | `leest een stap-if op inspringing 8 niet als de conditie van de job`   |
| 4   | `jobBlokken()` terug naar de reguliere expressie       | de kanarie, plus de toets over twee jobs en die over het `on:`-blok    |
| 5   | `binnen` begint op `true`                              | **niets**                                                              |
| 5b  | élke topsleutel opent een blok, niet alleen `jobs:`    | `laat de sleutels uit het on-blok met rust`                            |
| 6   | de overslag van commentaarregels eruit                 | **niets**                                                              |
| 6b  | idem, ná het toevoegen van een toets over kolom 0      | `laat een comment op kolom 0 het jobs-blok niet sluiten`               |

⚠️⚠️ **Rij 5 en rij 6 zijn het punt van dit hoofdstuk, en ze zeggen twee
verschillende dingen.**

**Rij 5 was de verkeerde mutatie.** `binnen` op `true` zetten verandert niets,
want de eerstvolgende topsleutel (`name:`, `on:`) zet hem meteen weer op
`false`. De scoping wordt gedragen door de combinatie van die reset en de
`jobs:`-poort, niet door de beginwaarde. Rij 5b breekt wél wat de toets
belooft, en dan bijt hij. **Een mutatie die niets rood maakt, is eerst een
verdenking tegen de mutatie** — dezelfde les als de armatuur die niet landde
bij QS8-593.

**Rij 6 was de verkeerde toets.** Daar was de mutatie juist en bleef het toch
groen: de toets die de overslag van commentaar nóemde — _"trapt niet in een
comment die de conditie noemt"_ — bewaakte hem niet, want `    # ... if: ...`
matcht `^ {4}if:` sowieso niet. Wat de overslag wél draagt is een comment op
**kolom 0**: die telt als nieuwe topsleutel en sluit het `jobs:`-blok, waarna de
controle groen is omdat hij niets meer vindt. 📏 Vandaag staan er **46** van
die comments in `ci.yml` en **0** ervan ná `jobs:` — dat is de stand en geen
eigenschap. De toets die dat afvangt is er in deze ronde bij gekomen, ná de
ijking en dóór de ijking.

⚠️ De oude toets is blíjven staan, met de meting in zijn kop dat hij geen
grendel is maar een must-allow. Stil weghalen zou de meting wissen; stil laten
staan zou hem als grendel laten lezen. Dat is dezelfde keuze als bij
`rls:dekking` in QS8-411: een instrument schrijft zijn grens op in plaats van
hem te overschreeuwen.

## 7. Wat dit niet is

- **Geen verruiming van `always()` als vorm.** Op stapniveau blijft
  `if: always()` juist goed — `ci.yml` heeft er zo een op regel 575, zodat één
  rode controle de volgende niet verbergt. De controle kijkt daarom alleen naar
  inspringing 4.
- **Geen belofte dat een afgebroken run nu zeldzaam is.** 19 op 100 blijft 19
  op 100; alleen de valse rode uitslag is weg. De reparatie van QS8-582 haalt
  het aantal afbrekingen op `main` omlaag, en dit issue haalt de schade van de
  overgebleven afbrekingen elders omlaag.
- **Geen uitspraak over branch protection.** Zie §4: de meting zegt wat er
  vandaag staat, niet dat het zo blijft.

## 8. Stand

- `npm run poort`: niets rood; 24 controles ongemeten — dezelfde set als aan het
  begin van deze ronde, en de gedocumenteerde set voor een cloudsessie.
- `tests/scripts/hoofdrun-controle.test.ts`: 53 groen.
- `node scripts/hoofdrun-controle.mjs`: exit 0.
