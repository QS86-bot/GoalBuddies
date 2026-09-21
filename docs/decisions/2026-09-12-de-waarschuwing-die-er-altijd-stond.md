# Een waarschuwing die er altijd staat, waarschuwt nergens voor

**Datum:** 12-09-2026 · **Issue:** QS8-435 · **Status:** gebouwd

## Het geval

`migraties:controle` meldde op 11-09-2026 dat een zusterbranch een migratienummer
droeg dat botste met dat van `main`. De melding is nagemeten met `git ls-tree` op
diezelfde ref, het klopte op die ref, en hij is als bevinding op het issue van
iemand anders gezet.

📏 Beide refs waren op dat moment een uur oud:

| | |
|---|---|
| `b34e61d` — *"0254 → 0255, want main deelde óók dat nummer uit"* | 15:03:31 UTC |
| de melding op dat issue | 16:13 UTC |

Er was alleen `git fetch origin main` gedraaid. De branchref was daardoor van vóór
het hernummeren, en de controle las dezelfde oude ref. **De bevinding was al een
uur onwaar toen hij opgeschreven werd.**

## Waarom dit geen "beter opletten" is

Het script wáárschuwde ervoor, onderaan zijn foutmelding:

> Dit beeld is zo oud als je laatste `git fetch`.

Die zin stond letterlijk in die uitvoer. Hij was waar, hij stond op de goede plek,
en hij hielp niet — want hij stond er **altijd**, of je ref nu van tien seconden
of van een week oud was.

Dat is woordelijk de vorm die dit project al één keer heeft afgekeurd, bij
`migratie:nieuw` (QS8-247): *het verschil tussen "van net" en "van eergisteren" ís
het risico; één tekst voor beide gevallen leest als een disclaimer, en die leer je
overslaan.* Die reparatie is toen aan de uitdelende kant gebouwd en niet aan de
controlerende — terwijl juist de controle uitspraken doet over het werk van een
ánder.

## Wat er gebouwd is

`beeldmelding()` in `scripts/migratiebranches.mjs`, met drie gevallen en drie
teksten:

| Toestand | Melding |
|---|---|
| `FETCH_HEAD` jonger dan vijf minuten | de tijd, zonder voorbehoud |
| ouder | de tijd, de leeftijd in woorden, en *draai `git fetch --all` voordat je hier iets over zegt* |
| geen `FETCH_HEAD` | dát er nooit gefetcht is, plus wat dat in CI en in een oude werkkopie betekent |

`scripts/migraties-controle.mjs` drukt die regels af **onder de branchbevindingen
en nergens anders**.

## Vier keuzes die niet vanzelf spreken

### 1. Hij fetcht nog steeds niet

De grens uit `CLAUDE.md` blijft: wie een nummer **uitdeelt** fetcht, wie
**controleert** niet. Deze controle draait in de poort en in CI, waar een
netwerkaanroep de uitslag afhankelijk maakt van bereikbaarheid — en CI draait toch
al op een verse checkout. De leeftijd is zonder netwerk te lezen: `FETCH_HEAD`
staat op schijf, en git herschrijft hem bij élke fetch.

⚠️ Die eis is op de belófte getoetst en niet op een subcommando. De laatste test
in `tests/scripts/migratie-fetch.test.ts` draait de controle twee keer — met een
bereikbare remote en met diezelfde bare repo opzijgeschoven — en eist dezelfde
uitvoer. Een toets die `git fetch` in de bron zoekt, laat `git ls-remote` erdoor;
deze vergelijking valt om bij élke netwerkaanroep die op de uitslag doorwerkt.
📏 Geijkt met mutatie K: een `git ls-remote` die in een melding terechtkomt maakt
die test rood.

### 2. Alleen bij een branchbevinding

Een gat of een duplicaat in de eigen map leest deze controle van schijf; de
leeftijd van de remote doet daar niet ter zake. Zou de regel onder élke bevinding
staan, dan staat hij er weer altijd — precies de vorm die dit issue bestrijdt. Die
helft staat apart onder test, want zonder haar is de reparatie een verplaatsing.

### 3. De gróene uitslag draagt hem niet

Die zegt *geen branch draagt een nummer dat hier ontbreekt*, en op een oud beeld is
dat óók een te ruime uitspraak. Toch geen regel eronder, om twee redenen. De schade
loopt de andere kant op: een vals **positief** kost het issue van iemand anders een
onjuiste bevinding, een vals **negatief** kost hooguit een rode CI later — en die
komt er dan ook, want een gat is onverwerkt. En een versheidsregel onder elke
groene poortregel is de tekst die je het snelst leert overslaan.

### 4. Vijf minuten, grof gemeten

De vraag is niet of het beeld perfect is maar of er in die tijd een hernummering
langs kan zijn gekomen die je niet ziet. Vijf minuten is kort genoeg dat het
antwoord in de praktijk nee is, en lang genoeg dat een poort die vlak na
`npm run claim` draait er niet elke keer een waarschuwing bij krijgt. De leeftijd
zelf staat in woorden (`3 dagen oud`) en niet in minuten: een precieze duur leest
als precisie die er niet is.

## Wat dit instrument niet weet, en dat staat in de melding zelf

Zonder `FETCH_HEAD` is er geen tijdstip. In CI en in een verse checkout is het
beeld dan van de kloon zelf en dus van net; in een werkkopie die al een week
openstaat en nooit gefetcht heeft, is het beeld een week oud — en deze functie ziet
exact hetzelfde. Die grens staat daarom in de melding en wordt niet weggeschreven.
Een instrument dat zijn eigen grens overschreeuwt, is erger dan een instrument dat
hem noemt.

## Wat de ijking opleverde

Zes mutaties, één per grendel, met de tellingen in de kop van
`tests/scripts/migratie-fetch.test.ts`. Eén ervan is het noteren waard.

⚠️ **Mutatie G maakte een test zichtbaar die niets bewaakte.** *geeft drie
verschillende teksten* zette de drie uitvoeren in een `Set` en telde er altijd
drie — want de tijd en de leeftijd staan erin, en die verschillen sowieso. Met de
oude-tak dichtgezet bleef hij groen terwijl twee van de drie gevallen dezelfde
melding gaven: precies wat hij hoorde te vinden. Hij vergelijkt sindsdien de vórm,
met de tijd en de leeftijd eruit genormaliseerd.

Dat is dezelfde les als bij QS8-412: **kijk bij een ijking wélke test omvalt, niet
dát er een omvalt** — en hier kwam hij van de andere kant, want de test die groen
bleef was degene die het hardst beweerde te meten.
