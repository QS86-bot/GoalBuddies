# Een invariant pinnen in plaats van proza politieren

**24-09-2026 — QS8-613.** Voortgekomen uit dossierrij **169** (06-09-2026).

## De vraag die openstond

De duurste regel van QS8-293 stond niet in een migratie maar als toelichting in
een test: *"die kolom staat niet in de UPDATE- of INSERT-grant van
`authenticated`, en dat hoort zo."* De invariant was precies goed. De
vaststelling was onwaar — `0057` versmalde alleen de UPDATE-grant, en de
INSERT-grant was nog de standaard die Supabase via `alter default privileges`
uitdeelt: **álle** kolommen. Er stond geen query naast, dus er werd niets rood
van, en de belofte van een hele migratie hing eraan.

Rij 169 laat achter: *schrijf een grant, een policy of een default nooit op als
feit zonder de query erbij die het meet — en zet die query in een test, niet in
een commentaarregel.* En als voorwaarde: **wordt zwaarder als er meer plekken
komen waar een invariant in proza wordt vastgelegd.**

Die voorwaarde is ingetreden. De vraag was wat je eraan doet.

## De voor de hand liggende grendel kan niet, en dat is gemeten

Het precedent lag klaar: `uitrolproza:controle` telt prozabeweringen over de
productiestand na en wordt rood als een rij een verlopen getal draagt. Hetzelfde
zou hier moeten kunnen.

📏 **Het kan niet, en het getal zegt waarom.** 138 bestanden noemen een grant in
proza — 53 in `docs/`, 50 in `tests/`, 25 in `src/`, 10 in `scripts/`. Precies
**één** regel in de hele boom draagt een getalsvorm die een script zou kunnen
natellen (`(7 kolommen INSERT, 3 UPDATE)`).

⚠️ `uitrolproza:controle` werkt juist doordat de uitrolstand **één getal op één
bekende plek** is. Een grant is dat niet: hij is een tabel, een kolom, een
rechtensoort en een rol, en elke schrijver noemt daar een andere deelverzameling
van in een andere zin. Een controle die dat probeert te beoordelen, geeft vals
alarm op tientallen plekken — en dit project weet wat een controle met die
trefzekerheid wordt: eentje die je leert overslaan (QS8-415).

## Wat wél kan: de andere kant op

De rij vraagt *een query naast elke bewering*. De duurzame vorm daarvan is niet
per bewering een query, maar **één toets die de eigenschap over het hele schema
vastlegt**. Dan is elke bewering ertegen te houden, en gaat elke wijziging rood —
ook een wijziging in een tabel die niemand met de hand aan een lijst heeft
toegevoegd.

⚠️ Dat is regel 18 vraag 2. De drie toetsen die rij 169 noemt pinnen
`commitments` en `goals`; dat zijn **onderdelen**. De belofte is een eigenschap
van het geheel.

📏 Gemeten op een lokaal opgebouwd schema (301 migraties), uit
`information_schema.column_privileges`:

| vraag | uitkomst |
| -- | -- |
| tabellen met een INSERT/UPDATE-kolomgrant voor `authenticated` | 25 |
| tabellen waar die grant álle kolommen dekt — de faalvorm van QS8-293 | **0** |
| `created_at` of `updated_at` in een schrijfgrant | **nergens** |

`tests/rls/kolomgrants.test.ts` legt beide vast.

## ⚠️⚠️ De ijking staat in het bestand en niet in een handeling

Een toets die zegt *er is geen tabelbrede schrijfgrant* ziet er precies zo uit
als een toets die niets meet. Beide zijn groen, en het verschil is van buiten
niet te zien.

Daarom zet elke lezer in dit bestand **eerst zelf een kapot geval neer** — een
tabel met een tabelbrede grant, een kolom `created_at` met een UPDATE-recht —
binnen een transactie die terugrolt, en eist dat hij het vindt. Pas daarna
betekent de groene invariant-toets ernaast iets.

📏 **Nagemeten door de lezer blind te maken** (`return []` bovenaan): dan valt
**alleen** de ijkingstoets om, en blijft de invariant-toets groen. Dat is
precies het bewijs dat dat groen zonder ijking niets zou hebben betekend —
regel 18 vraag 3, aan een levend geval.

⚠️ Het voordeel van een ijking in het bestand boven een ijking met de hand is
dat hij meereist. Een handmatige mutatie bewijst iets over de dag waarop je hem
uitvoerde; deze bewijst het elke run.

## Wat er onderweg gevonden is en geen bevinding bleek

📏 `id` staat in de UPDATE-kolomgrant van vijf tabellen. Dat leek een gat en is
het niet: alle vijf dragen een UPDATE-policy met `using false`, gemeten met
`pg_get_expr()`, dus geen client kan die tabellen überhaupt updaten.

⚠️ Het is wél een lading die op één handeling wacht, en dus een eigen rij met een
vervalvoorwaarde: drie van die vijf zijn woordelijk de `false`/`false`-policies
die rij **454** bij naam noemt. Draait iemand er ooit een open om één geval door
te laten, dan wordt in diezelfde beweging de primaire sleutel schrijfbaar van een
tabel die een auditspoor draagt.

Het `revoke` staat er niet in deze ronde, om twee redenen: het is een migratie en
dus de andere baan, en er is vandaag niets kapot — dus het is een opruiming met
een eigen afweging en geen reparatie.

## Wat hier niet mee besloten is

Rij 169 gaat niet dicht. Wat daar openstaat is een **gewoonte**, en die meet je
niet aan één toets. Wat eruit gaat is de vraag óf er een mechanische vorm voor
bestaat: die is nu gemeten, en het antwoord is nee.
