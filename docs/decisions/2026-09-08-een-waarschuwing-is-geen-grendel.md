# Een waarschuwing is geen grendel

**08-09-2026 — QS8-363, migratie 0206**

## Wat er gebeurde, in volgorde

| Tijd | Gebeurtenis |
| -- | -- |
| ochtend | 0200 (QS8-347) zet op negen tabellen een `BEFORE ROW`-rem, omdat een geweigerde bulk-insert de rijen éérst schrijft |
| diezelfde PR | Ik schrijf een dossierrij: *"QS8-344 bouwt het defect opnieuw op tien tabellen als hij zonder rem landt. **Wordt zwaarder als:** QS8-344 landt vóór iemand de rem eraan toevoegt."* |
| middag | 0203 (QS8-344) landt met zes nieuwe dagtellers, in de `AFTER STATEMENT`-vorm, zonder rem |
| kort daarna | Ik merk het op bij een merge, meet het na, en schrijf QS8-363 |

📏 Gemeten op `daily_moves` na die merge, één `authenticated`-sessie, batch van
20.000:

```
pg_total_relation_size vooraf   3080 kB
insert 20.000 dagzetten    ->   23514 Te veel dagzetten in één dag
rijen gebleven                  0
pg_total_relation_size erna     6024 kB
```

Vijf tabellen hadden weer precies het defect dat 0200 had weggenomen.

## De les zit niet in de reparatie

De reparatie is vijf keer dezelfde functie kopiëren; die was in tien minuten
geschreven. Het onderwerp van dit document is dat **de waarschuwing werkte zoals
bedoeld en toch niets tegenhield.**

De rij stond er, hij was precies genoeg, en hij noemde de voorwaarde bij naam. Wat
hem niet hielp:

* **Git zag geen conflict.** Twee branches breidden dezelfde structuur uit in
  verschillende bestanden. Er is niets om te mergen en dus niets om over te
  struikelen.
* **Geen enkele controle keek naar de structuur.** `migraties:controle` telt
  nummers, `kolomrechten:controle` telt rechten — niemand keek of een dagteller
  een rem had.
* **De lezer moest het onthouden.** Ik zag het omdat ik de rij die ochtend zelf
  geschreven had. Over drie maanden had niemand het gezien.

⚠️ **Dit is dezelfde vorm als het migratienummer, en die heeft dit project al
opgelost.** Daar is de afspraak *"wie als tweede merget, hernummert"* — maar de
afspraak wérkt omdat `migraties:controle` rood wordt. De afspraak is niet de
grendel; het alarm is de grendel.

## Wat er daarom bij zit

`tests/rls/remdekking.test.ts` wordt rood zodra er een `*_dagplafond`-trigger
bestaat zonder bijbehorende `*_rem`.

⚠️ **Hij leest `pg_trigger` en niet de migratiebestanden.** De database is de
waarheid: een rem die in een migratie staat maar door een latere `drop` verdwenen
is, telt niet — en precies dat verschil kunnen de bestanden niet zien.

⚠️ **De koppeling loopt over de naam** (`<naam>_dagplafond` ↔ `<naam>_rem`), en
dat is een afspraak. Wie een teller anders noemt wordt hier rood, en dat is de
bedoeling: dan is de afspraak zichtbaar verbroken in plaats van stil.

📏 De ijking laat zien dat dit precies het geval van vanmiddag vangt: een
proeftrigger `proef_dagplafond` op `reports` zonder rem maakt de test rood met
`reports (proef_dagplafond)` in de melding. Was deze test er vanochtend geweest,
dan was 0203 er niet doorgekomen.

## Waarom er twee tests zijn en niet één

De structuurtest bewaakt dát er een rem is. Hij blijft groen bij een rem waarvan
de drempel per ongeluk astronomisch staat.

Daarom meet `bulkschrijf.test.ts` er de belofte zelf bij, op `daily_moves` — een
van de vijf tabellen uit deze migratie:

```
zonder rem   1504 kB aangroei   (gemeten in de ijking)
met rem       184 kB aangroei
```

⚠️ Regel 18, vraag 2: *"toetst deze test de belofte, of een eigenschap van het
onderdeel?"* De structuurtest is het onderdeel, de omvangtest is de belofte. Ze
zijn allebei nodig en ze vangen verschillende dingen — de ijking laat dat zien:
het droppen van één rem maakt béide rood, een niéuwe teller zonder rem alleen de
eerste.

## Het register dat ik bijna kapot maakte

De vijf nieuwe `app.rem_*`-instellingen moeten in het register van
`sleutelzetters()`. Dat register staat in het functielichaam, en dat is de
merge-val van QS8-358.

📏 **Hier was dat geen theorie.** Had ik het register uit 0200 gekopieerd, dan had
ik `app.hervat_lidmaatschap` teruggezet — die sleutel is met 0204 (QS8-325)
vervallen omdat `paused` niet meer bestaat. De kopie zou naar een functie hebben
verwezen die er niet meer is.

⚠️ Tot QS8-358 gebouwd is: **lees de gedeployde definitie, voeg toe, en kopieer
nooit een oudere versie.**

## De grendel keek naar de naam en niet naar de vorm

⚠️⚠️ **De eerste versie van `remdekking.test.ts` bewaakte minder dan hij leek te
bewaken, en de security-review heeft dat gemeten.** Hij controleerde of er bij een
teller een trigger met de naam `<naam>_rem` bestond — en verder niets. Vijf
vormen die niets remmen bleven daardoor groen:

| Rem in deze vorm | eerste versie | nu |
| -- | -- | -- |
| `for each statement` | groen | rood |
| `after insert` | groen | rood |
| `before update` | groen | rood |
| `alter table … disable trigger` | groen | rood |
| wijst naar de rem van een ándere tabel | groen | rood |

📏 En de eerste is niet theoretisch: met `doelinterviews_rem` als
`after insert … for each statement` kostte een geweigerde batch van 20.000 weer
3008 kB bij nul overgebleven rijen — met `remdekking` én `bulkschrijf` groen.

⚠️ **Het is bovendien de waarschijnlijkste fout van allemaal.** De dagteller
ernaast *is* `after insert … for each statement`. Wie de volgende rem schrijft
door de vorm van zijn buurman te kopiëren, landt er precies op.

De query leest nu `tgtype` (BEFORE, FOR EACH ROW, INSERT), `tgenabled` én
`tgfoid` — die laatste omdat een trigger `dagzetten_rem` die
`rem_doelinterviews()` aanroept de goede naam en de goede vorm heeft, maar in de
sleutel van een andere tabel telt tegen een ander plafond.

⚠️⚠️ **En die laatste rij stond eerst als resultaat in deze tabel zónder dat hij
gemeten was.** Bij het naschrijven bleek hij groen: de query keek toen niet naar
`tgfoid`. Dat is dezelfde fout een laag hoger — een ijkingstabel die je invult
uit wat je *denkt* dat de query doet, is zelf een aanname. Vandaar dat elke rij
hierboven met de hand gedraaid is, één mutatie per rij, met een `grep` op de
gemuteerde definitie erbij.

**Dit is regel 18 vraag 3 op mijzelf.** Mijn ijking brak de *aanwezigheid* van de
rem, en dat is niet de as waarlangs deze fout binnenkomt. Een mutatie die door
een grens loopt die het geval al afvangt, bewaakt niets — dat staat in de
grondwet, en ik heb het op mijn eigen grendel niet toegepast.

## IJking

| Mutatie | Rood |
| -- | -- |
| `drop trigger dagzetten_rem on daily_moves` | `geen enkele tabel heeft een dagteller zonder rem ervoor` (noemt `daily_moves`) **en** `ook een tabel uit 0203 laat zich niet volschrijven` (1504 kB) |
| een teller zonder rem toevoegen (`proef_dagplafond` op `reports`) | alleen de eerste, met `reports (proef_dagplafond)` in de melding |
| de rem `for each statement` maken | de eerste |
| de rem `after insert` maken | de eerste |
| de rem `before update` maken | de eerste |
| `disable trigger` op de rem | de eerste |
| de rem naar `rem_doelinterviews()` laten wijzen | de eerste |

⚠️ De laatste vijf waren vóór de reparatie alle vijf groen.

## Wat hier niet in zit

* **Een rem op tabellen zónder dagteller.** Die hebben geen plafond, dus er is
  ook niets om vóór te remmen; ze staan open en dat is QS8-344's afweging
  geweest.
* **De rate limit, en die is op deze tabellen erger dan het dossier zei.** De rem
  begrenst rijen per verzoek, niet verzoeken per seconde. Het getal dat daarbij
  stond — 7,6 MB/s — is op `goals` gemeten: noodgrens 400, geen lange
  tekstkolom.

  📏 `daily_moves` mag er 1000 per verzoek met een `body` tot 2000 tekens.
  Nagemeten na een `vacuum full`, één geweigerd verzoek van 1001 rijen à ~1500
  willekeurige tekens: **40 kB → 1728 kB**, nul rijen gebleven. Dat is
  ~1,7 MB per geweigerd verzoek; de security-review mat over twintig seriële
  verzoeken **25,1 MB/s** vanaf één connectie.

  Op 500 MB gratis tier zonder backups is dat het verschil tussen "een minuut" en
  "twintig seconden". Het pleit niet tégen deze migratie — zonder rem was één
  verzoek al 38 MB — maar QS8-141 verdient het juiste getal.
