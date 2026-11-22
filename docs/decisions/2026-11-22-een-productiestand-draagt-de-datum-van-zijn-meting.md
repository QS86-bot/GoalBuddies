# Een productiestand draagt de datum van zijn meting

**22-11-2026, QS8-786.** Dit document volgt op
`docs/decisions/2026-09-17-de-uitrolstand-is-een-gegeven-en-geen-alinea.md` (QS8-517)
en op het besluit van Quinten van 22-11-2026, geplaatst als reactie op QS8-786.

## Het probleem

`uitrolproza:controle` (QS8-560) vergeleek elk kaal getal in een open dossierrij
(*"productie staat op **0336**"*) met `supabase/uitgerold.json`. Daardoor werd
elke uitrol rood op rijen die de dag ervoor nog klopten. 📏 Op 22-11-2026 gebeurde
dat twee keer: bij 0336 (PR #787) en bij 0337 (PR #791, zeven rijen). Beide keren
is het getal per rij met de hand opgehoogd (`8ef6be98`, `d58115c1`).

De tweede ronde zegt in haar commitbericht zelf wat dat waard was: *"de metingen
van 22-11 zijn niet herhaald en dat staat er als aanname bij."* De controle dwong
dus geen nieuwe meting af. Hij dwong alleen af dat het getal werd overgetypt, en
na het overtypen leest het getal als een verse meting.

Rij 762 had die rekening al voorspeld: *"Wie dat te duur vindt, laat de rijen naar
het gegeven wijzen in plaats van het getal over te schrijven."*

## Het besluit (Quinten, 22-11-2026)

**De controle blijft, en een rij die een productiestand noemt, krijgt er een datum
bij.** Twee vormen zijn goed:

- `productie staat op **0337** (stand van 22-11-2026)`: een meting op een moment.
  Die blijft waar na een uitrol.
- een verwijzing naar `supabase/uitgerold.json` zonder getal. Dat is geen bewering
  en de controle ziet er niets in.

De controle laat een gedateerde stand met rust en is rood op een kaal getal.

De andere optie was de controle schrappen en alleen naar `uitgerold.json`
verwijzen. Die is afgewezen: dan bewaakt niets meer dat een rij na een uitrol nog
klopt.

## Drie keuzes die het besluit niet zelf maakte

### 1. Een kaal getal is ook rood als het gelijk is aan de stand

De oude controle was alleen rood op een getal dat *afweek*. Was dat zo gebleven,
dan was een kaal `0337` vandaag groen en na de uitrol van dinsdag rood: precies de
ronde die dit issue wil weghalen. Een kaal getal is daarom altijd een bevinding.
Wijkt het ook af, dan noemt de melding dat erbij.

### 2. De datum moet direct na het getal staan

Een rij draagt in zijn eerste kolom al een datum, en in zijn tekst vaak tien. Mag
de datum overal staan, dan geldt elke rij als gedateerd en bewaakt de controle
niets meer. `MARKERING` is daarom verankerd aan de tekst direct na de bewering:
eventueel één `(`, `,`, `;`, `—`, `–` of `-`, en dan `stand van DD-MM-JJJJ`.

📏 Dit sluit ook een bestaande vorm uit, en dat is gemeten. De zeven rijen van
22-11 begonnen hun alinea met `**Stand 22-11-2026 (…):** productie staat op
**0337**`. Daar staat de datum vóór de bewering. De rijen hebben nu de markering
achter het getal gekregen. De kop is gebleven: die is proza en geen markering.

De datum moet ook bestaan (`geldigeDatum()`). Een `31-02-2026` telt niet als
markering, dus het getal ervoor is kaal.

### 3. `staat nu op` en `productiestand` horen bij de bewering

📏 Zes open rijen (r168, r207, r601, r667, r703, r714) schreven *"Productie staat
nu op **0294** en loopt daarmee gelijk met de map"*. `STANDCLAIM` kende alleen
`staat op` en `stand`, dus één bijwoord hield deze zinnen buiten beeld. Toch zijn
ze de tegenwoordige tijd bij uitstek. Sinds dit issue telt `staat … op` mee met
hoogstens twee woorden ertussen (`staat al op`, `staat sinds 24-11 op`), en ook
`productiestand **0337**`. Die laatste twee vormen vond de code-critic. 📏 Ze staan
vandaag in geen enkele open rij met een getal erachter: het verbrede patroon vindt
in het dossier precies dezelfde dertien beweringen als het smalle.

Bij die zes rijen is de stand gedateerd op **19-09-2026**. Dat is de datum in de
kop van hun eigen alinea (*"Hermeten op 19-09-2026, ná de uitrol van `0285` t/m
`0294`"*), dus de datum van de meting en niet die van vandaag.

## Wat er in het dossier veranderd is

Alleen open rijen die een productiestand noemen, en daarin alleen de bewering.
Er zijn geen nieuwe rijen bijgekomen en er is geen andere rij aangeraakt (uitzondering
van Quinten, 22-11-2026).

| rij | wat | datum | waarom die datum |
| -- | -- | -- | -- |
| 168, 207, 601, 667, 703, 714, 849 | `productie staat op **0337**` | 22-11-2026 | `uitgerold.json` meldt `"gemeten": "2026-11-22"`, en het commitbericht van `d58115c1` legt die stand op 22-11 vast |
| 168, 207, 601, 667, 703, 714 | `Productie staat nu op **0294**` | 19-09-2026 | de kop van hun eigen alinea |

## Wat deze controle níet ziet

⚠️ Een controle vangt alleen wat een patroon heeft (CLAUDE.md, *Wie bezit welk
feit*). Deze vormen noemen een productiestand zonder dat `STANDCLAIM` ze leest:

- de verleden tijd: `productie stond op`, `stónd toen op`. Rij 851 beschrijft dit
  sinds 19-09. Volgens die rij is het onderscheidende kenmerk niet de werkwoordsvorm
  maar of er een datum staat. Dat kenmerk bewaakt deze controle nu voor de
  tegenwoordige tijd. De verleden tijd blijft buiten beeld, zoals rij 851 al
  opschrijft. Die rij is níet bijgewerkt, want ze noemt zelf geen productiestand in
  de vorm die de controle leest, en de uitzondering van Quinten dekt haar dus niet.
  De batch kan haar meenemen.
- tussen haakjes of als bijzin: *productie (0294)*, *tegen productie 0294*,
  *productie op 0282*. Ook de omgekeerde volgorde (*op productie staat 0337*) en
  een dubbele punt (*productie: 0337*) vallen erbuiten. 📏 Ongeveer tien open rijen schrijven zo'n vorm (r118, r281,
  r315, r579, r721, r762 en andere). Die rijen staan bijna allemaal in een gedateerde
  alinea, maar dat is gelezen en niet afgedwongen.

Al deze vormen zouden in het patroon kunnen. Dan geldt wat 2026-09-24 over vrije
tekst schreef: hoe breder het net, hoe meer vals alarm, en een controle met die
trefzekerheid leer je overslaan. Dat is niet gemeten, en daarom staat het hier als
open punt en niet als besluit.

En een markering die er wél staat, kan onwaar zijn:

- **Een datum in de toekomst wordt geaccepteerd.** `(stand van 22-11-2099)` is een
  geldige markering. De controle kan niet nagaan of de schrijver echt gemeten heeft,
  en dat kan hij ook niet bij een datum van vandaag. Een datum na `gemeten` in
  `uitgerold.json` weigeren zou kunnen, maar dan wordt een meting op de dag van een
  uitrol, vóór `register:controle` draait, ten onrechte rood. Dat is niet uitgewerkt.
- **Een gedateerde stand wordt niet tegen de geschiedenis gehouden.** De
  code-critic vond in zes rijen de zin *"productie stond op 0302 (hermeten op
  19-09-2026 …)"*. 📏 Volgens `git log -S` op `supabase/uitgerold.json` verschijnt
  `0302` daar pas op 17-11 (`1a8fc7ba`). Die zin valt buiten de uitzondering van
  Quinten (verleden tijd, geen bewering die de controle leest) en is hier niet
  aangeraakt. Ze is als vervolg gemeld aan de hoofdorchestrator.

## De ijking (regel 18)

Per grendel één mutatie in `scripts/uitrolproza-controle.mjs`, en daarbij is
nagegaan wélke toets omvalt:

| grendel | mutatie | valt om |
| -- | -- | -- |
| `staat nu op` | `staat (?:nu )?op` → `staat op` (eerste ronde) | *vindt "Productie staat nu op"* (alleen die) |
| elk bijwoord | `staat(?: [\w-]+){0,2} op` → `staat (?:nu )?op` | *vindt "productiestand" en een ander bijwoord dan "nu"* (alleen die) |
| `productiestand` | `stand\b` als eerste tak weg | idem (alleen die) |
| streep en puntkomma | `[(,;—–-]?` → `[(,]?` | *leest hem na een gedachtestreepje of puntkomma* (alleen die) |
| exitcode | `return 1` → `return 0` op de rode tak van `hoofd()` | *geeft 1 op een kaal getal* (alleen die) |
| vet slot na het getal | `\**` aan het eind van `STANDCLAIM` weg | *leest hem ook na een vet getal*, plus vijf die op die vorm leunen, het echte dossier inbegrepen |
| verankering | `^` uit `MARKERING` weg | *telt een datum verderop in de rij niet als markering* (alleen die) |
| komma als scheiding | `[(,]?` → `\(?` | *leest hem zonder haakjes, ook na een komma* (alleen die) |
| geldige datum | `geldigeDatum()` geeft altijd een datum | *telt een datum die niet bestaat niet* en *geldigeDatum* |
| kaal is rood, ook gelijk | `&& claim.nummer !== stand` erbij | *meldt een kaal getal ook als het gelijk is aan de stand*, plus twee die een gelijk kaal getal voeden |
| gedateerd met rust | `\|\| claim.nummer !== stand` erbij | *zwijgt over een gedateerde stand*, *blijft stil … na een uitrol*, *twee beweringen*, het echte dossier |

Daarna een mutatie op het dossier: bij r601 is `(stand van 19-09-2026)` met de hand
weggehaald. `npm run uitrolproza:controle` werd rood op precies die bewering, en
van de toetsen viel alleen *het echte dossier* om.

**De proef voor de uitrol van dinsdag.** `supabase/uitgerold.json` is lokaal op
`0339` gezet. `npm run uitrolproza:controle` bleef groen (exitcode 0), en daarna is
het bestand teruggezet. Dezelfde proef staat nu ook als toets: het echte dossier
tegen `0339`, en dan moeten `kaal` én `ingehaald` allebei leeg zijn. ⚠️ Voor `kaal`
maakt de stand per constructie niet uit. Wat de proef draagt, is `ingehaald`: geen
rij die op een uitrol wacht, mag door `0338` en `0339` als geland gelden. Dat de
uitrol van dinsdag precies `0339` wordt, is een aanname uit de bouwprompt.

## Pad terug

Met `git revert` van de merge komt de oude controle terug, met de oude rijen erbij.
De datummarkeringen kunnen ook blijven staan: de oude `STANDCLAIM` leest ze niet en
vergelijkt alleen het getal, dus dan komt de rekening van vóór dit besluit terug,
maar breekt er niets.
