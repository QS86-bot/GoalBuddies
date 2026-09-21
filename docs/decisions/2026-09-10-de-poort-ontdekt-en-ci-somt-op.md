# De poort ontdekt, en CI somde op — 10-09-2026

**Issue:** QS8-417
**Raakt:** `scripts/ci-controles.mjs` (nieuw), `tests/scripts/ci-controles.test.ts` (nieuw), `.github/workflows/ci.yml`, `scripts/poort.mjs`, `docs/ENGINEER-REVIEW.md`

---

## 1. Het gat, en welke kant het op liep

`scripts/poort.mjs` leest `package.json` en pikt élke `*:controle` op —
`controlesUit()` staat er sinds de dag dat de poort gebouwd is, met een comment
erboven dat precies dit uitlegt. `ci.yml` deed dat níet: daar stonden de namen
met de hand opgesomd.

📏 Hermeten op 10-09-2026: **52 controles, 26 genoemd in `.github/workflows/`,
26 niet.**

Het gevolg liep de verkeerde kant op. Een nieuwe grendel stond **automatisch in
de poort** — een commando dat een mens typt, en dat CLAUDE.md zelf *"de
inschatting van een mens over zijn eigen werk"* noemt — en **automatisch niet in
CI**, dat bij elke push draait.

Onder de 26 zaten precies de grendels die dit project betaald heeft:
`schermingang:controle` (vond `/doel/plan` af en onbereikbaar),
`registerdrift:controle` (redde drie sleutels van `sleutelzetters()`),
`exports:controle` en `hoofdrun:controle`.

⚠️ Twee ervan waren dezelfde dag gebouwd, in deze sessie: `padverwijzing:controle`
(QS8-412) en — bijna — `idempotent:controle` (QS8-413), die alleen in CI staat
omdat er met de hand een stap voor is bijgezet. Dat is het mechanisme in
werking, twee keer, binnen een uur na elkaar.

## 2. Een teruggegroeide reparatie, en dat is de eigenlijke les

`docs/ENGINEER-REVIEW.md` draagt de rij van **27-08-2026** —
*"CI toetste dát de controles werkten, en liet ze niets bewaken"* — op
`~~Laag~~ opgelost`. Die ronde repareerde **acht van de zeventien** instanties.

Drie weken later zijn het er 26, en de meeste zijn ná die reparatie gebouwd. De
klasse is dus nooit gesloten; alleen de instanties van toen.

> **Een reparatie die de instanties opruimt en het mechanisme laat staan, groeit
> terug — en hij doet dat onder een rij die "opgelost" zegt.**

De rij is met deze meting herwogen en draagt nu `~~Laag~~ opgelost, klasse
gesloten in QS8-417`.

## 3. De vorm: één lijst, twee banen, één register

`scripts/ci-controles.mjs --baan repo|database` print de namen; CI loopt erdoor.
De indeling komt uit twee dingen die al bestonden en niet uit een nieuwe lijst:

- `controlesUit()` uit `poort.mjs` — welke controles er zijn;
- `HEEFT_DATABASE_NODIG` uit `poort.mjs` — welke een opgebouwde database nodig
  hebben, en dus in de RLS-job horen.

**De verdeling is totaal.** Elke controle valt in precies één van drie: de
repobaan, de databasebaan, of `ZONDER_CI`. Er is geen vierde bak waarin iets
stil kan verdwijnen; dat wás de bug. Wil je er een buiten CI houden, dan moet je
hem in het register zetten mét een reden, en dat staat in de diff.

**Het register telt acht rijen**, en die stonden hiervoor verdeeld over twee
comments in `ci.yml`, elk met een deel van de lijst. Twee halve lijsten is hoe
je er een kwijtraakt.

📏 De banen draaien in **40 s** (repo, 36 controles) en **28 s** (database, 9).

## 4. Wat de per-stap-commentaren betreft

Er verdwenen twintig `- name:`-stappen met elk een comment erboven, en die
comments waren inhoudelijk. Ze zijn niet zomaar weggehaald: 📏 **alle 26
controles die in `ci.yml` stonden dragen een eigen scriptkop van tien regels of
meer.** Eén van de verwijderde comments zei het zelf al — *"Zie de kop van het
script voor wat hij wél en niet vindt."*

Twee kopieën van dezelfde uitleg is precies wat `docs:controle` elders in dit
project verbiedt. De reden per controle staat nu op één plek, en dat is de plek
waar hij hoort.

De prijs is dat een rode controle in de GitHub-UI één rode stap is in plaats van
een rode stap mét naam. Vandaar `::group::` per bevinding, en `set +e` zodat één
run álle bevindingen toont in plaats van de eerste — dezelfde vorm als de
Windows-job al had.

## 5. De ijking

| Grendel | Mutatie | Uitslag |
| -- | -- | -- |
| A — een nieuwe controle valt vanzelf in een baan | een `verzonnen:controle` in `package.json` | staat in de repobaan, grendel groen |
| B — een registerrij zonder reden | dezelfde controle in `ZONDER_CI` met `'zomaar'` | rood |
| C — een handmatige stap terug | `run: npm run emoji:controle` los in `ci.yml` | rood |
| D — een registerrij die niets meer noemt | `weggehaald:controle` in het register | rood |

A verdient een woord: dat is de **tegenproef**, en hij is de kern van het
ontwerp. De grendel hoeft niet te merken dat er een controle bijkomt — die valt
vanzelf in de repobaan en draait. Wat de grendel bewaakt is dat níemand er
daarna weer een handmatige lijst naast bouwt.

## 6. Een meting die hier niet thuishoort maar wel genoteerd wil zijn

📏 `gedeelde-identiteit:controle` en `logboek:controle` staan in
`HEEFT_DATABASE_NODIG`, maar draaien zonder database groen en meten dan wél iets
— ze lezen bronbestanden. Ze belanden daardoor in de databasebaan terwijl ze in
de repobaan hadden gekund.

Dat is onnauwkeurig en niet fout: ze draaien, en ze meten. Het is hier **niet**
gerepareerd omdat het issue met zoveel woorden zegt dat de poort niet het
probleem is en niet aangeraakt hoort te worden. Wie die set ooit opschoont,
vindt hier de meting.

## 7. Wat dit niet is

Geen wijziging aan de poort: die is de bron van de lijst en doet het goed. Geen
uitspraak over of een controle het júíste toetst — alleen dat hij ergens draait.
En geen matrix-job: één lus per baan is goedkoper dan tientallen runners voor
veertig seconden werk.
