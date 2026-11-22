# Een tijdelijke typebrug krijgt één wekker voor alle bruggen — QS8-782

Draait mee in `npm test` en is bewust geen eigen `*:controle` (die zou het poortstand-blok en het auditkop-blok laten meegroeien).

Datum: 22-11-2026. Vervolg op PR #787 (uitrol 0303 t/m 0336).

## Wat er stond

Na de uitrol bleven er tien plekken over die zeiden of deden alsof iets nog niet in
`src/lib/database.types.ts` stond: `NogNietInTypes` in `commitments/api.ts` en
`auth/profile.ts`, de smalle casts in `buddies/demping.ts`, `prestatie-delen.ts`,
`profiel.ts`, `uiterlijk/api.ts` en `xp/api.ts`, `COMMITMENT_KOLOMMEN: string`, drie
RLS-testbestanden met `as never` op namen en een uitleg in `risicoradar.test.ts`.
Gemeten (typecheck op de hergenereerde types): **alle** kolommen, tabellen en functies
staan er nu in. Alles is weggehaald; typecheck is zonder die bruggen groen.

## Waarom hun wekker niet afging

De drie bruggen die wél rood gingen hadden een toets die de naam van hún functie in het
typebestand zocht. De andere hadden alleen een zin ("zodra uitgerold: `npm run types:db`").
Een zin gaat niet af, en de regel "elke brug een eigen toets" is niet te handhaven: die
vergeet de volgende bouwer, en dat is precies wat er gebeurde. Regel 18, vraag 3.

## De wekker nu

`tests/beloftes/geen-verouderde-typebrug.test.ts` (register: `tests/beloftes/typebrug-register.ts`) is één wekker voor alle
bruggen: elk bestand dat beweert dat iets nog niet in de typen staat moet in `BRUGGEN`
staan met een sleutel die de typen nog niet mogen kennen; staat die er wel, dan is de
brug overbodig en de controle rood; staat een ingang er zonder bewering, dan is het
register verouderd. `BRUGGEN` is leeg. Geijkt met de hand op G1, G2 en G3 (22-11-2026) en in
`tests/beloftes/geen-verouderde-typebrug.test.ts`.

## Wat de wekker meteen opleverde

Drie RLS-testbestanden droegen dezelfde bewering (`organisatiebeheer`, `organisaties`,
`organisatieteams`): de `as never` op literale namen is eruit. En `risicoradar.test.ts`
legde uit dat `herbereken_risico` bewust niet in de typen staat omdat de generator alleen
functies voor `authenticated` zou opnemen. Dat klopt niet: de functie staat er wel in.
📏 Gemeten op productie op 22-11-2026 (alleen lezen): `has_function_privilege` is `false`
voor `authenticated` en `true` voor `service_role`. Het recht is dus zoals 0051 belooft;
het bewijs daarvan is de grant, niet de afwezigheid van een type.

## Aanname

De RLS-suites die ik aangeraakt heb (`organisatie*`, `risicoradar`, `weekbelofte-aangaan`)
heb ik alleen getypecheckt, niet tegen een database gedraaid.
