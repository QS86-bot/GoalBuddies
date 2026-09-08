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

## Waarom niemand het zag

📏 Het recht staat er sinds `0001_schema.sql` (20-08-2026) — de kolommen zijn
nooit uit de INSERT-grant gehaald die de tabel bij zijn aanmaak kreeg. Negentien
dagen, en in die tijd is er een kolomrechtencontrole bijgekomen die er langs
keek.

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
