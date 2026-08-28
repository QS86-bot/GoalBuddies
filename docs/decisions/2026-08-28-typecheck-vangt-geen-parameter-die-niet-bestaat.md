# Typecheck vangt geen parameter die niet bestaat

**Datum:** 28-08-2026
**Aanleiding:** de dossierrij van 28-08, twee keer bevestigd door deze sessie zelf
**Raakt:** `scripts/rpc-argumenten-controle.mjs`, `tests/scripts/rpc-argumenten.test.ts`,
`package.json`, `.github/workflows/ci.yml`

## 1. Het gat, met de hand gemeten

De kop van `src/modules/buddies/weekafsluiting.ts` beloofde dat de build breekt
als een naam niet klopt. Voor de **kolommen** is dat waar — `Returns` wordt echt
gebruikt — maar niet voor de **argumenten**. Elke vorm los gemeten tegen
`npm run typecheck`, met de mutatie in een echt aanroepbestand:

| Vorm | typecheck |
|---|---|
| een verkeerd type op een bestaande parameter | vangt |
| een weggelaten verplichte parameter | vangt |
| een onbekende functienaam | vangt |
| **een parameter die niet bestaat** | **zwijgt** |

⚠️ **Die laatste komt er in béide vormen doorheen**: als letterlijk object achter
de naam, én via een `const` ertussen. Bij een letterlijk object zou je de
excess-property-toets verwachten; die slaat hier niet aan omdat het `Args`-type
van de generator álle sleutels optioneel maakt.

## 2. Waarom nu

Het is deze sessie twee keer gebeurd. 0121 hernoemde `p_offset` in
`weekafsluiting_reacties()`, en 0125 deed hetzelfde in
`openstaande_beoordelingen()`. In dat tweede geval bleef
`tests/rls/besluiten.test.ts` `p_offset` sturen, kwam het door typecheck heen, en
viel het pas om bij het draaien — met `PGRST202`, de code die zegt dat PostgREST
de functie met díé argumenten niet kent.

De dossierrij zei *"wordt zwaarder als er nóg een RPC-parameter hernoemd wordt"*.
Dat is precies wat er gebeurde, dus de rij was aan de beurt.

## 3. Wat het script vergelijkt, en waarom niet met de types

Typecheck leest `src/lib/database.types.ts`. Dit script leest
`supabase/migrations/` en `supabase/shim/`.

⚠️ **Die twee kunnen uit elkaar lopen**, en dat is geen theorie: de gegenereerde
types worden in dit project ook met de hand bijgewerkt — vandaag nog, voor 0125.
Een aanroep die bij de types past maar niet bij de migraties is precies wat er op
productie omvalt, en dit is de enige plek waar dat zichtbaar wordt.

De shimmap staat erbij omdat `shim_maak_gebruiker()` en `shim_verwijder_gebruiker()`
in `supabase/shim/0000_supabase_shim.sql` staan en niet in een migratie. Dat is
beter dan een uitzonderingenlijst: de definitie bewijst zichzelf.

## 4. Drie ontwerpkeuzes

**De sleutel van een overload is het áántal parameters, niet de handtekening.**
Een `create` noemt namen, een `drop` noemt typen; het aantal is het enige dat ze
delen. Grover dan Postgres, en dat is de goede kant om op te leunen — twee
overloads met hetzelfde aantal argumenten en verschillende namen zouden dit
script te ruimhartig maken, en die bestaan in dit schema niet.

**Drie soorten aanroep, apart geteld.** Zes aanroepen geven hun argumenten via
een variabele door en zijn met een regex niet te lezen. Ze als "gecontroleerd"
meetellen zou de slotregel laten liegen — dat is hoe de blinde vlek van
`keten:controle` maandenlang onzichtbaar bleef. Ze staan er als eigen getal
onder.

⚠️ **Eén van die zes is deze sessie zelf ontstaan.** `fetchBeoordelingen()` bouwt
zijn argumenten sinds 0125 in een `const`, omdat `exactOptionalPropertyTypes`
geen `undefined` op een optionele sleutel toestaat. De reparatie heeft haar eigen
aanroep dus buiten het bereik van deze controle gezet. Dat hoort zichtbaar te
zijn en niet weggerekend.

**`tests/scripts/` telt niet mee.** Daar staan de ijkingsgevallen van de ándere
controles, en die zijn met opzet verzonnen: `dode-keten.test.ts` voedt letterlijk
`.rpc('create_group', { p_naam: … })` aan `rpcAanroepenIn()`. Dat is invoer, geen
aanroep.

## 5. Wat het ijken opleverde, en dat is het echte verhaal

**a. De eerste werkende versie meldde nul terwijl de fout er met de hand in
stond.** `bovensteSleutels()` kreeg de accolades ván het argumentenblok mee
binnen, stond dus meteen op diepte 1, en gaf voor élke aanroep een lege
sleutellijst — en een lege lijst past in élke handtekening. **Groen zonder iets te
toetsen, in het script dat juist die klasse fout moet vangen.**

Het viel alleen op doordat ik de vraag stelde *"vindt hij de fout van vandaag?"*
en `p_offset` met de hand terugzette. Lezen had het niet gegeven; de slotregel
zei toen ook al "332 aanroepen sturen alleen parameters die bestaan".

**b. Twee van de vijf ijkingen raakten hun eigen grendel niet.** Beide bleven
groen toen ik de grendel weghaalde die ze in hun naam dragen:

- *een oude parameternaam nadat een migratie de functie heeft omgebouwd* — mijn
  fixture had drie vormen met állemaal twee parameters, dus de tweede `create`
  overschreef de eerste toch al en deed de drop niets. Nu heeft de nieuwe vorm er
  drie, wat bovendien de échte vorm van 0125 is.
- *een ternary en een string met een dubbele punt erin* — ik gebruikte
  `open ? 'ja' : 'nee'`, en de quote-tak slaat beide takken al over. Met
  `open ? ja : nee` staat er een kale naam vóór een dubbele punt, en dát is wat
  er zonder de komma-eis als sleutel binnenkomt.

⚠️ Dit is voor de tweede dag op rij dezelfde vondst, en inmiddels een regel in
`CLAUDE.md`: **mutatie per grendel, en controleer dat de mutatie de grendel raakt
die hij noemt.** Gisteren bij `tekst:controle`, vandaag twee keer hier. Het
antwoord komt nooit uit lezen.

**c. Een sorteerfout gaf zeventien valse "onbekend"-meldingen.** `functiesIn()` in
`dode-keten-controle.mjs` schrijft met zoveel woorden op dat je op positie moet
sorteren; ik had dat overgeslagen, en toen werd een drop bovenaan een migratie ná
de create eronder toegepast. Het patroon stond er, en ik heb het niet
overgenomen — een controle die twee keer geschreven wordt, moet twee keer
dezelfde les leren of één keer de code delen.

## 6. Stand

332 aanroepen met letterlijke argumenten over 143 functies: allemaal goed.
6 via een variabele (niet te lezen), 49 zonder argumenten. Draait in CI naast de
andere controles.
