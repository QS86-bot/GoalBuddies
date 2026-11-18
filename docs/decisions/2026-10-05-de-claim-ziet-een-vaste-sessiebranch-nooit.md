# Een claim-commit op een branch zonder issuenummer — QS8-620

**Datum:** 05-10-2026
**Issue:** QS8-620
**Raakt:** `scripts/claim.mjs`, `tests/scripts/claim.test.ts`,
`tests/scripts/claim-gelande-geschiedenis.test.ts`

## Wat er mis was

`botsendeBranches()` herkent een bezette branch aan het **issuenummer in de
branchnaam**. Een sessie die een vaste branch opgelegd krijgt — `claude/…` —
bouwt elk issue op een naam die per constructie nooit een nummer draagt. Haar
werk was daarmee voor geen enkele andere sessie zichtbaar, niet vóór de push en
niet erna.

⚠️ **En de blinde vlek was eenrichtingsverkeer.** Zo'n sessie kan de ánder wél
zien, want díe branches dragen het nummer. Er ging dus nooit een alarm af bij de
partij die het had moeten horen. Dat is op 28-09-2026 één keer betaald: QS8-603
is twee keer gebouwd.

⚠️ **Er zat nog een laag onder, en die is de eigenlijke oorzaak.** De standaardweg
doet `git checkout -b <naam> origin/main`. Dat haalt een sessie met een opgelegde
branch van haar eigen werk af, dus zij **kón** het gereedschap niet gebruiken — en
gebruikte het niet. De blinde leeskant was het gevolg, niet de oorzaak.

## Wat er gekozen is

**Richting 1 van het issue: de claim-commit op de branch zetten waar de sessie al
staat**, plus de leeskant die hem terugvindt. De andere twee zijn afgewezen:

| richting | waarom niet |
|---|---|
| een claim-register buiten git | git is de enige bron die beide sessies zeker delen; een tweede bron is een tweede ding dat uit elkaar kan lopen |
| niets doen en de handeling afdwingen | dat was de toestand, en CLAUDE.md zegt er al bij dat een claim een afspraak is en geen slot. De meting hieronder laat zien hoe vaak die afspraak niet gehouden wordt |

Drie stukken, en ze hangen aan elkaar:

1. **`--hier`** claimt op de huidige branch en pusht die, in plaats van een branch
   per issue vanaf `origin/main` te maken.
2. **Een grendel op de standaardweg.** Sta je op een branch zonder issuenummer en
   geef je geen `--hier`, dan weigert de claim en noemt hij beide uitwegen. Dat
   verandert *"dit gereedschap kan ik niet gebruiken"* in *"zo gebruik je het"*.
3. **`bezetteNaamlozeBranches()`** leest de claim-commits die vóór `origin/main`
   op een remote branch staan, en weigert hard — zoals `botsendeBranches()`, want
   dit is bezetting *nu* en geen gelande geschiedenis.

## 📏 De grens, en waarom hij structureel is en geen datum

Dit is het deel dat de bron bruikbaar maakt. Gemeten op 05-10-2026: er stonden
**176** unieke claim-commits vóór `main`. Per branch geteld — en zo kijkt deze
grens — zijn het **533** paren over 34 branches; de twee grootste delen bijna
hun hele geschiedenis, vandaar het verschil. Het overgrote deel zit in vijf
afgedwaalde branches die nooit geland zijn:

| branch | claims vóór main | commits vóór main | tip |
|---|---|---|---|
| `quintenstrijdonk/qs8-438-…` | 154 | 1832 | 13-09 |
| `quintenstrijdonk/overdracht-13-09` | 153 | 1832 | 13-09 |
| `quintenstrijdonk/qs8-388-…` | 83 | 1466 | 09-09 |
| `quintenstrijdonk/qs8-375-…` | 70 | 1401 | 09-09 |
| `claude/linear-backlog-plan-erjwv1` | 47 | 1269 | 08-09 |

Werk dat écht in uitvoering was, droeg er **één**, op 1 tot 3 commits —
gemeten over qs8-631, qs8-624, qs8-623, qs8-621, qs8-606, qs8-603, qs8-525 en
qs8-233. **Een regel zonder grens meldt dus honderden bezettingen waar er acht
zijn**, en een controle die alles meldt leer je te negeren.

⚠️ **Een tipdatum zou het vandaag ook doen, en is toch niet gekozen.** De drie
naamloze kerkhoven hebben een tip van 08-09, 13-09 en 14-09, en een levende
sessiebranch die van vandaag — dus een drempel zou scheiden. Maar een datum wordt
vanzelf onwaar zonder dat er iets rood van gaat; dat is dezelfde klasse als de
prijstabel die haar geldigheid in een commentaarregel droeg (QS8-187). Het aantal
onafgeronde claims is een eigenschap van het ding zelf: **een werkbank draagt er
één, een kerkhof honderdvijftig.**

⚠️ **En de bron ruimt zichzelf op.** `origin/main..<branch>` krimpt zodra werk
landt, dus de claim van een afgerond issue valt er vanzelf uit. Dat is precies
het verschil met `gelandVoor()`, die de andere kant leest.

`MAX_ONAFGERONDE_CLAIMS` staat op **3**: ruimte voor een sessie met meer dan één
PR open, en nog ver onder de 47 van het kleinste kerkhof.

## 📏 IJking — met de hand, één mutatie per grendel

Ervóór 53/53 groen (41 unit, 12 integratie). Elke mutatie hersteld en met
`diff -q` nagekeken; `claim.mjs` is na alle zeven byte-identiek.

| mutatie | rood | in unit (41) | in integratie (12) |
|---|---|---|---|
| A de `bezetteNaamlozeBranches`-tak uit `hoofd()` halen | 2 | **0** | 2 |
| B melden maar niet `process.exit` | 2 | **0** | 2 |
| C de grens `MAX_ONAFGERONDE_CLAIMS` weghalen | 3 | 2 | 1 |
| D de uitsluiting van een branch mét nummer weghalen | 1 | 1 | 0 |
| E `--hier` negeren | 2 | **0** | 2 |
| F de grendel op een vaste branch weghalen | 1 | **0** | 1 |
| G het onderwerp van de claim-commit anders schrijven | 3 | 1 | 2 |

⚠️ **Vier van de zeven grendels zijn onzichtbaar in de unit-suite.** Dat is
waarom het integratieharnas met een echte repo op schijf bestaat: A, B, E en F
laten alle 41 unit-toetsen groen terwijl de claim precies de fout van 28-09 weer
maakt.

⚠️ **A en B vallen op dezelfde twee toetsen, en dat is geen gat.** Het zijn twee
verschillende fouten met één uitkomst — de claim gaat door — en de toets bewaakt
de belofte (*weigert, en laat niets op de remote achter*) en niet welke regel die
belofte waarmaakt.

⚠️ **G is de naad.** `claimBericht()` schrijft het onderwerp en `claimVoor()`
leest het terug; verander je de vorm aan één kant, dan wordt de claim onzichtbaar
terwijl er niets stuk lijkt. Die mutatie valt daarom aan beide kanten om — en dat
is wat een naadtoets hoort te doen.

## 📏 De meting van het issue, hermeten — en ze reproduceert niet

AC 3 vraagt de meting van het issue in dit document, zodat de volgende sessie kan
zien of het gat kleiner wordt. Hij reproduceert niet, en dat is het opschrijven
waard in plaats van hem stil te vervangen.

Het issue meldt **184** merges sinds 13-09 op `daa22b64`, met als commando
`git log origin/main --merges --first-parent --since=2026-09-13T00:00:00Z`.
Gemeten op 05-10-2026:

| variant | op `daa22b64` | op `083b6137` |
|---|---|---|
| `--merges --first-parent --since` (het commando van het issue) | **116** | **126** |
| `--merges --since`, zonder `--first-parent` | **210** | **221** |

**184 ligt tussen die twee en is met geen van beide te halen.** Zelfde klasse als
QS8-603, dat precies hierover ging: een getal met een methode eronder die het niet
oplevert.

De stand van vandaag, met het commando er expliciet bij — `--first-parent`, want
dat zijn de landingen op `main` zelf:

| meting op `083b6137` | waarde |
|---|---|
| merges sinds 13-09 (`--merges --first-parent`) | **126** |
| daarvan zonder `claim: QS8-NNN` in de tweede ouder | **26** |

Van die 26 zijn er twee een `Overdracht bijgewerkt`-PR; de rest zijn
issue-bouwen, waaronder #604, #626, #614, #605, #602, #599, #597 en #595. **Het
gat staat dus nog open** — dit issue maakt het zichtbaar, het dicht het niet
vanzelf.

## Wat dit níet repareert

- **Een sessie die `npm run claim` niet draait.** Dat is een proceshandeling, en
  dit gereedschap kan hem niet afdwingen; wat het nu wél doet is de weg
  openzetten die er voor zo'n sessie niet was. De 26 hierboven zijn de maat
  waarop de volgende sessie kan zien of dat helpt.
- **Een squash- of rebase-merge**, die geen claim-commit op `main` achterlaat.
  Dezelfde blinde vlek als bij QS8-611.
- **Een kerkhof dat tóch bezetting is.** Draagt een branch meer dan drie
  onafgeronde claims, dan telt hij hier niet mee. Dat is bewust: de alternatieve
  fout — honderden meldingen — kost de hele controle.
- **Een claim die alleen lokaal staat.** `--hier` pusht daarom; een claim die de
  ander niet kan zien is een aantekening.
