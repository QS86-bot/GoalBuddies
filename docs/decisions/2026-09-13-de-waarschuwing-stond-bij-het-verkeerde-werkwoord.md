# De waarschuwing stond bij het verkeerde werkwoord

**13-09-2026 — QS8-442.**

## 1. Wat het issue zei, en wat er van klopte

QS8-442 beschreef twee dingen. Eén was gemeten, één was een verklaring die goed
paste. 📏 Nagemeten op 13-09-2026, en de verklaring bleek onjuist.

| Bewering | Gemeten |
|---|---|
| `groep / g` valt buiten elke opruiming en blijft staan | **klopt** — na elke run staat er `groep \| g = 8` |
| Hij loopt op, dus vanaf de dérde run op dezelfde dag zit de groep aan haar plafond van 20 | **klopt niet** — drie runs achter elkaar, elke keer 20 tests groen en elke keer `g = 8` |

De teller loopt niet op. En de reden dát hij niet oploopt, is de eigenlijke bug.

## 2. De echte oorzaak: een `update` zonder `where`

`tests/rls/dagteller-overleeft-wissen.test.ts` deed, in het geval *"een etmaal
later mag het weer"*:

```ts
psql(`update dagtellers set venster_start = now() - interval '25 hours';`);
```

Geen `where`. 📏 Gemeten met een vreemde tellerrij ernaast — één die een andere
suite had kunnen zetten:

```
VOOR:  aantal=5  start=2026-09-13 05:11:13+00
NA:    aantal=5  start=2026-09-12 04:11:21+00
```

Het **aantal** bleef staan en het **venster** ging een etmaal terug. De
eerstvolgende `tel_dagteller()` ziet dan een verstreken venster, zet de teller op
1 en laat de handeling door. Dat is *"expected GEWEIGERD, got OK"* — precies de
faalsignatuur waar QS8-442 mee begon en waar geen mechanisme bij stond.

⚠️ **Het verklaart ook waarom `g` niet oploopt.** Diezelfde `update` wist elke
run het venster van `groep/g`, dus de teller begon telkens opnieuw. De twee
defecten maskeerden elkaar: **repareer je alleen de `update`, dan bouw je de
tijdbom die het issue beschrijft alsnog.** Ze horen in één wijziging.

## 3. Waarom niemand het zag

Vier regels boven die `update` staat in `leeg()` een uitgebreide uitleg waaróm
een kale `delete from dagtellers` fout is — met het geval, de reden en een
verwijzing naar QS8-336. Die uitleg klopt. Hij staat op de goede plek. Hij gaat
over het verkeerde werkwoord.

⚠️ **Een gevaar dat uitgeschreven naast zich staat, leest als een gevaar dat
afgevangen is.** Dat is dezelfde vorm als de vaste zin in `migraties:controle`
die er ook bij een verse fetch stond (QS8-435) en die daardoor niets meer zei.
De les is niet "beter lezen": het is dat een waarschuwing in proza geen bereik
heeft. Een grendel wel.

## 4. Het besluit over `gedeelde-identiteit:controle` (criterium 3)

**Hij blijft op uuid's, en `g` wordt géén tweede uitzondering — hij wordt
gerepareerd.** Er komt een aparte controle bij voor de vraag die hier echt
gesteld werd.

De reden is dat het twee verschillende vragen zijn:

| Controle | Vraag |
|---|---|
| `gedeelde-identiteit:controle` | **van wie is deze rij?** — twee runs mogen niet dezelfde identiteit dragen |
| `tellerbereik:controle` (nieuw) | **waar mag ik overheen schrijven?** — een opruiming raakt alleen haar eigen sleutels |

`g` is toevallig allebei, en dat maakt het verleidelijk om de eerste te
verbreden. Maar de verbreding die daarvoor nodig is — *"elke vaste waarde in een
gedeelde sleutelruimte"* — heeft geen rand. Elke stringliteral in elke fixture is
dan een kandidaat, en dat is precies de vorm waar dat script zelf voor
waarschuwt: *"een controle die alles meldt, leert je hem te negeren."* De tweede
vraag heeft die rand wél, want hij gaat over schrijfacties op één tabel.

⚠️ **En de nieuwe controle is de vraag die twéé keer gemeten is**, niet één keer.
Het kale `delete from dagtellers` dat `leeg()` vermijdt en de kale `update` die
eronder stond zijn hetzelfde defect; de domeinbrede opruimingen in vier andere
bestanden zijn het ook, alleen met een kleinere straal.

⚠️ **Waarom uitgerekend `dagtellers`.** Die tabel is met opzet gebouwd om een
`delete` te overleven — hij telt de handelingen die er wáren en niet de rijen die
er staan (QS8-399, migratie 0233). Daardoor is hij de enige tabel in dit schema
waar de gewone fixture-opruiming niets aan doet: een rij hangt niet aan een
gebruiker of groep die `removeTestUsers()` weghaalt, maar aan een tekstsleutel
die niemand bezit. Wat er blijft staan, staat er de volgende run nog.

## 5. De belofte stond er al en werd half afgedwongen

De kop van `tests/rls/nevenschade.test.ts` zegt met zoveel woorden: *"Een
testbestand schrijft nooit buiten zijn eigen fixture."* Alles wat dat bestand
tóetst gaat over **databasefuncties** — `pg_get_functiondef()`, een bereik dat de
aanroeper meegeeft. De rauwe SQL van de testbestanden zélf is er nooit langs
gekomen.

Regel 18 in zijn zuiverste vorm: de belofte is een eigenschap van het geheel, de
toets een eigenschap van een onderdeel. En de naad — het testbestand met een
`psql()` in de hand — bleef onbewaakt.
