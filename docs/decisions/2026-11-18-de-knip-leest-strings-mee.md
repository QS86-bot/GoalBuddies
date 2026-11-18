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

**Grens.** Een regex wordt herkend aan het teken ervoor (`( , = : [ ! & | ? { } ; + - * % < > ~ ^` of een
sleutelwoord). Dat is een heuristiek. Gaat hij mis, dan is dat beperkt tot één regel (string en regex
eindigen aan het regeleinde); een template eindigt pas bij zijn backtick.

**Niet gedaan.** Criterium 5 van het issue (`netwerkexit:controle` op de gedeelde knip, rij in `MET_REDEN`)
is niet van toepassing op deze `main`: dat script bestaat hier nog niet (QS8-704, baan B).
