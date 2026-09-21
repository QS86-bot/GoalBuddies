# Een ontbrekende knip ziet eruit als niets te knippen

**19-09-2026 — QS8-567**

## Waar dit over gaat

QS8-446 zette de gedeelde knip neer (`scripts/zonder-commentaar.mjs`) en een
controle eromheen: *wie commentaar uit bron knipt, doet dat met de gedeelde knip
of staat met een reden in het register.*

Dat bewaakt de knip die er **is**. Niemand bewaakte de knip die er **niet** is.

Dat is de gevaarlijker helft, en de reden is een vorm die in dit dossier vaker
terugkomt dan welke andere ook: **een ontbrekende knip ziet er precies zo uit als
een controle die niets te knippen heeft.** Allebei leveren ze nul bevindingen op.
Zelfde vorm als bij `padverwijzing:controle` (QS8-412): *een ontbrekende test
valt op; een test waarvan in de bron staat dát hij er is, valt niet op.*

## De meting

📏 Geteld op 19-09-2026: **48** lezende controles, waarvan **11** knipten en
**37** niet. Van de 37 bouwden er een handvol een regex uit een **naam** — de
vorm waarin een commentaarregel als code gelezen wordt.

Vier bleken een echte instantie, en **alle vier faalden open**:

| controle | gemeten vóór de knip |
|---|---|
| `foutsleutel-controle.mjs` | een vormtoets die alleen in een comment genoemd werd, telde als vormtoets; een voorbeeld-allowlist in een comment verving de echte lijst van elf sleutels |
| `kolomrechten-controle.mjs` | `const velden = { onschuldig: 1 }` in een comment verving de echte kolomlijst |
| `aansluiting-controle.mjs` | een naam die alléén in een comment stond, maakte een dode keten levend |
| `avatar-controle.mjs` | een comment in een tekenend blok pleitte een ongetekende mapping vrij — `kaal: []`, identiek aan een échte aanroep |

### ⚠️ Een correctie op mijn eigen weging, en die is het opschrijven waard

De eerste versie van dit document noemde `kolomrechten` het zwaarst, met
domeinregel 7 als grond: *RLS kan geen kolommen beperken.* De security-review
wees aan dat die grond aan de verkeerde helft hing, en dat klopt — nagemeten:

- `velduitLokaal()` wordt **alleen** vanuit `schrijfIn()` aangeroepen. Dit was
  dus de **schrijf**kant; `selectiesIn()` — de leeskant — bleef eerst ruw lezen.
  Dat is inmiddels ook gerepareerd, en waarom dat nodig was staat hieronder.
- De faalvorm is in beide helften een **42501 in productie** (de
  0089/0140-klasse), geen stil datalek. De kolomgrant zélf is de grendel; deze
  controle is de pre-flight-check erop. PostgREST laat geen kolommen stilletjes
  weg — dat staat met zoveel woorden in de kop van het script, als een aanname
  die dit project al eens weerlegd heeft.

Een gemiste kolom is dus **duur** (een storing die élke schrijfactie op die tabel
omvergooit) maar het is **geen gemiste privacygrens**.

📏 En de reparatie kost vandaag niets: `schrijfIn()` over de hele boom geeft oud
en nieuw **33 schrijfacties, 0 verschillen**; `selectiesIn()` **71 selecties,
byte-identiek**.

### En de reparatie had dezelfde fout in zich

De eerste versie knipte alleen in `velduitLokaal()`. Daarmee gold
`kolomrechten-controle.mjs` voor de nieuwe helft van `knip:controle` als
*"knipt"* — want `knipt()` kijkt naar de **import** — terwijl `selectiesIn()`
ruw bleef lezen. De pas verliep niet meer.

Dat is het neveneffect-in-plaats-van-eigenschap uit dit document, terug in de
reparatie ervan. 📏 En de leeskant faalde open:

    "// vroeger: .from('goals')\nconst r = await q.select('secret');"
      →  { tabel: 'goals', kolommen: ['secret'] }

De tabelnaam kwam uit een comment, de kolom uit échte code, en de selectie werd
tegen de grant van de **verkeerde tabel** gelegd. Beide helften knippen nu.
📏 Kosten: 71 selecties en 33 schrijfacties, gelijk aan `main`.

⚠️ **Dit is meteen de scherpste grens van de nieuwe helft.** `knipt()` oordeelt
per **bestand**; een bestand met twee leesplekken krijgt een pas zodra er één
knipt. Dat staat in `ZONDER_KNIP`'s kop als belofte ("classificatie, geen
juistheid") en hier als het geval dat het aantoont.

**Dat ik dit fout had is precies de vorm waar dit document over gaat.** Een
reden die het verkeerde mechanisme noemt is in dit project de dure variant — hij
leest als onderbouwing, en de volgende persoon neemt hem over in plaats van hem
na te meten. CLAUDE.md zegt het scherper: *een afwijking die je onderbouwt is
duurder dan een die je vergeet.*

## Wat de nieuwe helft wél en niet belooft

⚠️⚠️ **Dit is het punt van dit document.**

Hij belooft: **een nieuwe bronlezende controle wordt geclassificeerd** — hij
knipt, of hij staat met een gemeten reden in `ZONDER_KNIP`.

Hij belooft **niet** dat elke bronlezer correct knipt. Die tweede belofte is met
dit gereedschap niet te maken, en hem tóch opschrijven zou precies de fout
herhalen die dit issue vond.

*"Importeert dit bestand de knip"* is een **neveneffect** van de reparatie, geen
eigenschap van het werk. `foutsleutel-controle.mjs` importeert hem en leest zijn
derde helft (`contextsleutels`) nog steeds ruw — met reden, want die meldt
regelnummers en de gedeelde knip vervangt een blok door één spatie. Een grendel
die op de import afgaat, zou dat groen noemen. Dan meet hij precies wat hij zegt
te bewaken niet.

**Wat elke bronlezer écht doet, blijft handwerk en een ijkingstest.** De controle
dwingt de kéuze af, niet de juistheid ervan.

## Wat de gedeelde knip niet weghaalt

Een **áchterlopend** `// …` op een regel met code. Dat is met opzet: een knip die
midden in een regel snijdt, eet de `//` van een URL op — het gemeten geval van
QS8-412.

📏 Gemeten per vorm op de échte `scrub.ts`, met de tak `key === 'sqlstate'`
weggehaald en `sqlstate` op de allowlist:

| vorm | `heeftVormtoets` | bevindingen |
|---|---|---|
| JSDoc-blok (de huisstijlvorm) | `false` | **1 — rood** |
| hele regel `//` | `false` | **1 — rood** |
| áchterlopend `//` op een coderegel | `true` | **0 — groen** |

De onderste rij is een geaccepteerde rest en geen omissie. De vorm die dit
project schrijft is het JSDoc-blok, en die gaat er wél uit.

## Twee dingen die de controle zelf corrigeerde

⚠️ **Hij vond een instantie die ik niet gemeten had.** `avatar-controle.mjs`
kwam pas boven nádat de controle aan stond. Hij knipt op zijn détectiepad (met
een eigen per-regel-vorm, netjes toegelicht) en knipte niet op het pad waar een
treffer een mapping juist *vrijpleit*. Eén bestand, twee paden, tegengestelde
richting — dat vind je niet door naar de importlijst te kijken.

⚠️⚠️ **En hij corrigeerde de telling waarmee dit issue begon.** Het issue sprak
van acht kandidaten; dat kwam uit een grep op `` new RegExp(` `` zónder de eis
dat er een `${…}` in zit. `afstemgetal-controle.mjs` gebruikt een template
literal zonder interpolatie en is de vorm dus niet. Hij stond even in
`ZONDER_KNIP` en is er door `verweesdeVrijstellingen()` weer uit gemeld.

Dat is dezelfde fout in het klein als de fout die het issue beschrijft: **ik las
een neveneffect van hóe iets geschreven is — de backtick — en behandelde dat als
de eigenschap.** Het verschil is dat de weesrij-controle hem binnen een uur
terugvond.

## Wat dit niet is

Geen herziening van QS8-446. `MET_REDEN` en de gedeelde knip blijven zoals ze
zijn; dit is de andere helft van dezelfde belofte.

Geen uitspraak over `tests/` en `app/`. De nieuwe helft kijkt alleen in
`scripts/` — daar wonen de grendels, en de vormen in `tests/beloftes/` zijn
gevarieerd genoeg dat een blinde eis daar ruis zou worden.
