# De wezenbewaker vraagt wie de groep gemaakt heeft, niet wanneer

**Datum:** 07-09-2026 · **Issue:** QS8-329 · **Volgt op:** QS8-281

## Wat er stond, en wat de kop er zelf al bij zei

`meldAchtergeblevenGroepen()` in `tests/rls/harness.ts` kijkt aan het eind van
elk testbestand of er groepen van ná `RUN_START` zonder leden zijn blijven staan,
en gooit als dat zo is. De kop van die functie noemde de aanname met zoveel
woorden:

> De vensterkeuze leunt op `fileParallelism: false` … Draait deze groep ooit
> parallel, dan is dit een valse rode en hoort deze bewaker mee verbouwd te
> worden.

Die aanname gold **binnen** één run. Op 07-09-2026 draaiden er twee sessies tegen
dezelfde lokale stack, en toen gold hij niet meer.

## De meting

📏 Twee volledige suites tegelijk, op de code zoals hij was:

| | run A | run B |
| -- | --: | --: |
| rode **bestanden** | 5 | 6 |
| gefaalde **tests** | 2 | 3 |
| wezenmeldingen | 4 | 8 |

**Het gat tussen 5 rode bestanden en 2 gefaalde tests is de bewaker**, die in
`afterAll` gooit. Elk van die bestanden was los meteen weer groen.

⚠️ Een bewaker die willekeurig rood wordt, leert je hem opnieuw te draaien. Dat
is dezelfde gewoonte waar QS8-268 en QS8-270 over gaan, en de eerstvolgende keer
dat hij een échte wees meldt, is "gewoon nog een keer draaien" het antwoord dat
iedereen al geleerd heeft.

## Het besluit: eigendom vragen in plaats van tijd

De harness zei het zelf al, één alinea hoger in hetzelfde bestand: *een
tijdstempel is geen eigendomsbewijs.* Dat stond er als reden om **niets te
verwijderen**; deze wijziging trekt het door naar het oordeel zelf.

Een lege verse groep valt nu in één van drie bakken:

| bak | hoe herkend | uitkomst |
| -- | -- | -- |
| **van ons** | aangemeld via `registreerGroep()`, óf aangemaakt door een gebruiker van deze run | rood |
| **van een andere run** | `created_by` wijst naar een lévende gebruiker die niet van ons is | genegeerd |
| **niet toe te wijzen** | `created_by` is NULL en wij kennen de groep niet | zie hieronder |

De tweede bak is de valse rode van 07-09: de andere run had die groep even zonder
leden en ruimde hem milliseconden later op.

### De derde bak is het eerlijke midden

Een lege groep zónder aanmaker is nu juist het lek waar deze bewaker voor gebouwd
is (QS8-281: `verwijder_mijn_account()` zet `groups.created_by` op NULL en het
lidmaatschap cascadeert weg, waarna beide wegen naar die groep dicht zitten).
Draait er niemand anders, dan is zo'n groep van ons en hoort de run om te vallen.
Draait er wél iemand anders, dan kán hij van hen zijn.

⚠️ **Dan is de uitslag `ONGEMETEN` en niet groen**, luid, met de id erbij. Dit
project heeft een eigen issue over controles die "OVERGESLAGEN" printen en daarna
exitcode 0 geven (QS8-268) en over een suite die zichzelf stil oversloeg
(QS8-270). Wie hier iets afzwakt, hoort het te horen.

### Waarom niet "elke run zijn eigen database"

Dat is denkrichting 1 uit het issue en het sluit het hele geval. Het is hier niet
gekozen om een reden die in het issue zelf staat: **acceptatiecriterium 1 vraagt
dat twee runs *tegen dezelfde stack* geen valse melding meer geven.** Een aparte
database maakt dat criterium onmeetbaar in plaats van waar.

## Het oordeel staat los, en dát is de reparatie eronder

De bewaker was alleen te ijken door een échte database in een toestand te
brengen. Dat is de vorm die dit project elders al heeft afgezworen: *een controle
die je niet kunt voeden, kun je niet ijken.* Het oordeel staat daarom in
`tests/rls/wezen.ts`, zonder één import, en `tests/wezen.test.ts` biedt hem elke
vorm los aan — de vormen die hij moet melden én de vormen die hij met rust moet
laten.

## Twee dingen die de meting corrigeerde en het denken niet

Beide zijn gevonden door na elke versie opnieuw twee suites tegelijk te draaien,
en geen van beide was voorzien.

### 1. Het signaal knipperde

De eerste versie vroeg *"draait er nú een andere run"* aan het aantal verse
profielen dat niet van ons is. 📏 Dat gaf nog steeds drie valse rode: tussen twee
testbestanden van de andere run door is die teller even nul, en precies in dat
gaatje viel de melding.

Twee reparaties, en de tweede is de belangrijkste:

- **Een geheugen.** De vraag is niet *"draait er nú iemand anders"* maar *"heeft
  er tijdens dit bestand iemand anders aan deze database gezeten"* — die is
  monotoon.
- **Een breder bewijs.** Élke verse groep met een lévende vreemde aanmaker telt
  mee, ook een groep waar nog leden in zitten. Een run die middenin een bestand
  zit heeft altijd zulke fixtures — en **alleen middenin een bestand kan hij een
  verwarrende wees laten staan**. Daarmee valt het gaatje dicht.

### 2. `policies.test.ts` ruimde zijn fixture op naam op

📏 Bij de tweede meting meldden **beide** runs dezelfde twee id's. Dat was geen
valse rode maar een échte: `policies.test.ts` maakt een `SETNULL proefgroep`,
zoekt hem op naam terug en verwijdert hem op naam. Draaien er twee suites, dan
dragen ze allebei een groep met die naam — het `toHaveLength(1)` ziet er twee, en
de `delete` van de één haalt de fixture van de ánder weg.

⚠️ **Een naam is geen identiteit.** Nu op id, en daarmee verdween de rij.

## De uitkomst

📏 Twee volledige suites tegelijk, na de reparatie:

| | run A | run B |
| -- | --: | --: |
| wezenmeldingen | **0** | **0** |
| `ONGEMETEN` | 0 | 0 |
| `opruiming.test.ts` rood | nee | nee |

## De must-see moest anders worden geformuleerd

`opruiming.test.ts` maakt met opzet een wees die niet toe te wijzen is en eiste
dat `removeTestUsers()` gooit. Onder twee runs is dat niet meer altijd waar — en
dat is geen defect maar de nieuwe, eerlijke uitslag.

⚠️ **De eerste poging was een meting vooraf plus één geëiste uitkomst.** 📏 Die
viel om: de test en de bewaker bemonsteren op twee verschillende momenten, en
tussen die twee door verscheen er een vreemde aanmaker. **Twee metingen van
hetzelfde feit lopen uit elkaar; één belofte doet dat niet.**

De test eist nu wat in beide omstandigheden waar is: **de bewaker zwijgt hier
nooit** — rood óf een luide `ONGEMETEN`, precies één van de twee. Dat is geen
slappe `of/of`: de uitgesloten uitkomst is de enige die ertoe doet. Wélke van de
twee het wordt, staat exact onder test in `tests/wezen.test.ts`, waar de
omstandigheid een parameter is en geen toevalligheid.

## De ijking

Acht mutaties, elk apart, elk met een controle dat de mutatie ook echt in het
bestand stond, elk rood op de test die hem noemt:

| # | Wat gebroken | Wat rood werd |
| --: | -- | -- |
| 1 | attributie via de aanmaker | *een lege groep die door een gebruiker van ons is aangemaakt* |
| 2 | attributie via de boekhouding | *een lege groep die deze run zelf heeft aangemeld* |
| 3 | een vreemde groep telt als de onze | *een lege groep van een lévende gebruiker die niet van ons is* |
| 4 | het geheugen | *onthoudt dat er eerder een andere run gezien is* |
| 5 | het verbrede bewijs | *een vreemde lege groep is zelf al bewijs* |
| 6 | `ongemeten` wordt groen | drie gevallen, waaronder de degradatie zelf |
| 7 | elke groep telt als schoon | acht van de elf |
| 8 | de bewaker gooit niet meer | *gooit als er tóch een groep zonder leden blijft staan* |

⚠️ Mutatie 6 is de belangrijkste van de acht: zonder die test is "zwijgen" ook
groen, en dan is de degradatie een uitschakelknop in plaats van een uitslag.

## Wat hierna nog open staat

Twee suites tegen één database botsen op méér dan de wezenbewaker. 📏 Na deze
reparatie bleven er in de gelijktijdige meting nog failures over in
`avatarbucket`, `adempauze-grendels` en `risicoradar` — fixtures met een vaste
uuid of een vast pad, die elkaar overschrijven. Dat is dezelfde familie en een
ander issue; deze wijziging raakt hem niet.
