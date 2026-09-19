# Dezelfde belofte op vier tabellen — QS8-561

**19-09-2026.** `weigeren-en-niet-schrijven-zijn-twee-beloftes.md` (QS8-557) legt
vast *wat* een `<iets>_over() > 0`-conjunct in een insert-policy oplevert en wat
niet. Dit document herhaalt die redenering niet; het draagt wat er bij de vier
andere tabellen anders was, en de metingen die daar nodig waren.

## De vorm, per tabel nagemeten

📏 Uit `pg_policy`, `pg_trigger` en `pg_get_functiondef()` op de lokale stack —
niet uit een migratiebestand:

| tabel | plafond | telt op | handhaver | rem |
| --- | --- | --- | --- | --- |
| `chat_messages` | 500 | `sender_id` | `begrens_berichten` | `rem_berichten` |
| `day_checkins` | 500 | eigenaar van het doel | `begrens_dagafvinkingen` | `rem_dagafvinkingen` |
| `week_review_replies` | 100 | `author_id` | `begrens_weekreacties` | `rem_weekreacties` |
| `weekly_goals` | 200 | eigenaar van het doel | `begrens_weekdoelen` | `rem_weekdoelen` |

Alle vier handhavers hangen als **`after insert … for each statement`** aan hun
tabel, tellen dezelfde populatie als hun `<iets>_over()` en toetsen tegen
hetzelfde `<iets>_plafond()`. Alle vier remmen zijn `before insert … for each
row` op tweemaal dat plafond.

⚠️ **Daarmee geldt de conclusie van QS8-557 hier woordelijk**, en nu gemeten in
plaats van doorgetrokken: de conjunct is voor de **weigering** redundant, en wat
hij in zijn eentje levert is dat de rijen **niet geschreven worden**.

## Wat er per tabel anders is, en waarom dat de reden was om dit apart te doen

### De vulkant verschilt, en de verkeerde kant meet niets

📏 `berichten_over()` en `weekreacties_over()` tellen op de **auteur**;
`dagafvinkingen_over()` en `weekdoelen_over()` via de **eigenaar** van het doel.

Voor die eerste twee kan de opvulling dus niet via `adminDb()` — dan staat de
testgebruiker bij de meting helemaal niet op zijn plafond, passeert élke rij de
conjunct, en meet de toets niets terwijl hij groen is. Dat is regel 18 vraag 3 in
zijn goedkoopste vorm: een fixture die de toestand niet maakt die de toets
beweert te meten.

### `day_checkins` levert zeven rijen per weekdoel en geen achtste

📏 `afvinking_binnen_de_cyclus()` keert **niet** vroeg terug bij een lege
`auth.uid()` — anders dan `weekdoel_cyclus_klopt()` — en eist altijd dat
`local_date` binnen `[cycle_start, cycle_start + 6]` valt. Daar bovenop is
`day_checkins_een_per_dag` uniek op `(weekly_goal_id, local_date)`.

Eén weekdoel draagt dus hoogstens zeven afvinkingen. De opvulling (500) en de
aanvalsbatch (1000) vragen daarom **215** weekdoelen, en ze moeten uit elkaar
gehouden worden: zou de aanval dezelfde paren gebruiken als de opvulling, dan
ketst hij af op de unieke index en meet de toets de verkeerde grendel.

⚠️ Dat de aanvalsrijen elke ronde identiek zijn, mág juist: ze worden geweigerd,
dus ze committen nooit en botsen nooit met zichzelf.

## De meting

Tien geweigerde verzoeken van `plafond * 2` rijen door een gebruiker die al op
zijn plafond stond. 📏 Met de conjunct intact groeide geen van de vier tabellen;
de ijking (de conjunct vervangen door niets, de rest van de policy woordelijk
gelijk) gaf:

| tabel | groei zonder de conjunct | drempel | factor |
| --- | --- | --- | --- |
| `weekly_goals` | 344 kB (352.256 B) | 150 kB | 2,3 |
| `week_review_replies` | 464 kB (475.136 B) | 150 kB | 3,1 |
| `day_checkins` | 1368 kB (1.400.832 B) | 150 kB | 9,1 |
| `chat_messages` | 3520 kB (3.604.480 B) | 150 kB | 23,4 |

⚠️ **De drempel is dezelfde 150 kB als in `bulkschrijf.test.ts`** en is niet per
tabel gespreid. Hij moet het in het **kleinste** geval houden, en dat is
`weekly_goals` met factor 2,3 — vergelijkbaar met de 2,6 die QS8-557 voor
`weekly_plan_steps` mat. Dat `chat_messages` er een factor 23 boven zit, is geen
reden om de drempel daar te verlagen: de marge dekt vrijgemaakte ruimte van
eerdere testbestanden, en die is niet kleiner op een grote tabel.

## De ijking

Vier mutaties, elk apart, en **geen enkele voor alle vier tegelijk** — dat zou
niets zeggen over de drie andere policies. Elke mutatie maakt precies één toets
rood, en telkens op de **schijfassertie**:

| mutatie | rood |
| --- | --- |
| `weekdoelen_over() > 0` uit `weekly_goals_insert` | *weekly_goals: wie op zijn dagplafond zit…* |
| `dagafvinkingen_over() > 0` uit `day_checkins_insert` | *day_checkins: …* |
| `berichten_over() > 0` uit `chat_messages_insert` | *chat_messages: …* |
| `weekreacties_over() > 0` uit `week_review_replies_insert` | *week_review_replies: …* |

⚠️⚠️ **In alle vier de gevallen bleef assertie 1 — *elk verzoek wordt geweigerd*
— groen.** Dat is de bevinding van QS8-557 nog een keer, nu viervoudig gemeten:
een toets op "dit wordt geweigerd" bewaakt deze conjuncten niet. De handhaver
weigert hetzelfde verzoek, één rij later, als alles al op schijf staat.

⚠️ **En daarom staat de schijfmeting vóór de foutcode-assertie.** Andersom is
geen van de vier te ijken: de mutatie flipt óók de code van `42501` naar `23514`,
die assertie gooit als eerste, en de meting die de belofte raakt draait nooit.

## `rls:dekking` en wat dit wel en niet oplost

📏 Met deze vier toetsen erbij komt `npm run rls:dekking -- <tabel>` voor alle
vier schoon terug: `chat_messages` 7/8, `day_checkins` 3/4,
`week_review_replies` 8/8 en `weekly_goals` 4/5, waarbij elke ontbrekende helft
een vastgelegde uitzondering is met een verwijzing naar de toets die haar dekt.

⚠️ Dat script vervangt een conjunct door `true` en kijkt of er een test rood
wordt — dezelfde mutatie als de ijking hierboven. Het bewijst dus dat er een
toets aan hangt, niet dat die toets de juiste belofte meet. Dat tweede is wat de
volgorde van de asserties hier levert.

## Wat hier níet mee af is

⚠️⚠️ **Geen van deze vier toetsen is een grendel tegen misbruik**, en die zin
staat hier omdat hij in de eerste versie van het QS8-557-document ontbrak en
daar een open **Hoog**-rij geruststelde. Een aanvaller komt nooit in de toestand
die hier getoetst wordt: zijn rijen worden geweigerd, dus ze committen nooit,
dus zijn teller blijft nul en `<iets>_over()` geeft altijd het volle plafond.
Wat de conjunct wél levert is de nette afhandeling van een legitieme herhaling
door wie zijn plafond écht gehaald heeft.

Het gat erachter staat als open risico **Hoog** in rij 609 van
`docs/ENGINEER-REVIEW.md`: er staat geen rate limit vóór PostgREST.

📏 En geen van de vijf is een live gat: alle vijf policies dragen de conjunct
gewoon, ook op productie.
