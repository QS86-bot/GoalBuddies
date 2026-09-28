# Een herstel dat een migratie terugdraait

**22-09-2026 · QS8-588 · `scripts/rls-dekking.mjs`**

## Wat er stuk was

`rls:dekking` verzwakt policies één helft tegelijk om te meten of er een test op
zit. Vóór elke verzwakking schrijft hij een spoorbestand weg, zodat een
afgebroken run bij de volgende start hersteld kan worden. Dat herstel was vier
regels:

```js
const policy = JSON.parse(readFileSync(HERSTELBESTAND, 'utf8'));
const sql = herstelSql(policy);
if (sql !== null) psql(sql);
rmSync(HERSTELBESTAND);
```

📏 Gelezen in de map op 22-09-2026 tegen `origin/main` = `fa49ab5d`. Er zit geen
enkele toets tussen die vraagt of de policy vandaag nog dezelfde vorm heeft.

⚠️ **Dit is een codelezing en geen draaiende reproductie.** `rls:dekking` vraagt
de lokale stack op poort 5433, en die is in een cloudsessie ongemeten. Wat er
wél gereproduceerd is, is het oordeel zelf: `beoordeelHerstel()` is puur en de
ijking voert hem elke vorm los.

## Twee faalvormen

**1. Een migratie wijzigt de policy tussen de afgebroken run en de volgende.**
Dan schrijft het herstel de **pre-migratiedefinitie** terug. Dat is klasse B uit
onwrikbare regel 20, en bij `group_visible_streaks` zou het een besluit onder A41
terugdraaien — stilzwijgend, want het herstel meldde alleen *"eerst terugzetten"*
en niet wát het terugzette.

Het venster is één afgebroken run plus één `git pull`, en een run duurt ongeveer
een uur.

**2. De policy bestaat niet meer.** Dan wierp `psql`, bleef het spoorbestand
liggen, en crashte élke volgende run op dezelfde regel tot iemand
`.rls-dekking-herstel.json` met de hand weggooide. Het herstel dat een afgebroken
run moest opvangen, werd dan zelf de blokkade.

## Wat het spoor niet wist

Het spoor droeg alleen de **originele** definitie. Welke helft er openstond ging
niet mee — terwijl dat de lusvariabele één regel eerder was. Zonder die helft is
bij het herstellen niet vast te stellen welke toestand de database hóórt te
hebben, en dus ook niet of er tussendoor iets veranderd is. **Het spoor kon de
vraag niet beantwoorden omdat het de vraag niet droeg.**

## Wat er nu staat

Het spoor is `{ versie: 2, policy, helft }`. `beoordeelHerstel(spoor, huidig)` is
puur en geeft één van drie dingen:

| geval | actie | wat er gebeurt |
| --- | --- | --- |
| spoor zonder versie of zonder helft | `weiger` | faalt dicht — niet gokken |
| policy bestaat niet meer | `weg` | spoor opruimen, geen SQL, volgende run draait |
| onaangeraakte helft veranderd | `weiger` | spoor blijft liggen, exitcode 1 |
| aangeraakte helft is niet wat het spoor verwacht | `weiger` | idem |
| staat al terug zoals hij was | `weg` | niets schrijven |
| de geopende helft staat nog open | `terugzetten` | zoals hiervoor |

⚠️ **Weigeren laat het spoor liggen, en dat is de kern.** Weghalen zou de enige
aanwijzing wissen dat er iets openstond; automatisch terugzetten zou een migratie
terugdraaien. Allebei zijn erger dan stoppen. De melding legt daarom de twee
mogelijke gevallen uit en wat er bij elk hoort te gebeuren — de gebruiker
beslist, niet het script.

⚠️ **Stoppen gebeurt met `process.exit` en niet met een `throw`.** Die aanroep
staat binnen de `try` die een psql-fout vertaalt naar *"geen database"*; een worp
zou hier dus als een ontbrekende stack gemeld worden terwijl de stack gewoon
draait. Woordelijk de klasse van QS8-268, waar zes scripts jarenlang de verkeerde
oorzaak noemden.

### De vergelijking gaat per conjunct

⚠️⚠️ **En dat is geen finesse maar de enige manier waarop dit kán werken.**
Postgres deparseert een uitdrukking bij het teruglezen, dus de tekst die wij met
`alter policy` schreven komt anders opgemaakt terug. Een vergelijking op de hele
helft zou weigeren op een verschil dat niemand gemaakt heeft — en een grendel die
vals alarm slaat bij elke normale afbreking, is een grendel die de volgende
persoon leert om het spoor ongelezen weg te gooien. Dat is precies de handeling
die dit moet voorkomen.

De conjuncten die we niet aangeraakt hebben komen uit dezelfde deparser op
dezelfde knoop en zijn daarom wél letterlijk gelijk. `conjunctenVan()` bestond al
voor QS8-550; hij wordt hier hergebruikt.

⚠️ **De grens ervan staat in de ijking opgeschreven.** Wat dit niet vangt is een
migratie die precies de geopende conjunct vervangt door iets dat óók als `true`
deparseert. Dat is geen tekortkoming van de toets maar van wat een tekst kan
dragen, en het staat er als toets-commentaar zodat de volgende lezer het niet
opnieuw hoeft te ontdekken.

## De ijking

📏 **Ervóór: 99 geslaagd, 0 rood** in `tests/scripts/rls-dekking.test.ts`, op
commit `2a6e6b02`. Eén mutatie per grendel, telkens teruggedraaid, erna weer 99/0.

| # | mutatie | rood |
| --- | --- | --- |
| 1 | de versietoets weg | *een spoor uit een oudere versie* + *met de juiste versie maar zonder helft* |
| 2 | de onaangeraakte helft wordt niet vergeleken | *de onaangeraakte helft is veranderd — dat is een migratie geweest* |
| 3 | een verdwenen policy geeft `terugzetten` | *de policy bestaat niet meer, en dan crasht de volgende run niet meer* |
| 4 | de conjunctvergelijking laat de geopende conjunct vrij | *een ándere conjunct is gewijzigd* + *de conjunct die open hoorde te staan* + *vergelijkt per conjunct* |
| 5 | het aantal conjuncten wordt niet geteld | *de aangeraakte helft telt nu een conjunct meer* |
| 6 | *staat al terug* verdwijnt | *de policy staat al terug zoals hij was* |
| 7 | een hele helft hoeft niet meer `true` te zijn | *een hele helft die noch open noch de oude vorm is* |

## Wat dit niet is

Geen wijziging aan wat de lus zelf doet — die zet netjes terug in een `finally`
sinds ronde 9 van QS8-262. Dit gaat uitsluitend over het herstel van een run die
dáár niet meer aan toegekomen is.

En geen poging om automatisch te beslissen wat er moet gebeuren als er wél iets
veranderd is. Een script dat een policy terugzet die een migratie bewust
gewijzigd heeft, ís het probleem; slimmer gokken is geen uitweg.
