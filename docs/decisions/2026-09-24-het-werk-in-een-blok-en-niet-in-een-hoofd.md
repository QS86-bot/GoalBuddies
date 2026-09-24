# Het werk in een blok, en niet in een `hoofd()`

**Datum:** 24-09-2026
**Issue:** QS8-608 (gemeten tijdens QS8-599)
**Status:** gebouwd
**Raakt:** tien scripts in `scripts/`, `tests/scripts/hoofdwacht.test.ts`

## 1. Wat er aan de hand was

📏 Tien scripts in `scripts/` deden hun werk op **moduleniveau**, dus zodra je ze
importeerde:

| soort                 | scripts                                                                                              | wat er gebeurt                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| schrijft naar de repo | `sync-edge-shared`, `maak-iconen`                                                                    | 19 bestanden gekopieerd, zes PNG's geschreven |
| draait een controle   | `migraties-controle`, `migratieregister-uitlijnen`                                                   | uitslag geprint                               |
| `process.exit()`      | `auth-urls`, `db-dump`, `db-types`, `sentry-proef`, `functies-controle`, `migratieregister-controle` | proces beëindigd                              |

⚠️⚠️ **Die laatste zes zijn de gevaarlijkste vorm, en erger dan werpen.** Een
`throw` kun je vangen; een `process.exit()` tijdens een import beëindigt het
proces van wie importeert, zonder melding. Een toets of een script dat er één
functie uit wil hergebruiken, gaat stil dood.

## 2. De vorm: een blok en geen functie

De voor de hand liggende reparatie is het werk in een `async function hoofd()`
zetten en die achter de main-guard aanroepen. **Dat is gebouwd, gemeten, en
weer teruggedraaid.**

📏 Met de functievorm kwamen er **acht** `hoofd()`-functies boven de vijftig
regels uit — `migraties-controle` op 329, `sentry-proef` op 167 — en liep
`regel15:controle` van **15 naar 21** tegen een plafond van 15. Dat plafond mag
in dit project alleen na overleg omhoog, en dat is terecht: een functie van 329
regels is geen vooruitgang op een module van 329 regels.

De vorm die dat niet kost is een **blok**:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  …het werk…
}
```

Geen nieuwe functie, dus `max-lines-per-function` telt niets; `const` en `let`
zijn blokgebonden, dus wat erbuiten leeft moet erbuiten blijven staan — en de
linter zegt het als dat misgaat.

📏 **Dat top-level `await` binnen zo'n blok mag, is nagemeten en niet
aangenomen**, met een proefbestand: het blok draait, de `await` werkt, de
`process.exit(3)` erin geeft exitcode 3, en bij import zonder `argv[1]` gebeurt
er niets.

## 3. Wat de blokvorm wél kost

⚠️ Een blok voegt een **nestingniveau** toe, en dat brak `max-depth` op vier
plekken in twee scripts. Daar zijn vier functies uit geëxtraheerd, elk met in
zijn kop waarom hij los staat:

| script               | functie                                 | wat het was                                                |
| -------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `sync-edge-shared`   | `kopieerBestand`, `meldControleUitslag` | de binnenste kopieerlus en de `--check`-uitslag            |
| `migraties-controle` | `gatenIn`, `kopVan`                     | de gatenzoeker en het commentaarblok bovenaan een migratie |

Dat is de eerlijke prijs, en hij is lager dan acht lange functies: vier kleine
functies met een naam zijn winst, geen schuld.

## 4. Hoe de gelijkheid gemeten is

Per script de volledige uitvoer én de exitcode, vóór en ná: **alle tien
byte-identiek**, vier op exit 1 en zes op 0.

⚠️⚠️ **En dat "op zijn eigen plek" is geen detail.** De eerste vergelijking
draaide de oude versie vanuit een map in `/tmp`, waar zijn relatieve paden niet
kloppen. 📏 Uitslag: zes valse verschillen, waaronder vier scripts die "exit 1
in plaats van 0" leken te geven. **Het instrument was stuk, niet de code.**
De goede vorm is `git stash`, meten, `git stash pop` — de oude versie op zijn
eigen pad.

⚠️ Een eerdere meting in dezelfde ronde maakte de spiegelfout: `node script.mjs
2>&1 | head -1` geeft de exitcode van `head` en niet van het script. Alle tien
leken toen op 0 te staan. **Meet een exitcode nooit door een pijp.**

## 5. Wat de grendel nu bewaakt

De toets van QS8-599 selecteerde alleen scripts **mét** een main-guard — een
veiligheidsgrens, want de tien deden toen nog iets. Die grens is nu weg, en dat
moest ook: zolang hij er stond, viel een **nieuw** script zonder guard buiten de
meting. 📏 De toets importeert nu alle **105** en eist dat er niets geworpen en
niets geprint wordt.

⚠️ **De restrisico verhuist mee en blijft opgeschreven**: zet iemand werk op
moduleniveau in een nieuw script, dan draait dat werk hier één keer. De toets
wordt er luid rood van, maar ná de handeling.

## 6. De ijking

Stand ervóór gemeten: **3 groen, 0 rood**.

| #   | Mutatie                                     | Wat er rood werd                                                                   |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | de guard weg bij `sync-edge-shared`         | _geen enkel script werpt of print bij import_ — met de kopieerregels in de melding |
| 2   | de guard weg bij `db-dump`                  | idem                                                                               |
| 3   | de zeef zoekt een extensie die niet bestaat | _vindt genoeg scripts dat een lege uitkomst iets betekent_                         |

⚠️ **Mutatie 2 is er met opzet een die nergens met naam in de toets staat.** Bij
de eerste opzet — selectie op de main-guard — maakten mutatie 1 en 2 alleen een
toets met een hárdgecodeerde namenlijst rood, en de inertheidstoets bleef groen:
zonder guard werd het script immers niet geïmporteerd. Dat is precies het gat
dat §5 dichtte, en het kwam boven doordat de ijking naar _welke_ toets omviel
keek en niet naar _dát_ er een omviel.

⚠️⚠️ **En één keer is er werk verloren gegaan.** Na het verbreden van de
selectie is er geijkt zónder eerst te committen, en `git checkout --` bij het
terugdraaien van een mutatie wiste die wijziging. Dezelfde valkuil als eerder
deze ronde, en dezelfde les: **commit vóór je ijkt** — ook als je vijf minuten
geleden al gecommit hebt.

## 7. Stand

- `npm run poort`: niets rood; 25 controles ongemeten.
- 📏 **Nul** scripts in `scripts/` doen nog iets bij import, tegen tien ervoor.
- `regel15:controle`: `scripts/` op **15**, precies het plafond — de ratel is
  niet aangeraakt.
- Alle tien byte-identiek in uitvoer en exitcode.
