# Een drop in commentaar pleit niets vrij — QS8-570

**21-09-2026.** `tests/migraties/idempotentie.ts` is de grendel onder onwrikbare
regel 20. `bezwarenIn()` meldt elke `create` die bij een tweede ronde op een
bestaand object stuit — tenzij het bestand het object eerder dropt met
`if exists`.

Die drop werd gezocht in bron die alléén van `--`-commentaar ontdaan was. Een
`drop function if exists f(uuid)` **in een blokcommentaar** pleitte dus een echte
`create function f(uuid)` vrij, en de grendel zweeg.

## 📏 De meting, met de controlerij eerst

| invoer | vóór | ná |
|---|---|---|
| `create function` zónder enige drop | 1 — gemeld | 1 |
| met een échte `drop … if exists` ervoor | 0 — gedekt | 0 |
| met die drop in een blokcommentaar | **0 — gedekt** ← het gat | **1** |
| met die drop op een `--`-regel | 1 — gemeld | 1 |
| met die drop als tekst in een stringliteral | — | **1** |

⚠️ **De eerste rij is het punt.** Zonder haar bewijst de nul van rij 3 niets: een
grendel die nergens op aanslaat geeft óók nul. Het issue zelf liep precies daarin
vast — de eerste poging demonstreerde het gat op migratie 0293, waar mutatie én
controle allebei nul gaven omdat die migratie `create or replace` gebruikt en dus
sowieso vroeg terugkeert. De nul kwam ergens anders vandaan.

## De kop beloofde al wat de code niet deed

De regel boven de functie luidde: *"Haalt commentaar **en tekst uit
stringliteralen** weg, met behoud van regelnummers."* De code deed één ding —
knip vanaf de eerste `--` — en dat betekende drie tekorten tegelijk:
blokcommentaar bleef staan, stringliteralen bleven staan, en een `--` **binnen**
een literal knipte juist wél de rest van de regel weg.

⚠️ Zelfde klasse als QS8-466, waar een comment een transactie beloofde die de
vlag niet leverde: **een belofte in de kop leest als een eigenschap van de
code.** De reparatie maakt de code waar wat er al stond, in plaats van de zin bij
te stellen.

## ⚠️ Waarom een scanner en niet een tweede knip

Een `/*`-knip erbij die niets van quotes weet, verplaatst het gat alleen: dan
knipt een blokopener **in een stringliteral** de rest van het bestand weg, en dat
faalt **open** op alles wat erna komt. Erger dan wat er stond.

Postgres nest blokcommentaar bovendien, anders dan C. Tellen tot de eerste
sluiter sluit een blok te vroeg en leest de staart als code — ook open.

`schoneBron()` loopt daarom teken voor teken, met dezelfde redenering als
`code_zonder_commentaar()` in migratie 0292. Die code is SQL en niet te
hergebruiken; de redenering wel.

Wat hij doet:

| vorm | behandeling |
|---|---|
| `--` tot regeleinde | spaties |
| `/* … */`, genest | spaties |
| `'…'`, met `''` als ontsnapping | inhoud spaties, quotes blijven |
| `$tag$ … $tag$` | inhoud spaties, begrenzers blijven |
| `"…"` | **blijft heel** — dat is een objectnaam, geen tekst |

⚠️ Elke regel houdt zijn lengte en elke `\n` blijft staan, want een bezwaar
draagt een regelnummer.

⚠️ De gequote identifier is de enige die heel blijft, en dat is een keuze: de
tekst ín een literal wordt niet uitgevoerd, een naam tússen dubbele quotes wel.

## 📏 Wat het op de echte boom doet: niets

Vóór en ná de wijziging meldt de controle **nul** bezwaren over alle 297
migratiebestanden. Dat is de belangrijkste meting van deze reparatie: een
strengere zeef die literaalinhoud leegt en dollar-quotes herkent, had best een
vals alarm kunnen opleveren. Hij doet dat niet.

📏 Het gat was ook nog niet geraakt: nul migraties dragen vandaag een
`drop … if exists` ín een blok. Wat het dichthield was een **gewoonte** — de
koppen van dit project staan in `--`-regels — en geen grendel. En juist die kop
draagt het ROLLBACK-PAD, dat per definitie drops bevat: wie ooit een kop als blok
schrijft, pleit zijn eigen migratie vrij.

## Geijkt — zes mutaties, elk één rood

| mutatie | welke toets viel om |
|---|---|
| blokcommentaar blijft staan (de bug zelf) | *de drop in een blok pleit hem níet vrij* + *nest blokcommentaar* |
| blok sluit op de eerste sluiter | *nest blokcommentaar* |
| stringliteralen blijven staan | *als tekst in een literal* + *een `--` binnen een literal* |
| dollar-quotes niet herkend | *leegt de inhoud van een dollar-quote* |
| regeleindes gaan verloren in commentaar | *houdt het aantal regels gelijk* |
| een gequote identifier wordt óók geleegd | *laat een gequote identifier met rust* |

## ⚠️⚠️ En één toets was eerst rood op een scanner die het goed deed

📏 De nesting-toets viel om, en niet omdat de code fout was: hij luidde
`expect(uit).not.toContain('a')`, en de overgebleven code was
`create table t (id int)` — met de **a** van `table`. De assertie sloeg aan op
iets anders dan ze beloofde.

Dat is dezelfde vorm die dit project vaker betaalt, nu in een assertie in plaats
van in een grendel: **een losse letter toetst niet wat een woord toetst.** De
toets gebruikt nu onderscheidende woorden (`buiten`, `binnen`).
