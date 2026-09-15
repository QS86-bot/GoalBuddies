# Een plafond dat een uitweg niet verspert

**Datum:** 15-09-2026
**Issue:** QS8-496
**Migratie:** 0272 — `blokkades_plafond()`, `begrens_blokkades()`
**Raakt:** 0203 (de tien tabellen zonder dagteller), 0145 (`blokkeer()`),
QS8-476 (`zoek_mensen()`)

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

## 6. De drie ijkingen

📏 Mutatie per grendel, 15-09-2026:

| IJKING | Gebroken | Wat er omviel (van 3) |
|---|---|---|
| A | `blokkades_plafond()` op `select 20` | **3** — ook de must-allow, want 48 > 20 |
| B | de lege-batchtak, op twee plekken | **0** — zie §5 |
| C | de trigger `user_blocks_dagplafond` gedropt | 1 — de weigering |

⚠️ Dat A er drie omgooit is juist het bewijs dat de must-allow scherp staat: een
te laag plafond raakt als eerste de gebruiker die het niet mag raken.
