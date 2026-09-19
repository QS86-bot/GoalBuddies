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

`kolomrechten` weegt het zwaarst. Die controle telt welke kolommen `src/` en
`app/` terugvragen, en domeinregel 7 zegt dat **RLS geen kolommen kan beperken**
— dit is de enige plek waar die grens geteld wordt. Een comment die de kolomlijst
verving, verving de meting.

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
