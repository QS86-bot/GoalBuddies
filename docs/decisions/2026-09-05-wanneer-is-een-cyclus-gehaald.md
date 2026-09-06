# Wanneer is een cyclus "gehaald"?

**05-09-2026 — QS8-279, migratie 0163.**

De Risico-radar rekent een tempo uit over de laatste vier afgesloten cycli:
`cycli_gehaald / cycli_bekeken`. Zolang er precies één weekdoel per cyclus staat,
is "deze cyclus is gehaald" geen vraag. Er staat geen unieke sleutel op
`(goal_id, cycle_start_date)` — `weekly_goals_goal_cycle_idx` is een gewone index
— dus er kunnen er meer zijn, en dan is het er wél een.

Dit document legt vast welk antwoord gekozen is en waarom, want de code kan het
niet zeggen: elk van de drie lezingen ziet er in SQL even redelijk uit.

## Wat er stond

Beide helften telden `count(distinct w.cycle_start_date)` over dezelfde rijen met
een ander filter:

```sql
count(distinct w.cycle_start_date) filter (where w.status in ('approved', 'missed')),
count(distinct w.cycle_start_date) filter (where w.status = 'approved')
```

Een cyclus met zowel een goedgekeurd als een gemist weekdoel valt in béide
filters, dus teller en noemer kregen er allebei één bij. Gemeten, drie afgesloten
cycli met telkens één goedgekeurd plafond ernaast, drie mijlpalen te gaan en de
streefdatum over drie weken:

```
0 gemiste weekdoelen per cyclus -> on_track  tempo=1.00 bekeken=3 gehaald=3
1 gemist  weekdoel  per cyclus  -> on_track  tempo=1.00 bekeken=3 gehaald=3
5 gemiste weekdoelen per cyclus -> on_track  tempo=1.00 bekeken=3 gehaald=3
```

Het tempo van deze gebruiker kón niet onder 1,00 komen. Dat is niet "een beetje
mild": het is een noemer die per definitie gelijk is aan zijn teller.

## De drie lezingen

| lezing | een cyclus met 1 goedgekeurd en 5 gemiste weekdoelen | eenheid |
|---|---|---|
| minstens één goedgekeurd *(wat er stond)* | gehaald | cyclus |
| **álle beoordeelde weekdoelen goedgekeurd** *(gekozen)* | niet gehaald | cyclus |
| naar verhouding, per weekdoel | voor ⅙ gehaald | weekdoel |

## Waarom "álle beoordeelde weekdoelen goedgekeurd"

**1. Het is dezelfde eenheid en dezelfde vorm als de vloerteller.** Die is één
dag oud: 0162 (QS8-278) verving daar `exists` door `bool_and` omdat de belofte
*"structureel alléén de vloer"* een eigenschap van de cýclus is en niet van het
weekdoel. Voor `cycli_gehaald` geldt precies hetzelfde: de naam is de belofte, en
een week waarin je iets liet liggen is geen gehaalde week. De verhoudingslezing
zou de vloerteller mee moeten verbouwen — het issue zegt dat met zoveel woorden —
en dan draai je een besluit van gisteren terug om een tel-fout van vandaag te
repareren.

**2. Drie drempels zijn in cycli geijkt.** `c_venster = 4` (cycli waarover het
tempo telt), `c_min_geschiedenis = 3` ("minder is geen patroon") en
`c_vloer_aandeel = 0.75`. Tel je in weekdoelen, dan betekent "minder dan drie is
geen patroon" ineens *drie weekdoelen* — dat kan één week zijn. Drempels die
stilzwijgend van betekenis veranderen zijn erger dan drempels die verkeerd staan,
want aan de eerste soort zie je niets.

**3. Het proportionele signaal bestáát al, en niet hier.** `points_ledger` boekt
per weekdoel: plafond `+2`, vloer `+1`, gemist `−1` (domeinregel 10). Wie vijf van
de zes weekdoelen mist, ziet dat in zijn score, op volle resolutie. De radar is
een grove waarschuwing over één vraag — *haal ik mijn streefdatum* — en hoeft die
boekhouding niet op lagere resolutie over te doen.

## ⚠️ De prijs, en waarom die niet met domeinregel 8 botst

Deze lezing is streng: één gemist weekdoel kost de hele cyclus, ook als er vijf
gehaalde naast staan. Dat is het bezwaar dat in het issue staat, en het klopt.

Wat het níet is, is een botsing met domeinregel 8. De vloer is de milde weg en
die blijft helemaal open: een gehaalde vloer staat op `approved` en telt hier
onverkort mee — de vloer haal je juist op je slechtste week, en dat is precies de
week waarin dit anders zou toeslaan. De uitweg voor wie zijn plafond niet haalt is
een vloer zetten, niet een lagere lat voor gemiste weekdoelen.

En de andere kant weegt zwaarder: onder de lezing die er stond kón het tempo niet
dalen zolang je per week één ding afvinkte. Een radar die alleen maar `on_track`
kan zeggen, waarschuwt niemand.

⚠️ **De gemengde cyclus is geen randgeval, en dat is nagemeten.** De eerste
versie van dit document noemde hem er een. Gemeten in de code na de
security-review op 0163: `maakWeekdoel()` (`src/modules/goals/weekly.ts`) zet élk
nieuw weekdoel in de húidige cyclus, zonder limiet en zonder unieke sleutel, en
`rollover/index.ts` zet élk overgebleven `todo` of `cancelled` weekdoel op
`missed`. Een scherm in de app zegt het zelf: *"zes weekdoelen in één week zijn
nog steeds vijf minpunten."* Wie er twee plant en er één laat liggen, heeft een
gemengde cyclus — met twee knoppen en zonder iets ongewoons te doen.

Dat maakt de keuze hierboven niet anders, maar wel zwaarwegender: hij raakt de
gewone gebruiker en niet de uitzondering. Precies daarom staat de gradatie
hieronder erbij.

⚠️ **Wordt dit zwaarder als:** het gemiddelde aantal weekdoelen per cyclus
stijgt. Bij twee is "één laten liggen" de helft; bij zes is het een zesde en
weegt de alles-of-niets-lezing steeds zwaarder. Kantelt dat, dan is de
verhoudingslezing de kandidaat, mét de vloerteller erbij.

## ⚠️ Wat de strengere noemer verderop kapot maakte

De standenketen eronder heeft een tak die op `v_tempo = 0` hangt, met dit
commentaar erboven: *"Vier cycli op rij niets afgerond, met werk dat nog moet."*
Die zin was waar zolang een tempo van nul betekende dat er niets goedgekeurd was.
Onder deze lezing betekent hij iets anders: geen enkele week is *heel* geworden.

Gemeten op de nieuwe noemer — vier afgesloten cycli, twee open mijlpalen, tien
weken tot de streefdatum:

```
5 goedgekeurde plafonds + 1 gemist weekdoel per cyclus -> behind  tempo 0.00
1 goedgekeurde vloer    + 1 gemist weekdoel per cyclus -> behind  tempo 0.00
niets goedgekeurd, alles gemist                        -> behind  tempo 0.00
```

De eerste haalde twintig van zijn vierentwintig weekdoelen en las: *"Je hebt de
laatste 4 weken geen week afgerond… Dit is het moment om je doel kleiner te maken
of je datum te verschuiven."* Dat is de op één na zwaarste stand die dit systeem
kent. Gevonden door de security-review op 0163 en zelf nagemeten.

De tweede raakt de vloer. Onder 0162 kreeg die gebruiker `risico.at_risk.vloer` —
de enige zin in de app die zegt *"Dat telt volledig mee"*, met een testcommentaar
erbij dat hij er niet uit mag. Die tak eist `v_recent_goed >= 3`, en dat is nu 0,
dus de zin werd onbereikbaar voor precies de gebruiker voor wie hij geschreven is.

**De reparatie is `v_recent_deels`** — het aantal cycli met mínstens één
goedgekeurd weekdoel — en het is geen verzachting van de noemer. Die blijft
precies zoals hierboven beschreven: geen van deze drie heeft een hele week
afgerond en geen van de drie staat op koers. Hersteld wordt de vóórwaarde van de
tak: hij is geschreven voor "er komt niets af", dat geval bestaat nog steeds en
houdt zijn `behind`. Wie wél elke week iets afrondt, krijgt `at_risk` — een
waarschuwing, niet het zwaarste oordeel.

⚠️ **Domeinregel 8 raakt dit niet, en dat is de moeite van het opschrijven waard
omdat het er wél op lijkt.** De vloer van een weekdoel telt onverkort: dat
weekdoel staat op `approved`, de reeks loopt door, de goedkeuring verloopt
identiek. Wat hier meetelt is een *ander* weekdoel in dezelfde week dat bleef
liggen. De regel gaat over de lat van één weekdoel, niet over hoeveel weekdoelen
je die week nog meer had.

## Eén zin erbij in de app

`risico.at_risk.deels`: *"Je rondt elke week iets af, maar de laatste 4 weken geen
enkele week helemaal. Plan er per week minder, of zet een vloer onder wat blijft
liggen."* Zonder die zin valt deze gebruiker door naar `risico.at_risk.tempo` en
leest hij *"je zit nu op 0"* — bij twintig van de vierentwintig weekdoelen.

De uitweg die de zin noemt is de vloer, en dat is met opzet: dat is de milde weg
die domeinregel 8 openhoudt, en dit is de gebruiker die er iets aan heeft.

⚠️ `risico.behind.niets_afgerond` (*"geen week afgerond"*) bleef staan zoals hij
was. Met de gradatie erboven is `behind` met `cycli_gehaald = 0` alleen nog
bereikbaar wanneer er werkelijk niets goedgekeurd is, en dan klopt de zin weer.
Hij stond één commit lang op *"geen week helemaal afgerond"*, en die omweg is niet
meer nodig.

## De naad die erbij hoort

`v_vloerdeel` is `v_recent_vloer / v_recent_goed`. Wordt de noemer strenger en de
vloerteller niet, dan telt de teller cycli die de noemer niet telt en komt de
verhouding boven 1 uit. Gemeten met alleen de noemer gerepareerd — drie cycli met
een goedgekeurde vloer náást een gemist weekdoel, plus één hele plafondcyclus:
`cycli_gehaald = 1` en `vloeraandeel = 3.00`. Die onderbouwing gaat als `reason`
mee naar de UI.

Daarom staat de uitslag van de noemer sinds 0163 in `v_gehaalde_cycli` en leest de
vloerquery diezelfde array (`= any (v_gehaalde_cycli)`) in plaats van het venster
nóg een keer op te schrijven. Twee where-clausules die op elkaar lijken zijn geen
gedeelde definitie — deze naad is nu tweemaal gescheurd, in 0157 op het venster en
in 0162 op de eenheid, en beide keren omdat de twee query's hun eigen antwoord op
dezelfde vraag gaven.

## De ijking

Vijf mutaties, elk apart op de gedeployde functie gezet met
`tests/rls/vloerverhouding.test.ts` ertegen. De matrix staat in dat bestand, bij
het blok over QS8-279. Twee ervan raken precies één test: de losgekoppelde naad en
de eenheid. De andere drie raken er meer, en dat staat er met de reden bij.
