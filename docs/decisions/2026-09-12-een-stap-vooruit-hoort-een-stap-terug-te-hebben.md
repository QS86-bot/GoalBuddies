# Een stap vooruit hoort een stap terug te hebben

**Datum:** 12-09-2026 · **Issue:** QS8-438 · **Migratie:** geen

## De klacht

Uit de testronde van 12-09: *op elk scherm waar iets gevraagd wordt, horen een
"verder" en een "terug" te staan, zodat je altijd terug kunt om een antwoord te
veranderen.*

QS8-211 loste de doodlopende weg **tussen** schermen op met een `terug` op
`Screen`. Wat dat niet dekte is de navigatie **binnen** een scherm dat uit
stappen bestaat, en daar kwam de klacht vandaan.

## 📏 De lijst, gemeten en niet aangenomen

Er zijn precies **twee** schermen met stappen in `app/`:

| scherm | stappen | vooruit | terug (vóór dit issue) |
| -- | --: | -- | -- |
| `app/onboarding/vragenlijst.tsx` | 5 | ja | **ja** — `volgende`/`vorige`, plus een samenvatting met *wijzig* per antwoord |
| `app/onboarding/uitleg.tsx` | 4 | ja | **nee — nul** |

`vragenlijst.tsx` is niet de klacht maar **de maat**. Er is dus niets nieuws
bedacht: de vorm van dat scherm is doorgetrokken naar `uitleg.tsx`.

⚠️ **Zes andere stukken state worden óók opgehoogd en zijn géén stap:** vier
`ronde`-herlaadtellers en twee `paginaNr`-pagineertellers. Die hebben per
definitie geen "terug", en een regel die ze meldt is een regel die je leert
negeren. Dat onderscheid is de kern van de zeef — zie §4.

## 1. Wat `uitleg.tsx` erbij kreeg

Een `vorige()` die alleen `stap` verlaagt, en een knop die op stap 0 niet
bestaat. Exact de voorwaarde die `vragenlijst.tsx` al hanteert: een knop die
niets doet is erger dan geen knop.

⚠️ **De knoppen staan nu gestapeld in plaats van op een rij.** Er zijn er drie
(verder, terug, overslaan) en drie tekstlabels naast elkaar passen niet op een
smalle telefoon — de tabbalk gebruikt om dezelfde reden tekst en geen iconen.
`vragenlijst.tsx` stapelt al; daarmee zijn de twee onboardingschermen ook
onderling consistent.

## 2. ⚠️ Waar dit afwijkt van het issue, en waarom

Criterium 1 vroeg twee dingen: een terugknop **per stap**, én een `terug` op
`Screen`. Het eerste is gebouwd. **Het tweede niet, en dat is een besluit.**

QS8-211 had `uitleg.tsx` met reden in `GEEN_UITGANG_NODIG` gezet. Die reden is
nagemeten en hij klopt:

* `useTerug()` doet `canGoBack() ? back() : replace(naar)`.
* Vanaf de uitleg is `canGoBack()` waar — je komt van `/aanmelden`.
* `bestemmingVoor()` met een sessie die niet onboarded is en `wortel: 'aanmelden'`
  geeft **`/onboarding/uitleg`**.

Een terugknop in de kop springt dus naar het aanmeldscherm en wordt onmiddellijk
teruggestuurd. **Dat is precies de dode knop die QS8-211 met een verplichte
`naar` kwam wegnemen** — hem hier toevoegen zou die reparatie ongedaan maken op
het enige scherm waar ze niet werkt.

⚠️ **Dit staat niet als argument maar als proef.** CLAUDE.md waarschuwt dat een
afwijking die je onderbouwt duurder is dan een die je vergeet, juist omdat een
uitgeschreven redenering leest als een reden om niet te twijfelen. Daarom staan
die twee sprongen als **tests** in
`tests/beloftes/een-meerstaps-scherm-biedt-een-weg-terug.test.ts`, tegen de
echte `bestemmingVoor()`. Verandert de routewacht ooit zo dat de bounce
verdwijnt, dan valt die proef om en hoort dit besluit opnieuw bekeken te worden.

## 3. De schermen die met reden géén terug krijgen

Criterium 4 vraagt ze hier, met de reden erbij.

| scherm | waarom niet |
| -- | -- |
| `app/aanmelden.tsx` | Het beginpunt zonder sessie. `bestemmingVoor()` stuurt élke route zonder sessie hierheen, dus er is per definitie niets om naar terug te gaan |
| `app/onboarding/uitleg.tsx` — **alleen de kop** | De sprong bouncet, zie §2. Het scherm heeft sinds dit issue wél een terugknop **binnen** de stappen |
| de weekafsluiting | Geen nieuwe uitgang bijgebouwd. Beide bestaande knoppen lopen door `verlaat()` van de `vertrekwacht` (QS8-192); een extra uitgang eromheen zou onopgeslagen tekst weggooien |
| alles wat al bevestigd en weggeschreven is | Append-only (domeinregel 6). "Terug" mag daar navigatie zijn, nooit het terugdraaien van een gebeurtenis |

📏 De vertrekwacht is nagemeten en niet aangenomen: `app/groep/weekafsluiting/`
is in deze branch niet aangeraakt, beide knoppen gaan nog door `verlaat()`, en
`vertrekwacht.test.ts` plus `de-terugknop-van-de-router.test.ts` staan groen op
19 tests.

## 4. De belofte toetsen zonder naar de plek te grijpen

Criterium 6 vroeg een test op de belofte en niet op de plek. Een test die in
`uitleg.tsx` een knop zoekt, bewaakt dat ene scherm — terwijl het gat ontstaat
bij het vólgende meerstaps-scherm dat iemand bouwt.

De zeef zoekt daarom zélf welke schermen stappen hebben, en eist van elk een weg
terug. **Wat een "stap" is, is daarbij een meting en geen naam:** de state moet
opgehoogd worden **én** er moet op vergeleken worden met een vast getal om te
bepalen wat er getekend wordt.

📏 Over de hele map `app/`:

| vorm | treffers |
| -- | --: |
| state die opgehoogd wordt | 8 |
| daarvan: stuurt ook de weergave | **2** — precies de twee stapschermen |
| daarvan: herlaad- of pagineerteller | 6 — allemaal terecht met rust gelaten |

⚠️ **Waarom een bronzeef en geen echte klik.** Dit project heeft met opzet geen
React-renderer; `de-terugknop-van-de-router.test.ts` legt uit waarom — *"de
keuze is niet gedrag of tekst, maar tekst of niets, en niets is hier de
duurdere"*. Zelfde afweging, zelfde uitkomst.

## 5. IJking

Per grendel apart, vooraf gemeten op 9 groen.

| mutatie | wat er brak | wat er rood werd |
| -- | -- | -- |
| A | de terugovergang uit `uitleg.tsx` | 1 — "elk stapscherm laat je terug" |
| B | de terugovergang uit `vragenlijst.tsx` | 1 — dezelfde test |
| C | de vergelijking als eis eruit | **3** — de twee tellertests én de belofte |
| D | `onboarding.vorige` uit `en.ts` | 1 — "elke terug-sleutel staat in nl en en" |

**C is de mutatie die het meest zegt.** Zonder die eis leest de zeef de zes
tellers als stap zónder weg terug en meldt hij zes schermen waar niets mis mee
is. Dat hij dáár rood van wordt, is het bewijs dat de eis draagt.

**A en B maken dezelfde test rood, en dat hoort zo:** de belofte is er één over
de hele map. Wélk scherm hem breekt, staat in de foutmelding en niet in de
testnaam.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie.
