# Een sleutel die nergens aankwam

**07-09-2026.** QS8-330.

## Wat er stuk was

📏 57 aanroepen van `reportError()` gaven `{ pgcode: error.code }` mee.
`pgcode` staat niet op `ALLOWED_KEYS` in `src/lib/observability/scrub.ts` en is
niet `sqlstate` — de enige sleutel met een eigen vormtoets. Gemeten met de échte
functie:

```
scrubContext({ group_id: 'g1', pgcode: '42501' })
  → { group_id: '[weggelaten]', pgcode: '[weggelaten]' }
```

Zevenenvijftig aanroepers dachten een foutcode mee te sturen. Er kwam niets aan,
en niets in de suite zei er iets van.

⚠️ **Dit is regel 18 vraag 1 in zuivere vorm.** De schoonmaaklaag deed precies
wat hij belooft: alles wat niet op de allowlist staat, gaat er niet doorheen. De
aanroepers deden precies wat zij dachten te doen: een technisch veld meesturen.
Beide onderdelen waren correct en volledig getest; de naad ertussen — *bestaat de
sleutel die je meestuurt eigenlijk?* — was door niets bewaakt, want dat is geen
eigenschap van één van beide.

## Wat er gemeten is vóór er iets gekozen werd

Het issue noemde drie richtingen en stelde er zelf een vraag bij die nog niet
beantwoord was: **hebben die 57 hun eigen codesleutel nog wel nodig?** Sinds
QS8-319 rijdt de foutcode namelijk in de melding mee. Twee metingen:

📏 **Alle 57 `pgcode`-waarden zijn `<eerste argument>.code`** — dezelfde
foutobject als dat wat als eerste argument aan `reportError()` meegaat. Geen
enkele uitzondering; met de hand nagelopen op het geval dat het patroon niet ving
(`src/modules/completions/api.ts:149`, dezelfde vorm over meer regels).

📏 **Die code komt al aan.** `reportError()` haalt élke fout door
`beschrijfFout()`, en die geeft voor een `PostgrestError`:

```
{ naam: 'NonError', melding: 'Servermelding weggelaten (42501)' }
```

De sleutel was dus niet alleen kapot, hij was ook overbodig. Dat maakt de keuze
makkelijk: **richting 3 — de sleutel weghalen bij de aanroepers.** Geen tweede
naam voor hetzelfde ding, geen nieuw kanaal met een nieuwe vormtoets, en de
informatie gaat niet verloren want ze ging al langs een andere weg mee.

| Richting | Oordeel |
|---|---|
| **1.** De 57 naar `sqlstate` brengen | Werkt, maar voegt niets toe: de code stáát al in de melding. Zevenenvijftig plekken aanraken om iets te herstellen dat niemand mist. |
| **2.** `pgcode` een eigen vormtoets geven | ⚠️ Twee sleutels voor één ding, en daarmee de kans op een derde. Precies waar de kop van `FOUTCODE` voor waarschuwt. |
| **3.** De sleutel weghalen | ✅ **Gebouwd.** De goedkoopste reparatie is hier ook de juiste, en dat is gemeten en niet gehoopt. |

## En toen vond de grendel iets ergers

De controle die bij deze reparatie hoort, ging bij zijn eerste run meteen rood —
op iets anders dan waarvoor hij geschreven was:

> `code` staat op ALLOWED_KEYS zonder eigen vormtoets in `scrubContext()`.

📏 **74 aanroepen** geven `code: error.code` mee. Die sleutel stáát op de
allowlist, dus die kwam wél aan — **ongetoetst**. Een allowlist-sleutel is een
kanaal naar buiten, en dit kanaal had geen vorm:

```
scrubContext({ code: 'permission denied for table goals' })
  → { code: 'permission denied for table goals' }
```

⚠️ **Dat is exact het gat dat de kop van `FOUTCODE` beschrijft, één sleutel
verderop.** Die kop legt uit waarom `sqlstate` bewust *niet* op `ALLOWED_KEYS`
staat maar een eigen tak met een vormtoets heeft: *"een sleutel die als
vervanging van een lek wordt ingevoerd, mag niet het volgende lek zijn."* Bij het
schrijven van die zin stond `code` al op de lijst.

**Gebouwd:** `code` van `ALLOWED_KEYS` af en in de getoetste tak, met
`FOUTCODE || SYMBOOLCODE` — want `code` draagt beide catalogi (`42501`,
`PGRST202`, maar ook `invalid_credentials` en `NoSuchKey`). Alle 74 aanroepen
blijven werken; alleen wat níét als foutcode leest, wordt nu `[weggelaten]`.

⚠️ **Twee takken en niet één, en dat is een gerepareerde verruiming.** De eerste
versie zette `sqlstate` en `code` in dezelfde tak met allebei de vormen. Daarmee
werd `sqlstate` opengezet voor `pgrst202` — kleine letters, geen geldige
PostgREST-code — en `scrub.test.ts` werd er terecht rood van. `sqlstate` is smal
met een reden; ze delen een doel, geen vorm. **De reparatie van een gat is de
makkelijkste plek om een tweede te maken.**

## De grendel

`npm run foutsleutel:controle` bewaakt de twee helften van dezelfde belofte:

1. **Geen aanroeper verzint een eigen codesleutel.** Alles wat als foutcode leest
   (`pgcode`, `errcode`, `error_code`, `sqlcode`, …) en niet `sqlstate` heet, is
   een sleutel die stil weggegooid wordt.
2. **Geen codesleutel op `ALLOWED_KEYS` zonder vormtoets.**

⚠️ **Waarom een controle en geen test.** Het gat ontstaat bij de vólgende
aanroeper die zijn eigen sleutel verzint, niet in de 57 die er stonden. Alleen
iets dat over `src/` en `app/` loopt, kan een aanroep zien die vandaag nog niet
geschreven is.

⚠️ **Wat hij niet kan, en dat hoort erbij te staan:** hij leest namen en geen
dataflow. Een codesleutel die via een spread of een tussenvariabele binnenkomt,
ziet hij niet. Dezelfde grens als bij `meldtekst:controle`, en hij staat in de
kop van het script zodat niemand erop rekent dat dit alles dekt.

## De ijking

Vier grendels, vier aparte mutaties — **niet één mutatie voor de hele controle**.
Elke mutatie is vooraf met een `grep` op het bestand bevestigd voordat de uitslag
geloofd werd.

| Mutatie | Wat er rood werd |
|---|---|
| de tak die een verzonnen codesleutel vindt (`if (true) continue`) | **7** — precies de zes "moet vinden"-vormen plus het meerregelige geval; alle must-allows bleven groen |
| de tak die een ongetoetste allowlist-sleutel vindt | **1** — precies de test die hem noemt |
| `code` terug op `ALLOWED_KEYS`, zonder tak (de oude toestand) | **5 belofte-tests in `scrub.test.ts`** én de controle meldt hem, exitcode 1 |
| `pgcode` terug in een écht bestand (`klassement.ts`) | de controle meldt hem op regel 99, exitcode 1 |

⚠️ De derde en de vierde zijn er allebei, en dat is met opzet: de derde toetst
dat de **belofte** onder test staat (een sleutel zonder codevorm komt er niet
uit), de vierde dat de **controle** hem in de echte boom vindt. Een van de twee
alleen laat de andere helft onbewaakt.

## Wat de security-review erop aanmerkte

Zes bevindingen, alle zes zelf nagemeten en alle zes terecht. Geen ervan was een
lek; vijf gingen over **de grendel die niet bewaakte wat hij beweerde**, en dat
is in dit project de duurdere soort.

**1. De uitbreiding naar de edge-jobs was dekking op papier.** De controle scande
`supabase/functions/` wél, maar zocht alleen op `reportError` — en de edge-jobs
melden met `meld()`. 📏 Geijkt door `pgcode: fout.code` in een echte job te
zetten: **204 bestanden gelezen, nul bevindingen.** Een map toevoegen zonder de
aanroepnaam is erger dan hem niet scannen, want de tellerstand suggereert dat er
gekeken is. `MELDERS` kent nu alle drie de namen, en de melding noemt de functie
die er écht staat.

⚠️ Dit is het geval waar de ijking zichzelf verdiende: het bestandsaantal ging
omhoog, de controle bleef groen, en zonder de mutatie had ik dat "geregeld"
genoemd.

**2. Een must-allow die niets bewees.** De test heette *"laat `code` staan zolang
hij een eigen vormtoets heeft"* en voedde een allowlist zónder `code`. 📏 Mét en
zónder de vormtoets in de gevoede bron: allebei `[]`. Beide grendels sloegen het
geval al over, dus de conditie in zijn eigen titel kon hij niet waarnemen —
precies de val die CLAUDE.md bij regel 18 beschrijft, en dezelfde die op de
branch ernaast (QS8-331) net was rechtgezet. De vorm die het wél meet, zet `code`
op de gevoede allowlist en toetst beide kanten in één test.

**3. `GEEN_FOUTCODE` was dode code.** De enige regel was `httpStatus`, en die
matcht `CODEACHTIG` niet en is niet `code`. 📏 Weggemuteerd: nul tests rood. Een
uitzonderingsmechanisme dat nooit bereikt wordt is gevaarlijker dan geen — de
volgende schrijver zet er een naam in en legt niets vast. Weggehaald, met de
reden in het script.

**4. De kop van `CODEACHTIG` noemde `statusCode` als gedekt.** 📏
`CODEACHTIG.test('statusCode')` is `false`. En hij hóórt er niet onder te vallen:
`StorageApiError.statusCode` is de HTTP-code als string, geen SQLSTATE — dezelfde
verwarring die in `foutcodeVan()` al eens tot een terugval leidde die nooit iets
kon opleveren. Kop gecorrigeerd.

**5. Twee onjuistheden in de kop van `contextsleutels`, allebei de veilige kant
op.** Hij beweerde "alleen het derde argument, alleen het eerste niveau"; 📏
`reportError(e, { pgcode: c })` en `{ meta: { pgcode: c } }` worden allebei
gezien. Een kop die mínder belooft dan de code doet, laat de lezer een gat
vermoeden waar er geen is.

**6. De verkorte schrijfwijze is een echte blinde vlek.** `{ pgcode }` zonder
dubbele punt ziet hij niet, en die vorm komt in de boom voor
(`src/modules/buddies/rem.ts:32` schrijft `{ teller }`). De test die zogenaamd
toetste dat hij *buiten* een `reportError` niet kijkt, slaagde door deze vlek en
niet door de bedoelde grendel. Beide blinde vlekken staan nu als test vastgelegd
en niet alleen als zin in de kop — een grens die je opschrijft maar niet
vastlegt, verschuift ongemerkt.

⚠️ **En één bevinding raakte de code zelf.** De veiligheidsredenering onder
`SYMBOOLCODE` zei dat het veld *"niet door een aanroeper gevuld wordt"*. Dat gold
toen die vorm alleen `foutcodeVan()` bediende; sinds hij óók de `code`-**sleutel**
bewaakt is het onwaar — 📏 tien plekken in `rollover` en `notificaties` schrijven
met de hand `{ code: 'profielen_ophalen_mislukt' }`. Vandaag constanten, dus geen
lek, maar de rem is dan ook enkel de vormtoets en die laat elk enkel woord door.
De kop zegt nu wat waar is; de rij staat in `docs/ENGINEER-REVIEW.md`.

## Wat hier niet in zit

* ~~**De 74 aanroepen met `code: error.code` zijn ook duplicatie.**~~ ✅ Weg sinds
  08-09-2026 (QS8-338). Het waren er 76 en niet 74; zie de sectie hieronder.
* **De `%`-interpolatie in een handgeschreven `Error`.** Onveranderd; staat als
  open rij van 07-09 in `docs/ENGINEER-REVIEW.md`.


---

## Nawerk 08-09-2026: de 76 zijn weg (QS8-338)

Dit document liet één punt open: de aanroepen die `code: error.code` meegeven.
Ze waren niet kapot — sinds de grendel hierboven zijn ze vormgetoetst — maar ze
stuurden dezelfde waarde die `beschrijfFout()` al in de melding zet. Het issue
vroeg een besluit tussen weghalen en houden, en noemde één argument om te
houden: *"in Sentry is een apart veld filterbaar en een stuk melding niet."*

**Dat argument gaat voor deze envelope niet op, en dat is te meten.**
📏 `maakVerzending()` in `src/lib/observability/edge-rapport.ts` zet
`gegevens.context` in **`extra`**, en `tags` draagt precies twee sleutels:
`waar` en `runtime`. Sentry indexeert `tags` en niet `extra` — je kunt dus niet
op `context.code` filteren of groeperen, ook niet zodra de DSN gezet is. Het
veld was geen index maar een tweede kopie.

⚠️ **Wil iemand ooit wél op foutcode kunnen groeperen, dan is de weg terug niet
deze 76 aanroepen.** Dan zet je hem in `tags`, één keer, in de sink, afgeleid met
`foutcodeVan(error)` uit dezelfde fout die al meegaat. Dat is dan géén duplicatie
maar een afleiding: hij kan niet uit de pas lopen met de melding, en er is één
plek om hem te veranderen.

### Wat er weg is en wat er blijft

📏 **76 aanroepen in 17 bestanden**, en niet de 74 in dertien modules die het
issue noemde. Twee ontbraken in die telling omdat ze `mijn.error.code` en
`leden.error.code` schrijven — een grep op `code: <naam>.code` ziet een gepunt
pad niet. Bij 25 ervan was `code` de énige sleutel; die aanroepen dragen nu geen
derde argument meer.

**Wat blijft staan is de zeef.** `code` blijft in de vormgetoetste tak van
`scrubContext()`. Een sleutel die vandaag niemand stuurt, moet morgen nog steeds
bewaakt zijn — 📏 de 15 regels in `rollover` en `notificaties` die met de hand
`{ code: 'profielen_ophalen_mislukt' }` schrijven zijn hier niet aangeraakt, en
de volgende aanroeper die iets in `code` stopt, hoort tegen dezelfde vormtoets
aan te lopen. Een grendel weghalen omdat er even niets langskomt, is precies hoe
het gat van deze branch is ontstaan.

⚠️ **Eén tekstuele treffer is géén aanroep, en dat is de val bij dit soort
opruimen.** `src/modules/buddies/pending.ts` schrijft
`return { code: gelezen.code, automatisch: … }` — dat is een uitnodigingscode en
geen foutrapportage. Een `sed` over het patroon had hem meegenomen. De
opruiming liep daarom per `reportError(`-aanroep met gebalanceerde haakjes, en
niet per regel.

### En er staat nu een grendel op

`tests/beloftes/foutcode-uit-een-bron.test.ts` wordt rood zodra een meldaanroep
de foutcode van zijn éígen eerste argument nog een keer meestuurt. Hij leest
allebei de randen — `reportError()` in de app en `meld()` in de Edge Functions,
want die hebben dezelfde vorm en dezelfde `scrub.ts` eronder — en hij laat een
handgeschreven `code` met rust, want die draagt iets wat nergens anders staat.

⚠️ **Zonder die grendel is er geen reden om aan te nemen dat er geen derde ronde
komt.** Dezelfde duplicatie is twee keer gegroeid: 57 keer als `pgcode` en 76
keer als `code`, allebei één regel per keer omdat de vorige regel het ook deed.

Geijkt met de hand, per kant: een weggehaalde aanroep terugzetten in
`src/modules/goals/api.ts` geeft één rood met bestand en regelnummer; hetzelfde
in een echte `meld()`-aanroep in `rollover` ook; en de 15 handgeschreven codes
blijven groen terwijl de zeef ze wél leest — dat laatste is het verschil tussen
een must-allow en een pad waar de zeef toch niet komt.
