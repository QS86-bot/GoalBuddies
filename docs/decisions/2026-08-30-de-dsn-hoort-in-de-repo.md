# De DSN hoort in de repo, en de deploy bewaakt dat hij er is

**Datum:** 30-08-2026
**Aanleiding:** er was in vier dagen geen enkele fout uit de app in Sentry aangekomen
**Raakt:** `src/lib/env.ts`, `app/_layout.tsx`, `scripts/dsn-controle.mjs`, `scripts/deploy-web.mjs`, `scripts/sentry-proef.mjs`

## 1. Wat er aan de hand was

QS8-24 stond op alle vier de acceptatiecriteria afgevinkt en op In Review, met
één openstaand punt: er was nooit een gebeurtenis uít de app in Sentry
aangekomen. Dat punt stond vier dagen lang op drie lijstjes en werd vijf keer
niet afgehandeld.

**De reden was niet luiheid maar de vorm.** Het bewijs hing aan een handeling die
maar op één machine gedaan kon worden: `EXPO_PUBLIC_SENTRY_DSN` in een `.env`
zetten die nergens anders bestaat. Dat is dezelfde vorm waar dit project al vaker
op is gevallen — een zin in een document in plaats van een controle die vanzelf
rood wordt.

De keten heeft vier schakels. Op 30-08 was er precies één bewezen:

| # | Schakel | Vóór | Na |
|---|---|---|---|
| 1 | DSN staat in de gedeployde bundel | nooit gemeten | **poort in de deploy** |
| 2 | `setErrorSink()` wordt bij het opstarten aangeroepen | nooit gemeten | nog open |
| 3 | De sink bouwt een envelope en verstuurt hem | nooit gemeten | `sentry:proef -- --app` |
| 4 | Sentry accepteert hem | ✅ HTTP 200 | idem |

## 2. Besluit: de DSN gaat de repo in

`STANDAARD_SENTRY_DSN` staat in `src/lib/env.ts`, naast `STANDAARD_APP_URL` dat
er om dezelfde reden al stond.

**Een DSN is geen secret.** Hij is een schrijf-only ingest-adres dat per ontwerp
in élke clientbundel staat die je publiceert; iedereen die de site opent kan hem
uit de JavaScript plukken. Hem behandelen als geheim levert geen enkele
bescherming op — alleen een stap die maar één mens kan zetten.

Wat het wél kost, eerlijk opgeschreven:

- **Quota.** Wie de DSN uit de bundel haalt, kan er meldingen in pompen. Dat gold
  gisteren ook al, en op de gratis tier is het ruis en geen rekening.
- **Ruis uit ontwikkeling.** Vanaf nu rapporteert `npm run dev` net zo hard als
  productie. Dat is de echte prijs, en die is betaald in §3.

Uitzetten kan: `EXPO_PUBLIC_SENTRY_DSN` expliciet op leeg zetten wint van de
standaard. Daarom `??` en niet `||` — met `||` zou een lege waarde terugvallen op
de standaard en was Sentry niet uit te zetten.

## 3. Daarom óók `environment`, in dezelfde wijziging

Zonder dat veld is een fout uit `npm run dev` niet te onderscheiden van een fout
uit productie, en dan is de eerste echte productiefout zoek tussen het geknoei
van de ontwikkelaar. De standaard-DSN zonder dit veld zou een verslechtering
zijn.

`sentryOmgevingUit()` leidt hem af: een expliciete
`EXPO_PUBLIC_SENTRY_ENVIRONMENT` wint, anders `production` in een productiebuild
en `development` daarbuiten. Een onbekende `NODE_ENV` is nadrukkelijk **geen**
productie — andersom raden zou een lokale run tussen de echte fouten zetten.

De waarden zijn Engels, net als `server_name` en `runtime` ernaast: dit is een
veld dat Sentry zelf filtert en groepeert, geen UI-tekst. De emoji- en
tekstregels gaan hier niet over.

## 4. De poort in de deploy

`npm run deploy` trekt vlak vóór het inpakken na of de sleutel uit de DSN
daadwerkelijk in `dist/` staat. Het oordeel staat los in
`scripts/dsn-controle.mjs`, zodat de test hem elke vorm kan voeden.

| Uitkomst | Wat de deploy doet |
|---|---|
| `aanwezig` | doorgaan |
| `uit` (geen DSN) | doorgaan, met een luide regel |
| `ontbreekt` (wél DSN, niet in de bundel) | **afbreken** |
| `onbruikbaar` | **afbreken** |

⚠️ **Alleen het derde geval is echt gevaarlijk, en daarom breekt juist dat af.**
Dan denk je dat je bewaakt wordt terwijl er niets uitgaat — dezelfde vorm als
`setErrorSink()` dat nergens werd aangeroepen, `profiles.locale` zonder
schrijfpad en `verwijderPushToken()` zonder aanroeper. Géén DSN is een keuze en
mag door: een app onbereikbaar maken om een leesbaarheidsprobleem is de verkeerde
ruil, en dat is dezelfde afweging als bij `stuurSourceMapsNaarSentry()`.

**Met de hand rood gemaakt**, alle drie de takken, met `--droog --geen-build`
tegen een nagebouwde `dist/`: zonder de sleutel breekt hij af met exitcode 1 en
een melding die zegt waar je moet kijken; mét de sleutel gaat hij door; met een
lege DSN gaat hij door met een waarschuwing.

⚠️ **De standaard wordt uit de bron gelezen, niet gekopieerd.** De waarde staat
in TypeScript en de deploy is een `.mjs`; die twee kunnen de constante niet
delen. Een tweede letterlijke kopie zou precies de kopie zijn die in dit project
al twee keer geruisloos uit elkaar liep. In plaats daarvan leest
`standaardDsnUit()` hem met een regex uit `src/lib/env.ts`, en er staat een test
onder die rood wordt zodra de constante hernoemd wordt — anders verandert een
hernoeming deze controle stilletjes in een die niets meet.

## 5. Een stille fout in de proef van 26-08

`npm run sentry:proef` bouwt de envelope met `maakVerzending()`, dat `runtime` en
`server` allebei verplicht stelt. Maar het script is een `.mjs` met
type-stripping: TypeScript kijkt er niet naar. Ze werden nooit meegegeven, waren
`undefined`, en vielen uit de JSON.

**De envelope die op 26-08 met HTTP 200 werd aangenomen, droeg dus geen
`server_name` en geen `runtime`-tag** — precies de twee velden waaraan je een
fout uit de app van een fout uit een Edge Function onderscheidt. De 200 was echt;
de vorm was incompleet, en niemand kon dat zien omdat de ingest zo'n envelope
gewoon accepteert.

Rechtgezet in dezelfde wijziging: de edge-kant stuurt nu `edge`/`deno`, en
`--app` stuurt `app`/`web` plus de release uit `app.json`.

## 6. Wat hierna nog open is

**Schakel 2: dat `app/_layout.tsx` de sink daadwerkelijk aansluit.** Dat is de
schakel die wekenlang dood was — 34 bestanden meldden fouten aan een lege
bestemming — en de enige die je niet zonder browser kunt bewijzen.

Het antwoord daarop is een Playwright-stap in CI: een GitHub Actions-runner heeft
wél internet en kan zowel de site als de ingest bereiken. Hij laadt de gedeployde
pagina, gooit een fout, en eist een 2xx-POST naar de ingest. Dat is bewust niet in
deze wijziging meegenomen — het is een eigen stuk werk met een eigen valkuil (een
test die groen blijft omdat hij de POST mist in plaats van omdat hij er is).

⚠️ **Wordt zwaarder als:** er een tweede omgeving bijkomt, of zodra er echte
gebruikers zijn. Vanaf dat moment is "de app meldt niets en niemand ziet het" niet
meer een gemiste meting maar een blinde vlek op productie.
