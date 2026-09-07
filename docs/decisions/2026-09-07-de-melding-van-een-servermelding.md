# De melding die wij niet geschreven hebben, gaat niet mee

**Datum:** 07-09-2026 · **Issue:** QS8-319 · **Volgt op:** QS8-315
(`docs/decisions/2026-09-07-een-melding-die-de-waarde-meeneemt.md`)

## Het gat

`scrubMessage()` haalt e-mailadressen, tokens, geciteerde waarden en de
`Key (col)=(val)`-vorm uit een foutmelding. Hij haalt er **geen `%`-interpolatie**
uit, en dat is precies de vorm waarin PL/pgSQL interpoleert.

📏 Gemeten met de échte functie:

| Melding | Eruit |
| -- | -- |
| `Europe/Bogus is geen bekende tijdzone` | **onveranderd** |
| `Te veel avatars voor deze gebruiker (12).` | **onveranderd** |
| `duplicate key … constraint "groups_invite_code_key"` | `… constraint [weggelaten]` |

De onderste regel is het ongemakkelijke deel: de zeef schoont de constraintnaam —
schemametadata, precies wat je bij het opzoeken nodig hebt — en laat de
`%`-waarde staan. **De veilige helft beschermd, de gevaarlijke doorgelaten.**

📏 `grep` op de migraties geeft **42 `raise`-regels met een `%`, in 22
verschillende vormen**. Dit is geen randgeval; het is hoe onze eigen wachters
praten.

## De meting die het besluit droeg

Het issue schreef er zelf bij dat het aantal aanroepen dat op een échte
databasefout uitkomt **niet gemeten** was, en dat een naamgebaseerde schatting
geen meting is. Daarom eerst gemeten, met de TypeScript-compiler in plaats van
met `grep`: van elke aanroep van `reportError()` en `meld()` het **statische type
van het eerste argument** opgevraagd.

📏 **160 aanroepen in `src/` en `app/`**, plus 15 `meld()`-aanroepen in de Edge
Functions:

| Type van het eerste argument | Aantal |
| -- | --: |
| `PostgrestError` | 130 |
| `AuthError` | 4 |
| `StorageError` | 2 |
| handgeschreven `Error` | 13 |
| `unknown` (een gevangen waarde) | 10 |
| `any` | 1 |

**136 van de 160 — 85% — dragen een melding die een server heeft samengesteld.**
Dat maakt dit een opruimklus in één laag en geen herontwerp: er is niet één
aanroeper die iets anders moet gaan doen.

⚠️ **En de meting zegt méér dan het aantal.** Ze zegt dat de herkomst niet alleen
zíchtbaar is maar in 85% van de gevallen zelfs in het type staat — en dat is
precies wat richting 2 nodig had en wat het issue als open vraag noemde
(*"Vraagt wel dat de herkomst betrouwbaar te zien is bij álle 173"*).

## Het besluit: richting 2, en waaróm niet 1 of 3

**Richting 3 — de `%`-waarden onherkenbaar maken — kan niet**, en dat is geen
inschatting: zonder het formaatsjabloon is `Europe/Bogus` niet van de rest van de
zin te onderscheiden. Er is geen bezem die `Europe/Bogus is geen bekende
tijdzone` schoont en `Rij uit group_overview zonder user_id` heel laat.

**Richting 1 — een allowlist van bekende meldingsvormen — is duur én lek.** De
verleidelijke variant is hem te *genereren* uit de 22 `%`-vormen in de migraties,
zodat het onderhoud vanzelf gaat. Twee bezwaren, en het tweede is het echte:

1. Elke nieuwe `raise` vraagt een regeneratie, en de tabel moet mee de
   client-bundel in.
2. **Hij dekt alleen ónze meldingen.** Postgres, PostgREST, GoTrue en Storage
   hebben hun eigen catalogus van duizenden zinnen — `date/time field value out
   of range: "…"` is er één. Voor die hele klasse heb je alsnog een terugval
   nodig, en zodra die er is, koopt de allowlist alleen nog leesbaarheid voor een
   deelverzameling. Een allowlist die op de melding**tekst** werkt, faalt
   bovendien **open**: een vorm die er niet in staat, gaat door.

**Richting 2 werkt op de wáárde en faalt dicht.** Herkent hij een fout niet als
servermelding, dan blijft de melding staan (leesbaarheidsverlies is nul);
herkent hij hem wél, dan gaat de melding niet mee. En omdat de toets op het
object gebeurt en niet op het type, dekt hij ook de **11** aanroepen die
`unknown` of `any` zijn — daar kán een `PostgrestError` landen zonder dat de
compiler het weet, en een grens op het statische type zou die elf missen.

### Wat er van een serverfout overblijft

```
name:    PostgrestError                          ← klassenaam, geen gebruikerstekst
message: Servermelding weggelaten (23505)        ← vaste zin + de code
stack:   PostgrestError: Servermelding weggelaten (23505)
             at maakGroep (api.ts:41:11)         ← kop opnieuw ópgebouwd
where:   buddies.create                          ← de aanroeper zette hem
```

⚠️ **Dat de melding het minst waard is, staat in de documentatie van de
bibliotheek zelf.** `PostgrestError` rangschikt zijn velden expliciet naar
bruikbaarheid: `hint` (de letterlijke SQL om het op te lossen), dan `code`
(*"branch on this rather than on message text"*), dan `details`, en dan pas
`message` — *"Useful in UI strings; less useful for debugging"*. We laten dus het
gevaarlijkste veld vallen en houden het veld dat de bibliotheek zelf als tweede
zet. `hint` en `details` gaan al niet mee: die staan niet op de allowlist van
`scrubContext()`, en `details` is nu juist de regel waar Postgres de gebroken
waarde in zet.

### Wat dit besluit níét is

- **Geen verruiming van `scrubMessage()`.** Die blijft precies doen wat hij deed,
  voor precies de meldingen die wij zelf schrijven.
- **Geen vervanging van `meldtekst:controle`.** Die grendel vangt de andere helft
  — een melding die met de hánd in een eigen `Error` is overgeschreven
  (``new Error(`x: ${fout.message}`)``) is aan het object niet meer te zien. De
  twee dekken elkaars gat en **geen van beide is in zijn eentje sluitend**.
- **Geen tweede pad voor ontwikkelaars.** De verleiding was om de rauwe melding
  in de console-terugval te laten staan. Niet gedaan: dat is een tweede plek die
  uit elkaar kan lopen, en dat is in dit bestand al een keer gebeurd (de stack van
  24-08). De volledige tekst staat waar hij al stond — in de Supabase-functielogs
  voor de jobs, in het netwerkantwoord voor de client.

## De naad die eronder lag

Bij het bouwen bleek de eigenlijke reparatie een ándere dan het issue
beschreef. `describe()` in `src/lib/observability/index.ts` en `beschrijf()` in
`edge-rapport.ts` deden **hetzelfde werk in twee bestanden**: de app en de jobs,
dezelfde belofte, twee plekken om hem te breken. Een `%`-grens in één van de twee
zou de andere hebben laten staan.

Er is er nu één — `beschrijfFout()` in `scrub.ts`, het bestand dat via
`npm run edge:sync` naar Deno meegaat. Dat is regel 18 vraag 1: *waar knopen twee
correcte onderdelen aan elkaar?* Hier knoopten ze niet, ze stonden náást elkaar.

## Twee dingen die gemeten zijn en niet aangenomen

1. **`StorageApiError` zet zijn code niet in `code`.** Hij laat `code` leeg en
   zet `NoSuchKey` in `statusCode`, met daarnaast een numerieke `status`.
   Eén veld lezen had elke storage-fout stilzwijgend zonder code gelaten. Gevonden
   doordat de ijking rood ging, niet door oplettendheid.
2. **De marker en de naamvorm overlappen voor élke klasse die vandaag bestaat.**
   `AuthApiError` draagt `__isAuthError` én heet `AuthApiError`. Een ijking met
   een gewone `AuthApiError` zegt dus niets over welke van de twee het werk doet —
   precies de vorm van een grendel die door een eerdere grendel wordt afgevangen.
   Daarom staat er per herkenning een geval dat álleen díe vindt: een subklasse
   van de échte `AuthError` die zich buiten de naamvorm hernoemt (alleen de
   marker), `FunctionsHttpError` (alleen de naam — geen marker, geen
   PostgREST-vorm), en een kaal object na een JSON-heenreis (alleen de vorm).

## De ijking

Tien mutaties, elk apart, elk met een controle dat de mutatie ook echt in het
bestand stond, en elk rood op de test die hem noemt:

| # | Wat gebroken | Wat rood werd |
| --: | -- | -- |
| 1 | de markerherkenning | de hernoemde `AuthError`-subklasse |
| 2 | de PostgREST-vormherkenning | het kale object zonder naam |
| 3 | de naamvorm | `FunctionsHttpError` |
| 4 | de keuze tussen vaste zin en bezem | alle 22 `%`-vormen |
| 5 | de stackkop uit de rúwe melding | de stacktest + vier bestaande |
| 6 | de vormtoets op de code | *weigert alles wat geen code is* |
| 7 | de kop uit de rúwe melding halen | vier bestaande + alle 22 |
| 11 | de kop níét afknippen maar alleen filteren | de meerregelige melding |
| 12 | de vormtoets terugdraaien naar de typetoets | **alle 22 `%`-vormen** |
| 8 | de Edge-aanroeper zijn eigen weg laten gaan | alle 22, via de envelope |
| 9 | de scan die de migraties leest | *vindt de vormen die dit issue heeft gemeten* |
| 10 | álles wegpoetsen | *laat een handgeschreven melding staan* |

⚠️ **Mutatie 10 is de tegenrichting en hoort erbij.** Zonder die test is een
schoonmaak die élke melding vervangt óók groen, en dan is er van een foutrapport
niets meer over. Een controle die alles meldt, leert je hem te negeren; een zeef
die alles wegneemt, leert je hem uit te zetten.

⚠️ **Mutatie 9 laat het aantal tests dálen in plaats van er één rood te maken:**
een `it.each` over een lege lijst is groen zonder iets te beweren. Daarom staat
er een ondergrens (`>= 22`) náást de lus. Zonder die ondergrens zou een
kapotte scan het hele bestand geruisloos leegmaken.

## Wat er misging bij het ijken zelf

De eerste ijkopstelling zette het bestand na elke mutatie terug met
`git checkout -- <bestand>`. Dat herstelt uit de **index**, en het werk stond nog
niet gestaged — de eerste mutatie draaide dus correct en gooide daarna alle
wijzigingen van dit issue weg. De tweede mutatie meldde alleen "anker niet
gevonden", en de testuitslag die daarna kwam ging over een boom die er niet meer
was.

⚠️ **Een ijkopstelling die de code kan weggooien die hij ijkt, is een tweede
fout in de maak.** Sindsdien: een kopie naast het bestand en `cmp` in beide
richtingen — landde de mutatie écht, en staat het origineel er daarna écht weer.
Dat is dezelfde les als op 07-09 bij QS8-262, waar een mutatie groen bleef omdat
de bewerking het bestand nooit had geraakt: **de vraag is niet of de test rood
werd, maar of hij de kans kreeg.**

## Wat hierna nog open staat

- Een melding die met de hand in een eigen `Error` is overgeschreven, blijft
  buiten bereik van deze grens. `meldtekst:controle` vangt de vormen die met een
  tekstscan te zien zijn; de dossierrij van 07-09 noemt de vormen die dataflow
  vragen. Die rij blijft open.
- `SYMBOOLCODE` laat één enkel woord door. Zou een bibliotheek ooit iets
  dynamisch in `code` of `statusCode` zetten, dan is dat een kanaal. Vandaag
  vullen alle drie de bibliotheken die velden uit een vaste lijst; dat is de
  aanname die deze grens laag houdt.


## Wat de security-review vond, en wat de meting ervan zei

De review draaide vóór de PR (regel 19) en het oordeel was **blokkerend**. Elke
bevinding is zelf nagemeten voordat hij verwerkt werd; twee bleken scherper dan
ze klonken en één bleek te ruim gesteld.

### 1 — Kritiek, en volkomen terecht: de grendel ging op het meest voorkomende geval niet aan

De vormherkenning eiste dat `code`, `details` én `hint` alle drie een **string**
zijn. 📏 Gemeten tegen de lokale PostgREST, geen redenering:

```
$ curl -s -X POST http://127.0.0.1:3010/goals -d '{"title":"x"}'
{"code":"42501","details":null,"hint":null,"message":"permission denied for table goals"}
```

`details` en `hint` komen als **`null`** terug voor een kale `raise exception`,
en 84 van de 87 `raise exception` in dit project zijn kaal. Daar bovenop: 📏
`throwOnError()` staat **nul keer** in deze repo, en zonder die vlag geeft
postgrest-js letterlijk `JSON.parse(body)` terug
(`PostgrestBuilder.ts:545-570`) — dus een **kaal object**, zonder `name`, zonder
`stack`, zonder marker.

⚠️ **De typetoets sloeg daardoor niet aan op de vorm waarin deze fout de app
werkelijk bereikt.** Er lekte niets — `String(object)` platslaat naar
`[object Object]` — maar de vaste zin kwam er niet, de code kwam er niet, en de
bescherming die er stond, stond op het dominante geval uit.

⚠️⚠️ **En het ergste is waaróm dat groen was: de test voedde een vorm die deze
app nergens maakt.** `new PostgrestError({message, details, hint, code})`, alle
vier gevuld. Dat is exact de fout van 28-08, waar de fixture
`Key (invite_code)=('zomer-2026')` **mét** aanhalingstekens schreef en de test
dáárop groen was terwijl elke uitnodigingscode ongeschoond de deur uitging — een
fout die met zoveel woorden in de kop van `PG_DETAIL_WAARDE` staat, in hetzelfde
bestand, twintig regels hoger.

**De les die dit oplevert en die de bestaande niet dekt:** een fixture komt uit
het systeem of hij is een aanname. Overtypen uit een `curl`-antwoord kost een
minuut; de vorm bedenken kost niets en bewijst niets. **Wat een test invoert is
even hard een bewering als wat hij verwacht — en de invoer wordt nooit
gecontroleerd.**

Gerepareerd: de herkenning kijkt naar de **aanwezigheid** van de sleutels en niet
naar hun type, en de fixtures zijn overgetypt uit echte antwoorden. Mutatie 12
draait de oude toets terug: **alle 22 `%`-vormen worden dan rood**. Vóór de
fixture-reparatie was diezelfde mutatie groen.

### 2 — Terecht: er stond een levende omzeiling, en mijn commentaar wees naar een grendel die hem niet ziet

`supabase/functions/doelcoach/index.ts` gooide
``new Error(`De tip kon niet opgeslagen worden: ${tipfout.message}`)``. Die
`throw` wordt onderaan gevangen en gaat naar `meld()`. De grens hier kijkt naar
het objéct, en een met de hand overgeschreven melding is daar niet meer aan te
zien. En `meldtekst:controle` ziet hem ook niet: die leest het **eerste argument
van de aanroep**, en dat is daar de variabele `fout`. 📏 Nagedraaid: die controle
is **groen** met die regel erin.

⚠️ De kop van `isServerfout()` zei desondanks dat `meldtekst:controle` deze helft
"afvangt". Dat klopte niet, en zo'n zin is erger dan geen zin: hij laat de
volgende schrijver op een grendel vertrouwen die er niet is. De regel is
gerepareerd volgens het patroon van 0158 (volledige tekst naar `console.error`,
vaste zin naar `meld()`), en het commentaar zegt nu wat de twee grendels wél en
níét samen dekken.

### 3 — Terecht: het lek van 24-08, één regel lager

`scrubStack()` bewaarde elke regel die op `/^\s*at\s/` matcht. De kop wordt
opnieuw opgebouwd uit de onderdrukte melding, maar een melding mag **meerdere
regels** hebben, en een tweede meldingsregel die met `at ` begint (`ik werk\nat
home met …`) leest als frame en ging alsnog mee.

Gerepareerd door de kop **exact af te knippen** in plaats van hem weg te
filteren: kennen we de rúwe melding, dan is `${name}: ${melding}` een prefix die
je van de stack af kunt halen. Dat is precies, en het gokt niet naar de syntaxis
van een frame — een strengere frame-regex zou echte frames uit Hermes of Deno
kunnen weggooien.

### 4 — Half terecht, en de meting corrigeert de andere helft

**Terecht:** de netwerkfoutvorm van postgrest-js zet `code` op de **lege
string**, en die is een `string` — een `??` valt daar niet doorheen. Verwerkt.

**Niet terecht:** dat `FunctionsHttpError` en `FunctionsFetchError` "als dezelfde
zin in Sentry landen". 📏 Nagemeten: hun `name` verschilt
(`FunctionsHttpError` / `FunctionsFetchError`), en `beschrijfFout()` houdt de
naam. In de envelope wordt dat `exception.values[0].type`. De gebeurtenissen zijn
dus wél uit elkaar te houden; alleen het `message`-veld is gelijk.

**En de bevinding legde iets anders bloot dat wél fout was.** De terugval op
`statusCode` die ik had ingebouwd, was gebouwd op een verkeerde meting: ik riep
`new StorageApiError(melding, 404, 'NoSuchKey')` aan en las af dat de dienstcode
in `statusCode` belandt. De bibliotheek vult die velden anders — `statusCode` is
de HTTP-code als string (`'404'`), `code` is de dienstcode — dus die terugval kon
nooit iets opleveren: `'404'` valt op beide vormtoetsen af.

⚠️ **Een aanroep met de hand in elkaar zetten is geen meting van hoe hij gevuld
wordt.** Dat is dezelfde fout als bevinding 1, één laag dieper: ik had de
constructorhandtekening gemeten, niet het gedrag. De terugval is verwijderd.
Ook verwijderd: een `!== ''` in `leesString` die eruitzag als een grendel maar er
geen was — een mutatie erop bleef groen, want beide vormtoetsen weigeren de lege
string toch al.

### 5 — Terecht, en bewust niet in deze branch

📏 57 aanroepen geven `{ pgcode: error.code }` mee. `pgcode` staat niet op de
allowlist van `scrubContext()` en is niet `sqlstate`, dus die code wordt
`[weggelaten]`. Pre-existent, en met deze wijziging minder erg dan het was — de
code rijdt nu in de melding mee, dus een gebeurtenis is ook zonder `pgcode` te
plaatsen.

⚠️ **Niet hier gerepareerd, en de reden is een regel en geen agenda.** `pgcode`
toevoegen aan `ALLOWED_KEYS` is een kanaal openzetten zónder vormtoets, en de
kop van `FOUTCODE` legt uit waarom dat precies de fout is die dit bestand al een
keer heeft gemaakt. De keuze is: die 57 aanroepers naar `sqlstate` brengen, of
`pgcode` een eigen vormtoets geven. Dat is een eigen issue met een eigen meting
(QS8-330), en 57 aanroepen aanraken hoort niet in een PR over de schoonmaaklaag.

### Wat er als agendarij blijft staan

`SYMBOOLCODE` laat één enkel woord door, en de verdediging daarvoor is dat het
veld door de bibliotheek gevuld wordt en niet door een aanroeper. En `fout.name`
is nu het énige vrije-tekstveld dat op een serverfout overblijft. Beide staan met
een `**Wordt zwaarder als:**`-zin in `docs/ENGINEER-REVIEW.md`.
