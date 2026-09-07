# Een "flake" was een ontbrekende sleutel — QS8-303

**07-09-2026.** Migratie 0174. Vervolg op niets; gevonden tijdens QS8-299.

## Wat er gebeurde

`npm run poort` gaf op 06-09 twee rode gevallen in `tests/rls/epic9.test.ts`:

```
verwacht  ['confirmed', 'triggered', 'posted']
gekregen  ['confirmed', 'posted', 'triggered']
```

Een losse run van hetzelfde bestand op dezelfde database was groen. Dat is de
vorm waarin een bevinding zich als flake voordoet, en het was er geen.

## De meting

`commitment_events.created_at` had `now()` als default. In Postgres is `now()`
gelijk aan `transaction_timestamp()` — constant binnen één transactie:

```sql
begin;
create temp table t(a timestamptz default now(),
                    b timestamptz default clock_timestamp());
insert into t default values; select pg_sleep(0.02); insert into t default values;
select count(distinct a) as nu, count(distinct b) as klok from t;
-- nu = 1, klok = 2
```

Aan één UPDATE van `commitments` hangen twee AFTER-triggers die allebei in
`commitment_events` schrijven — `commitments_audit` (`triggered`) en
`commitments_systeembericht` (`posted`). AFTER-triggers vuren in naamvolgorde,
dus de schríjfvolgorde lag vast. Alleen kreeg elke rij daarna exact dezelfde
`created_at`, en `commitment_events.id` is een `gen_random_uuid()`. `order by
created_at` had niets om op te sorteren en Postgres mocht kiezen.

## Waarom het geen testprobleem was

`fetchCommitmentSpoor()` sorteerde precies zo. De eigenaar van een commitment
kon in zijn eigen auditspoor "geplaatst in de groep" bóven "verschuldigd
geworden" zien staan — in het spoor waar domeinregel 6 (append-only, corrigeren
via een correctie-record) op leunt. De rode test was het enige signaal dat er
was, en dat signaal was zwak genoeg om weg te klikken.

⚠️ **Dat is de les die blijft.** Een test die *soms* rood is, meet iets dat
*soms* waar is. "Flake" is de naam die je aan een meting geeft als je hem niet
verklaart. Onwrikbare regel 19 zegt het al voor bevindingen van agents —
verifieer zelf — en het geldt net zo hard voor je eigen suite.

## De keuze: een identity-kolom, niet `clock_timestamp()`

`alter column created_at set default clock_timestamp()` is één regel en lost het
geval van vandaag op. Twee redenen om het niet zo te doen:

1. **Het is een kans en geen garantie.** `timestamptz` telt in microseconden.
   Twee inserts in dezelfde microseconde zijn vandaag onwaarschijnlijk en op
   snellere hardware minder onwaarschijnlijk. "Onwaarschijnlijk" is precies het
   soort aanname dat dit project al eens een dag gekost heeft.
2. **Een wandklok kan achteruit.** NTP zet hem terug; dan draait de volgorde van
   twee gebeurtenissen om.

`seq bigint generated always as identity` kan niet knopen en niet achteruit.
`created_at` houdt zijn eigen betekenis — *wanneer dit gebeurde* — en `seq`
draagt de volgorde. Twee dingen, twee kolommen.

⚠️ **`always` en niet `by default`.** De client heeft vandaag geen INSERT-recht
op deze tabel, maar dat is een toestand en geen grendel — zie 0172, waar precies
dat verschil de belofte kostte.

## Wat de security-review erbij zette

Drie bevindingen, alle drie zelf nagemeten voordat ze verwerkt werden
(onwrikbare regel 19).

### De eerste sequence in dit schema kwam open binnen

📏 `public` had tot deze migratie **nul** sequences. Een identity-kolom brengt de
eerste mee, en Supabase's `alter default privileges` deelt hem net zo hard uit
als een tabel of een functie. Gemeten vlak na de eerste versie:

```
commitment_events_seq_seq | anon USAGE=t | auth USAGE=t
                          | auth UPDATE=t | anon SELECT=t
```

`UPDATE` op een sequence is `setval()`. Wie de teller terugzet, laat de volgende
triggerschrijving botsen op de unieke index óf een lagere `seq` hergebruiken — en
dan draait het auditspoor om. Precies de belofte die deze migratie komt vestigen.
Sequences kennen geen RLS, dus de policy doet hier niets.

⚠️ **Onwrikbare regel 4 in een objectsoort die deze codebase nog niet kende.** Er
is vandaag geen pad van een REST-client naar `setval()` — maar dat is een
toestand en geen grendel, en dat is letterlijk het argument waarmee deze migratie
`always` boven `by default` koos. Dezelfde redenering hoort te gelden voor het
onderdeel dat ze zelf introduceert. Tak 5 van `volgorde_bewaking()` maakt er een
grendel van.

### De migratie botste met zichzelf

📏 De vulling stond buiten de `do`-grendel, en zodra `seq` een identity is
weigert Postgres een `update` op die kolom **bij het plannen** — ook bij nul
rijen:

```
ERROR:  column "seq" can only be updated to DEFAULT
DETAIL:  Column "seq" is an identity column defined as GENERATED ALWAYS.
```

Dat valt niet in de tweede klasse die onwrikbare regel 20 met rust laat (een
botsing met een *latere* migratie). En de grendel in
`tests/migraties/idempotentie.ts` kon het niet zien: die leest de tekst van een
migratie en kent regels voor `create`-statements, niet voor een `update` op een
identity-kolom.

### `always` doet minder dan de kop beweerde

📏 Gemeten met een echte `set role authenticated` en alleen INSERT+SELECT:

```sql
insert into t (seq, x) overriding system value values (99, 'gespooft');
-- INSERT 0 1, seq = 99
```

`OVERRIDING SYSTEM VALUE` zet de kolom gewoon. `always` blokkeert alleen de kale
insert en elke UPDATE. **De dragende grendel is tak 4** — geen client mag een
schrijfrecht op deze kolom hebben — en `always` is de tweede laag.

⚠️ Twee tegenstrijdige uitspraken in één bestand over welke grendel de belofte
draagt, is precies hoe een tak later als overbodig wordt opgeruimd. Dit is de
derde keer vandaag dat de duurste fout niet in de code stond maar in de kop
ernaast.

## Waarom alleen deze tabel

`src/` sorteert op negen plekken op `created_at`. Acht dragen deze fout niet, en
dat is gemeten:

| Tabel | Waarom niet |
|---|---|
| `group_join_requests`, `goal_interviews`, `deadline_requests`, `weekly_goals`, `commitments`, `completion_approvals` | één rij per gebruikershandeling — nooit twee in dezelfde transactie |
| `weekly_plan_steps` | sorteert eerst op `order_index` en daarna nog eens in JS (`opVolgorde()`) |
| `chat_messages` (0024, 0059) | sorteert op `created_at desc, id desc`, dus bepaald |

**De vraag bij een nieuwe tabel is niet "staat er een `created_at` op"** maar:
*kunnen hier twee rijen uit één transactie komen die een mens in volgorde
leest?* Alleen dan hoort hij in `volgorde_register()`.

## Drie grendels, drie plekken

| Grendel | Waar | IJking |
|---|---|---|
| De sleutel bestaat en kan niet knopen | `volgorde_bewaking()`, 4 takken — `tests/rls/auditspoor-volgorde.test.ts` | A t/m D, elk apart |
| Het register is niet leeg en draagt redenen | dezelfde test | E en F |
| De leesvolgorde gebruikt de sleutel | `tests/beloftes/auditspoor-volgorde.test.ts` | A t/m C |

⚠️ **Twee keer is er tijdens het ijken een assertie verhuisd**, allebei om
dezelfde reden: één mutatie maakte twee tests rood, en dan isoleert geen van
beide nog iets.

* De grantcontrole stond als losse test naast de bewaking. Mutatie A — de kolom
  weghalen — maakte hem mee rood, want `has_column_privilege` werpt op een kolom
  die niet bestaat. Hij is tak 4 van de bewaking geworden.
* "Sorteert nergens op `created_at`" en "sorteert overal op `seq`" stonden als
  twee tests. Het is één eigenschap, twee keer opgeschreven. Nu één assertie met
  twee soorten bevinding.

⚠️ **En één ijking wérkte eerst niet.** Het wegknippen van commentaar in de
belofte-test bewaakte aantoonbaar niets: er stond nergens commentaar met een
`.order('created_at', …)` in een keten. De regel in `fetchCommitmentSpoor()` die
de oude aanroep citeert, is daarom blijven staan — hij houdt de ijking waar.
Dezelfde valkuil als bij `tekst:controle`.
