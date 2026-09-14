# De comment beloofde een transactie die er niet was

**14-09-2026 — QS8-466.**

## Wat er stond

Boven de migratielus in `scripts/schema-opbouwen.sh`:

> ⚠️ Elke migratie in zijn eigen transactie, precies zoals Supabase hem heeft
> toegepast.

En eronder een aanroep zonder `--single-transaction`. De migratiebestanden dragen
zelf geen `begin;`/`commit;`. In die vorm is elke **statement** zijn eigen
transactie, niet elk bestand.

## 📏 De meting, door de échte opbouw en niet door een losse psql-aanroep

Een migratie waarvan het eerste statement slaagt en het tweede omvalt, tijdelijk
in `supabase/migrations/` gelegd en `schema-opbouwen.sh` erop losgelaten:

```sql
create table public.ijk_qs8466 (id int);
select 1/0;
```

```
zonder --single-transaction   ->  opbouw exit 1,  ijk_qs8466 bestaat: 1
met    --single-transaction   ->  opbouw exit 1,  ijk_qs8466 bestaat: 0
```

⚠️ **Beide helften gemeten, en dat is niet overdreven.** Een "na" zonder "voor"
beantwoordt niet *is dit door mijn wijziging gekomen* — de les die `rls:dekking`
dit project kostte.

## Waarom het uitmaakt

`supabase db push` en de MCP `apply_migration` draaien elke migratie wél in een
transactie. Een half toegepaste migratie is op productie dus onmogelijk, en
lokaal was hij dat niet. Wie daarna iets op die database meet, meet **een schema
dat nergens bestaat** — terwijl deze hele opstelling bestaat om *"een database
met het schema van productie"* te zijn.

Concreet kwam het boven bij 0260: laat een omgevallen `validate constraint` de
`not valid` ervoor staan? Lokaal ja, op productie nee. Dat is geen detail als je
er een deployinstructie op baseert.

## Wat er rood werd van de vlag: niets

⚠️ Dit was de helft van het werk, en het antwoord is gemeten en niet aangenomen.
Er zijn statements die niet in een transactie kúnnen — `create index
concurrently`, `vacuum`, `alter type … add value` in oudere Postgres.

📏 De volledige map opgebouwd met de vlag: **270 migraties, nul omgevallen.** En
met `--dubbel` (de lus die `idempotent:controle` gebruikt) óók 270 × 2, nul
omgevallen — de fix wordt daar dus geërfd zonder dat de uitslag verandert.

⚠️ **Er is dus geen register met uitzonderingen, omdat er geen uitzonderingen
zijn.** Komt er ooit een migratie die niet in een transactie kan, dan valt de
opbouw luid om op dát bestand. Dat is de goede kant: een naamloze uitzondering
zou hier erger zijn dan een harde fout.

## De grendel, en wat hij bewust niet bewijst

`tests/scripts/schema-opbouwen-atomair.test.ts` leest de aanroep die de
migratiebestanden afspeelt en eist dat die `--single-transaction` (of `-1`)
draagt.

⚠️ **Statisch, en met reden.** De opbouw echt laten omvallen vraagt een Postgres,
en dan is de grendel die de opbouw bewaakt alleen te ijken mét die opbouw — de
vorm die CLAUDE.md afraadt: *een controle die je niet kunt voeden, kun je niet
ijken*. Dezelfde taakverdeling als bij `idempotent-controle`, waar het oordeel
los aangeboden wordt en de databasehelft met de hand gemeten is.

⚠️ **Wat hij dus niet bewijst:** dat Postgres de transactie ook echt terugrolt.
Dat is de handmeting hierboven. Wat hij wél bewijst is dat de aanroep de vlag
draagt — precies het verschil dat hier onopgemerkt bleef.

⚠️ Hij kijkt naar de regel die `"${BESTANDEN[@]}"` doorgeeft, niet naar het
bestand als geheel: een vlag op de aanroep van de steiger of het register telt
niet mee. Die vorm staat als eigen geval in de test.

## De ijking

| Mutatie | Uitslag |
|---|---|
| `--single-transaction` uit de echte aanroep halen | **rood** op `draait de migratieaanroep met --single-transaction` |
| de vorm van vóór QS8-466 los aangeboden | 1 klacht |
| de vlag op een ándere aanroep in hetzelfde bestand | 1 klacht |
| `--single-transaction` / `-1` op de juiste aanroep | 0 klachten |
| de lus helemaal weg | 1 klacht, en die zégt dat hij zijn onderwerp kwijt is |

⚠️ Dat laatste geval staat er omdat een verhuizing de gevaarlijkste beweging is
die er is: de test mag dan niet stil groen worden.

## Wat dit niet is

Geen wijziging aan `--dubbel` of `idempotent:controle` — die draaien op dezelfde
lus en erven de fix, en dat is hierboven gemeten in plaats van aangenomen.
