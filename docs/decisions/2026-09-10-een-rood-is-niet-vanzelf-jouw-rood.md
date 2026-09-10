# Een rood is niet vanzelf jouw rood

**10-09-2026 — QS8-262, ronde 9.**

`npm run rls:dekking` meet of een RLS-policy bewaakt wordt door hem wagenwijd
open te zetten en te kijken of er een test rood wordt. Dat is de juiste vraag.
Wat het script daarna deed was de verkeerde gevolgtrekking:

> er werd een test rood **⇒** deze policy is bewaakt

De tussenstap ontbreekt. "Er werd een test rood" en "déze policy maakte hem
rood" zijn twee verschillende beweringen, en het verschil is precies groot
genoeg om een gat als bewaakt te melden.

## 1. Het geval

📏 Gemeten op 10-09-2026, op één commit, zonder één regel code of één policy aan
te raken:

| Stand van `dagtellers` | `npm run rls:dekking -- profiles` |
|---|---|
| `avatars/uploader/tmp` = 6 | `1 van de 3` — beide helften van `profiles_update` een gat |
| dezelfde rij op 10 | **`3 van de 3` bewaakt**, plus de eis om de twee registerrijen weg te halen |

De sleutel is een **letterlijke** `tmp`. `avatarbucket.test.ts` zet een map neer
die geen uuid is — dat is waar die test over gaat — en gebruikte daar de naam
`tmp` voor. `bewaak_avatar_aantal()` telt per map in `dagtellers`, en een
`delete` haalt die telling er níet af; dat is geen bug maar precies wat migratie
0233 wilde ("een dagteller die een delete overleeft"). Elke run van dat bestand
telde er dus één bij op dezelfde rij. Bij tien slaat de teller dicht en valt de
test om met `23514` — in élke beurt van de meting, ongeacht welke policy er open
stond.

En het script las dat als bewijs.

⚠️ **Ik ben er zelf in gelopen.** Op grond van zo'n uitslag heb ik in deze ronde
twee terechte rijen uit `NIET_PER_HELFT_TE_METEN` weggehaald. De
`security-reviewer` mat het tegenovergestelde; nagemeten op een verse stack had
de reviewer gelijk en het instrument ongelijk. De rijen staan terug.

## 2. Waarom dit de derde fout van deze soort is

Dit script heeft er nu drie gehad, en ze zijn alle drie dezelfde vorm en alle
drie dezelfde richting:

| | Wat er als bewijs telde | Wat dat werkelijk was |
|---|---|---|
| #150 | elke niet-nul exitcode | ook een vitest die niet startte |
| #150 | een groene uitslag | ook een run waarin 58 bestanden omvielen |
| nu | elke gefaalde test | ook een test die al rood stónd |

De richting is elke keer de geruststellende: **een gat komt eruit als bewaakt.**
Dat is de kant waarop een meetinstrument stukgaat zonder dat iemand het merkt,
want de uitslag ziet er beter uit dan de werkelijkheid en niemand gaat een
gunstige uitslag natrekken.

## 3. De reparatie

**Het bewijs draagt voortaan een naam.** `leesUitkomst()` leest uit de
json-reporter van vitest wélke tests faalden in plaats van hoevéél, en een
telling zonder namen is `onbruikbaar` — geen oordeel, en dus ook geen gunstig
oordeel.

**Twee basislijnen.** De suite draait één keer vóór de eerste mutatie en één
keer ná de laatste, met alles dicht.

- Wat bij de start al rood stond, telt niet als bewijs — dat is het geval
  hierboven (`weegTegenBaseline()`).
- Wat tíjdens de run rood werd zonder dat er iets openstond, telt ook niet — een
  teller loopt door terwijl je meet, dus de eerste basislijn alleen is te weinig
  (`weegDrift()`). Een bevinding die daar volledig op leunt wordt `ongemeten`,
  en dan noemt het script liever geen getal dan een verkeerd getal. Dat is
  dezelfde houding die het al had voor een onbruikbare run.
- Wie er nog een ánder rood onder heeft, blijft bewaakt. Dat rood stond bij de
  start niet aan en aan het eind ook niet, dus dat is wél van deze policy.

**En een `✓` drukt af wélke test rood werd.** Dat is de goedkoopste helft van de
reparatie en misschien de belangrijkste: zonder die naam is een uitslag niet na
te kijken, en zag `✓` er identiek uit of het rood nou van de policy kwam of van
een volgelopen dagteller.

⚠️ **Wat de reparatie niet dekt.** Of een test rood wordt kan afhangen van
wélke bestanden er samen draaien — ze delen één database. De basislijn draait
daarom over precies de bestandenverzameling die de run zelf gebruikt, maar een
subset-effect binnen die verzameling blijft mogelijk. Dat is een tweede-orde
risico en het is niet gemeten; de naam bij de `✓` is wat het zichtbaar houdt.

## 4. En de sleutel `tmp` gaat weg

De instrumentreparatie maakt de meting eerlijk, maar de landmijn blijft: een
test die na tien runs omvalt op een stack waar niets mis mee is, maakt élke
poortrun onbetrouwbaar en leert de lezer om rood weg te wuiven. De mapnaam is nu
per run een andere.

⚠️ **Een uuid mag het niet zijn** — dat is nu juist wat die test uitsluit.

⚠️ **En dit is de énige letterlijke sleutel in de suite.** Nagelopen: elke
andere teller in `dagtellers` staat op een fixture-uuid, en die is per run
nieuw. `tmp` was de uitzondering, niet het patroon.

## 5. De regel die overblijft

> **Een meting die op "er werd iets rood" leunt, moet weten wát er rood werd —
> en of dat er vóór de meting al was.**

Dat geldt breder dan dit script. Elk instrument dat een grendel ijkt door hem te
breken, ijkt in werkelijkheid *"is de toestand na mijn mutatie anders dan
ervoor"*, en dat is alleen te beantwoorden als "ervoor" ook gemeten is. `CLAUDE.md`
eist bij een ijking al dat je de grendel breekt die de ijking nóemt; dit is
dezelfde eis vanaf de andere kant.
