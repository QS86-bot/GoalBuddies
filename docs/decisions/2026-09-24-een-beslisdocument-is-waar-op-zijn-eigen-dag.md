# Een beslisdocument is waar op zijn eigen dag

**Datum:** 24-09-2026
**Issue:** QS8-591
**Raakt:** `scripts/padverwijzing-controle.mjs`, `tests/scripts/padverwijzing-controle.test.ts`

## De vraag

`padverwijzing:controle` wordt rood zodra een bestand een repo-pad tussen
backticks noemt dat niet bestaat. `docs/decisions/` stond in `BUITEN` en viel er
dus volledig buiten. Het issue vroeg een keuze tussen drie richtingen: de map in
de scope trekken met een register (A), een zachtere controle voor alleen nieuwe
documenten (B), of de kapotte paden opruimen en het mechanisme laten staan (C).

## De meting die de keuze bepaalde

📏 Gemeten op 24-09-2026 met de geëxporteerde `verwijzingenIn()` over de hele
map: **250 documenten, 983 padverwijzingen, 19 die niet bestaan.**

⚠️⚠️ **Alle negentien zijn terecht.** Het issue nam aan dat *"de andere helft wél
drift"* zou zijn; gemeten is dat **nul**.

| klasse | aantal | wat het is |
|---|---|---|
| bestond wél op de dag van schrijven | 5 | met `git log --diff-filter=A` nagelopen: de sentry-module van de Edge Functions, het backlogplan, de fotokiezer, de tijdzonekeuze en de uitsluitlijst-toets |
| heeft **nooit** bestaan | 14 | citaten van het probleem, in documenten die er juist over gaan |

De veertien zijn het leerzaamst. Ze staan in zinnen als *"hier stond … en dat
bestand heeft nooit bestaan"*, in een tabelrij die luidt *"… bestaat niet |
juist"*, in een afgewezen optie (*"A. Het scherm verhuizen naar …"*), en als
verzonnen voorbeeldpad in een document dat over padverwijzingen gáát.

⚠️ **Een document over kapotte padverwijzingen bevat noodzakelijk kapotte
padverwijzingen.** Dat is dezelfde vorm als de `IJKING`-vrijstelling die al in
het script stond: de ijkingstest noemt met opzet paden die er niet zijn, *"en dat
is precies zijn werk"*.

## Het besluit: B, met A's register erbij en leeg

`docs/decisions/` gaat de scope in, maar alleen voor documenten waarvan de
**geboortedag** op of na `2026-09-24` ligt. Documenten van vóór die dag blijven
erbuiten; de zeven genummerde zonder datum in hun naam ook.

**Waarom niet A.** Een register van negentien rijen zou geschiedenis beschrijven
die niemand hoeft te bewaken. Dat is precies de inventaris waarvan dit project
weet wat ermee gebeurt: je leert hem overslaan. Dezelfde afweging als bij
QS8-594, waar zestien identieke registerrijen één natoetste regel werden.

**Waarom niet C.** Het issue sluit hem zelf uit, en terecht: een reparatie die de
instanties opruimt en het mechanisme laat staan, groeit terug.

**Waarom de grens werkt.** Een beslisdocument beschrijft de toestand op de dag
van schrijven; een padcontrole is een uitspraak in de tegenwoordige tijd. Die
twee zijn voor de verleden tijd niet te verzoenen en voor de toekomst wél: een
document dat vandaag geschreven wordt, hoort op zijn geboortedag naar bestaande
bestanden te wijzen. Dat is de klasse die QS8-412 opleverde — *een ontbrekende
test valt op; een test waarvan in de bron staat dát hij er is, valt niet op.*

⚠️ `HISTORISCH_JUIST` staat er als register voor het geval dat een document ín
scope later terecht veroudert, en het **begint leeg**. Dat is het verschil met
negentien rijen vooraf: één rij per échte vergrijzing, op het moment dat hij
optreedt.

## Wat dit weerlegt

De kop van het script droeg de meting van QS8-432: tien kapotte paden, negen
terecht historisch, en de conclusie *"negen keer ruis om de tiende te vinden is
geen regel"*. **Die conclusie klopte en klopt nog** — voor de verleden tijd. Wat
er niet in stond is dat de ruis en het signaal in de tijd uit elkaar liggen: de
ruis zit volledig in het verleden, en het signaal zit volledig in de toekomst.
Een datumgrens scheidt precies die twee.

## De ijking

Stand ervóór gemeten: de controle groen op 1172 bestanden, de test op 32 groen.

| mutatie | uitkomst |
|---|---|
| A — een kapot pad in een document van `2026-09-24` | **1 rood**, en de juiste |
| B — hetzelfde pad in een document van `2026-09-01` | **groen** |
| C — de datumgrens uit `binnenScope()` halen | **19 rood**, plus de toets die het besluit draagt |

⚠️ A en B samen zijn het bewijs: **hetzelfde kapotte pad**, en de uitkomst hangt
alleen van de geboortedag van het document af.

## Wat een aanname is

- **Een document dat vandaag klopt en volgend jaar niet meer, wordt rood.** Dat
  is met opzet: dan is er iets verhuisd en hoort iemand te kiezen tussen de
  verwijzing bijwerken of een registerrij. Wat het níet oplost is de vraag die de
  kop van het script al stelt — een zin die in de tegenwoordige tijd zegt wáár
  iets staat en onwaar wordt zonder dat het pad breekt. Daar helpt geen
  padcontrole.
- **De grens staat op vandaag en niet op een oudere datum.** Een oudere grens zou
  meer documenten bewaken en meteen registerrijen kosten; 📏 alle negentien
  kapotte paden zitten in documenten van vóór vandaag, dus elke oudere grens
  begint met minstens één rij.
