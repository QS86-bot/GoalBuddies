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

## IJking

| Mutatie | Rood |
| -- | -- |
| `drop trigger dagzetten_rem on daily_moves` | `geen enkele tabel heeft een dagteller zonder rem ervoor` (noemt `daily_moves`) **en** `ook een tabel uit 0203 laat zich niet volschrijven` (1504 kB) |
| een teller zonder rem toevoegen (`proef_dagplafond` op `reports`) | alleen de eerste, met `reports (proef_dagplafond)` in de melding |

## Wat hier niet in zit

* **Een rem op tabellen zónder dagteller.** Die hebben geen plafond, dus er is
  ook niets om vóór te remmen; ze staan open en dat is QS8-344's afweging
  geweest.
* **De rate limit.** De rem begrenst rijen per verzoek, niet verzoeken per
  seconde. 📏 7,6 MB/s vanaf één client blijft staan; dat is de dossierrij van
  08-09 over de ontbrekende laag vóór PostgREST.
