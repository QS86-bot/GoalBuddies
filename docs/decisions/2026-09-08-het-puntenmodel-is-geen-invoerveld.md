# Het puntenmodel is geen invoerveld

**08-09-2026.** QS8-352. Migratie `0195`.

## Wat er stuk was

📏 Gemeten met echte JWT's tegen de lokale stack — drie gewone verzoeken van
twee gewone accounts, zonder truc, zonder `service_role`, zonder RPC:

```
weekdoel aanmaken met points_ceiling=5    -> 201
voltooiing (achieved_level='ceiling')     -> 201
goedkeuring door de buddy                 -> 201

points_ledger:  delta = 5   reason = completion_approved_ceiling
```

**Vijf punten waar domeinregel 10 er twee voorschrijft**, geboekt langs de
normale goedkeuring van een buddy. Het plafond was een invoerveld.

## De keten, schakel voor schakel

| Schakel | Stand |
|---|---|
| `authenticated` INSERT-kolomgrant op `points_ceiling`, `points_floor` | 📏 `has_column_privilege(...) = true` |
| dezelfde grant op `points_miss` en `status` | 📏 `false` — die stonden wél dicht |
| `award_points_on_approval()` | boekt `punten := w.points_ceiling`, dus wat er in de rij staat |
| CHECK `weekly_goals_points_bounded` | begrenst het **bereik** (0..5), niet de **waarde** |

⚠️ **De CHECK is de reden dat dit er onschadelijk uitzag.** Er stáát een grens
op die kolom, dus bij een vluchtige blik is hij bewaakt. Hij houdt 100.000
tegen en 5 in plaats van 2 niet, en dat verschil is precies het domeinmodel.
Een bereikgrens is geen modelgrens — dezelfde vorm als
`docs/decisions/2026-09-08-een-drempel-is-geen-bereik.md`, twee dagen eerder.

⚠️ **De defaults zíjn het model** (`points_ceiling default 2`, `points_floor
default 1`, `points_miss default -1`). De client hoeft die kolommen dus
helemaal niet te sturen, en 📏 doet dat ook nergens: geen enkel bestand in
`src/` of `app/` noemt ze buiten de gegenereerde `database.types.ts`. Het recht
diende niets. Dat is wat het zo lang onzichtbaar hield.

## Waarom dit zwaar is

* **Domeinregel 10 is het puntenmodel.** Plafond `+2`, vloer `+1`, gemist `−1`.
  Wie zijn eigen plafond kiest, schrijft de regel over.
* In een **open** groep telt het mee in `groep_klassement()` (A54, migratie
  0141). Dat klassement is per ontwerp een teller die **alleen optelt** — een
  opgeblazen plafond is daar dus niet aan te zien én niet weg te laten zakken.
* `goals.max_points` is de som van de plafondpunten van de weekdoelen en schuift
  mee, dus het puntenplafond van het hele doel klopt daarna ook niet meer.
* Punten zijn append-only (domeinregel 6): een verkeerde boeking corrigeer je
  met een correctie-record, niet door hem weg te halen.
* **En het plantte zich voort.** 📏 `schuif_weekdoel_door()` maakt de opvolger
  met `values (… w.points_ceiling, w.points_floor, w.points_miss …)` — hij
  kopieert de puntenkolommen van het weekdoel dat je doorschuift. Eén keer een
  plafond van 5 zetten gaf dus geen incident maar een **reeks**: elke
  doorgeschoven week nam het mee, zonder dat de client daarna nog iets hoefde
  te sturen. Dat is de reparatie aan de bron waard in plaats van een controle
  op de boeking.

📏 Nagemeten op **allebei** de databases — lokaal én het echte project — omdat
"er is nog niets" een aanname is zodra je hem niet stelt. Rijen met een
afwijkend plafond, een afwijkende vloer of een afwijkend minpunt: **0** (het
project heeft één weekdoel in totaal). Deze migratie sluit de deur; er valt
niets te repareren dat al geboekt is.

⚠️⚠️ **En op het echte project staat het gat vandaag nog open.** 📏 Gemeten:
`has_column_privilege('authenticated','public.weekly_goals','points_ceiling',
'INSERT')` is daar **true**, en het migratieregister staat op `0186` — 0187 t/m
0195 zijn nog niet toegepast. Dat is de bekende achterstand uit
`docs/WERKVOORRAAD.md` §2 en geen nieuw feit, maar het hoort hier te staan in
plaats van dat dit document de indruk wekt dat de deur overal dicht is.

Alleen 0195 vooruit toepassen kan niet: het register kent één nummering, en een
migratie overslaan maakt de volgende toepassing een gok. Het gaat mee in de
volgende ronde, en tot dan is de rem dat er 📏 één weekdoel op dat project staat
en nul afwijkende rijen.

## De reparatie

Eén statement.

```sql
revoke insert (points_ceiling, points_floor) on public.weekly_goals
  from public, anon, authenticated;
```

⚠️ **`authenticated` staat er met zoveel woorden** (onwrikbare regel 4).
`from public, anon` leest als "van iedereen" en houdt juist de rol over
waaronder iedere ingelogde gebruiker draait.

⚠️ **De definer-RPC's worden hier niet door geraakt, en dat is gemeten en niet
aangenomen.** `schuif_weekdoel_door()` en `sluit_weekdoel_af()` zijn
`SECURITY DEFINER` en draaien met de rechten van de eigenaar, dus een grant op
`authenticated` gaat niet over hen. Dat is een aanname over hoe kolomgrants en
definer-functies zich verhouden, en er staat daarom een must-allow op in plaats
van een zin.

## De ijking — per grendel, niet per migratie

📏 Drie mutaties, elk apart gedraaid, elk apart teruggedraaid. Vóór elke run is
met `has_column_privilege()` respectievelijk `grep` bevestigd dát de mutatie
stond.

| Mutatie | Uitslag | Welke test |
|---|---|---|
| `grant insert (points_ceiling) … to authenticated` | 📏 1 rood | *weigert een weekdoel waarin de client points_ceiling meestuurt* |
| `grant insert (points_floor) … to authenticated` | 📏 1 rood | *weigert een weekdoel waarin de client points_floor meestuurt* |
| `punten := w.points_ceiling + 3` in `award_points_on_approval()` | 📏 1 rood — `expected 5 to be 2` | *boekt +2 voor een gehaald plafond* |

Zonder mutatie: 📏 5 groen. Na elk terugdraaien opnieuw 5 groen.

⚠️ **De derde mutatie is er omdat de derde test níét op de revoke ijkt.** Die
test stuurt geen plafond mee — hij loopt de gewone keten en kijkt wat er in
`points_ledger` landt. Beide kolomgrants terugzetten laat hem groen, want de
client vroeg niets afwijkends. Dat leek eerst een zwakke test en is het niet:
hij bewaakt de belófte (regel 18 vraag 2), en die kan ook breken zonder dat er
één recht verandert — namelijk als de boeking zelf iets anders gaat doen. Wat
hij níét is, is een tweede bewijs voor de revoke. Daarom staat hij hier met
zijn eigen mutatie in plaats van mee te liften op die van de andere twee.

📏 Dat de mutant precies `5` boekte — hetzelfde getal als het oorspronkelijke
gat — is toeval (`2 + 3`), en geen bevestiging van iets.

## De gerepareerde ijking van test 2

⚠️⚠️ In de vloertest stond eerst `points_floor: 5`. 📏 Die gaf vóór de reparatie
`23514` en niet "toegelaten": een vloer boven het plafond valt op
`weekly_goals_points_bounded`. Dan meet de test de CHECK en niet het recht, en
ná de reparatie is niet meer te zien wélk slot dichtzat — hij zou groen zijn
geweest met of zonder migratie.

De waarde is nu `1`, de default. Geen enkele CHECK kan daar bezwaar tegen
maken, dus het ontbrekende INSERT-recht is het enige dat hem nog kan weigeren.
Dat is wat de tabel hierboven bevestigt: de vloermutatie maakt hem rood, de
plafondmutatie niet.

**Dit is regel 18 vraag 3 in zijn scherpste vorm.** Een test die om de
verkeerde reden rood is, is niet minder misleidend dan een test die om de
verkeerde reden groen is — hij bewijst alleen dat er *iets* weigert.

## Waarom niemand het zag — en de correctie die dat antwoord kreeg

⚠️⚠️ **Hier stond eerst dat het recht sinds `0001_schema.sql` was ingeslopen en
dat niemand er ooit naar gekeken had. Dat was onjuist, en de security-review op
deze branch mat het na.** 📏 `grep -c "^grant" supabase/migrations/0001_schema.sql`
geeft **0**: die migratie deelt geen enkel recht uit. Het INSERT-recht kwam uit
Supabase's `alter default privileges` — de val van onwrikbare regel 4.

**Iemand heeft er wél naar gekeken, en de kolommen met naam opgeschreven.**
📏 `0043_weekly_goals_aanmaken_en_verwijderen_op_slot.sql` (20-08-2026) trekt de
tabelbrede grant in en zet er een kolomlijst voor terug — met `points_ceiling`,
`points_floor` en `points_miss` er letterlijk in.

**En `0044` is zélf de nakomer op een security-review van 0043.** Die review
vond `points_miss = 0` ("missen gratis"), haalde die kolom uit de grant, en liet
de andere twee bewust staan. De motivering staat in zijn eigen kop:

> *"0043 liet de punten-kolommen bewust insertable met als argument dat de CHECK
> uit 0007 ze begrenst. Voor `points_ceiling` en `points_floor` klopt dat (0 t/m
> 5 is begrensde variatie in je eigen nadeel)."*

⚠️⚠️ **"In je eigen nadeel" is precies omgekeerd.** Een plafond van 5 is 2,5× het
model in je eigen vóórdeel. En de redenering die 0044 voor `points_miss` wél
maakte — *"de rollover boekt letterlijk `delta: weekdoel.points_miss`"* — geldt
één regel hoger woord voor woord voor het plafond: `award_points_on_approval()`
boekt `punten := w.points_ceiling`. **Het mechanisme was gevonden, op één van de
drie kolommen toegepast, en voor de andere twee weggeredeneerd.**

**Dat maakt de les een andere en een scherpere.** Niet "een oude default glipte
erdoor" maar: *een onderbouwing in een migratiekop wordt door de volgende lezer
als gezag gelezen.* De `GEEN_SCHRIJFPAD`-regel van 01-09-2026 is een afgeleide
van die ene zin uit 0044 — dezelfde gedachte, anders geformuleerd, drie weken
later. En daarmee een concrete vervolgvraag die niemand nog gesteld heeft: **welke
ándere kolommen heeft 0044 met dezelfde motivering laten staan?** Dat staat als
rij in `docs/ENGINEER-REVIEW.md`.

⚠️ Dit was in dit document, in de kop van 0195 én in `kolomrechten-controle.mjs`
met een 📏 ernaast opgeschreven zonder dat de grep gedraaid was. Dat is de
zwaardere helft van de fout: een verkeerd getal is te herkennen, een verkeerd
getal met een meetteken erbij niet.

⚠️⚠️ Want dit paar stond in `scripts/kolomrechten-controle.mjs` in
`GEEN_SCHRIJFPAD` — 📏 sinds 01-09-2026 (QS8-258, `09b49b9`), de commit die die
controle de schrijfkant gaf. Met als reden:

> *"Dat de client ze mág overschrijven is een oud recht en geen pad."*

Die zin is waar en hij is geen grendel. **Hij noemt de gewoonte en niet het
slot.** Er wás geen slot — de app stuurde de kolommen toevallig niet mee, en
"toevallig niet" is precies de toestand die één regel code verderop omslaat.

Diezelfde formulering hield `chat_messages_update` overeind tot QS8-327. Het is
dus geen eenmalige slordigheid maar een terugkerende vorm, en de vorm is
herkenbaar: **een reden die beschrijft wat de client dóet in plaats van wat hem
tegenhoudt.** De twee rijen zijn vervallen — er is nu een grendel, dus er is
niets meer weg te schrijven.

🗣 De vraag die dit oplevert voor de rest van dat bestand: staat er nog een rij
in `GEEN_SCHRIJFPAD` waarvan de reden een gewoonte beschrijft? Dat is nagelopen
voor deze twee en niet voor alle, en het staat als rij in
`docs/ENGINEER-REVIEW.md`.

## Wat dit besluit níét is

* **Geen wijziging aan het model.** 2, 1 en −1 stonden al in de defaults en
  staan daar nog.
* **Geen wijziging aan een policy of functie.** Alleen een kolomgrant.
* **Geen correctie van geboekte punten.** Er zijn er geen die correctie nodig
  hebben (📏 0 afwijkende rijen), en zouden ze er zijn, dan liep dat via een
  correctie-record (domeinregel 6) en niet via deze migratie.

## Wat de security-review hierop vond

Drie dingen, en alle drie zelf nagemeten voordat ze verwerkt zijn.

**1. Deze migratie maakte een bestaande test blind — en dat is de zwaarste.**
`tests/rls/policies.test.ts:1189` bewaakte de CHECK uit 0007 door als échte
gebruiker `points_ceiling: 100_000` te proberen en te eisen dat er *íets*
weigerde. Vóór 0195 was dat `23514`, de CHECK. Erna is het `42501`, de
ontbrekende kolomgrant — en die komt eerder.

📏 Zelf nagemeten: `alter table weekly_goals drop constraint
weekly_goals_points_bounded`, daarna die test draaien → **groen**. De test las
als bewijs voor 0007 en was dat niet meer.

⚠️⚠️ **Dit is exact regel 18 vraag 3, toegepast op een test die niet in de diff
stond.** Ik heb die vraag voor mijn eigen nieuwe tests gesteld en beantwoord —
en niet voor de test die door mijn wijziging van betekenis veranderde. **Een
revoke verandert wélke grendel als eerste weigert, en daarmee wat elke
bestaande must-deny op die kolom nog toetst.** Dat is een vraag die bij elke
intrekking hoort en die nergens opgeschreven stond.

De CHECK is bovendien niet overbodig geworden maar juist eenzijdig: hij is
vanaf nu de énige rem voor de schrijvers die er wél bij kunnen — `service_role`,
de rollover, en `schuif_weekdoel_door()` die de kolommen kopieert. Opgelost door
hem te toetsen op een schrijver die hem nog kán raken (`adminDb()`, verwacht
`23514`), en `policies.test.ts` de nieuwe waarheid te laten stellen (`42501`)
in plaats van "niet null".

⚠️ **En die nieuwe CHECK-test moest zelf ook gerepareerd worden.** Het tweede
geval stond op `points_miss: 3`, en 📏 dat bleef groen mét de CHECK gedropt:
`points_miss <= 0` is een éigen, oudere CHECK (`weekly_goals_miss_not_positive`)
die het geval al afving. `-100` valt alleen op de ondergrens uit 0007. Dezelfde
val als bij de vloertest hierboven, twee keer op één dag — het is de
standaardfout bij een tabel met meerdere CHECKs.

**2. De herkomst die ik opschreef, klopte niet.** Zie de sectie hierboven; dat
is met de correctie erin herschreven in plaats van vervangen, want de fout is
het punt.

**3. Het plafond is dicht, het volume niet.** `cycle_start_date` staat nog in de
INSERT-kolomgrant en draagt **geen enkele CHECK** — 📏 zelf nagemeten, nul rijen
in `pg_constraint`. De boeking neemt de datum over, en op `completion_approvals`
staat 📏 geen dagteller. Twee accounts in één open groep kunnen daarmee het
klassement volpompen zonder één recht te overtreden. Dat is een eigen grens en
niet deze; het staat als **QS8-354** en niet als extra commit op deze branch.
`groups.tz` — waar een beheerder met één PATCH de groepsklok van domeinregel 1
verzet — staat als **QS8-355**.

⚠️ Wat de review als **niet** gemeten meldde en wat hierna alsnog gemeten is:
het echte project. Zie de vorige sectie.
