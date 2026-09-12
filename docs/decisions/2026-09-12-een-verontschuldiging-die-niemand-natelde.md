# Een verontschuldiging die niemand natelde

**Datum:** 12-09-2026 · **Issue:** QS8-441 · **Migratie:** geen

## Wat er mis was

`schermingang:controle` (QS8-383) wordt rood zodra een route in `app/` nergens
vandaan geopend wordt. Vijf routes staan met reden in `ZONDER_PUSH`, en die reden
luidde:

> 📏 Staat als `<Tabs.Screen name="lijst">` in `app/(tabs)/_layout.tsx`: de
> tabbalk is de ingang.

📏 Sinds QS8-437 draagt dat bestand `tabBar={() => null}`. **De navigator tekent
geen balk meer.** De `<Tabs.Screen>`-regels staan er nog als *routedefinitie*,
dus de controle bleef groen terwijl zijn onderbouwing onwaar was geworden.

De echte ingang is de `<Link>` in `src/shared/ui/Taakbalk.tsx`, gevoed door
`TABBLADEN` in `src/shared/ui/taakbalk.ts`.

## Wat dat kostte

📏 Gemeten: `/lijst` had **nul** andere ingangen — geen `router.push`, geen
`href`, geen `terug={{naar}}` in heel `app/` en `src/`. Eén rij uit `TABBLADEN`
halen maakte het vijfde tabblad dus onbereikbaar.

📏 En dan bleef álles groen. Met `/lijst` uit `TABBLADEN`:

| wat | uitslag |
| -- | -- |
| `npm run schermingang:controle` | *"alle 27 routes hebben een ingang"* |
| de hele unit-suite (235 bestanden) | **3750 groen, 0 rood** |

Dat is woordelijk de situatie waarvoor QS8-383 die controle bouwde: `/doel/plan`
lag twee weken af en gemerged terwijl beide knoppen nog naar het oude formulier
wezen.

## De reparatie: de twee registers tegen elkaar

`ZONDER_PUSH` zegt *"deze route leunt op de taakbalk"*. `TABBLADEN` zegt *"dit
zijn de paden die de taakbalk aanwijst"*. Dat zijn twee beweringen over hetzelfde
ding, in twee bestanden, die tot vandaag nooit naast elkaar gelegd zijn.

De test doet precies dat, in beide richtingen: elke route die op de balk leunt
staat in `TABBLADEN`, en elk tabblad wordt door die controle ook als zodanig
verontschuldigd.

## ⚠️ Waarom dit geen tautologie is, en waarom dat hier expliciet moet

QS8-440 legde punt U vast, en dat ging over **dit bestand**:

> Een grendel kan een tautologie zijn. Hij filterde routes op `!toontTaakbalk(pad)`
> en toetste daarna of elk daarvan in `ZONDER_TAAKBALK` stond, terwijl
> `toontTaakbalk()` dat register léést. Die twee kunnen het per constructie niet
> oneens zijn.

Daarom komt de verwachting hier **niet** uit `TABBLADEN`. Ze komt uit
`ZONDER_PUSH`: een ander register, in een ander bestand, met een andere padvorm
(`/(tabs)/lijst` tegen `/lijst`), dat onafhankelijk onderhouden wordt. De twee
kúnnen het oneens zijn — en dat is het hele punt.

⚠️ Het issue stelde een MUST-CONTAIN met de vijf paden als literaal voor. Dat had
ook gewerkt, maar het legt de waarheid een derde keer vast: dan staan de
tabbladpaden in `TABBLADEN`, in `ZONDER_PUSH` **en** in een testbestand, en loopt
de derde net zo goed achter als de tweede deed. Twee registers die elkaar
natellen is één bron minder.

## De reden in het register is meeverhuisd

Criterium 2 vroeg dat geen enkele registerreden nog `<Tabs.Screen>` als ingang
noemt. De vijf rijen wijzen nu naar `TABBLADEN`. Het woord `<Tabs.Screen>` staat
nog twee keer in het bestand — in het blok dat uitlegt wat er vóór 12-09 stond en
waarom dat onwaar werd. Dat is geschiedenis en geen onderbouwing.

⚠️ **Dat onderscheid is de kern van dit issue.** Een reden die een mechanisme
noemt dat niet meer bestaat, is erger dan geen reden: hij leest als een meting.

## IJking

Vooraf 12 groen.

| mutatie | wat er rood werd |
| -- | -- |
| `/lijst` uit `TABBLADEN` | **1** — "elke route die op de taakbalk leunt, staat in TABBLADEN" |
| `/(tabs)/lijst` uit `ZONDER_PUSH` | **1** — "en elk tabblad wordt door die controle ook als zodanig verontschuldigd", plus `schermingang:controle` zelf |

⚠️ **Bij allebei is gekeken wélke toets omviel en niet dát er een omviel** —
punt T uit QS8-440. En bij de eerste is de tegenmeting gedaan die dit issue
rechtvaardigt: dezelfde mutatie liet vóór deze branch de hele suite van 3750
tests groen, en de controle die er expliciet over gaat óók.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie.
