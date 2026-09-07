# De week had een teller en geen vorm — QS8-301

**Datum:** 07-09-2026
**Raakt:** `src/modules/completions/afvinken.ts`, het blok *Vandaag*
**Geen migratie.** Er verandert niets aan het schema of aan een recht.

## Wat er stond

Twee functies, en samen deden ze het verkeerde:

| Functie | Gaf | Aangeroepen door |
|---|---|---|
| `fetchAfvinktellingen(cyclus)` | per weekdoel een **aantal** | het hoofdscherm |
| `fetchAfvinkingen(weekdoelId)` | van één weekdoel de **dagen** | 📏 niets |

De tweede stond als "hier hoort een scherm bij" in QS8-301, groep 1. Bij het
bouwen bleek dat de verkeerde vraag.

## De afweging: geen scherm erbij, maar de functie weg

**De feature is terecht en de functievorm is het niet.** Het enige oppervlak dat
"welke dagen" nodig heeft, is het ritmeblok op *Vandaag*, en dat toont álle
weekdoelen tegelijk. `fetchAfvinkingen()` daar aanroepen is één verzoek per
weekdoel — precies de N+1 waarvoor `fetchAfvinktellingen()` ooit gebouwd is
(onwrikbare regel 12).

De dure vraag stónd er dus al; het antwoord werd alleen weggegooid om er een
getal van te maken. Eén kolom erbij in dezelfde query, en de dagen zijn er —
tegen nul extra verzoeken.

Dus:

* `fetchAfvinktellingen()` → **`fetchAfvinkingenPerWeekdoel()`**, en die geeft de
  dagen.
* De teller is nu een **afleiding** (`.length`) en geen tweede gegeven. Twee
  tellingen die uiteen kunnen lopen zijn er één te veel.
* `fetchAfvinkingen()` is **weg**. Niet omdat hij dood was, maar omdat het scherm
  dat hem nodig leek te hebben, hem niet kan gebruiken zonder een regel te
  breken.

⚠️ **Dat is de derde uitkomst die QS8-301 niet noemde**, en hij hoort in de rij
naast de twee andere: *een scherm erbij*, *de functie weg*, en **dit** — *de
feature bouwen en de functie weghalen, want de bestaande query kon het al*. Bij
de volgende van de negen is die derde vraag het stellen waard voordat er een
scherm bij komt.

## Wat de gebruiker erbij krijgt

Een strook van zeven vakjes onder *"3 van 5 dagen"*.

⚠️ **Waarom dat geen versiering is.** Een getal heeft geen vorm: je ziet er niet
aan of die drie achter elkaar zaten of verspreid, en niet of vandaag er al bij
zit — terwijl de knop eronder juist over vandaag gaat.

Drie dingen die met opzet zo zijn:

* **Zeven vakjes, altijd.** Een rij die krimpt naarmate je minder afvinkt, zegt
  niet hoeveel er nog kan.
* **Een lege dag is een licht vakje en geen gat.** Zelfde afweging als in
  `Kalender`: een rooster met gaten leest als een aanklacht.
* **De eerste dag is de start van jóuw cyclus.** Niet maandag. Welke dag de week
  begint is een voorkeur (domeinregel 1), en een strook die op maandag begint
  ziet er volstrekt normaal uit terwijl hij twee dagen scheef staat. Dat is
  meteen de eerste ijkmutatie.

## Domeinregel 7: dit is en blijft privé

`day_checkins` is eigenaar-only, zonder tak voor groepsgenoten, ook in een open
groep (A41). De strook staat op *Vandaag* — het scherm van de eigenaar zelf — en
hoort nooit op een groepsoppervlak.

⚠️ **De twee vragen uit CLAUDE.md, gesteld en beantwoord:** kan hieruit iemands
gemiste week worden afgeleid? Ja, fijnmaziger nog dan een gemiste week — een
rooster met gaten. Kan iemand dat buiten de UI om uitlezen? Nee: de policy op
`day_checkins` geeft groepsgenoten niets. **Er komt dus geen rij bij in
`docs/decisions/002-domeinregel7-oppervlakken.md`**, want de groep krijgt niets
nieuws te zien. Dit is wat de eigenaar over zichzelf leest.

## Een module erbij, en niet uit netheid

`groepeerPerWeekdoel()` staat in `afvinkvorm.ts` en niet in `afvinken.ts`. 📏
Nagemeten: een unit-test die `afvinken.ts` importeert valt om in de transform,
nog vóór er iets draait — dat bestand trekt via `lib/supabase` AsyncStorage en
React Native mee, en de unit-tests draaien in Node.

Dat is vandaag de tweede keer (zie `deadline-redenen.ts`, QS8-311), en het is
hetzelfde patroon: **het stuk dat een belofte draagt, moet los staan van de
client — anders is het alleen te toetsen door het scherm te renderen, en dan
wordt het niet getoetst.**

## Ijking

Mutatie per grendel, en elke bewerking eerst met een grep nagekeken of hij er
stáát — dat laatste is de les van vanochtend, toen een mutatie groen bleef omdat
de bewerking het bestand niet geraakt had.

| | Mutatie | Uitslag |
|---|---|---|
| A | de strook twee dagen verschuiven | 1 rood: *begint op de startdag van de cyclus* |
| B | de strook laten krimpen tot de afgevinkte dagen | 5 rood |
| C | stilletjes ontdubbelen in de groepering | 1 rood: *telt een dubbele dag niet weg* |
| D | de groepering zelf laten sorteren | 1 rood: *houdt de volgorde aan* |

⚠️ **C lijkt een correctie en is een verhulling.** De unieke index
`day_checkins_een_per_dag` maakt een dubbele dag onmogelijk; zou die ooit
sneuvelen, dan hoort dat zichtbaar te worden in de teller en niet weggepoetst in
een hulpfunctie.

## De stand van QS8-301

`BEKENDE_ONBEREIKBAAR` gaat van negen naar **één**. Wat overblijft is
`isAfgegaan`, en die blijft staan met de reden die het issue er zelf bij gaf: hij
is een kopie van een databaseregel die door `tests/rls/epic9.test.ts` naast
`commitment_zichtbaar_voor_groep()` wordt gelegd. **Dat is een geldige reden om
te bestaan en geen reden om bereikbaar te zijn.**
