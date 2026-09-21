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

De opvulling moet die kolom dus vullen met de id van de testgebruiker. Doet ze
dat niet, dan staat hij bij de meting helemaal niet op zijn plafond, passeert
élke rij de conjunct, en meet de toets niets terwijl hij groen is. Dat is regel
18 vraag 3 in zijn goedkoopste vorm: een fixture die de toestand niet maakt die
de toets beweert te meten.

### ⚠️ Wat daar níet uit volgt — rechtgezet op 21-09-2026

De eerste versie van dit document, de rij in `docs/ENGINEER-REVIEW.md` die
QS8-557 wegzette en de kop van de toets trokken hier allemaal dezelfde conclusie
uit: *opvullen via `adminDb()` telt daar niet mee, dus de gebruiker moet zijn
eigen rijen schrijven.* 📏 Nagemeten en onjuist. Een rij die buiten de sessie van
de gebruiker geschreven wordt mét `sender_id` op zijn id telt gewoon mee —
`berichten_over()` ging van 500 naar 499 — want de functie leest de **kolom** en
niet de schrijver, en `stamp_chat_message()` zet `sender_id` alleen bij UPDATE
terug (`new.sender_id := old.sender_id`), nooit bij INSERT.

⚠️ **De vorm van de fout is dat "telt op de auteur" gelezen werd als "telt op wie
het verzoek doet".** Dat is bij een `security definer`-teller precies het
onderscheid dat ertoe doet, en het kostte hier niets omdat de toets toevallig de
strengere fixture koos — maar de regel die eronder geschreven stond, was een
regel die nergens op sloeg. De toetsen laten alice haar chatopvulling nog steeds
zelf schrijven: dat ligt dichter bij de werkelijkheid en kost niets. De regel is
*"de kolom draagt haar id"*, en die geldt voor alle vier.

### `day_checkins` levert zeven rijen per weekdoel en geen achtste

📏 `afvinking_binnen_de_cyclus()` keert **niet** vroeg terug bij een lege
`auth.uid()` — anders dan `weekdoel_cyclus_klopt()` — en eist altijd dat
`local_date` binnen `[cycle_start, cycle_start + 6]` valt. Daar bovenop is
`day_checkins_een_per_dag` uniek op `(weekly_goal_id, local_date)`.

Eén weekdoel draagt dus hoogstens zeven afvinkingen. De opvulling (500) vraagt
er 72, de aanvalsbatch (1000) nog eens 143, en de toets maakt er **216** — één
reserve, zodat de `??`-grendel in `afvinkingen()` een echte fout meldt en niet de
rand raakt. De twee groepen moeten uit elkaar gehouden worden: zou de aanval
dezelfde paren gebruiken als de opvulling, dan ketst hij af op de unieke index en
meet de toets de verkeerde grendel.

⚠️ Dat de aanvalsrijen elke ronde identiek zijn, mág juist: ze worden geweigerd,
dus ze committen nooit en botsen nooit met zichzelf.

## De meting

Tien geweigerde verzoeken van `plafond * 2` rijen door een gebruiker die al op
zijn plafond stond. 📏 Met de conjunct intact groeide geen van de vier tabellen;
de ijking (de conjunct vervangen door niets, de rest van de policy woordelijk
gelijk) gaf:

| tabel | groei zonder de conjunct | kleinste | drempel | factor |
| --- | --- | --- | --- | --- |
| `weekly_goals` | 344\*, 448, 584, 688, 704, 736 kB | 448 kB | 150 kB | 3,0 |
| `week_review_replies` | 464, 504, 528 kB | 464 kB | 150 kB | 3,1 |
| `day_checkins` | 1304, 1368, 1480 kB | 1304 kB | 150 kB | 8,7 |
| `chat_messages` | 3360, 3456, 3520 kB | 3360 kB | 150 kB | 22,4 |

⚠️⚠️ **Die eerste kolom stond er op 19-09-2026 met één getal per tabel in, en dat
was de fout.** 📏 De 344 kB voor `weekly_goals` is in vijf latere metingen geen
enkele keer teruggekomen; de spreiding loopt van 448 tot 736 kB. Het is precies
de grootheid waarvan de toets zelf opschrijft dat hij varieert met **vrijgemaakte
ruimte** van eerdere testbestanden — dus één monster zegt er niets over. En het
was uitgerekend het monster waar de drempel op verantwoord werd: de factor stond
er als 2,3 waar hij 3,0 is.

⚠️ **De vorm is dezelfde als die van `rls:dekking` op 10-09-2026** (*een rood is
niet vanzelf jouw rood*): een instrument dat een verschil meet in een toestand
die om andere redenen beweegt, moet die beweging meten in plaats van hem
wegdenken. Hier is dat goedkoop — dezelfde ijking nog twee keer draaien — en het
staat daarom nu als reeks in de toets, met de **kleinste** waarde als
verantwoording. Niet het gemiddelde: een drempel die op een gemiddelde leunt,
laat de helft van de metingen aan de verkeerde kant vallen.

⚠️ **De drempel is dezelfde 150 kB als in `bulkschrijf.test.ts`** en is niet per
tabel gespreid. Hij moet het in het **kleinste** geval houden, en dat is
`weekly_goals` met factor 3,0 — ruimer dan de 2,6 die QS8-557 voor
`weekly_plan_steps` mat. Dat `chat_messages` er een factor 22 boven zit, is geen
reden om de drempel daar te verlagen: de marge dekt vrijgemaakte ruimte van
eerdere testbestanden, en die is niet kleiner op een grote tabel.

## De ijking

Vier mutaties, elk apart, en **geen enkele voor alle vier tegelijk** — dat zou
niets zeggen over de drie andere policies. Elke mutatie maakt precies één toets
uit het nieuwe bestand rood, en telkens op de **schijfassertie** (wat er
daarbuiten rood werd, staat in de sectie hierna):

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

## ⚠️⚠️ "Ongetoetst" en "er wordt niets rood" zijn twee dingen — 21-09-2026

De kop van de toets zei dat de vier conjuncten *even onbewaakt* stonden als die
van `weekly_plan_steps` vóór QS8-557, en dat is bij drie van de vier onjuist.
📏 Per mutatie nagemeten, de rest van de `tests/rls`-boom zónder het nieuwe
bestand:

| conjunct weggehaald uit | wat er rood werd | waarop |
| --- | --- | --- |
| `chat_messages_insert` | `rem.test.ts:144` | `expect(error?.code).toBe('42501')` — kreeg `23514` |
| `day_checkins_insert` | `afvinkgrens.test.ts:213` | idem |
| `weekly_goals_insert` | `bulkschrijf.test.ts:239` | idem |
| `week_review_replies_insert` | **niets** — 185 bestanden, 2143 toetsen groen | — |

⚠️ **Alle drie vallen om op de foutcode, en geen van de drie meet de schijf.**
📏 `rem.test.ts` zet er een rijtelling achter, `afvinkgrens.test.ts` en
`bulkschrijf.test.ts:239` niets; `bulkschrijf.test.ts` méét de schijf wel, maar
in zijn eigen toets over `weekly_plan_steps`. En een rijtelling kán deze belofte
niet zien: 📏 uit de ijking hierboven blijkt dat de tabel groeit terwijl elk
verzoek geweigerd wordt, dus de rijen worden geschreven en daarna teruggerold —
een telling achteraf klopt precies zoals ze klopte.

Wat die drie toetsen dus bewaken is *welke grendel sprak*, niet *of er
geschreven werd*. De belofte stond bij alle vier even onbewaakt; alleen het
**signaal** was er bij drie.

⚠️⚠️ **En dat maakt die drie gevaarlijker dan het vierde, niet veiliger.** Een
toets die rood wordt en de verkeerde reden noemt, stuurt de volgende lezer naar
de verkeerde reparatie. `bulkschrijf.test.ts:239` doet dat met zoveel woorden:
zijn boodschap luidt *"23514 betekent dat de rem het venster telt in plaats van
dit verzoek"* — onder déze mutatie een onjuiste diagnose, en eentje die naar de
rem wijst terwijl de policy stuk is. Het goedkoopste einde daarvan is dat iemand
de verwachte code op `23514` zet en de suite weer groen maakt, met de conjunct
nog steeds weg.

⚠️ Waarom de kop het anders zei: er is op 19-09 geen mutatie gedraaid zónder het
nieuwe bestand. Met de nieuwe toets erbij wórdt er altijd iets rood, en dan is
*"er was hiervoor geen toets"* niet te onderscheiden van *"er werd hiervoor niets
rood"*. Dat is dezelfde meetfout als in
`2026-09-10-een-rood-is-niet-vanzelf-jouw-rood.md`: een ijking die de toestand
vóór de mutatie niet meet, beantwoordt een andere vraag dan ze stelt.

## `rls:dekking` en wat dit wel en niet oplost

📏 Met deze vier toetsen erbij komt `npm run rls:dekking -- <tabel>` voor alle
vier schoon terug: `chat_messages` 7/8, `day_checkins` 3/4,
`week_review_replies` 8/8 en `weekly_goals` 4/5, waarbij elke ontbrekende helft
een vastgelegde uitzondering is met een verwijzing naar de toets die haar dekt.

⚠️ Dat script vervangt een conjunct door `true` en kijkt of er een test rood
wordt — dezelfde mutatie als de ijking hierboven. Het bewijst dus dat er een
toets aan hangt, niet dat die toets de juiste belofte meet. Dat tweede is wat de
volgorde van de asserties hier levert.

⚠️⚠️ **En dat is hier geen theoretische kanttekening.** 📏 Bij drie van de vier
werd er vóór dit issue al iets rood onder precies die mutatie — de tabel in de
sectie hierboven. *"Er hangt een toets aan"* was daar dus al waar terwijl de
belofte onbewaakt stond. Een dekkingsscript dat op *er wordt iets rood* meet,
kan dit verschil per constructie niet zien; het is de prijs van een meting die
geen mens hoeft te lezen, en de reden dat hij een toets niet vervangt.

## Wat hier níet mee af is

⚠️⚠️ **Geen van deze vier toetsen is een grendel tegen misbruik**, en die zin
staat hier omdat hij in de eerste versie van het QS8-557-document ontbrak en
daar een open **Hoog**-rij geruststelde. Een aanvaller komt nooit in de toestand
die hier getoetst wordt: zijn rijen worden geweigerd, dus ze committen nooit,
dus zijn teller blijft nul en `<iets>_over()` geeft altijd het volle plafond.
Wat de conjunct wél levert is de nette afhandeling van een legitieme herhaling
door wie zijn plafond écht gehaald heeft.

Het gat erachter staat als open risico **Hoog** in de rij *Er staat geen rate
limit vóór PostgREST* (08-09-2026) van `docs/ENGINEER-REVIEW.md`.

📏 En geen van de vijf is een live gat, en dat is te stellen zonder productie aan
te raken: de laatste migratie die een van deze vijf insert-policies herschrijft
is **0140**, en `supabase/uitgerold.json` zet productie op **0282**. Alle vijf
conjuncten zitten dus in wat er draait.

⚠️ Dat is een afleiding uit twee bestanden en geen meting op de productiedatabase
zelf; die staat in een cloudsessie niet open. Wat eronder ligt — dat het
uitgerolde schema doet wat de migratiemap zegt — is wat `migraties:controle` en
`idempotent:controle` bewaken.
