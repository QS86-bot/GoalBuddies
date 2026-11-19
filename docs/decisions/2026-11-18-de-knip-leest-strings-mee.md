# De gedeelde knip leest strings mee (QS8-709)

**Besluit.** `scripts/zonder-commentaar.mjs` loopt de bron één keer door en houdt bij of hij in code,
een string, een template (ook `${ … }` binnen een template) of een regex staat. Een blokopening of
`//` telt alleen als commentaar in code. De uitvoer in de gewone gevallen is gelijk aan die van de oude
knip: een blok wordt één spatie, een regel die met `//` begint verdwijnt, een `//` midden in een regel blijft.

**Waarom.** De oude regex `/\/\*[\s\S]*?\*\//g` had geen anker. `${app}/**` in een template telde als begin
van een blok en at alles tot de volgende `*/`, ook een `process.exit`. De knip bepaalt wat code heet; is hij
blind, dan blijft een zeef groen terwijl de belofte breekt.

**Meting (📏, 18-11-2026, 892 bestanden in `src`, `app`, `scripts`, `tests`, `supabase/functions`).**
Oude en nieuwe knip geven in **60** bestanden een andere uitvoer, en steeds houdt de nieuwe méér over.
Steekproef op zeven bestanden: alle extra regels zijn code (globs als `'goalbuddies://**'`, `'app/**/*.tsx'`,
de string `'/* \'localtime\' */'`). In `src/` en `app/` is het verschil nul; het zit in `scripts/` (12) en
`tests/` (48). Controles en toetsen die deze bestanden lezen zien daarmee nu iets meer dan eerst (niet per controle
geteld); alle niet-database-controles die vandaag groen zijn, bleven groen.

**Meting per controle (📏, 19-11-2026, herhaald door een andere sessie op `origin/main`, oude knip = `4d2992f1^`).**
Een instrument in de knip draaide oude en nieuwe versie op elke invoer en telde per aanroepende controle; daarna zijn de drie
controles met een verschil kaal met elk van beide knippen gedraaid. Over 908 bestanden verschillen de knippen in **62**
(`scripts/` 12, `tests/` 50, `src/` en `app/` nul).

| controle | aanroepen | uitvoer anders | unieke invoeren | meldingen vóór → ná |
|---|---|---|---|---|
| `knip:controle` | 4015 | 160 | 27 | 0 → 0, uitvoer identiek |
| `belofteknip:controle` | 228 | 33 | 11 | 0 → 0, uitvoer identiek |
| `tellerbereik:controle` | 202 | 2 | 2 | 0 → 0, uitvoer identiek |
| `aansluiting`, `avatar`, `catalogus`, `eenrij`, `foutsleutel`, `handtekening`, `levend`, `spiegeling` | 1 tot 697 | 0 | 0 | 0 → 0 |

Voorbeeld: `scripts/auth-urls.mjs` r. 68, `` `${app}/**` `` — de oude knip las die `/**` als blokbegin. Geen controle gaf dus
een andere uitslag; er werd meer bron gelezen. **Ongemeten:** `defaultnull`, `jobbereik` en `kolomrechten` (importeren de knip,
vragen een lokale database) en `exports` en `regel15` (draaiden in de meetomgeving niet). De 50 testbestanden zijn als invoer
geteld, niet per testbestand gedraaid. Het verschil 62 tegenover 60 komt doordat `main` bestanden erbij kreeg en alle
`.js/.mjs/.ts/.tsx` zijn meegeteld.

**Grens.** Een regex wordt herkend aan het teken ervoor (`( , = : [ ! & | ? { } ; + - * % < > ~ ^` of een
sleutelwoord). Dat is een heuristiek. Gaat hij mis, dan is dat beperkt tot één regel (string en regex
eindigen aan het regeleinde); een template eindigt pas bij zijn backtick.

**Niet gedaan.** Criterium 5 van het issue (`netwerkexit:controle` op de gedeelde knip, rij in `MET_REDEN`)
is niet van toepassing op deze `main`: dat script bestaat hier nog niet (QS8-704, baan B).
