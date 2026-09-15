# Een plafond dat een uitweg niet verspert

**Datum:** 15-09-2026
**Issue:** QS8-496
**Migratie:** 0275 — `blokkades_plafond()`, `begrens_blokkades()`, `rem_blokkades()`
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
| pogingen om ergens binnen te komen | **20** per etmaal via een code, **10** via een verzoek |
| het ergste échte etmaal | 30 keer een groep in, elk met hoogstens 11 anderen: **~330** verschillende mensen |
| het plafond | **500**, ruim anderhalf keer dat getal |

⚠⚠ **Hier stond 110, en dat was de verkeerde eenheid.** Gevonden in de
security-review. De redenering was: tien groepen van twaalf, dus 10 × 11 = 110,
*"meer kán hij er via groepen niet kennen"*. De twee plafonds kloppen — 📏
nagemeten dat 12 en 10 server-afgedwongen zijn en dat `authenticated` géén INSERT
op `group_members` heeft, dus de definer-functies zijn de enige weg. **Maar 110
is een momentopname en dit plafond telt een etmaal.** 📏 `verlaat_groep()` doet
een `delete from group_members`, dus vertrekken maakt de plek meteen vrij; wat
een dag begrenst zijn de dagbudgetten om binnen te komen, en dat zijn er 30.

⚠️ **Afgeleid uit gemeten constanten, niet end-to-end gedraaid.** Dertig groepen
volbouwen en weer verlaten is geen toets die hier thuishoort; de constanten (20,
10, 12, 10, en de `delete`) zijn stuk voor stuk uit de draaiende database
gelezen.

⚠⚠ **De marge is dus anderhalf en niet vier en een half, en dat verandert wat
je in de gaten houdt** — niet de leden- en groepsplafonds maar die twee
dágbudgetten. De rij in `docs/ENGINEER-REVIEW.md` noemde de verkeerde variabele
en is bijgewerkt.

⚠️ Die bovengrens geldt bovendien alleen voor het **legitieme** geval.
`zoek_mensen()` laat je juist mensen blokkeren die je nooit ontmoet hebt — daar
bindt de groepsroute niets meer, en dát is waarom er überhaupt een plafond nodig
is.

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

## 7. Wat de security-review vond, en wat ervan gerepareerd is

⚠⚠ **Twee bevindingen waren gaten die ik zelf gemaakt had, en ze zijn allebei
gerepareerd in plaats van weggeschreven in een dossierrij.**

### 7a. Het plafond zette een bestaansorakel terug dat 0197 een migratie kostte

0145 schrijft boven zijn bestaanstoets: *"Eén antwoord voor 'bestaat niet' en
'bestaat wel'. Zou dit onderscheid maken, dan is deze functie een manier om te
toetsen of een profiel-id bestaat."* 0197 heeft daarvoor de directe
INSERT-grant ingetrokken.

📏 Gemeten met de teller van de aanroeper op 500:

| probe | antwoord |
|---|---|
| een id dat **niet** bestaat | `{"ok": true}` |
| een id dat **wel** bestaat | `ERROR 23514 Te veel blokkades in één dag (501).` |

Een fout betekende dan *"dit account bestaat én ik heb het nog niet
geblokkeerd"*, en elke probe was gratis: 📏 de exception rolt de ophoging mee
terug, dus de teller bleef op 500 staan.

**De reparatie:** `blokkeer()` toetst het plafond **vóór** het bestaan en geeft
`{ok:false, reason:'rate_limited'}`. 📏 Nagemeten: beide probes geven nu
hetzelfde antwoord. ⚠️ Een `reason` eráchter had het orakel juist laten staan —
dat is de hele reden dat de volgorde in de kop van 0275 staat uitgeschreven.

⚠️ **De trigger blijft en wordt hierdoor niet overbodig.** Deze toets zit in één
RPC; de trigger geldt voor elke schrijver naar `user_blocks`. Een grens die
alleen in de aanroeproute staat is precies wat onwrikbare regel 2 verbiedt.

### 7b. De gebruiker kreeg onjuist advies, op een veiligheidshandeling

Zonder `reason` mapte de client elke fout op **"Dat lukte niet. Probeer het
opnieuw."** — en opnieuw proberen werkt tot 24 uur lang niet. Op de knop
"blokkeer deze persoon" is dat de verkeerde zin, en dit is de handeling waar
0203 met opzet géén rem op zette.

⚠️ **En `rate_limited` stond al in de gedeelde tabel, gemapt op
`melden.te_veel`** — *"Je hebt vandaag twintig meldingen gedaan"*. Verkeerd getal
én verkeerde handeling. `blokkeer()` heeft nu zijn eigen zin, die er bovendien
bij zegt dat mélden nog wél kan.

### 7c. De belofte "het plafond geldt per gebruiker" stond onder geen enkele toets

De zwaarste belofte die deze feature heeft, en er was één blokkerende sessie in
het testbestand. Zou de sleutel ooit een constante worden, dan sluit één account
dat 500 mensen blokkeert **iedereen** 24 uur lang uit — precies de uitweg waar
0203 om deze reden geen plafond op zette. Er staat nu een tweede gebruiker in.

⚠⚠ **En de eerste versie van die toets deugde niet, wat bij het ijken bleek.**
Hij stelde zijn opstelling vast met `tellerstand()`, die filtert op
`sleutel = vluchter.id` — en juist bij een gedeelde sleutel staat daar niets.
📏 Gemeten: de toets viel dan om op zijn eigen opstelling ("vluchter zit niet
vol") in plaats van op zijn belofte. **Een toets die struikelt vóórdat hij
toekomt aan wat hij belooft, bewaakt die belofte niet.** De opstelling wordt nu
gedrágsmatig vastgesteld (vluchter kríjgt `rate_limited`), en dan valt hij om op
de goede regel.

⚠️ **Bij het ijken kwam er nog een naad boven.** De plafondtoets in `blokkeer()`
en de sleutel in `begrens_blokkades()` moéten dezelfde zijn; lopen ze uiteen, dan
weigert de RPC op de ene teller terwijl de trigger op de andere werpt. 📏 Dat is
gezien: met alleen de trígger op een gedeelde sleutel gaf de suite een `23514`
waar een `reason` hoorde. Twee plekken, één sleutel.

### Wat er niet gerepareerd is

De overige bevindingen staan als rij in `docs/ENGINEER-REVIEW.md`, elk met de
voorwaarde die hem laag houdt.

---

## 8. De ijkingen

📏 Mutatie per grendel, 15-09-2026:

| IJKING | Gebroken | Wat er omviel (van 5) |
|---|---|---|
| A | `blokkades_plafond()` op `select 20` | **3** — ook de must-allow, want 48 > 20 |
| B | de lege-batchtak, op twee plekken | **0** — zie §5 |
| C | de trigger `blokkades_dagplafond` gedropt | 1 — de weigering |
| D | de plafondtak ná de bestaanstoets gezet | 1 — en precies de orakeltoets |
| E | de tellersleutel een constante gemaakt, in én `blokkeer()` én de trigger | 2 — waaronder de per-gebruikertoets, op zijn belofte |

⚠️ **C is gedraaid toén de trigger nog `user_blocks_dagplafond` heette.** De
hernoeming van §6 kwam erna, dus de tabel hierboven noemt een naam die bij het
meten anders was — en dat is precies de vorm die de volgende lezer niet kan
narekenen. 📏 C is daarom onder de nieuwe naam opnieuw gedraaid: één rode toets — de
weigering — en de twee must-allows bleven groen. Zelfde uitslag als onder de
oude naam.

⚠️ Dat A er drie omgooit is juist het bewijs dat de must-allow scherp staat: een
te laag plafond raakt als eerste de gebruiker die het niet mag raken.
