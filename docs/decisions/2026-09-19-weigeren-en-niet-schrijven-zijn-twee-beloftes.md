# Weigeren en niet-schrijven zijn twee beloftes — QS8-557

**19-09-2026.** `weekly_plan_steps_insert.check#1` — de conjunct
`weekplanstappen_over() > 0` — stond wagenwijd open zonder dat één test rood
werd. Dit document legt vast wat de meting opleverde, want die weerlegt de
diagnose waarmee het issue geopend is **én** de eerste versie van dit document.

## De diagnose in het issue, en waarom hij niet klopte

QS8-557 redeneerde zo: er staan twee triggers op deze tabel, de rem vuurt op
`weekplanstappen_plafond() * 2`, de policy-conjunct staat op het plafond zélf,
dus er is een **bereik tussen plafond en tweemaal plafond waarin alléén deze
conjunct de grendel is**. Het issue zei er eerlijk bij wat het níet gemeten had.

📏 Gemeten op een lokale stack, een eigenaar met 199 stappen in het
etmaalvenster:

| | uitkomst |
|---|---|
| `weekplanstappen_over()` bij C=199 | **1** — de 200e stap landt |
| `weekplanstappen_over()` bij C=200 | **0** — de 201e wordt geweigerd (`42501`) |
| dezelfde 201e mét de conjunct opengezet | **óók geweigerd** (`23514`) |

De weigering kwam de tweede keer van `begrens_weekplanstappen()` (0192).

⚠️ **Het issue vergeleek met de verkeerde trigger.** Er staan er twee, en het
issue noemde ze allebei — maar het zette de conjunct naast `weekplanstappen_rem`
(0200, op `plafond * 2`) terwijl `weekplanstappen_dagplafond` (0192) op
**precies dezelfde drempel** staat. Het veronderstelde bereik tussen 200 en 400
bestaat niet: voor de vraag *"wordt dit geweigerd"* is de conjunct redundant.

* de conjunct weigert ⟺ `C >= 200` (C = de stand bij het begin van het statement);
* de handhaver weigert ⟺ `C + N > 200`.

Is `C >= 200` en `N >= 1`, dan is `C + N >= 201`.

⚠️ **Die gelijkheid is voorwaardelijk en niet structureel.** Ze leunt erop dat
`created_at` niet client-schrijfbaar is: kan een client die kolom zetten, dan
telt het etmaalvenster van de handhaver teruggedateerde rijen niet mee en laat
`200 > 200` ze door, terwijl de conjunct ze weigert. 📏 Vandaag dicht —
`authenticated` heeft INSERT op zeven kolommen van `weekly_plan_steps` en
`created_at` zit daar niet bij. Dat is exact de aanname die rij **603** van
`docs/ENGINEER-REVIEW.md` als open risico bijhoudt. Vervalt die, dan is niet
alleen deze redenering weg maar het hele dagplafond.

## Wat de conjunct wél in zijn eentje doet — en wat níet

`begrens_weekplanstappen()` is een `after insert`-trigger: hij weigert *nadat*
de rijen op schijf staan. De conjunct is een `with check` en weigert *ervóór*.

📏 Tien geweigerde verzoeken van 400 rijen door een gebruiker die **al op 200
stond**:

| | foutcode | aangroei |
|---|---|---|
| conjunct intact | `42501` | **0 bytes** |
| conjunct open | `23514` | **≥ 401.408 bytes** |

## ⚠️⚠️ Maar dit is géén grendel tegen misbruik, en de eerste versie van dit document beweerde dat wel

Die eerste versie schreef: *"dezelfde belofte als QS8-347/0200 — één gebruiker
kan de schijf niet volschrijven met verzoeken die tóch geweigerd worden."*
**Dat is weerlegd, en door de security-review van dit issue gevonden.**

Een aanvaller komt nooit in de toestand waar de conjunct iets doet. Zijn rijen
worden geweigerd, dus ze **committen nooit**, dus zijn teller blijft op nul, dus
`weekplanstappen_over()` geeft altijd 200 en élke rij passeert de conjunct. Pas
daarna weigert de handhaver — als alle 400 al geschreven zijn.

📏 Nagemeten met de conjunct **volledig intact**, twintig verzoeken van 400
rijen vanaf een vers account:

```
pg_total_relation_size  1.048.576 → 1.867.776   (+819.200 bytes)
rijen blijven staan     0
```

**Achthonderd kilobyte, nul rijen, met de grendel erin.** Hetzelfde als zonder.

⚠️ En de rem van 0200 sluit dat niet: hij is `before insert … for each row` en
telt óp. Bij 401 rijen vuurt hij op rij 401 — als 400 er al staan. Hij begrenst
wat één verzoek kán kosten, niet dát het kost, en niet hoeveel verzoeken er
komen. Dat staat al als open risico **Hoog** in rij **609** van
`docs/ENGINEER-REVIEW.md`: *"er staat geen rate limit vóór PostgREST."*

**De winst van de conjunct is dus smaller, en het is nog steeds een echte
winst:** hij maakt het gratis in plaats van duur wanneer de client van een
gebruiker die zijn dagplafond écht gehaald heeft, netjes nog eens probeert. Dat
is nette afhandeling van een legitieme herhaling, geen misbruikgrendel.

⚠️ **Dat onderscheid is de reden dat dit document herschreven is in plaats van
aangevuld.** Een beslisdocument dat een open **Hoog**-rij geruststelt, is
duurder dan geen document: de volgende lezer concludeert *"dat is geregeld"*
terwijl rij 609 openstaat.

## De toets, en de fout in de eerste ijking

De eerste versie toetste in deze volgorde: (1) elk verzoek geweigerd, (2) de
foutcode is `42501`, (3) de tabel groeide niet. Met de conjunct opengezet werd
**assertie 2** rood — en assertie 3, de enige die de belofte meet, werd daardoor
nooit uitgevoerd. Precies de val uit CLAUDE.md: *een ijking die zijn geval door
een pad voert dat een éérdere grendel al afvangt, bewaakt niets van wat hij
belooft.*

De schijfmeting staat daarom vóór de foutcode. De foutcode blijft eronder als
diagnose — hij zegt wélke grendel sprak.

⚠️ **Assertie 1 blijft met opzet groen onder de mutatie.** Dat is geen zwakte
maar de bevinding: de weigering is niet wat deze conjunct levert.

## De drempel

150 kB, tegen een gemeten signaal van **minstens 392 kB** — factor ≥ 2,6. De
spreiding zit in de indexen: dezelfde mutatie gaf één keer 401.408 en één keer
663.552 bytes op `pg_total_relation_size`, afhankelijk van of de indexpagina's
meegroeiden. De drempel moet het in het **kleinste** geval houden, dus 2,6 is het
getal dat telt en niet 4,3.

⚠️ **De marge is er niet voor parallelle ruis.** De eerste versie schreef dat de
suite parallel draait; 📏 dat is onwaar — `vitest.config.mts` zet voor de
`rls`-groep `fileParallelism: false` én `sequence: { concurrent: false }`, met
een kop die uitlegt waarom. De marge is er voor **vrijgemaakte ruimte**: eerdere
bestanden laten dode tuples en halfvolle pagina's achter, en dan groeit de tabel
onder de mutatie minder hard omdat hij die ruimte hergebruikt. 📏 In het
ongunstigste geval dat te maken was — 6000 rijen erin, eruit, `vacuum`, ≈570 kB
vrij — groeide hij nog 434.176 bytes.

Wie deze drempel ooit ruimer zet omdat de toets rood werd, repareert het
verkeerde: er is geen ruisbron die hem legitiem over de 150 kB tilt.

## Wat hier níet mee af is

📏 **Vier andere tabellen dragen dezelfde vorm** — een `*_over() > 0`-conjunct,
een dagplafondtrigger op dezelfde drempel, een rem op tweemaal die drempel:
`chat_messages` (500), `day_checkins` (500), `week_review_replies` (100),
`weekly_goals` (200). Staat als QS8-561.

⚠️ **En de truc uit deze toets werkt daar niet overal.** `berichten_over()` en
`weekreacties_over()` tellen op **auteur** (`sender_id` / `author_id`), niet op
doel-eigenaar. Opvullen via `adminDb()` telt daar dus niet mee voor de
testgebruiker; die fixtures moeten door de gebruiker zelf geschreven worden.
Alleen `dagafvinkingen_over()` en `weekdoelen_over()` tellen via de eigenaar,
zoals hier.

⚠️ Geen van de vijf is een live gat: alle vijf dragen de conjunct gewoon. Het
gaat om de grendel die hem vasthoudt bij een refactor.
