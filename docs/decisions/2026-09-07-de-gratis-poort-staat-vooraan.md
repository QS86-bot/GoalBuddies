# De gratis poort staat vooraan, en het is dezelfde poort

**Datum:** 07-09-2026 · **Issue:** QS8-341 · **Volgt op:** QS8-206

## Twee dingen, en de eerste is een reparatie die al bestond

### 1. De profielquery had geen pagina's

📏 `notificaties/index.ts` las álle profielen met een kale `.select()` — geen
`range()`, geen `order()`, geen `limit()`.

⚠️ **Dat is woordelijk de bevinding van 19-08 die op 03-09 is opgelost — in
`rollover/index.ts` en niet hier.** `paginas()` stond al klaar in
`_shared/bladeren/`, en `notificaties` importeerde al vijf dingen uit `_shared/`.

📏 Wat het scherper maakt: het commentaar dat *direct onder die query staat*
verwijst naar QS8-315 en zegt dat de dossierrij twee plekken in de rollover
noemde en dat dit de derde is. Dezelfde reparatieronde nam dus de **logboek**-helft
van dit bestand mee en liet de **paginerings**-helft staan. Regel 18 vraag 4: de
reparatie hing aan de plek en niet aan de belofte.

### 2. Zes dure vragen stonden vóór de gratis poort

De job bouwde per profiel een object-literal met zes `await`-vragen erin, en gaf
dat aan een beslissing die op de eerste drie **gratis** velden al kortsluit:
`herinneringAan`, `herinneringUur` en `lokaalUur` komen uit de profielrij die er
toch al is.

Een object-literal evalueert eager, dus die zes query's draaiden **altijd** — ook
in de 23 van de 24 uren waarin de gebruiker sowieso niets krijgt, en voor iedereen
met `reminder_enabled = false`.

## Het besluit: één poort, twee lezers

`nudgeVoorpoortReden()` in `regels.ts` bevat de drie gratis redenen.
**`nudgeReden()` roept hem aan, en de job roept hem aan** — via
`nudgeBesluit()`, dat eerst de poort doet en daarna pas de zes vragen stelt.

⚠️ **Dat is de hele reden dat het een functie is en niet drie regels in de job.**
Een kopie van dezelfde drie voorwaarden op twee plekken is precies de naad waar
dit project regel 18 voor heeft: hij loopt niet meteen uit de pas, hij loopt
*later* uit de pas. Nu kán het niet: het is dezelfde code, in dezelfde volgorde.

Acceptatiecriterium 3 — *de beslissing verandert niet, alleen wat hij kost* — is
daarmee geen belofte maar een eigenschap van de constructie. De test legt hem
alsnog naast de oude beslissing, voor elke tak die `nudgeReden()` kent.

### De zes overgebleven vragen gaan in één `Promise.all`

Ze hangen niet van elkaar af; ze stonden achter elkaar omdat een object-literal
nu eenmaal van boven naar beneden leest. Zes ronden na elkaar is zes keer de
latency, per profiel, per uur.

## Waarom de beslissing in `src/` staat en niet in de Edge Function

Acceptatiecriterium 2 vraagt om een **tellende dubbel**: *een profiel dat de poort
niet haalt, veroorzaakt nul databasevragen.* Dat is niet met een blik op de
brontekst vast te stellen.

⚠️ Een test die in `notificaties/index.ts` naar de vólgorde van regels kijkt,
bewaakt de vorm en niet de belofte — hij blijft groen als iemand de query's
terugzet in een object-literal ergens anders (regel 18 vraag 4). Daarom staat
`nudgeBesluit()` in `src/modules/notifications/`, waar vitest draait, met de zes
vragen als **callbacks**. De dubbel telt gewoon hoe vaak er iets gevraagd is.

⚠️ En de tegenhanger staat er ook: *stelt de zes vragen wél zodra de poort open
is.* Zonder die test is "nooit iets vragen" ook groen, en dan stuurt de job nooit
meer een nudge.

## Wat de poort van dit project onderweg vond

`exports:controle` werd rood: **`magNudgen()` had geen aanroeper meer.** De job
was zijn enige gebruiker, en die roept nu `nudgeBesluit()` aan.

⚠️ De uitweg was een regel in `BEKENDE_ONBEREIKBAAR` met een reden. Niet gedaan:
QS8-194 gaat over precies deze klasse — *drie backend-issues op rij bleken geen
enkele aanroeper te hebben* — en een uitzonderingsregister is de goedkoopste
manier om die lijst te laten groeien. `magNudgen()` is weg; zijn tests toetsen nu
`nudgeReden()` zelf, wat sterker is: die zegt óók wélke reden het was.

## Criterium 4, nagemeten

📏 Doet de rollover hetzelfde? Nee. Een scan op object-literals met een `await` in
een veld geeft **nul** treffers in `rollover/index.ts`, `notificaties/index.ts`
(na deze wijziging) en `doelcoach/index.ts`. Deze vorm stond alleen hier.

## Twee dingen die tijdens het bouwen misgingen

### De foutcontrole kon niet meer vuren

Bij het pagineren belandde `if (profielFout)` vóór de lus die hem zet. Dat
typecheckt, het leest goed, en het kan per constructie nooit gebeuren — de vorm
van een grendel die er wel staat en niets bewaakt. Hij staat nu ná de lus, waar
`paginas()` hem heeft achtergelaten.

### Prettier over een bestand dat niet prettier-geformatteerd is

Om de inspringing van de genestte lus recht te trekken draaide ik `npx prettier
--write` over de job. Resultaat: **602 regels bij, 376 eraf** in een wijziging die
er echt 85 groot is.

📏 Nagemeten: dit project heeft géén prettier-config, en `prettier --check` meldt
óók `rollover/index.ts` en `regels.ts` als "niet geformatteerd". Het is dus niet
de formatter van deze codebase. Teruggedraaid en met de hand ingesprongen.

⚠️ **Een formatter over een bestand dat er niet onder staat, is geen opruiming
maar een herschrijving** — en hij begraaft de wijziging die je wilt laten
beoordelen. De echte diff is 85 regels; de rest van wat de PR toont, is de twee
spaties die de genestte lus kost.

### En de derde: ik liet CI meten wat ik zelf kon meten

De poort meldde `edge:types:controle` als **OVERGESLAGEN — geen Deno gevonden**,
en ik schreef in de PR dat CI die wel zou meten. CI mat, en vond **drie** fouten
in precies dat bestand:

```
TS2339  Property 'message' does not exist on type 'never'.
TS2339  Property 'code' does not exist on type 'never'.
TS2304  Cannot find name 'profielen'.
```

De derde is een kale vergissing: de samenvatting onderaan telde nog `profielen`,
de variabele die met het pagineren verdween. ⚠️ **Mijn eigen `npx tsc --noEmit`
zag dat niet**, want `supabase/functions/` valt buiten `tsconfig.json` — dat is
juist de reden dát `edge:types:controle` bestaat. De eerste twee komen doordat
TypeScript een toekenning in een closure niet volgt en `profielFout` daarna tot
`never` versmalt; de rollover heeft daar op r.512 al een cast voor staan, en die
staat er nu ook hier.

⚠️ **Wat hier de les is en niet de fout:** "geen Deno in deze container" was geen
gegeven. 📏 `npm i --no-save deno@2.9.6` haalt hem gewoon binnen — dezelfde versie
als CI — en daarna is `edge:types:controle` in twintig seconden groen te krijgen.
De devDependency stond al in `package.json`; hij was in deze omgeving alleen niet
geïnstalleerd. **Een controle die "ongemeten" meldt, is een vraag en geen
uitslag**, en dit project schrijft dat zelf op bij `npm run poort` — ik heb hem
als uitslag gelezen.

## Wat hierna nog open staat

De job heeft nog steeds geen watermerk: raakt hij zijn tijdslimiet van 120
seconden, dan begint hij het uur erna weer bij profiel 0. Pagineren maakt de kans
daarop kleiner en de afkapping zichtbaar in plaats van stil, maar het lost de
volgorde-afhankelijkheid niet op. Zolang het aantal profielen ruim onder die
grens blijft, is dat een aanname die klopt — en geen die zichzelf bewaakt.
