# Een vierde document met stand hoort onder dezelfde eigenaarstoets — QS8-583

**Datum:** 22-09-2026
**Aanleiding:** `docs/PROMPT-SESSIE.md` erbij, met eigen metingen erin.

## Het besluit

`docs/PROMPT-SESSIE.md` komt in de repo, en hij staat vanaf dag één in
`DOCUMENTEN` van `scripts/docs-controle.mjs`.

## Waarom niet gewoon een bestand erbij

Het document draagt metingen: welk aandeel van de merges welk oppervlak raakt,
hoe vaak `docs/ENGINEER-REVIEW.md` geraakt wordt, hoe lang CI op `main` duurt.
Dat is precies het soort tekst waar een volgende sessie een regel aan toevoegt
die de stand herhaalt — "en de map telt er inmiddels zoveel" — en dan staat
dezelfde stand op twee plekken.

Dat is QS8-125 woordelijk: `CLAUDE.md`, `docs/WERKVOORRAAD.md` en
`docs/VOLGENDE-SESSIE.md` liepen op één dag vijf keer uiteen, en `docs:controle`
is daarvoor gebouwd. Een vierde document met stand dat buiten die controle valt,
is die fout opnieuw, met een extra bestand erbij.

⚠️ **De eigenaarstabel in `CLAUDE.md` groeit hiermee niet.** `PROMPT-SESSIE`
bezit één ding — de afspraken tussen gelijktijdige sessies, en de meting die het
sessieaantal draagt — en verwijst voor al het andere. Tak B dwingt dat af in
plaats van het te vragen.

## Wat er aan het script veranderd is, en waarom dat meer is dan een sleutel

Tak B stond rechtstreeks op `lees()` en las dus altijd van schijf. Daarmee was
hij alleen te ijken door een écht document te verminken, en dat is de vorm die
`CLAUDE.md` bij onwrikbare regel 18 afwijst: *een controle die je niet kunt
voeden, kun je niet ijken*, en de helft die het zwaarst weegt is de tweede — de
vormen die hij met rúst moet laten.

`eigendomsklachten(inhoudPerDocument, feiten, paden)` is nu puur.
`controleerEigenaarschap()` is de dunne laag eromheen die de vier bestanden
inleest. Het gedrag is ongewijzigd; wat erbij komt is dat hij te voeden is.

⚠️ **Een ontbrekende sleutel wordt overgeslagen en niet als lege string gelezen.**
Vandaag maakt dat geen verschil — elk `FEITEN`-patroon is bevestigend, en een
leeg document draagt niets. Maar bij een patroon dat iets juist *mist*, zou een
leeg document meetellen als bewijs. Dat is de ongemeten-tegen-groen-scheiding op
documentniveau, en die staat onder toets.

## De ijking, en wat ze opleverde

Drie mutaties, elk op een eigen grendel, stand ervóór elke keer opnieuw gemeten
(46 geslaagd, `docs:controle` groen).

| mutatie | rode toetsen | `docs:controle` |
| --- | --- | --- |
| **A** — `PROMPT-SESSIE` uit `DOCUMENTEN` | 4 | **groen** |
| **B** — `eigendomsklachten` meldt nooit iets (`length >= 0`) | 3 | groen |
| **C** — `467 geslaagd` in het echte document | 1 | **rood** |

📏 **A is de reden dat er een toets bij moest.** De toets die het echte document
nakijkt, loopt over `DOCUMENTEN` heen — haal je `PROMPT-SESSIE` daaruit weg, dan
kijkt hij dat document niet meer na en blijft groen, en `docs:controle` blijft
óók groen. Een grendel waarvan je het ónderwerp kunt verwijderen zonder dat iets
rood wordt, bewaakt niets. `PROMPT-SESSIE doet mee in DOCUMENTEN` is die
ontbrekende sport; hij is een van de vier die op A omvallen.

📏 **En B laat zien waarom A alleen niet genoeg was.** Bij B blijft
`docs:controle` óók groen, want de drie documenten die er al stonden dragen
elkaars feiten vandaag toevallig niet. De unittoetsen op de detector zijn dus de
enige sport die B vindt — het echte bestand kan de detector niet ijken zolang hij
er niets in te vinden heeft.

⚠️ **B en C wijzen daarmee naar verschillende beloftes, en dat is met opzet.**
B bewaakt *de detector werkt*; C bewaakt *dit document is schoon*. Alleen C zou
groen blijven bij een kapotte detector; alleen B zou niets zeggen over het
document zelf.

Na de ijking is beide bestanden met `diff -q` woordelijk naast de uitgangsversie
gelegd.

## Wat dit niet is

Geen tweede grondwet. `CLAUDE.md` bezit de regels en houdt ze.

Geen fragmentenmap. Die stond in de prompt van het andere project en botst hier
met de eigenaarstabel: een fragment is per definitie een plek waar een feit
tijdelijk buiten zijn eigenaar staat. Wat er in de plaats komt is een vormregel —
additief, achteraan, nooit herschikken — en die kost niets aan structuur.
