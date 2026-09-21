# Een belofte die stilvalt is erger dan een die dichtslaat

**13-09-2026 — QS8-444.** Gevonden in de wekelijkse audit van 12-09 en zelf
nagemeten.

## 1. Wat er stond

`src/shared/kiezers/kiesDocument.ts` las het gekozen bestand met een kale
`await fetch(uri)`. Onwrikbare regel 14 zegt dat elke externe call een timeout
heeft, en 📏 elke ándere `fetch` in `src/` droeg er een:

| plek | grens |
| -- | -- |
| `src/lib/supabase.ts:54` | 15.000 ms, en 35.000 voor een Edge Function |
| `src/modules/notifications/webpush-verzenden.ts:210` | 15.000 ms |
| `src/lib/observability/sentry-sink.ts:143` | 10.000 ms |
| `src/lib/observability/edge-rapport.ts:318` | 5.000 ms |

Deze was de enige zonder. En de aanroeper had géén laadstand:
`app/groep/chat/[id].tsx` deed `onPress={() => void keuze.kiesEenDocument()}`
zonder `busy`.

**Dat is niet één tekortkoming maar twee helften van dezelfde.** Een `file:`- of
`content:`-URI hoeft geen bestand op schijf te zijn: een iCloud-placeholder of
een Drive-map via SAF laat de leesactie de bytes eerst binnenhalen. Zonder grens
wacht de app oneindig, en zonder laadstand ziet de gebruiker in die tijd níets.
Wat hij overhoudt is een knop waar je op tikt waarna er niets gebeurt — en er
komt ook nooit een melding.

⚠️ **Een belofte die stilvalt is erger dan een die dichtslaat.** Een melding is
een antwoord; stilte is er geen, en de gebruiker kan er niets mee. Dat is de
reden dat deze twee helften in één issue zaten en niet in twee.

## 2. De grens: 30.000 ms

Niet "ruim genoeg" maar afgewogen, en de afweging staat ook in de kop van
`kiesDocument.ts` zodat wie het getal leest de reden erbij krijgt:

- **Niet de vijftien van `src/lib/supabase.ts`.** Dat is een verzoek aan een
  server die óf antwoordt óf niet. Dit is een leesactie die er een download
  achter kan hebben zitten: 5 MiB (`CHATDOC_MAX_BYTES`) haalt op een
  middelmatige mobiele verbinding — zo'n 2 Mbit/s — de twintig seconden. Met
  vijftien breekt de app een keuze af die gewoon onderweg was.
- **Niet meer.** `FUNCTIE_TIMEOUT_MS` is 35 seconden en dekt een AI-call die
  gemeten twintig nodig heeft. Een bijlage kiezen hoort niet de langste
  wachttijd in de app te zijn.
- **De omvangspoort van QS8-431 vervangt hem niet.** Die leunt op `size`, en die
  is optioneel bij `expo-document-picker`. Ontbreekt hij, dan is deze grens het
  enige dat het lezen nog beëindigt.

⚠️ **En dertig is alleen verdedigbaar omdat er een laadstand bij hoort.** Dertig
seconden mét een bezette knop is wachten; dertig seconden zonder is een dode
knop. Haalt iemand `bezig` uit `useChatbijlage()` weg, dan is dit getal te hoog
geworden — dat staat in beide bestanden opgeschreven, want het is precies het
soort koppeling dat bij een latere wijziging onzichtbaar is.

**Geen nieuwe foutsleutel.** `AbortSignal.timeout()` laat `fetch` afwijzen met
een `TimeoutError`; die valt in de bestaande `catch`, wordt `null`, en de
aanroeper vertaalde dat al naar `chatdoc.kiezen_mislukt`. Criterium 3 van
QS8-431 — één zin voor "het lezen lukte niet", wat de reden ook was — blijft
daarmee onverkort gelden.

## 3. De laadstand wijst één knop aan

`Chatbijlagekeuze` kreeg `bezig: Bijlagesoort | null` en geen `boolean`. Een
enkele vlag zou bij een tik op "document" ook een spinner onder "foto" zetten,
en dan wijst de laadstand de verkeerde knop aan. Zelfde vorm en zelfde reden als
`bezigPad` in `useDocumentOpenen.ts`, die daar over meerdere documenten in één
gesprek gaat.

`Bijlagesoort` is **afgeleid** (`Gekozenbijlage['soort']`) en niet opnieuw
uitgeschreven: twee bronnen voor dezelfde opsomming lopen uit elkaar, en een
afgeleid type kan dat niet.

De vlag dekt het systeemvenster mee. Tijdens `getDocumentAsync()` staat de kiezer
vóór het scherm en is de spinner onzichtbaar; wat ertoe doet is wat er ná het
dichtklappen gebeurt. Hem pas dán zetten vraagt een tweede `setState` voor een
verschil dat niemand ziet.

## 4. De ijking

📏 **Acht mutaties, één per grendel, alle acht met de hand rood gezien op
13-09-2026. Vooraf gemeten groen: 9 in de nieuwe suite, 9 in die van QS8-431.**
Van elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóórdat de uitslag geloofd werd.

| Mutatie | Wat er brak | Wat er rood werd |
|---|---|---|
| A | het `signal` weg uit de `fetch` | 2 — de grensvraag, en de hangtest liep in de runnerlimiet |
| B | `LEES_TIMEOUT_MS` naar `Infinity` | 1 — alleen de grensvraag |
| C | de afbreking geeft `afgebroken` terug | 2 — waaronder de bijna-treffer |
| D | de `finally` eruit in `bezetTijdens()` | **1 — alleen de worptest** |
| E | de vlag pas ná het werk gezet | 1 — de volgordetest |
| F | de `busy` weg bij de documentknop | 1 — de schermzeef |
| G | `new AbortController().signal` in plaats van de tijdgrens | 2 — als bij A |
| H | `kies()` leest rechtstreeks, buiten `bezetTijdens()` om | 1 — de hookzeef |

⚠️ **G is de mutatie die ertoe doet.** Dat is de vorm die je in het echt krijgt:
er stáát een `signal`, de code leest als bewaakt, en hij vuurt nooit. Een
assertie op *"`signal` is niet `undefined`"* had hem doorgelaten. Daarom bespiedt
de suite `AbortSignal.timeout` zelf in plaats van het argument te bekijken: wie
een `AbortController` gebruikt, roept die functie niet aan.

⚠️ **D is de mutatie die minder oplevert dan je zou denken, en dat is de juiste
uitslag.** De `finally` in `bezetTijdens()` is alleen dragend op het worp-pad;
de vier `return`s uit de keuzes zitten in het meegegeven werk en kúnnen de
vrijgave niet overslaan. De vorm dekt die vier, de `finally` dekt de vijfde. Eén
rode test is dus wat er hoort te gebeuren — de kop van `bezetTijdens()` zegt dat
er nu bij, want de eerste formulering claimde meer dan de meting droeg.

## 5. Twee gemeten beperkingen die in de suite staan

📏 **`vi.useFakeTimers()` drijft `AbortSignal.timeout()` niet.** Na
`advanceTimersByTimeAsync(31_000)` bleef `signal.aborted` op `false`; Node hangt
die aan een eigen timer en niet aan `setTimeout`. Met echte tijd (5 ms) vuurde
hij wél, met `reason.name === 'TimeoutError'`. Dertig seconden uitwachten kan
niet in een suite, en dat is de reden voor de spion.

**De suite toetst niet dát de grens 30.000 is.** Die assertie zou haar
verwachting uit dezelfde module halen die zij controleert, en kan dus nooit iets
vinden. Wat wél getoetst wordt zijn de eigenschappen die een tijdgrens tot een
tijdgrens maken: eindig, en groter dan nul. `Infinity`, `0`, `NaN` en een
ontbrekend argument zijn alle vier manieren waarop *"er staat een timeout"* in de
praktijk *"er staat geen timeout"* betekent.

**De laatste schakel heeft geen runtime-oppervlak.** Deze repo heeft geen
renderer in de testrunner — geen `@testing-library/react`, geen
`react-test-renderer` — dus `useChatbijlage()` is niet aan te roepen. Twee
gevolgen, en ze zijn allebei een keuze:

- de eigenschap die kapot kan (de vlag komt altijd weer vrij) is losgetrokken in
  `bezetTijdens()`, een gewone functie met de zetter als parameter. **Een
  grendel die je niet kunt voeden, kun je niet ijken** — dezelfde reden waarom
  `teGroot()` in QS8-431 geëxporteerd werd;
- dát de vlag de knoppen bereikt, is een bronzeef op `app/groep/chat/[id].tsx`.
  De concessie van regel 18 vraag 4 geldt: verhuist `Bijlageknoppen`, dan wijst
  het pad nergens heen. De zeef faalt daarom hard als het bestand of de aanroep
  er niet is, in plaats van groen te blijven op nul gevallen.
