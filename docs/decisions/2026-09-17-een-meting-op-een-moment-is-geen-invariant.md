# Een meting op één moment is geen invariant

**Datum:** 17-09-2026 · **Issue:** QS8-530 · **Raakt:**
`tests/rls/strafklok-ligt-vast.test.ts`, `supabase/migrations/0280_*.sql`,
`docs/ENGINEER-REVIEW.md`, `docs/decisions/2026-09-16-de-klok-die-de-gestrafte-zelf-zet.md`,
`docs/decisions/2026-09-08-wat-een-straf-overleeft.md`

## Wat er gebeurde

`npm run poort` liep op 17-09-2026 om **10:34 UTC** rood op een test die niets
met het lopende werk te maken had:

```
FAIL tests/rls/strafklok-ligt-vast.test.ts > staat op precies twee datums tegelijk
AssertionError: expected 'datums=3\n' to contain 'datums=2'
```

De test legde de aanname vast onder de hele redenering van 0280: *"de spreiding
over álle zones in `pg_timezone_names` is op elk moment **precies twee datums** —
hier nagemeten en niet aangenomen"*. Eronder stond, woordelijk:

> ⚠️ Gaat dit ooit naar drie, dan koopt een zonesprong twee dagen en is "één dag"
> geen bovengrens meer. Deze toets zegt dat hardop.

Hij zei het hardop. De aanname was onwaar.

## De meting

📏 Per UTC-uur, `count(distinct (u at time zone name)::date)` over
`pg_timezone_names`, op de lokale stack:

| UTC | datums |
|---|---|
| 00:00 – 09:59 | 2 |
| **10:00 – 11:59** | **3** |
| 12:00 – 23:59 | 2 |

Op de minuut nagemeten is het venster **10:00 t/m 11:59 UTC**, elke dag, twee uur
lang. 📏 En de oorzaak, in dezelfde database gemeten:

- uiterste offsets: **−12:00** (`Etc/GMT+12`) tot **+14:00** (`Etc/GMT-14`,
  `Pacific/Kiritimati`)
- spanwijdte: **26:00:00**

Een venster van 26 uur is langer dan een etmaal, dus het **moet** twee
middernachten bevatten — precies 26 − 24 = twee uur per dag. Dit is geen flake en
geen drift: het komt elke dag terug, en het is een eigenschap van de tz-database.

## Waarom de meting klopte en de conclusie niet

De meting van 16-09 was echt gedaan. Ze is alleen op **één moment** gedaan, en
dat moment lag buiten het venster van twee uur — 22 van de 24 uur geeft het
antwoord dat opgeschreven is.

⚠️ Dat is onwrikbare regel 18 in zijn zuiverste vorm: *toetst deze test de
belofte, of een eigenschap van het onderdeel?* Het aantal datums is een
eigenschap van de **klok**. De spanwijdte is een eigenschap van de
**tz-database**. De redenering van 0280 leunt op de tweede en de test vroeg de
eerste — en de eerste is 8,3% van de dag een ander getal.

⚠️⚠️ **En de tegenspraak stond al in de repo.** `0134_respijtdag_in_de_eigen_tijdzone.sql`
draagt in zijn kop een tabel die UTC−8 nul dagen respijt geeft en UTC+10 twee.
Dat *ís* een spreiding van twee dagen tussen de uitersten. 0280 schreef er
anderhalve week later één van, mét een meting erbij — en de meting won het van de
tabel die er al stond.

De les die daaruit volgt is smaller dan "beter opletten": **een verse meting
overtuigt harder dan bestaande documentatie, ook als de documentatie gelijk
heeft.** Een getal met 📏 ervoor leest als bewijs. Het is bewijs over het moment
waarop het gemeten is, en verder niets.

## Wat er níet fout was

⚠️ **De grendel van 0280 klopt.** Die bevriest `commitments.tz` bij het aangaan,
en `tz` staat in géén enkele grant aan `authenticated` — 📏 nagemeten:
`has_column_privilege('authenticated','public.commitments','tz','UPDATE')` is
`false`, en `bevries_commitmentzone()` werpt op elke wijziging. Dáár is de
bovengrens dus niet dragend, één dag of twee.

⚠️⚠️ **Maar "geen gat in 0280" is niet "geen gat", en dat onderscheid is de
duurste regel van dit document.** De security-ronde op deze wijziging vond twee
andere plekken die op de **levende** `profiles.tz` beslissen, en daar is het
getal wél de grens tussen geweigerd en toegelaten. Allebei zelf nagemeten tegen
de gedeployde functies, met echte rijen en teruggerold — ze staan als rij van
17-09-2026 in `docs/ENGINEER-REVIEW.md` en als QS8-531 en QS8-533 in Linear.

📏 `beslis_deadline_verzoek()`, met als énige variabele de zone van de aanvrager
en een verzoek waarvan de nieuwe datum twee dagen achter de oostelijke klok ligt:

| `profiles.tz` van de aanvrager | uitkomst | straf |
|---|---|---|
| `Pacific/Kiritimati` (+14, eerlijk) | `verzoek_verlopen` | blijft `due` |
| `UTC` | `verzoek_verlopen` | blijft `due` |
| `Etc/GMT+12` (−12) | `ok: true, straffen_teruggezet: 1` | **`due` → `set`** |

⚠️ En met een verzoek van één dag terug in plaats van twee gaat `UTC` er óók
doorheen. **De poort staat dus vierentwintig uur per dag open met één dag bereik;
het venster van twee uur bepaalt alleen of het er één wordt of twee.** Dat is een
scherpere uitslag dan "een randgeval van twee uur", en hij kwam boven doordat de
eendaagse variant apart gemeten is.

**Het besluit om die twee te repareren ligt bij Quinten** — het is een commitment
device, en dat is grens 1. Precies zoals 0280 zelf een besluit van Quinten was.

Wat er in *dit* issue verandert is dus geen grendel: een verkeerd opgeschreven
bovengrens op vijf plekken, en een toets die elke dag twee uur rood stond op
`main`.

## Het besluit

De toets vraagt voortaan de grootheid waar de redenering op leunt:

> `max(utc_offset) − min(utc_offset)` = **26:00:00**, dus een zonesprong koopt ten
> hoogste `ceil(26 / 24)` = **twee** dagen.

Dat is klokonafhankelijk, en hij wordt rood zodra de tz-database een extremere
zone krijgt — precies het geval dat de oorspronkelijke toets wilde vangen. Van
het aantal datums blijft alleen de **bovengrens** over (`dagen + 1`, dus drie),
want dat getal is per uur anders en een gelijkheid erop is een belofte die
niemand kan waarmaken.

De vijf plekken die "één extra dag" zeiden, zeggen nu "ten hoogste twee dagen",
met het venster van twee uur erbij en met `0134` als de tegenspraak die er al
stond.

## De ijking

📏 Drie grendels, drie mutaties, elk apart — en elke keer werd de grendel rood die
de mutatie noemde, terwijl de andere twee groen bleven:

| mutatie | uitkomst | wat er rood werd |
|---|---|---|
| een zone bij op `+25:00` | `spanwijdte=37:00:00;dagen=2` | alleen `spanwijdte` |
| `ceil` naar `floor` | `spanwijdte=26:00:00;dagen=1` | alleen `dagen` |
| de telling drie omhoog | `datums=6` | alleen de bovengrens |

⚠️ De eerste is niet willekeurig: `+25:00` is gekozen omdát `ceil(37 / 24)` nog
steeds 2 is. Zo toetst die mutatie de spanwijdte los van het dagental, in plaats
van allebei tegelijk om te gooien — en dan zou niet te zeggen zijn welke grendel
hem ving.

📏 En een vierde bewijs kwam er gratis bij: alle drie de ijkruns draaiden rond
11:15 UTC en printten `datums=3`. De oude assertie was op dat moment rood
geweest — de klok, en niets anders, bepaalde de uitslag.

## Wat dit openlaat

Deze klasse is hiermee niet dicht. Een test die een meting op één moment
vastlegt, ziet er precies zo uit als een test die een invariant vastlegt; het
verschil zit in wat er gemeten wordt en niet in hoe de test geschreven is. Er is
geen script dat dat onderscheid kan maken.

Wat wél helpt is de vraag bij elke grendel die een getal vastlegt: **hangt dit
getal aan iets dat vanzelf verandert?** De klok, de datum, een teller, de inhoud
van een tabel die groeit. Zo ja, dan hoort de grendel aan de grootheid eronder te
hangen en niet aan het getal zelf. `tests/rls/zoekpadschaduw.test.ts` draagt
dezelfde les: *"dat was tien uur per dag loos groen"* — daar viel hij de andere
kant op, en dan vindt niemand hem.
