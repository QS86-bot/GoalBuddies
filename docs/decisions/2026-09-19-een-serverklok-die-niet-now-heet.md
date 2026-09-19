# Een serverklok die niet `now()` heet

**19-09-2026 — QS8-558, migratie 0292**

## Waar dit vandaan komt

Bij het nameten van rij 603 van `docs/ENGINEER-REVIEW.md` ("Het dagplafond leunt
op `created_at`", Middel, 07-09-2026). De belofte van die rij is dat het
etmaalvenster van een dagplafond op een kolom rust die de client niet kan
verzetten — anders is het plafond met één veld in de body weg, precies zoals dat
bij `weekplanstappen_over()` en `dagafvinkingen_over()` al eens gemeten is
(QS8-295).

📏 **Die belofte houdt.** Gemeten op stand 0291: achttien `*_dagplafond`-triggers,
en geen enkele vensterkolom is voor `anon` of `authenticated` te schrijven.

Wat er niet klopte is waar de belofte op leunde.

## 1. De rij noemt `created_at`, en dat is niet de enige vensterkolom

📏 De achttien vensters rusten op vier verschillende dingen:

| vorm | aantal | waar het venster op rust |
|---|---|---|
| `created_at > now() - interval '1 day'` | 14 | `created_at` |
| `begrens_voltooiingen` | 1 | `completions.submitted_at` |
| `begrens_doelkoppelingen` | 1 | `goal_group_links.linked_at` |
| `tel_dagteller()` | 2 | géén rijkolom — een teller in `dagtellers` |

De rij schrijft voor dat je nakijkt of **`created_at`** servergestempeld is. Wie
dat doet, mist er twee. Dat is de klasse van QS8-414: *een regel die je met de
hand handhaaft, handhaaf je op de vorm die je toevallig intypt.*

⚠️ En de voorwaarde die de rij draagt — *wordt zwaarder als er een tabel bij komt
die een dagplafond krijgt zonder dat iemand nakijkt* — is sinds 07-09 **tien keer
ingetreden**: acht bij het schrijven, zestien op 09-09, achttien vandaag. Tien
keer heeft iemand het goed gedaan. Dat is diligentie, en diligentie is geen
grendel.

## 2. De grendel eronder keek naar de spelling van een default

`tijdstempel_bewaking()` (QS8-299, 0173) is de énige mechanische grendel onder
die belofte, en hij is kolomnaam-onafhankelijk — dat deel was goed. Maar hij
selecteerde op `column_default like '%now()%'`.

📏 Gemeten op een wegwerptabel met acht `timestamptz`-kolommen:

| default | zag de oude bewaking hem |
|---|---|
| `now()` | ✅ ja |
| `timezone('utc', now())` | ✅ ja |
| `CURRENT_TIMESTAMP` | ❌ nee |
| `transaction_timestamp()` | ❌ nee |
| `statement_timestamp()` | ❌ nee |
| `clock_timestamp()` | ❌ nee |
| een eigen `stable`-functie `mijn_klok()` | ❌ nee |
| `'2020-01-01T00:00:00Z'` (constante) | ❌ nee, en terecht |

⚠️⚠️ 📏 **En `select now() = transaction_timestamp()` geeft `t`.** `now()` *is*
`transaction_timestamp()`; `CURRENT_TIMESTAMP` is de SQL-standaardspelling van
datzelfde. Twee van die vijf blinde vlekken waren dus dezelfde functie onder een
andere naam, en Postgres normaliseert ze niet — `pg_get_expr` drukt af wat er
getypt is.

De bewaking meldde dan **nul bezwaren omdat ze niet gekeken had**, niet omdat er
niets was. Dezelfde vorm als QS8-412 en als `rls:dekking`: een instrument dat een
neveneffect van zijn eigen aanroep leest en dat als eigenschap van het werk
rapporteert.

## Wat er gebouwd is

**`serverklok_default(oid, smallint)`** leest de **parseboom** van de default in
plaats van zijn tekst: roept hij een `stable` of `volatile` functie aan, dan
wordt de waarde bij het invoegen bepaald. Een `immutable` default is een
constante en draagt geen grendel.

⚠️ De `SQLVALUEFUNCTION`-tak is niet overbodig: `CURRENT_TIMESTAMP` is in
Postgres 16 geen functieaanroep maar een eigen knooptype, dus er staat geen
`:funcid` in de boom om op te joinen. 📏 Zonder die tak komt precies de kolom
waar dit issue mee begon er nog steeds doorheen (mutatie G).

**`dagplafondvenster_bewaking()`** toetst de belófte in plaats van een eigenschap
van een onderdeel: voor elke `*_dagplafond`-trigger zoekt hij de kolom op waar
zijn venster op rust, en meldt het zodra `anon` of `authenticated` die kan
schrijven. Vier takken — onleesbare vorm, kolom niet op deze tabel, kolom
schrijfbaar, tellertabel schrijfbaar.

⚠️⚠️ **Tak 1 is de helft die het zwaarst weegt.** Een `begrens_*`-functie waarin
geen van beide vormen te vinden is, is een **bezwaar** en geen stilte. Een
grendel die groen staat omdat hij zijn invoer niet begreep, bewaakt niets.

## Wat `pg_depend` niet kan, zodat de volgende het niet hoeft te proberen

📏 Een afhankelijkheid van `pg_attrdef` naar `pg_proc` is **geen** structurele
uitweg: ingebouwde functies zijn *pinned*, dus een default die `now()` aanroept
legt niets vast. Gemeten op alle acht testkolommen: `false`, `now()` zelf incluis.

## De gemeten grens van de nieuwe vorm, en hij valt de veilige kant op

📏 `(date '2020-01-01')::timestamptz` wordt als serverklok geteld, want
`date → timestamptz` is `stable`: de uitkomst hangt van `TimeZone` af. Dat is een
constant moment en geen klok, dus een vals alarm — het eist dan dat die kolom
dicht staat, en dat is strenger dan nodig in plaats van losser.
📏 `'2020-01-01'::text::timestamptz` en `'epoch'::timestamptz` worden wél met rust
gelaten. Geen van de drie vormen komt in dit schema voor.

## Wat dit vandaag aan de uitslag verandert: niets

📏 Gemeten op 0291: **49 van de 58** `timestamptz`-kolommen dragen een
serverklok-default, en **alle 49** werden ook door de oude `like '%now()%'`
gevonden. Deze codebase spelt hem overal `now()`. Oude vorm: 0 bezwaren. Nieuwe
vorm: 0 bezwaren.

**Dat hoort er te staan.** De winst is prospectief — hij zit in de spelling die
nog niemand getypt heeft. Dat is geen verzonnen toekomst: `0176` stelt
`alter column created_at set default clock_timestamp()` in zijn eigen kop voor.

## Wat de ijking opleverde en niet voorspeld was

Zes mutaties, elk op de echte database en teruggerold. Twee ervan vielen anders
uit dan gedacht, en dat is het leerzame deel.

📏 **A en B gaf ik op 1 rood en ze waren allebei 2.** `todo_items.created_at` en
`completions.submitted_at` dragen allebei een `now()`-default, dus
`tijdstempel_bewaking()` ving ze zélf al af. Twee van mijn zes mutaties voerden
hun geval dus door een pad dat een éérdere grendel afvangt — precies wat CLAUDE.md
bij regel 18 verbiedt, en het maakte die twee ijkingen waardeloos als bewijs voor
de nieuwe bewaking.

📏 **Mutatie E is er daarna bij gekomen en die isoleert wél**: een dagplafond op
een kolom zónder serverklok-default, client-schrijfbaar. Voor
`tijdstempel_bewaking()` is zo'n kolom onzichtbaar — die eist een niet-immutable
default — en dan blijft er precies **1 rood** over. Dát getal is het bewijs dat
`dagplafondvenster_bewaking()` iets draagt wat de oude grendel niet kan dragen.
De overlap op `created_at` is meegenomen winst, niet de reden dat hij bestaat.

⚠️ De les is niet "beter voorspellen". De les is dat een ijking die groen blijft
op de bedoelde grendel én rood op een andere, precies zo ver van bewijs af staat
als een ijking die niets rood maakt — en dat je dat alleen ziet door te kijken
**wélke** test omvalt in plaats van dát er een omvalt (QS8-412).

## Wat hier buiten valt

📏 Zes `timestamptz`-kolommen zijn vandaag wél door `authenticated` te schrijven,
alle zes **zonder default**, dus beide bewakingen slaan ze over:
`commitments.confirmed_at` (INSERT), `deadline_requests.decided_at` (INSERT +
UPDATE), `group_join_requests.decided_at` (INSERT + UPDATE),
`profiles.onboarded_at` (UPDATE), `todo_items.done_at` (UPDATE).

Geen ervan draagt vandaag een dagplafond-venster, dus er lekt niets, en
`dagplafondvenster_bewaking()` zou ze melden zodra dat verandert. Of
`commitments.confirmed_at` bij het invoegen door de client gezet hoort te worden
is een vraag over een commitment device — domeinregel 5, *Beslisbevoegdheid*
grens 1 — en dus een eigen issue en geen bijvangst hiervan.
