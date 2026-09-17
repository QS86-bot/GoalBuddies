# De uitrolstand is een gegeven en geen alinea

**17-09-2026 — QS8-517.** Volgt op rij 816 van `docs/ENGINEER-REVIEW.md`, die
overbleef uit QS8-505.

## De vraag die openstond

De rij stelde hem als een keuze tussen twee vormen:

> De open vraag is of een controle die op een MCP leunt in CI iets betekent —
> daar draait die MCP niet — en dus of dit een controle wordt of een stap in
> `/audit`.

## 📏 Eerst gemeten, en dat verandert de vraag

| wat | uitkomst |
| -- | -- |
| productie (`list_migrations`, `wehgocadxehottiiyvsc`) | hoogste `0282`, **285** registerrijen, aaneengesloten |
| de map | hoogste `0285`, **288** bestanden |
| bestanden t/m `0282` | **285** — gelijk aan het aantal registerrijen |
| het gat | **drie**: `0283`, `0284`, `0285` |
| `docs/WERKVOORRAAD.md` | zei dit al, met dezelfde getallen |

Het symptoom van de rij is er vandaag dus niet. Het gat is normaal en de
documentatie liep bij. Wat er wél staat is het mechanisme, en dat is een andere
bevinding dan de rij beschreef.

## Waarom het geen van beide vormen is geworden

**Niet als controle in CI.** De sleutel die `register:controle` nodig heeft is
een productie-service-role-key. In CI-secrets is die leesbaar voor elke
workflowrun van elke PR, en dat is een grotere opening dan de drift die hij zou
vinden. En de uitslag zou niets betekenen: tussen twee uitrollen ís er een gat,
dat is de juiste toestand. Een controle die rood is in de normale toestand, leer
je te negeren — dezelfde reden waarom regel 15 een ratel kreeg en geen verbod.

**Niet als stap in `/audit`.** Dat is een commando dat een mens typt. QS8-417
wees precies die verhouding aan als de fout: een nieuwe grendel belandt
automatisch in de poort — *"de inschatting van een mens over zijn eigen werk"* —
en automatisch niet in CI.

## ⚠️ En de echte faalvorm vangt geen van beide

`register:controle --streng` hangt aan `supabase db push`. Hij vuurt **wanneer je
uitrolt**. De drift van 52 bestanden ontstond doordat er níet uitgerold werd.

> Een controle die aan een handeling hangt, kan de afwezigheid van die handeling
> per definitie niet zien.

Dat is dezelfde klasse als `verbindingen:controle` in CLAUDE.md: *"dat is geen
instelling maar de afwezigheid van iets, en die is stil kwijt te raken."* Ook een
MCP-stap in `/audit` had dit niet gevangen — die hangt aan het typen van
`/audit`.

## Wat er dan wél in de weg zat

`scripts/stand.mjs` schrijft het zelf op:

> ⚠️ **Alleen wat uit de repo te meten valt.** Wélke migraties op productie staan
> is géén eigenschap van de map, en dat blijft dus met de hand geschreven proza
> eronder — met `register:controle` als grendel.

Die grendel kán niet draaien op de plek waar dat proza geschreven wordt. De
uitrolstand was daarmee het enige getal in dit project dat met de hand werd
overgetypt zonder dat iets het naleest. QS8-125 verbiedt precies die vorm.

## Het besluit

**Schrijf de meting op als gegeven, door de kant die de sleutel wél heeft.**

1. `supabase/uitgerold.json` draagt `hoogste`, `registerrijen`, `gemeten` en
   `bron`.
2. `register:controle` schrijft dat bestand wanneer hij draait — daar zijn de
   credentials per definitie, dus daar is de meting gratis. Een **bijproduct**
   van uitrollen, geen ceremonie. Hij schrijft het ook als de vergelijking
   daarna rood wordt: wat er op productie staat is waar, en juist bij een
   verschil is dat getal het eerste dat iemand wil zien.
3. `npm run uitrolstand:controle` leest het bestand naast de map. Geen sleutel,
   dus overal — de poort, CI, een cloudsessie.

⚠️ **Wat die derde niet is: een tweede bron van waarheid.** Hij bewijst niet dat
productie op `hoogste` staat; dat kan alleen `register:controle`. Hij bewijst dat
het opgeschreven getal intern klopt met de map, en hij zegt hoe oud het is. Wie
hem als bewijs van de productiestand leest, heeft hetzelfde gedaan als wie
`OVERGESLAGEN` voor groen aanziet.

## Waar hij rood op wordt, en waar bewust niet

| geval | oordeel |
| -- | -- |
| bestand ontbreekt, of is geen object | **rood** |
| `hoogste`, `registerrijen`, `gemeten` of `bron` mist of heeft de verkeerde vorm | **rood** |
| `hoogste` heeft geen bestand in de map | **rood** — de vorm van QS8-237 |
| `hoogste` ligt boven het hoogste bestand in de map | **rood** |
| `registerrijen` ≠ het aantal bestanden t/m `hoogste` | **rood** |
| `gemeten` ligt in de toekomst | **rood** |
| de map loopt vóór op productie | **geen fout** — met de leeftijd erbij |

⚠️⚠️ **`registerrijen` is de vangst die dit script zijn bestaansrecht geeft.** Een
vergelijking op het hoogste nummer alleen ziet een gat **ónder** de lijn niet:
productie kan `0282` melden en `0150` missen. De bovenkant klopt dan, en er
draait een ander schema dan de map beschrijft. `migraties:controle` kan dat niet
zien (die kent de map alleen) en een hoogste-nummer-blik ook niet.

⚠️ **`bron` telt mee als grendel.** Een getal zonder herkomst is niet na te
meten, en dan is dit bestand een bewering in plaats van een meting.

## De leeftijd, in drie gevallen

Het gat zelf is nieuws en geen fout, maar nieuws dat zegt hoe oud het is: tot
zeven dagen *vers*, tot dertig *oud*, daarboven *stoffig* — en dat laatste gaat
mét een gat naar stderr met een `⚠` ervoor. Niet rood, wel zichtbaar.

Dat is de les van QS8-435 letterlijk toegepast: de vaste zin die daar stond —
*dit beeld is zo oud als je laatste `git fetch`* — deed niets, want hij stond er
ook bij een beeld van tien seconden oud. Eén tekst voor elke leeftijd leest als
een disclaimer, en die leer je overslaan.

## 📏 De ijking, en wat zij vond

Elke grendel apart gebroken, met een `grep` op de mutatie vóór de uitslag
geloofd werd. Tien mutaties, tien keer precies de eigen test rood — **op twee
na, en die twee waren echte vondsten**:

| mutatie | wat er gebeurde |
| -- | -- |
| veldtoets op `hoogste` eruit | de eigen test bleef **groen**; een tijdstempel staat ook niet in de map, dus grendel 2 vuurde — en díe tekst noemt `hoogste` óók |
| veldtoets op `registerrijen` eruit | **niets** werd rood; `'4' !== 4` liet grendel 4 vuren, en díe tekst noemt `registerrijen` net zo goed |

Beide tests keken naar de **veldnaam** in de melding, en die staat in twee
teksten. Ze toetsten daarmee niet hun eigen grendel maar de aanwezigheid van een
woord. Nu toetsen ze de vormklacht (*"is geen versie van de vorm"*, *"is geen
positief geheel getal"*), en dan valt elk van beide op zijn eigen mutatie om.

⚠️ **Dit is CLAUDE.md's regel in het echt:** *kijk bij een ijking wélke test
omvalt, niet dát er een omvalt* — plus de andere helft, dat een mutatie die door
een eerdere grendel wordt afgevangen niets bewaakt van wat hij belooft. Zonder
mutatie-per-grendel waren allebei deze tests jarenlang groen gebleven zonder iets
te doen.

## Wat hiermee níet opgelost is

- **Niemand wordt hier wakker van een gat dat blijft staan.** Het getal is
  zichtbaar in elke poort- en CI-run, en dat is meer dan er was, maar het is geen
  alarm. Een drempel is bewust niet gebouwd: elk gekozen getal is rood in een
  normale toestand zodra de uitrolcadans verandert.
- **Het bestand kan verouderen zonder dat het rood wordt.** De leeftijd wordt
  genoemd, niet afgedwongen. Wie een maand niet uitrolt, ziet dat — en beslist
  zelf.
- **De edge-functies staan er niet in.** Die lopen hun eigen achterstand op
  (QS8-320), en dat is een tweede meting met een tweede bron.
