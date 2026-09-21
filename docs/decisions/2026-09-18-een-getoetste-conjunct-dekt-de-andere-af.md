# Een getoetste conjunct dekt de andere af

**18-09-2026 — QS8-550, uit rij 277 van `docs/ENGINEER-REVIEW.md`.**

## Wat er mis was

`npm run rls:dekking` beantwoordt één vraag door te muteren: **zet je deze
policy wagenwijd open, wordt er dan iets rood?** Dat is een goede vraag, en hij
is de reden dat dit instrument bestaat — een grep op "noemt een test deze tabel"
bewijst niets.

Maar het is niet de vraag die de uitslag suggereert. De uitslag heet *bewaakt*,
en dat leest als *elke voorwaarde in deze policy is getoetst*. Bij een policy
met een `and` erin vallen die twee uit elkaar: **één getoetste conjunct maakt het
geheel bewaakt, en de andere kan stil verdwijnen.**

📏 Het geval dat dit blootlegde. `chat_messages_delete` draagt

```sql
(sender_id = auth.uid()) and is_group_member(group_id)
```

Het rapport meldde `bewaakt`, met `archief-leesbaar.test.ts` als getuige — *"laat
niemand zijn eigen chatbericht meer wissen"*. Dat klopt voor de vraag die het
script stelde: wagenwijd open laat óók het archiefdeel vallen, en dát is wel
getoetst.

Alleen de eigenaarshelft weghalen liet echter **180 testbestanden en 2094 tests
groen** staan, terwijl elk groepslid het bericht van elk ander groepslid kon
wissen:

```sql
alter policy chat_messages_delete on chat_messages
  using (is_group_member(group_id));
```

Dat is regel 18 vraag 2 — *toetst deze test de belofte, of een eigenschap van het
onderdeel?* — een niveau hoger toegepast: op het meetinstrument zelf.

⚠️ **Het is geen fout in het script.** Het deed precies wat het beloofde. De
fout zat in wat wij uit het getal lazen.

## Wat we gemeten hebben voordat we iets besloten

📏 Over alle policies in het schema, met een parser die alleen op **diepte nul**
splitst:

| | |
|---|---|
| policyhelften totaal | **133** |
| top-level conjunctie (`and`) | **35** |
| top-level disjunctie (`or`) | 15 |
| enkelvoudig | 83 |
| conjuncten in die 35 helften samen | **106** |

⚠️ **Die parser is niet cosmetisch.** Een naïeve `split(' AND ')` telde er **50**
waar er 35 zijn: elke `exists (… where a and b)` en elke join-voorwaarde telde
mee. Zo'n `and` is geen aparte grendel maar een deel van één uitdrukking, en los
openzetten geeft een SQL-fout in plaats van een meting.

**De kosten van per conjunct meten:** 133 − 35 + 106 = **204** runs in plaats van
133, een groei van **1,53×**.

## Het besluit

**`rls:dekking` meet per conjunct, en dat is de standaard — geen vlag.**

De afweging is niet krap. Dit rapport draait met opzet níét in de poort (het
duurt uren) en is een handmatige, periodieke meting. 1,53× op iets dat toch al
buiten de gewone lus valt, is de prijs van een getal dat betekent wat het zegt.
Een vlag zou de oude, te gunstige uitslag de standaard laten en de scherpe
uitslag optioneel maken — en een strengere meting die je apart moet aanzetten,
zet niemand aan.

**Een helft met precies één conjunct houdt zijn kale sleutel** (`using`, niet
`using#0`). Dat is geen esthetiek: het houdt de registersleutels van zulke rijen
op hun plek. 📏 Van de negen rijen in `NIET_PER_HELFT_TE_METEN` is er precies
**één** een conjunctie, en alleen díe hoefde hermeten te worden.

## Wat het meteen opleverde

📏 Op alléén `chat_messages`, de eerste tabel waar het op losgelaten is:

| | oud | nieuw |
|---|---|---|
| | `3 van de 3 bewaakt` | **`5 van de 8`**, drie gaten |

- `chat_messages_delete (using#0)` — een groepsgenoot kon jouw bericht wissen.
- `chat_messages_insert (check#0)` — niemand toetste dat je geen bericht namens
  een ánder kunt plaatsen.
- `chat_messages_insert (check#2)` — `type <> 'system'`.

**Twee van die drie kende niemand.** Alle drie zijn test­dekkingsgaten en geen
live gaten: de gedeployde policies dragen al hun conjuncten gewoon. Maar een
conjunct die niemand mist, kan bij een refactor verdwijnen zonder dat iets rood
wordt — en het rapport zou hem dan nog steeds als bewaakt tellen.

## ⚠️ En één van de drie hoort juist níet in een test

📏 `check#2` is niet los te breken, en dat is met de hand gemeten:

| mutatie | uitslag |
|---|---|
| conjunct 2 (`type <> 'system'`) op `true` | groen |
| CHECK `chat_messages_sender_required` gedropt | groen |
| allebei weg | **rood** |

Elk van de twee volstaat afzonderlijk om een vervalst systeembericht tegen te
houden. De conjunct staat daarom in `NIET_PER_HELFT_TE_METEN` mét die meting —
dezelfde vorm als `day_checkins_delete.using`, waar de grendel ook een paar is.

📏 Dat het páár écht de grendel is, is apart gemeten en niet afgeleid: met
conjunct 0 **én** conjunct 2 open landde
`insert … (sender_id, type) values (null, 'system')` gewoon.

⚠️⚠️ **Dit is de tweede keer op één dag dat een ijking door een ándere grendel
liep dan hij noemde.** De eerste was de payload-mutatie in QS8-545, die in de
trigger wierp en door een `exception`-handler werd opgeslokt — rood op de
verkeerde assertie. Hier leek een toets conjunct 2 te bewaken terwijl een CHECK
het werk deed. **Kijk bij een ijking wélke assertie omvalt, en of hij omvalt om
de reden die je opschrijft.**

## Wat dit betekent voor de getallen die er al liggen

**Elk eerder totaal van dit instrument is een bovengrens, geen stand.** De
93-van-102 uit rij 277 telde 35 samengestelde helften als één grendel elk. Die
rij draagt die kanttekening nu, en het volgende volledige rapport moet met de
nieuwe vorm gedraaid worden.

⚠️ Wat dat rapport níét doet: een sweep over alle 39 tabellen past niet in één
sessie — dat is dezelfde beperking die rij 277 al opschreef, en de reden dat er
per tabel gemeten wordt. Wat hier ligt is het instrument en de eerste tabel; het
totaal is werk voor een volgende ronde.

## Wat hier bewust níet is gebeurd

- **Geen policy gewijzigd.** Elke mutatie is teruggezet en met `pg_get_expr()`
  geverifieerd; de drie gaten zijn test­gaten, geen lekken.
- **Geen `or`-tak gesplitst.** Bij een disjunctie dekt het geheel juist niet af
  wat een deel doet: elke tak afzonderlijk openzetten verruimt de policy niet,
  want de andere takken stonden er al. Dat is een andere vraag en misschien een
  ander instrument.
