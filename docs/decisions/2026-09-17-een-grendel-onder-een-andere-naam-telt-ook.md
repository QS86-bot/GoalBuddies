# Een grendel onder een andere naam telt ook, maar alleen als hij opgeschreven staat

**17-09-2026 — QS8-522.** Volgt uit het hermeten van rij 605 van
`docs/ENGINEER-REVIEW.md` (risico Hoog, 08-09-2026).

## Waar dit begon

0200 legde de vorm neer: een geweigerde bulk-insert schrijft de rijen eerst en
gooit ze daarna weg, en die ruimte komt pas terug bij een `vacuum full`. 📏 Die
migratie mat **9,6 MB** voor één geweigerde batch van 50.000 doelen op `goals`.
De reparatie is een `BEFORE INSERT ... FOR EACH ROW`-rem die op `2 × dagplafond`
weigert.

Sindsdien zijn er rems bij gekomen in 0207, 0214 en verder — met de hand, per
migratie, zonder dat iets de lijst compleet hield.

## 📏 De vraag die niemand kon stellen

De eerste versie van `rem-controle.mjs` vroeg:

```sql
has_table_privilege('authenticated', c.oid, 'INSERT')
```

en meldde **"0 van de 0 beschrijfbare tabellen"** — met exitcode 0.

⚠️⚠️ **Dat was groen op een lege vraag.** Dit project trekt tabelbrede rechten
met opzet in en geeft kolommen terug (0236). `daily_moves` draagt daardoor
`authenticated=rx` op tabelniveau — geen `a` — en tóch een INSERT-recht op elke
kolom. `has_table_privilege` is dan `false` en `has_any_column_privilege` `true`:

| predicaat | tabellen |
| -- | -- |
| `has_table_privilege(… 'INSERT')` | **0** |
| `has_any_column_privilege(… 'INSERT')` | **22** |

Zelfde familie als QS8-334, waar een `grant … to public` onder
`grantee = 'PUBLIC'` uit een join viel. **Het gereedschap dat het dichtst bij de
vraag lijkt te liggen, is hier het verkeerde.**

⚠️ **En een kolomrecht maakt een tabel nog niet beschrijfbaar.** 📏 Vijf van de
zeven tabellen zonder rem dragen `with check (false)` op hun INSERT-policy —
`groups`, `reports`, `deadline_requests`, `group_join_requests`,
`approval_withdrawals`. De grant staat er, de policy laat niets door, en het
schrijven loopt via een definer-RPC. Ze meetellen zou vijf vrijbrieven in het
register zetten die niets bewaken, en een register vol overbodige redenen leest
niemand meer na.

De juiste vraag is dus **drieledig**: een kolomgrant, én een INSERT-policy die
niet `false` is, én geen rem.

## 📏 Wat er dan overblijft

| | |
| -- | -- |
| tabellen die een client kan volschrijven | **17** |
| daarvan met een rem op `plafond() * 2` | **15** |
| zonder rem | **2** — `week_reviews` en `hero_profiles` |

En die twee zijn niet ongedekt:

| tabel | wat de rijen tegenhoudt | 📏 gemeten met een poging van 5000 rijen |
| -- | -- | -- |
| `week_reviews` | `week_reviews_one_per_period`, uniek op (groep, gebruiker, periode) | 88 kB → **144 kB**, twee rijen, `23505` |
| `hero_profiles` | `hero_profiles_source_geldig` (CHECK) plus de primaire sleutel op `user_id` | 32 kB → **32 kB**, weigering op rij 1, `23514` |

**Een unieke index en een CHECK weigeren per rij, net als een rem.** Het verschil
is dat niemand ze daarvoor gebouwd heeft. Dat is de vorm van QS8-434 — *de
grendel bestond al, onder een andere naam* — en precies daarom staan ze in
`ZONDER_REM` mét hun meting: verdwijnt die unieke sleutel ooit bij een
productwijziging, dan valt de bodem weg zonder dat er iets rood wordt.

## Wat er gebouwd is

`npm run rem:controle` leest `pg_trigger`, de kolomgrants en `pg_policy` van een
opgebouwde database, en wordt rood op drie dingen:

1. een tabel die een client kan volschrijven zonder rem en zonder registerrij;
2. een rem op een andere grens dan `<naam>_plafond() * 2`, zonder registerrij;
3. een registerrij die niets meer dekt.

⚠️ **En op een vierde: een lege uitslag.** Nul rijen is *ongemeten* en niet
groen — dat is geen theorie maar het geval waarmee dit script begon.

## De ijking

Vijf mutaties, één per tak, elk met een `grep` op de mutatie vóór de uitslag
geloofd werd. Vijf keer viel precies de eigen test om, en geen enkele mutatie
sleepte een vreemde tak mee.

Daarna twee keer tegen de **échte database**, want een controle die alleen zijn
eigen handgevoerde lijstjes ziet, bewijst niets over de vraag die hij stelt:

| mutatie op de lokale stack | wat de controle zei |
| -- | -- |
| `drop trigger dagzetten_rem on daily_moves` | ✗ `daily_moves` — tabel zonder rem |
| `rem_dagzetten()` herschreven op grens `9999` | ✗ `daily_moves rem_dagzetten → 9999` |

Twee verschillende takken, twee verschillende meldingen, allebei op het bedoelde
geval. De stack is daarna opnieuw opgebouwd.

## Wat hiermee níet opgelost is

- **De rij van 605 blijft open en blijft Hoog.** Er staat nog steeds geen laag
  vóór PostgREST; die kan er pas komen met een langdraaiende Node-server
  (`docs/DEPLOY.md` §2.7), en het uitgavenplafond en schijfalarm van QS8-141
  staan op `wacht-op-Quinten`.
- **De rem maakt een geweigerd verzoek niet goedkoop.** 📏 Hermeten op
  `daily_moves`: 1000 rijen van 2000 onsamendrukbare tekens laten de tabel van
  376 kB naar 3272 kB groeien — **2,9 MB**, waar de rij 1,7 MB zei. De rem zweeg
  zelfs, want zijn grens ligt op 1000 en de batch wás er 1000; de dagteller
  weigerde ná het schrijven. De rem begrenst; hij verlaagt niet.
- ⚠️⚠️ **En let op de meetfout die dat bijna verborg.** De eerste poging mat
  144 kB, met `repeat('x', 2000)` als vulling. Dat comprimeert pglz tot bijna
  niets, dus de vulling bepaalde de uitslag in plaats van de grens. **Meet deze
  klasse met onsamendrukbare tekst op de kolomgrens**, anders meet je de
  compressie.
- **De controle toetst niet of een rem wérkt**, alleen dat hij er is en op welke
  grens hij staat. Een rem met een lichaam dat nooit weigert, komt er groen
  langs. Dat is handwerk gebleven.
