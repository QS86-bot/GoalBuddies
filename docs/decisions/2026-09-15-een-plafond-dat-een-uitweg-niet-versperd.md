# Een plafond dat een uitweg niet verspert

**Datum:** 15-09-2026
**Issue:** QS8-496
**Migratie:** 0273 — `blokkades_plafond()`, `begrens_blokkades()`, `rem_blokkades()`
**Raakt:** 0203 (de tien tabellen zonder dagteller), 0145 (`blokkeer()`),
0200/0207 (de remmen), QS8-476 (`zoek_mensen()`)

---

## 1. Dit is een voorwaarde die intreedt, geen nieuwe bevinding

0203 gaf tien tabellen een dagteller en liet `user_blocks` er met zoveel woorden
buiten staan:

> **`user_blocks` — bewust geen plafond, en dat is een veiligheidskeuze.**
> Een rem op blokkeren zit iemand in de weg die misbruik ontvlucht […]
> **Wordt zwaarder als:** profiel-id's in bulk op te vragen worden.

`zoek_mensen()` (QS8-476) **is** dat: tot 50 profiel-id's per aanroep, en elk
teruggegeven `id` is een geldige `blocked_id`. De begrenzing *"door wie je
kent"* is daarmee weg; wat overblijft is *"hoeveel accounts er zijn"*.

⚠️ Dat is precies de vraag die CLAUDE.md voorschrijft bij een nieuwe beslissing
die op een bestaande primitieve handeling leunt: *staat daar een weggelegde
bevinding over?* Hier stond die er, mét zijn voorwaarde — en de voorwaarde is
ingetreden.

## 2. De spanning is opgelost en niet weggenomen

⚠️⚠️ **De reden dat er géén plafond stond is goed en blijft goed.** Een rem op
blokkeren zit iemand in de weg die misbruik ontvlucht, en dat is de verkeerde
kant om te falen.

De opdracht was dus niet "zet er een limiet op" maar: een plafond dat **ruim
boven elk echt gebruik ligt** en alleen de bulkvorm raakt. Wie in paniek vijf
mensen blokkeert, mag het nooit merken.

Daarom staat de must-allow in `tests/rls/blokkadeplafond.test.ts` **vooraan** en
niet achteraan. Een toets die alleen de weigering vastlegt, blijft groen bij een
plafond van vijf — en dat is precies de fout die dit issue niet mocht maken.

## 3. Het getal: 500, afgeleid en niet rond

Het huis rekent een plafond uit als *een veelvoud van een zware gebruiksdag*
(0203, "De zes plafonds, en waarom ze zo hoog staan"). Voor blokkades:

📏 **En het ergste echte geval is hier geen schatting maar een afgedwongen
bovengrens** — nagemeten in 0016 in plaats van aangenomen:

| | |
|---|---|
| een groep is vol bij | **twaalf** actieve leden |
| een gebruiker zit in hoogstens | **tien** groepen |
| het ergste échte geval | uit alle tien vertrekken en daar iedereen blokkeren: 10 × 11 = **110**. Meer kán hij er via groepen niet kennen |
| het plafond | **500**, ruim vier en een half keer die harde bovengrens |

⚠️ Die bovengrens geldt alleen voor het **legitieme** geval. `zoek_mensen()`
laat je juist mensen blokkeren die je nooit ontmoet hebt — daar is 110 geen
grens meer, en dát is waarom er überhaupt een plafond nodig is.

⚠️ **Dit stond eerst als "vier groepen van twaalf is 48, en 500 is tien keer
dat".** Dat was een schatting waar een afgedwongen getal voorhanden was. Het
antwoord verandert er niet van — 500 blijft ruim — maar de onderbouwing wel: van
*"dit lijkt me veel"* naar *"meer kan niet"*.

⚠️ **Het faalt naar de veilige kant, en dat is hier de hele opdracht.** Te laag
betekent dat iemand die misbruik ontvlucht tegen een muur loopt; te hoog
betekent dat een tabel harder groeit dan nodig. Die tweede is begrensd,
omkeerbaar en kost opslag; de eerste kost een mens zijn uitweg. Bij twijfel dus
omhoog. 500 zit in dezelfde band als `voltooiingen_plafond()` en
`dagzetten_plafond()`.

⚠️ **En het bindt de lus wél.** `zoek_mensen()` geeft 50 id's per aanroep, dus de
bulkvorm gaat van onbegrensd naar tien aanroepen per etmaal.

## 4. Wat een echte gebruiker daarnaast beschermt

`blokkeer()` (0145) doet `insert … on conflict do nothing`. Iemand die al
geblokkeerd is levert dus **nul** toegevoegde rijen op, en dat kost geen quotum.
Zonder die eigenschap zou een app die bij elke start opnieuw blokkeert iemand
blijvend vastzetten op een fout die hij zelf niet kan opheffen — woordelijk de
must-allow die 0214 voor pushtokens beschrijft.

## 5. IJKING B beet niet, twee keer, en dat is het opschrijven waard

📏 De toets *"herhaald blokkeren kost geen quotum"* staat er en hij is groen. Mijn
eerste comment zei erbij dat de **lege-batchtak** dat draagt. Dat is onwaar, en
het is twee keer gemeten:

| mutatie | uitkomst |
|---|---|
| `if v_batch = 0 …` uit `begrens_blokkades()` weg | **3 van 3 groen** |
| `if p_erbij <= 0 …` uit `tel_dagteller()` zélf weg | **3 van 3 groen** |

**De reden is rekenkundig en geen grendel.** Bij nul toegevoegde rijen is
`p_erbij` nul, en `aantal = aantal + 0` verandert niets. De teller kán niet
stijgen van een statement dat niets deed.

📏 Wat die tak wél doet: hij houdt `dagtellers` schoon. Gemeten —
`tel_dagteller('proef','x','k',10,interval '1 day','proef',0)` geeft `0` terug
en laat **nul** rijen achter; zonder de tak zou er een rij met `aantal = 0`
ontstaan in een tabel die anders alleen bestaat waar er iets gebeurd is. 0234
zegt dat ook met zoveel woorden over `begrens_pushtokens()`.

⚠️⚠️ **Dit is dezelfde klasse fout als bij QS8-495, twee issues op rij:** een
calibratienotitie die een grendel crediteert die het werk niet doet. Zo'n regel
leest de volgende persoon als bewijs. De toets blijft staan — hij bewaakt de
**belofte** (*herhaald blokkeren kost geen quotum*) en niet het mechanisme; wordt
de optelling ooit vervangen door iets dat per statement telt, dan is dit de toets
die omvalt.

⚠️ De les die eronder ligt is die van QS8-495 §6, en hij blijkt niet eenmalig:
**een ijking die niet bijt, is een uitkomst en geen mislukking — maar dan moet je
wél uitzoeken waaróm.** Stoppen bij "hij bleef groen, dus de toets deugt niet"
had hier een goede toets weggegooid; stoppen bij "hij bleef groen, raar" had de
onware notitie laten staan.

## 6. De rem die ik niet gebouwd had, en die de suite ving

⚠⚠ **Dit is het deel van dit issue dat het waard is om te onthouden**, en het
is geen ijking: het is een gat dat er echt in zat.

Een dagteller is `after insert … for each statement`. Dat móét, want een
transitietabel bestaat alleen in `after` — en dus schrijft Postgres de hele batch
fysiek weg vóórdat de trigger nee kan zeggen. 0200 (QS8-347) heeft dat gemeten en
zette op negen tabellen een `before insert … for each row`-rem ervoor; 0207
deed er vijf.

Ik bouwde de teller en niet de rem. `tests/rls/remdekking.test.ts` werd rood, met
`user_blocks (user_blocks_dagplafond)` in de melding.

📏 **Op deze tabel nagemeten in plaats van overgenomen**, één batch van 3000
rijen in één statement, beide keren vanaf een lege tabel en beide keren
teruggerold:

| | `pg_relation_size` | wie weigert, en wanneer |
|---|---|---|
| mét `blokkades_rem` | 0 → **73.728** bytes | `rem_blokkades()`, bij rij **1001** |
| zónder (`disable trigger`) | 0 → **204.800** bytes | `tel_dagteller()`, ná alle 3000 |

Nul rijen blijven er in beide gevallen over, en die ruimte komt pas bij een
`vacuum full` terug. ⚠️ Factor 2,8 bij 3000 rijen, en het groéit met de batch: de
rem kapt af op een vast getal, de statement-trigger op geen enkel.

⚠️⚠️ **En er zat een tweede fout onder de eerste.** Ik noemde de teller
`user_blocks_dagplafond`, naar de tábel — als enige van achttien, want de andere
zeventien dragen het domeinwoord (`dagzetten_dagplafond` op `daily_moves`,
`weekdoelen_dagplafond` op `weekly_goals`). De koppeling in `remdekking.test.ts`
loopt over die naam en eist dat de rem `rem_<domeinwoord>()` aanroept. Met de
tabelnaam had ik de rem er dus náast kunnen zetten zonder dat hij ooit aan zijn
teller vastzat, en dan was het bestand groen geweest op een rem die niets remt.

⚠️ **Wat dit over de vorige zes ijkingen zegt.** Elke ijking bevestigt dat een
grendel doet wat je dacht; geen enkele zegt of je de goede grendel hébt. Dit gat
is niet gevonden door een ijking van mijn eigen werk maar door een grendel van
iemand anders, die precies naar de leegte keek waar ik niets had staan. Dat is
dezelfde les als §5, en het is de tweede keer in dit issue.

📏 De aantekening bij die grendel is meteen bijgewerkt: 0214, 0217 en 0246
zetten er ook een teller bij, maar die drie droegen hun rem meteen. Dit is de
eerste keer dat `remdekking.test.ts` een écht gat ving in plaats van alleen mee
te tellen.

---

## 7. De drie ijkingen

📏 Mutatie per grendel, 15-09-2026:

| IJKING | Gebroken | Wat er omviel (van 3) |
|---|---|---|
| A | `blokkades_plafond()` op `select 20` | **3** — ook de must-allow, want 48 > 20 |
| B | de lege-batchtak, op twee plekken | **0** — zie §5 |
| C | de trigger `blokkades_dagplafond` gedropt | 1 — de weigering |

⚠️ **C is gedraaid toén de trigger nog `user_blocks_dagplafond` heette.** De
hernoeming van §6 kwam erna, dus de tabel hierboven noemt een naam die bij het
meten anders was — en dat is precies de vorm die de volgende lezer niet kan
narekenen. C wordt daarom onder de nieuwe naam opnieuw gedraaid en deze regel vervangen
door die uitslag; tot dat gebeurd is, staat hier wat er wél gemeten is en niet
wat ervan verwacht wordt.

⚠️ Dat A er drie omgooit is juist het bewijs dat de must-allow scherp staat: een
te laag plafond raakt als eerste de gebruiker die het niet mag raken.
