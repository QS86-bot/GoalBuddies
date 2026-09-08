# Een opruimactie is geen nieuwe handeling

**08-09-2026 — QS8-359, migratie 0203**

## Waar dit over gaat

Een gebruiker met één weekafsluiting van 65 dagen oud kon zijn account niet meer
verwijderen. 📏 Gemeten op de echte RPC, met een `authenticated`-sessie:

```
select verwijder_mijn_account()
ERROR:  group_period_start 2026-07-05 ligt buiten het toegestane venster
CONTEXT: UPDATE ONLY "public"."week_reviews" SET "user_id" = NULL
         SQL statement "delete from auth.users where id = mij"
```

⚠️ **Er is geen aanvaller en geen beheerder nodig. Alleen tijd.** Dat maakt dit
een AVG-verplichting die vanzelf stukgaat.

## De oorzaak, in één zin

`on delete set null` is geen verwijdering maar een **UPDATE**, en die vuurt de
`BEFORE UPDATE`-trigger opnieuw af — op een rij die jaren oud kan zijn. Die
trigger legt de historische `group_period_start` dan naast de huidige toestand:
het venster van 35 dagen, en de huidige `groups.huddle_day`.

Een rij die geldig wás toen hij geschreven werd, is dat 36 dagen later niet meer.
En juist dan wordt hij opnieuw beoordeeld, door een actie die die kolom niet eens
aanraakt.

## De reparatie, en waarom hij naar de periode kijkt en niet naar `user_id`

```sql
if tg_op = 'UPDATE'
   and new.group_period_start is not distinct from old.group_period_start
   and new.group_id is not distinct from old.group_id then
  return new;
end if;
```

⚠️ Een uitgang op *"`user_id` werd NULL"* zou precies één opruimactie kennen en de
volgende missen. Wat deze toets bewaakt is de periodestart; verandert die niet,
dan is er niets nieuws te beoordelen — wie de UPDATE ook doet en waarom dan ook.

⚠️ `is not distinct from` en niet `=`: `null = null` is `null` en niet `true`,
dus met `=` zou de uitgang nooit genomen worden zodra een van beide kolommen leeg
is. Dezelfde val als in QS8-356.

📏 Wat er niet verandert, nagemeten: een nieuwe weekafsluiting buiten het venster
blijft `22007`, een op de verkeerde weekdag blijft `22023`, en een UPDATE die de
periodestart wél verzet wordt gewoon beoordeeld.

## De vierde keer, en waarom er deze keer geveegd is

`tests/rls/epic7.test.ts:700` beschrijft deze bugklasse als de derde keer (0033,
0059/0060, WERKVOORRAAD §8 punt 8) en schrijft er zelf bij: *"Deze suite zou dat
niet gevangen hebben… De opruiming verbergt de bug."*

Dat is precies wat opnieuw gebeurde. Er stáán groene tests op
`verwijder_mijn_account()` — en ze zijn groen omdat ze gebruikers verwijderen die
seconden oud zijn.

**Daarom is er geen losse toets bijgekomen maar een veegtest.** 📏 Met
`pg_trigger` gemeten welke tabellen doelwit zijn van een `set null`-FK én een
`BEFORE UPDATE`-rijtrigger dragen — dat zijn er zes — en `opruiming.test.ts`
bouwt één gebruiker met een rij in elk daarvan. De belofte die getoetst wordt is
*een account is te verwijderen*, niet *deze trigger doet het goed*.

## Wat de veeg meteen vond

⚠️⚠️ Een **tweede** breuk, met een andere oorzaak: een gebruiker met een
goedgekeurde voltooiing én een bevestigde straf krijgt
`commitment_events_commitment_id_fkey`. Twee FK-acties raken daar dezelfde
auditrij — `actor_id` gaat op NULL (de vertrekkende gebruiker ís de actor) terwijl
`commitments` via `goals` al weggecascadeerd is, en die UPDATE hervalideert de FK
van een ouder die er niet meer is.

📏 Nagemeten dat er géén trigger op `commitments` bij betrokken is: een tijdelijke
`after insert or update or delete`-trigger gaf tijdens de verwijdering geen enkele
melding. Dit is de referentiële integriteit zelf.

Dat is een andere belofte — *een auditspoor overleeft zijn onderwerp niet* — en
het raakt domeinregel 5. Het staat als **QS8-361**, en `commitments` blijft
daarom bewust buiten de veeg: meenemen zou deze test rood houden op iets dat 0203
niet repareert.

**Dat de veeg binnen een minuut een tweede geval vond, is het argument voor de
veeg.** Een losse toets op `bewaak_week_review_periode()` was groen geworden en
had niets over de belofte gezegd.

## De ijking, en de fout die hij aanwees

| Mutatie | Rood |
| -- | -- |
| de vroege uitgang eruit halen | `een account met een verouderde weekafsluiting gaat weg` |
| dezelfde mutatie, met een vérse weekafsluiting | **groen** — en dat is het bewijs dat de leeftijd gemeten wordt |

⚠️ **De must-allow was eerst niets waard, en de ijking liet dat zien.** De
periodestart stond op `date_trunc('week', …) + 6 dagen`, en dat is voor
`dagenOud = 0` de kómende zondag: 2026-09-13 op een dag dat het 2026-09-08 was.
Die rij lag dus buiten het venster aan de **toekomstkant** en overleefde alleen
dankzij de vroege uitgang — waardoor de mutatie béide tests rood maakte.

Een must-allow die met de grendel meesterft, toetst de grendel en niet de
must-allow. Dat verschil is precies waarom criterium 4 van het issue erop stond
dat het ijkgeval oud genoeg moet zijn.

## Wat hier niet in zit

* **QS8-361**, hierboven.
* **QS8-360** — de tweede variant van dit defect heeft wél een veroorzaker: na een
  `huddle_day`-PATCH van een beheerder faalt dezelfde verwijdering met *"is geen
  periodestart van deze groep"*. Migratie 0203 repareert ook die kant (de vroege
  uitgang kijkt naar `group_id` én de periodestart), maar het onderliggende
  probleem — dat een beheerder de lopende periode van een ander kan ongeldig
  maken — blijft en staat apart.
* **De blinde vlek zelf.** Geen enkele test in dit project laat tijd verstrijken;
  dit is de eerste die het doet, en dan nog door een trigger even uit te zetten.
  Dat staat als dossierrij van 08-09-2026, want *hoe* je tijd toetst zonder de
  suite traag of wankel te maken is een weging voor de engineer.
