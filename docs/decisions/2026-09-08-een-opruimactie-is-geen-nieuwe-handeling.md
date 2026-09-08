# Een opruimactie is geen nieuwe handeling

**08-09-2026 — QS8-359, migratie 0205**

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

## De reparatie, en het slot dat er bijna mee verdween

```sql
if tg_op = 'UPDATE'
   and to_jsonb(new) - 'user_id' = to_jsonb(old) - 'user_id' then
  return new;
end if;
```

⚠️⚠️ **Dit is de tweede versie, en de eerste was te ruim.** Die eiste alleen dat
de periode en de groep gelijk bleven. Dat repareert de verwijdering — maar het
haalde en passant een slot weg dat niemand bewust opengezet heeft: 📏 gemeten dat
de eigenaar daarmee de tekst van een weekafsluiting van 69 dagen oud kon
herschrijven, waar het venster dat eerder weigerde met `22007`.

In een accountability-app is dat de rij waar je buddies onder gereageerd hebben.
Maanden later herschrijven wat je opgeschreven had, terwijl hun reacties eronder
blijven hangen, is precies wat een auditspoor niet hoort toe te laten
(domeinregel 5, en de geest van domeinregel 6).

**Niets werd daar rood van** — een `grep` over `tests/` levert nul UPDATE's op
`week_reviews` op. Gevonden in de security-review; er staat nu een test op.

`to_jsonb(new) - 'user_id'` vergelijkt de hele rij op één kolom na. Dat is exact
wat er bedoeld wordt — *er is niets gebeurd behalve dat de eigenaar losgekoppeld
is* — en het blijft kloppen als er een kolom bij komt, waar een lijstje
kolomvergelijkingen die stil zou doorlaten.

⚠️ De eerste versie rechtvaardigde `is not distinct from` met "null = null is
null". 📏 Dat was niet dragend: `group_id` en `group_period_start` zijn allebei
`not null`, dus `=` had daar hetzelfde gedaan. De `to_jsonb`-vorm heeft dat
probleem sowieso niet.

📏 Wat er niet verandert, nagemeten: een nieuwe weekafsluiting buiten het venster
blijft `22007`, een op de verkeerde weekdag blijft `22023`, een UPDATE die de
periodestart wél verzet wordt beoordeeld, en de opruimactie zelf loopt door.

## De vierde keer, en waarom er deze keer geveegd is

`tests/rls/epic7.test.ts:700` beschrijft deze bugklasse als de derde keer (0033,
0059/0060, WERKVOORRAAD §8 punt 8) en schrijft er zelf bij: *"Deze suite zou dat
niet gevangen hebben… De opruiming verbergt de bug."*

Dat is precies wat opnieuw gebeurde. Er stáán groene tests op
`verwijder_mijn_account()` — en ze zijn groen omdat ze gebruikers verwijderen die
seconden oud zijn.

**Daarom is er geen losse toets bijgekomen maar een veegtest.** De belofte die
getoetst wordt is *een account is te verwijderen*, niet *deze trigger doet het
goed*.

⚠️ **Mijn eerste dekkingsclaim klopte niet, en de review heeft dat gemeten.** Ik
selecteerde op "doelwit van een `set null`-FK én een `BEFORE UPDATE`-rijtrigger"
en kwam op zes tabellen. De review heeft in plaats daarvan elke triggerfunctie om
beurten vergiftigd en geteld wat er tijdens `verwijder_mijn_account()` écht
vuurt: **7 van de 62**, en daar zitten er drie bij die ik niet had
(`recalc_goal_max_points`, `noteer_ontkoppeling`, `noteer_beoordelaar_weg_lid`,
alle drie `AFTER DELETE`), terwijl drie van mijn zes structureel niet kúnnen
vuren voor de vertrekkende gebruiker.

Twee dingen zaten er fout in mijn criterium:

* **`BEFORE` was te smal.** Een `AFTER`-trigger breekt een verwijdering even
  hard — `commitments_audit` is er een, en dat is precies het mechanisme onder
  QS8-361.
* **Een kolomgebonden trigger telt niet mee.** `bewaak_tijdzone` stond in mijn
  lijst onder `groups`, maar hij is `BEFORE INSERT OR UPDATE **OF tz**` en kan op
  een `created_by`-set-null per definitie niet afgaan.

De les: **een dekkingsclaim afleiden uit de catalogus is niet hetzelfde als hem
meten.** De kop van de test noemt nu wat er werkelijk vuurt, en welke poten pas
vuren als een ánder vertrekt (de beoordelaar, de getuige).

## Wat de veeg meteen vond

⚠️⚠️ Een **tweede** breuk, met een andere oorzaak — en mijn eerste diagnose
daarvan was fout op een manier die het opschrijven waard is.

Ik mat: een gebruiker met een goedgekeurde voltooiing én een bevestigde straf kan
zijn account niet verwijderen, met `commitment_events_commitment_id_fkey`. Ik
concludeerde dat het de referentiële integriteit zelf was, omdat een tijdelijke
trigger op `commitments` tijdens de verwijdering **geen enkele melding** gaf.

📏 De review heeft dat nagemeten met de opstelling **gecommit** in een eerdere
transactie, en toen slaagde de verwijdering gewoon: `{"ok": true}`, zowel voor de
eigenaar als voor de getuige. Mijn geval faalde alleen doordat opbouw én
verwijdering in dezelfde transactie zaten — Postgres slaat de FK-hercontrole over
als de sleutel niet verandert, behálve wanneer de oude rij door de huidige
transactie is ingevoegd.

⚠️ **Een meting in één transactie is niet dezelfde meting als een gecommitte
toestand.** Dat verschil zat óók onder mijn zwijgende trigger: die vuurde wél,
alleen niet in dat scenario.

Wat er wél is: 📏 eigenaar én getuige in **één statement** (`delete from
auth.users where id in (…)`) faalt, en het is `noteer_commitment()` die de
auditrij schrijft voor een commitment dat dezelfde statement al weggecascadeerd
heeft. Geen zelfbedieningspad, wél precies wat een bulk- of retentieverwijdering
doet. Staat als **QS8-361**, met de correctie erin.

`commitments` blijft daarom bewust buiten de veeg: meenemen zou deze test rood
houden op iets dat 0205 niet repareert.

**Dat de veeg binnen een minuut iets vond, blijft het argument voor de veeg** —
ook al bleek het iets anders te zijn dan ik dacht. Een losse toets op
`bewaak_week_review_periode()` was groen geworden en had niets gezegd.

## De ijking, en de fout die hij aanwees

| Mutatie | Rood |
| -- | -- |
| de vroege uitgang eruit halen | `een account met een verouderde weekafsluiting gaat weg` |
| de uitgang verruimen tot alleen periode en groep (de eerste versie) | `een oude weekafsluiting is niet meer te herschrijven` |
| de eerste mutatie, met een vérse weekafsluiting | **groen** — en dat is het bewijs dat de leeftijd gemeten wordt |

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
  periodestart van deze groep"*. Migratie 0205 repareert ook die kant (de vroege
  uitgang kijkt naar `group_id` én de periodestart), maar het onderliggende
  probleem — dat een beheerder de lopende periode van een ander kan ongeldig
  maken — blijft en staat apart.
* **De blinde vlek zelf.** Geen enkele test in dit project laat tijd verstrijken;
  dit is de eerste die het doet, en dan nog door een trigger even uit te zetten.
  Dat staat als dossierrij van 08-09-2026, want *hoe* je tijd toetst zonder de
  suite traag of wankel te maken is een weging voor de engineer.
