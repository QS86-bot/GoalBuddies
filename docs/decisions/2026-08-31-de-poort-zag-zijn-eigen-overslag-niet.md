# De poort zag zijn eigen overslag niet

**Datum:** 31-08-2026
**Aanleiding:** QS8-239, gevonden bij het inhangen van `adviseur:controle` (QS8-235)
**Raakt:** `scripts/poort.mjs`, `tests/scripts/poort.test.ts`, twee proefscripts in `package.json`

## 1. Wat er stond

`poort.mjs` deelt elke stap in drieën in plaats van twee, en zijn eigen kop legt
uit waarom dat moet:

> ⚠️ **Eerst de overslag, en die staat bewust vóór de exitcode.**
> `functies:controle` en `register:controle` printen "OVERGESLAGEN" en geven
> daarna **exitcode 0**. Voor elke poort die alleen naar de exitcode kijkt, zijn
> ze dus groen terwijl ze niets gemeten hebben.

Die indeling zat in `beoordeel()`, en die functie was goed. Hij stond uitgebreid
onder test en deelde elke uitvoer correct in.

`draai()` gaf hem alleen die uitvoer niet:

```js
const uitvoer = execFileSync('npm', [...], { stdio: ['ignore', 'pipe', 'pipe'] });
return { code: 0, uitvoer };
```

`execFileSync` geeft bij een geslaagde afloop **alleen stdout** terug. `stderr`
komt er uitsluitend uit via `catch`, dus alleen als de stap rood is. En allebei
die controles schrijven hun `OVERGESLAGEN` bewust naar stderr — want, in hun
eigen woorden, *"op stdout leest 'overgeslagen' als 'gelukt'"*.

## 2. Aangetoond, niet beredeneerd

```
execFileSync bij exitcode 0 geeft terug: ""
spawnSync stderr: "x-controle: OVERGESLAGEN — geen sleutel\n"
```

In elke lokale poortrun zonder `.env` stonden `functies:controle` en
`register:controle` dus op ✓. De drieverdeling stond er, was getest, en kwam voor
de twee gevallen waarvoor hij geschréven is nooit aan.

## 3. Waarom geen enkele test dit zag

Regel 18, vraag 1: *waar knopen twee correcte onderdelen aan elkaar?*

| Onderdeel | Onder test | Klopte |
|---|---|---|
| `beoordeel()` | ja, uitgebreid | ja |
| `draai()` | **nee** | nee |

Dit is niet "een test bleef groen terwijl de belofte brak". Er wás geen test die
`draai()` kon raken. De belofte van dit bestand is niet "`beoordeel` deelt correct
in" maar "de poort meldt nooit groen over iets dat niet gemeten is" — en die
belofte hangt aan de naad tussen die twee.

⚠️ **De poort ís de grendel die op 28-08 is ingesteld** nadat PR #100 rood ging op
`klokgrens:controle`, met als les *draai álles en niet een greep eruit*. Je kon
sindsdien alles draaien en toch twee ongemeten controles als groen gerapporteerd
krijgen. Een grendel die zijn eigen categorie niet haalt, is de duurste soort:
hij vervangt de argwaan die je zonder hem wél had gehad.

## 4. Wat er nu staat

`draai()` gebruikt `spawnSync` en geeft stdout én stderr terug, ook bij exitcode
0. Een mislukt spawnen (npm niet gevonden) is rood en geen overslag: er is niets
gedraaid, maar het is ook geen bewuste overslag van de stap zelf.

⚠️ **De tests draaien echte subprocessen**, via twee `poort:proef:*`-scripts in
`package.json`. Een gemockte `spawnSync` zou hier niets toetsen: de bug zát in
welke stromen het echte subproces teruggeeft, en een mock geeft precies wat je
hem laat geven. Dat is dezelfde val als het onderdeel toetsen in plaats van de
naad.

Geijkt door `execFileSync` terug te zetten — precies die ene test wordt rood.

## 5. Wat dit níét afdekt

⚠️ Elke controle die tot nu toe groen was in een lokale run, was groen op **stdout
alleen**. Er is nagekeken of er nog een controle de overslagvorm op stderr
gebruikt; die is er niet. Maar dat is een controle op één patroon, niet op elke
manier waarop een script stil kan falen met exitcode 0.

## 6. En dezelfde val, dezelfde dag, voor de derde keer

Bij het inhangen van `adviseur:controle` viel `tests/scripts/adviseur-controle.test.ts`
om (een aparte fout — het script schond de `pathToFileURL`-conventie uit
`padvormen.test.ts`). Vitest toonde een diff met de regel

```
⚠ adviseur-controle: OVERGESLAGEN — geen SUPABASE_ACCESS_TOKEN
```

— de bróncode van het script, en dus exact de vorm waarop het patroon in ronde
twee verankerd was. De poort noemde een **rode** suite "ongemeten".

⚠️ **Geen enkel tekstpatroon lost dit op, en dat is de eigenlijke les.** Elk
patroon dat de échte melding vindt, vindt ook een citaat ervan — in een diff, een
fixture, een verwachting. Twee reparaties op rij waren scherpere patronen, en
allebei faalden op de volgende vorm van hetzelfde.

De grens ligt niet in de tekst maar in de stapsoort: **een testsuite kan geen
sleutel missen.** Alleen een controle kan zichzelf overslaan. `beoordeel()` neemt
daarom `soort` mee en past de overslag alleen toe op `soort === 'controle'`.

Dat een suite zonder database ongemeten heet, blijft: die route loopt via
`GEEN_DATABASE` en `heeftDatabaseNodig`, niet via de overslag, en staat apart
onder test.
