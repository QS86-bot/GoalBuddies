# Een branch die nog niet geland is, is geen fout

**Datum:** 18-09-2026 · **Issue:** QS8-552 · **Aanleiding:** `main` stond rood zonder dat er iets mis was met `main`

## Wat er gebeurde

📏 De run op `a585a37` faalde op `migraties:controle`:

```
origin/…qs8-533 draagt 1 migratie(s) die hier ontbreken: 0290.
```

`main` stond op 0289. QS8-533 was een **openstaande branch** met 0290 — de normale toestand van elk stuk werk dat nog niet geland is.

## Waarom het nú pas gebeurde

`migraties:controle` loopt elke `origin/*`-ref af en is daar altijd toe in staat geweest. Wat veranderde is wat CI hém te zien gaf.

QS8-452 zette `fetch-depth: 0` op de checkout van de job *typecheck · lint · test*, met een comment die precies zegt waarom: `dossierdrift:controle` leest de aanmaakdatum van elke migratie uit `git log` en slaat zichzelf over op een ondiepe kloon.

⚠️⚠️ **Maar `fetch-depth: 0` haalt niet alleen alle commits op — het haalt ook alle remote branches op.** Vóór die dag zag CI precies één branch en vuurde de branchtak nooit. Er is niets veranderd aan de controle, aan de map of aan `main`; er is iets veranderd aan wat er in `.git/refs/remotes` stond.

**Dat is dezelfde vorm als QS8-449 en als QS8-551, en alle drie op dezelfde week:** een instrument leest iets wat een *neveneffect* is van hoe de kloon tot stand kwam, en behandelt het als een *eigenschap* van het werk.

## ⚠️ Waarom dit niet eenmalig was

Zolang QS8-533 openstond bleef `main` rood. Landde hij, dan was de volgende migratiebranch aan de beurt. 📏 Bij het bouwen van deze reparatie stonden er al **twee** branches met 0290 (QS8-533 en QS8-546).

**Elke keer dat iemand aan een migratie werkt, zou `main` rood staan** — en daarmee ook elke PR, want dezelfde job draait daar. Op het moment van schrijven was er geen enkele PR die kon landen.

Een rood dat altijd aan staat, betekent niets meer. Dat is precies wat `hoofdrun:controle` en `docs/decisions/2026-09-09-twee-groene-prs-samen-rood.md` proberen te beschermen: rood op `main` hoort *werk nu* te betekenen.

## Het besluit

**Alleen `fouten` geeft exitcode 1. Een branchbevinding is een waarschuwing.**

De weging is niet hier bedacht. CLAUDE.md schrijft de drie signalen van deze controle zelf uit:

> Er komen drie signalen uit, en ze vragen om verschillende handelingen: het nummer, **de branches die datzelfde nummer dragen (een afspraak, geen fout)**, en — apart, want dit is de énige echte fout — dat `origin/main` vóórloopt en je moet pullen.

Het script scheidde die twee al netjes in `fouten` en `branchfouten`; het telde ze alleen bij het afsluiten bij elkaar op. Die optelling is weg.

De melding zelf blijft staan, inclusief de leeftijdsregel uit QS8-435 — want die waarschuwing is nuttig, ze hoort alleen niets tegen te houden.

### 📏 Wat hiermee níét verdwijnt, nagemeten en niet aangenomen

Elk van de vier fatale klassen is met de hand op de echte migratiemap gevoed en daarna opgeruimd:

| geval | exitcode |
| -- | -- |
| een gat (0292 zonder 0291) | **1** |
| een duplicaat (tweede bestand met 0289) | **1** |
| een migratie zonder `ROLLBACK-PAD` in zijn kop | **1** |
| een CLI-tegenspraak (`db:push` in `package.json`) | **1** |
| alleen een branchbevinding (de echte stand) | **0** |

⚠️ De eerste vier draaiden allemaal terwijl er óók een branchbevinding stond, dus ze tonen tegelijk dat een echte fout naast een branchmelding nog steeds rood geeft.

⚠️⚠️ **En twee PR's met hetzelfde nummer blijven gedekt.** Dat is de zorg van QS8-318, en die grendel is niet de branchtak maar het **duplicaat** dat er ná de merge staat — en dat is fataal gebleven. De branchtak waarschuwt vooraf; hij bewijst niets over de map zoals hij nu is.

## Waarom niet een van de alternatieven

1. **`dossierdrift:controle` een eigen job met `fetch-depth: 0`.** Werkt, maar verdubbelt de checkout én laat de val liggen: de volgende controle die in die job belandt en naar refs kijkt, loopt er opnieuw in. Het probleem zit niet in de job maar in de aanname dat een branchmelding een bouwfout is.
2. **De branchtak overslaan als `CI` gezet is.** Lost `main` op, maar verbergt het signaal ook op een feature-branch in CI, waar het wél iets zegt — en het maakt het gedrag afhankelijk van een omgevingsvariabele in plaats van van wat het signaal betekent.
3. **Wachten tot QS8-533 landt.** Komt terug bij de volgende migratie.

## ⚠️ Een aanname die hier zichtbaar hoort te staan

Dit besluit **versoepelt** een controle in plaats van hem aan te scherpen, en dat is de richting waar dit project terecht wantrouwig over is. Het is genomen op gezag van de zin in CLAUDE.md die de branchtak al *"een afspraak, geen fout"* noemt — niet op eigen inzicht dat het wel losser kan.

Blijkt bij de engineer-review dat de branchtak wél tegen moet houden, dan is de vorm die dan past alternatief 1: een eigen job voor `dossierdrift:controle`, zodat de rest van de controles weer één branch zien. Die weg staat open en kost niets van wat hier gebouwd is.

## Nasleep

`uitslag()` staat in `scripts/migratiebranches.mjs` en niet in het controlescript zelf, omdat dat script zijn werk op topniveau doet en `process.exit()` aanroept: importeren voert het uit. Een grendel die je niet kunt importeren, kun je niet ijken.
