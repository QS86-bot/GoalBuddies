# Een ratel in de verkeerde grootheid

**Datum:** 11-09-2026 · **Issue:** QS8-427 · **Gevonden in:** de wekelijkse audit

## 1. Wat er mis was

`scripts/regel15-controle.mjs` hield in `PLAFOND` een **aantal** per laag bij en legde
`perLaag[laag]` daarnaast. De **lengte** van een functie kwam in de weging niet voor —
alleen of hij boven de vijftig zat.

📏 Over de week tot 11-09-2026: het aantal functies boven de vijftig **daalde met vijf**,
en het aantal regels erbínnen **steeg met 292**. `app/` ging van 7574 naar 7845 regels en
zijn langste van 523 naar **557**. De controle stond die hele week terecht groen.

⚠️ **De controle deed precies wat hij beloofde; de belofte was alleen niet wat coderegel
15 wil.** Dat is dezelfde klasse die CLAUDE.md elders zelf benoemt: *een teller in grafemen
bij een grens in codepunten is een nieuwe fout en geen reparatie.* Een plafond in een
andere grootheid dan de regel meet, is een plafond dat de volgende meting niet terugvindt.

⚠️⚠️ **En het getal was al bekend.** De koppen in datzelfde script schrijven de langste
zélf op — *"de langste op 280 regels (`draaiRollover`)"*, *"tien boven de vijftig met een
langste van 710"*. Gemeten, opgeschreven, en vervolgens niet afgedwongen.

## 2. Wat er nu staat

Een tweede grootheid: `LANGSTE`, de langste functie per laag. Tweezijdig, net als
`PLAFOND` — rood als hij groeit, en rood als hij zakt zonder dat het plafond meezakt.

| | app/ | src/shared/ui/ | scripts/ | supabase/functions/ |
|---|---|---|---|---|
| aantal | 65 | 8 | 15 | 4 |
| langste | 557 | 70 | 221 | 115 |

⚠️ **Een eigen constante en geen tweede veld in `PLAFOND`.** Dat laatste zou de vorm van
een geëxporteerde constante veranderen die de bestaande tests als `{laag: getal}`
aanbieden. `beoordeel(vondsten, plafond, langste)` houdt beide aanroepvormen werkend, en
wie er een derde grootheid bij wil doet hetzelfde.

⚠️ **Nul is de juiste ondergrens.** Een laag zonder overtredingen heeft geen langste, en
`teKort` hoort dan af te gaan zolang het plafond hoger staat — precies zoals bij het
aantal.

## 3. De controle wees op zichzelf

De vier meldblokken zetten `hoofd()` over de vijftig regels, en `scripts/` ging van 15 naar
16. **De ratel werd rood op de commit die hem uitbreidde.** Dat is geen ongelukje maar het
bewijs dat hij werkt: een grendel die zijn eigen bestand niet haalt, leert je hem uit te
zetten. `hoofd()` is gesplitst in `meld()` en `toon()`.

## 4. De ijking

📏 Vijf gevallen, elk apart, met een gemeten plafond van 2 functies / 100 regels:

| geval | ok | teveel | teruim | teLang | teKort |
|---|---|---|---|---|---|
| 2 functies, langste 100 | ✅ | 0 | 0 | 0 | 0 |
| **zelfde aantal, langste 101** | ❌ | 0 | 0 | **1** | 0 |
| aantal daalt naar 1 | ❌ | 0 | **1** | 0 | 0 |
| aantal gelijk, langste zakt naar 80 | ❌ | 0 | 0 | 0 | **1** |
| aantal stijgt naar 3 | ❌ | **1** | 0 | 0 | 0 |

**Rij 2 is het gat.** Elke grootheid gaat onafhankelijk af, en geen mutatie zet er twee
tegelijk aan.

📏 En op de echte codebase: twee regels toegevoegd aan de functie van 557 →

```
app/  langste 559 regels, plafond 557
```

⚠️ Het **aantal** bleef daarbij op 65. Omdat de melding in volgorde kortsluit
(`teveel` → `teruim` → `teLang` → `teKort`), bewijst het feit dát `teLang` gemeld werd dat
de twee aantal-signalen leeg waren: **de oude, aantal-only controle zou hier groen zijn
geweest.**

📏 Drie mutaties op de test zelf: `teLang` uitzetten geeft precies de "langere
functie"-test, `teKort` uitzetten precies de "zákte"-test, en de langste helemaal niet
bijhouden geeft er drie — inclusief het geval dat een functie **op** de grens niet als
langste telt.

## 5. Wat dit niet is

- **Geen voorstel om `app/groep/beheer/[id].tsx` te splitsen.** Dat mag later; de grendel
  hoort er eerst te zijn, anders is splitsen een opruimactie die over drie maanden terug is.
- **Geen harde lintregel in `app/`.** De reden daarvoor staat ongewijzigd in de kop van
  het script: een regel die vijfenzestig keer rood staat, leer je uitzetten.
- **Geen som.** Het totaal aantal regels bínnen lange functies is óók gemeten (7845 in
  `app/`), maar een som beweegt bij elke splitsing en zegt weinig over de ergste functie.
  De langste is de grootheid waar de regel over gaat.
