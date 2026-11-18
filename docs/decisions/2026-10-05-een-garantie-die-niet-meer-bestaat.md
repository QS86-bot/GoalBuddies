# Een garantie die niet meer bestaat, en een controle die haar nog telt

**Datum:** 05-10-2026 · **Issue:** QS8-639 · **Raakt:** `scripts/eenrij-controle.mjs`,
`tests/scripts/eenrij-controle.test.ts`, `tests/rls/eenrij-garanties.test.ts`

## Waar dit vandaan komt

QS8-605 bouwde `eenrij:controle`: elke `.single()` en `.maybeSingle()` draagt een
garantie dat er hoogstens één rij terugkomt, en de garanties komen uit
`supabase/migrations/`. Bij het nameten van dat issue is de lijst die het script
uit de tekst las naast `pg_index` van een database uit alle 301 migraties gelegd.

## De meting

📏 `garantiesUit()` leverde **71** garanties. **Drie** bestonden niet in de
database (de drie views zijn de bekende erfenis, geen bevinding):

| garantie uit de tekst | waarom ze niet bestaat |
| -- | -- |
| `points_ledger (user_id, reason, ref_type, ref_id)` met predicaat, twee varianten | `points_ledger_dedupe_idx` is in 0094 en 0266 gedropt en onder dezelfde naam opnieuw aangemaakt mét `ronde` |
| `opslag_dagtellers (bucket_id, sleutel, soort)` | 0234 hernoemt de tabel naar `dagtellers` én de kolom `bucket_id` naar `domein` |

De inventaris van wat er in de migraties aan `drop` en `rename` staat (zonder
commentaar, met de gedeelde SQL-knip): 8 × `drop index`, 181 × `drop constraint`
(waarvan één op een unieke constraint, `completions_id_gebruiker_uniek`),
1 × `rename to`, 1 × `rename column`, 4 × `drop column`, en nul × `drop table`,
`rename constraint` en `alter index … rename`. Het issue noemde `drop index` en
`rename`; de kolomhernoeming en de `drop column` bleken er ook bij te horen.

Geen van de 38 aanroepen leunde op een van de drie, dus vandaag was de uitslag
juist. Dat was geluk en geen eigenschap.

## Wat er is besloten

Het issue gaf twee wegen: de migraties afspelen, of tegen de echte `pg_index`
toetsen. **Het is allebei geworden, en ze doen verschillend werk.**

1. **Afspelen in de controle zelf.** `garantiesUit()` verwerkt de migraties als
   gebeurtenissen op volgorde van voorkomen: `create` (tabel en index), `drop
   index`, `drop constraint`, `drop column`, `rename to`, `rename column` en
   `add constraint … unique|primary key`. Een garantie draagt de naam waaronder
   het schema haar kent, want een `drop` zoekt op naam. De controle blijft zo
   statisch: hij draait zonder database, in de `repo`-baan van CI en in een
   cloudsessie zonder stack.
2. **Een databasetoets die het afspelen naast `pg_index` legt**
   (`tests/rls/eenrij-garanties.test.ts`). Het afspelen is tekst lezen, en tekst
   lezen is precies wat hier misging. De database is de enige die weet wat
   Postgres ervan maakt, en wat het script níet volgt (`drop table`,
   `rename constraint`) ziet alleen zij.

⚠️ **De databasetoets toetst één richting, en dat is met opzet.** Een garantie
die het script kent en de database niet, laat een aanroep als gedekt doorgaan
die dat niet is: dat is het gevaar. Een index die de database kent en het script
niet, maakt hooguit een aanroep tot bevinding die het niet hoeft te zijn: de
controle faalt dicht. Die richting ook eisen zou de toets rood maken op vormen
die het script bewust niet leest (een expressie-index, een predicaat dat het niet
snapt), en hem leren overslaan.

⚠️ **Een view wordt alleen overgeslagen als de database hem als view kent.** Een
relatie die in de database helemaal niet bestaat is geen view maar een spook.

## De ijking

Stand ervóór: `tests/scripts/eenrij-controle.test.ts` 27 groen. Daarna 20 nieuwe
toetsen (47), en twaalf mutaties op het script, één per grendel, teruggezet en met
`diff -q` bevestigd:

| mutatie | rood |
| -- | -- |
| gebeurtenissen niet op positie sorteren | 3: o.a. *leest de volgorde binnen één bestand* |
| `dropNaam` doet niets | 9: o.a. de vervangen-index-toets en alle `drop constraint`-toetsen |
| `hernoemTabel` doet niets | 2: *volgt een hernoemde tabel* en de echte migraties |
| `hernoemKolom` doet niets | 2: *volgt een hernoemde kolom, ook in het predicaat* en de echte migraties |
| `dropKolom` doet niets | 1: *haalt elke garantie weg waar een gedropte kolom in zit* |
| een constraint-drop zoekt in alle tabellen | 1: *laat een drop van een constraint op een andere tabel met rust* |
| schemaprefix niet gefilterd | 1: *laat een index in een ander schema met rust* |
| standaardnaam `_pkey` of `_key` verkeerd | 2 en 1 |
| een tweede create onder dezelfde naam telt dubbel | 1 |
| `add constraint` niet gelezen | 1 |
| de commentaarknip weg (zie hieronder) | 2: *leest het rollback-pad in een commentaar niet als code* en *leest een index in een commentaar niet als garantie* |

De databasetoets is apart geijkt tegen een lokale stack (Postgres 16, 301
migraties), met dezelfde stappen uitgezet: `dropNaam` laat
`points_ledger|reason,ref_id,ref_type,user_id|partieel` zien, `hernoemTabel`
`opslag_dagtellers|bucket_id,sleutel,soort|heel`, `hernoemKolom`
`dagtellers|bucket_id,sleutel,soort|heel`. Elke stap noemt zijn eigen spook bij
naam. Na de wijziging: **69** garanties uit de tekst, **0** die de database niet
heeft, tegen 67 unieke indexen in de database.

## Het commentaar gaat eruit

⚠️ Bij het nalezen van de eigen diff bleek `garantiesUit()` de **ruwe** tekst te
lezen. Elke migratie draagt in zijn kop een rollback-pad als commentaar, vol
`drop index` en `create unique index`. Gelezen als code haalt zo'n regel een echte
garantie weg of voegt er een toe. 📏 Vandaag verandert het niets: 69 garanties
met én zonder de knip, dus dit is een gat dat nog leeg is. De gedeelde SQL-knip
(`scripts/zonder-sql-commentaar.mjs`) staat er nu voor, zoals `knip:controle` van
elk script eist dat SQL leest.

## Een eerlijke beperking van de echte `points_ledger`

Het issue vroeg dat *de oude `points_ledger`-variant een aanroep zonder `ronde`
ongedekt laat*. Dat is gebouwd, maar met een fixture en niet met de echte tabel.

📏 Beide oude varianten hebben een predicaat dat `predicaatUit()` niet leest
(`ref_id is not null`, en `ref_id is not null and reason <> 'review_given'`). Een
index met een onleesbaar predicaat telt **nooit** als garantie. Een aanroep op de
echte `points_ledger` was dus ook vóór deze reparatie ongedekt, en een toets op
dat geval zou groen blijven met en zonder het afspelen: regel 18, vraag 3. De
toets gebruikt daarom een index met een leesbaar predicaat (`where soort = 'x'`),
waar de uitkomst aan precies het afspelen hangt. Dat de echte tabel in de
afgespeelde lijst géén variant zonder `ronde` meer heeft, staat apart onder toets.

## Wat dit niet is

- **Geen volledige SQL-parser.** Een statement binnen een `do $$ … if … then`-blok
  telt als uitgevoerd. Dat is wat een database doet die uit de map is opgebouwd,
  maar niet wat een database doet die in een andere toestand begon.
- **Geen volgen van `drop table`, `rename constraint` en `alter index … rename`.**
  Ze komen niet voor. Komt er een, dan is de databasetoets de eerste die het ziet,
  en dan hoort hij hier te worden toegevoegd.
- **Geen uitspraak over `.rpc()` en de view-diepte.** Die staan in het document
  van QS8-605 en zijn niet veranderd.

## Aannames

- **De standaardnamen van Postgres** (`<tabel>_pkey`, `<tabel>_<kolommen>_key`)
  gelden zonder de afkapping op 63 tekens. Geen enkele tabel in dit schema komt
  daar in de buurt; de databasetoets zou het zien.
- **De databasetoets draait in de database-baan van CI.** Hier gemeten tegen een
  lokale stack, niet in CI zelf.
