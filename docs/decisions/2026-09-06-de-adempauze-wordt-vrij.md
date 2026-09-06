# De adempauze wordt vrij, en wat dat kost

**Datum:** 06-09-2026 · **Issue:** QS8-227 · **Migratie:** 0165
**Besluit van:** Quinten, 30-08-2026 · **Advies daarvóór:** tegen

---

## 1. Wat er verandert

| | Vóór 0165 | Sinds 0165 |
|---|---|---|
| Lengte | hoogstens twee cycli | elke lengte |
| Wanneer | vanaf de vólgende cyclus | elke cyclus, ook een die al voorbij is |
| Aantal | meerdere mocht al | meerdere, en nu ook zichtbaar in het scherm |
| Overlap | verboden | verboden |
| Hele weken | verplicht | verplicht |

Twee grenzen vervallen: de CHECK `breathers_hoogstens_twee_cycli` en de
weigering `niet_vooraf` in `plan_adempauze()`. Twee blijven: de weekdagtoets met
`breathers_hele_cycli`, en de overlapcontrole met de unieke index
`breathers_geen_dubbele_start`.

## 2. De tegenspraak, en waarom hij hier blijft staan

`niet_vooraf` bestond tegen één aanval, en die is niet theoretisch:

> Het is zondagavond. Je weet dat je je weekdoel niet gaat halen. Je kondigt een
> adempauze aan over de lopende week. De rollover schrijft `excused` in plaats
> van `missed`, en het minpunt wordt niet geboekt.

Dat is dezelfde ontsnapping als A39 en A40, en die hebben samen vier migraties
gekost: 0043 tot en met 0046, plus 0066 vanuit een andere hoek. **Dit besluit
zet er één bewust weer open, en breder dan hij ooit dicht zat** — met
terugwerkende kracht kun je een week die al gemist is alsnog wegnemen.

Ik heb geadviseerd het vooraf aankondigen te behouden. Quinten heeft daarna voor
volledige vrijheid gekozen. Dat is zijn keuze en die is gebouwd. De consequentie
hoort er wel bij te staan:

**De reeks en het minpunt worden vrijwillig.** Wie een gemiste week ziet
aankomen of al gemist heeft, kan hem wegnemen. De score is daarna geen bewijs
meer maar een intentie. Wie de score ooit ergens op wil baseren — een
klassement, een commitment device dat afgaat, een seizoensrecap — leest dit
eerst.

⚠️ **Wat dit níét is: een uitzondering op domeinregel 6.** De geschiedenis wordt
niet overschreven. De `cycle_missed`-rij blijft staan en er komt een
`correction`-rij naast met de tegengestelde delta. Het saldo klopt en het spoor
ook: aan `points_ledger` is te zien dát er een week is teruggedraaid en wanneer.
Was het een `delete` geweest, dan was dit besluit óók een schending van
domeinregel 6, en dan had het er twee moeten opgeven in plaats van één.

## 3. De rem die overblijft, en wat die rem zelf kost

Er is er nog precies één, en dat is de aankondiging aan de groep.

`breathers` is leesbaar voor groepsgenoten van een gekoppeld doel. Dat is
domeinregel 7's eigen uitzondering: tegenslag mag de groep bereiken langs de
gebruiker zelf, en een adempauze aankondigen is die eigen handeling. Sinds A50
(25-08-2026) is de hele rij zichtbaar, begin- en einddatum incluis.

⚠️ **Daarom is "ook met terugwerkende kracht net zo aangekondigd" een
acceptatiecriterium en geen bijzaak.** Een pauze achteraf die de groep niet
bereikt, is niet een half gebouwde feature maar de laatste rem die eraf valt.
`breathers_select` filtert niet op datum en de RPC maakt de rij op dezelfde
manier aan, dus het klopt vandaag — en `tests/rls/epic8.test.ts` wordt rood
zodra iemand er een datumfilter in zet. Dat is nagemeten met een mutatie op de
policy en niet aangenomen.

### 3a. En dat is een verruiming van domeinregel 7 — benoemd, niet meegelift

⚠️⚠️ **Dit is de duurste vondst van de security-review van 06-09-2026, en ze
zat niet in de code maar in een document.** Rij 21 van
`002-domeinregel7-oppervlakken.md` keurde de zichtbaarheid van `breathers` goed
met precies deze zin:

> "de gebruiker kondigt zijn pauze **zelf en vooraf** aan … Een aankondiging
> vooraf is iets anders dan een gemiste week achteraf."

Dat "vooraf" was de hele onderbouwing, en dit besluit haalt het weg. Sindsdien
kan een groepsgenoot in een **beschermde** groep uit één rij afleiden dát je een
week gemist hebt: een pauze waarvan `announced_at` ná `ends_cycle` ligt, kondig
je aan omdát die week misging. Gemeten met één GET op `/rest/v1/breathers` als
gewoon lid; `weekly_goals.status` bleef daarbij netjes dicht (0047), dus dit is
een nieuw oppervlak en niet een bestaand lek.

**Het besluit zelf staat.** Quinten schreef in QS8-227 met zoveel woorden dat
een terugwerkende pauze "net zo zichtbaar wordt aangekondigd als een vooruit
geplande", en dat de aankondiging de enige rem is die overblijft. Wat ontbrak
was de erkenning dát dit domeinregel 7 verruimt. Die staat er nu, als **derde
benoemde verruiming naast A15 en A7**, in `002` §4a — met dezelfde vorm en
dezelfde zorgvuldigheid.

⚠️ **De les erachter is algemener dan deze feature.** De verruiming stond
nergens in het issue; ze volgde uit het schrappen van een lengtegrens. CLAUDE.md
waarschuwt daar bij regel 19 voor — *staat er over deze primitieve handeling een
weggelegde bevinding?* — en hier stond er een. Die is pas bij de review
teruggevonden.

⚠️ **En de copy is meeverhuisd.** `adempauze.groep_ziet` zei "ze zien niet welke
weekdoelen je wel of niet gehaald hebt" en verzweeg dat een pauze over verstreken
weken net zo zichtbaar is. Een bevestiging op grond van een onjuiste zin is er
geen (domeinregel 5), dus die zin noemt het nu.

## 4. Waarom de weekdagtoets wél blijft

`breathers_hele_cycli` en de toets op `week_start_day` zien eruit als dezelfde
soort grens, maar zijn het niet. Ze zijn geen anti-misbruikregel maar een
correctheidsregel: **de rollover werkt per cyclus.** Een pauze van woensdag tot
woensdag dekt twee hálve cycli, en dan doet de rollover iets anders dan het
scherm belooft.

Het scherm laat daarom vrije datums toe en rondt ze zichtbaar af naar hele
weken: "Dit wordt 5 weken: van 7 september tot en met de week van 5 oktober."

⚠️ **Het tonen is de helft van het besluit.** Afronden zonder het te laten zien
is stilzwijgend iets anders doen dan gevraagd, en dan is het puntentotaal de
eerste plek waar de gebruiker het merkt.

De afronding zelf staat in `src/modules/goals/adempauze-periode.ts` en niet in
het scherm, en rekent niets zelf uit: `userCycleOn` en `cyclesBetween` komen uit
`shared/time` (correctheidsregel 7).

## 5. Wat de tests bewaken, en hoe dat geijkt is

Tien grendels, elk apart kapot gemaakt en gecontroleerd of de test die hem
noemt rood werd. Een mutatie per grendel, niet één mutatie voor het geheel.

| # | Grendel | Mutatie | Test die rood werd |
|---|---|---|---|
| 1 | het herstelblok zet `excused` | de `update` eruit | zet een al afgesloten gemiste week op excused ... |
| 2 | de correctierij | de `insert` eruit | idem |
| 3 | `having sum <> 0` | de `having` eruit | boekt geen correctie voor een gemiste week die geen minpunt kostte |
| 4 | `niet_vooraf` is weg | de weigering terug | staat een adempauze over de week die nu loopt toe |
| 5 | de CHECK is gedropt | de constraint terug | staat een adempauze van vijf weken toe |
| 6 | de overlapcontrole blijft | de controle eruit | weigert een adempauze die over een bestaande heen ligt |
| 7 | de weekdagtoets blijft | de toets eruit | weigert een datum die geen cyclusstart is |
| 8 | de aankondiging achteraf | een datumfilter in `breathers_select` | is voor een groepsgenoot ook zichtbaar met terugwerkende kracht |
| 9 | correctie per weekdoel | één correctie per cyclus | draait het minpunt van elk weekdoel in de cyclus apart terug |
| 10 | de herberekening | `herbereken_reeks()` eruit | herberekent de reeks, zodat een herstelde week hem niet meer breekt |

| 11 | de eigenaarspoort | de poort eruit | een groepsgenoot krijgt not_owner en de gemiste week blijft gemist |
| 12 | het slot per doel | `pg_advisory_xact_lock` eruit | laat er maar één door, ook als de tweede binnen de transactie van de eerste valt |
| 13 | het plafond van een jaar | de grens eruit | weigert een adempauze van langer dan een jaar |
| 14 | `carried` hoort erbij | terug naar alleen `missed` | stelt ook een doorgeschoven week vrij en draait dat minpunt terug |
| 15 | `cancelled` hoort er niet bij | `cancelled` erbij | laat een ingetrokken week met rust |
| 16 | client en database delen het plafond | `c_max_cycli` op 26, en apart: de constante weg | en dat zijn twee keer dezelfde weken |

Plus acht op de afronding zelf in `adempauze-periode.test.ts`, waaronder de
startdag vastgezet op maandag in plaats van die van de gebruiker, en één in
`shared/time`: de cyclusgrens rond het jaar 9999.

⚠️ **Grendel 11 hoort in `definerpoorten.test.ts` en niet in `epic8.test.ts`, en
dat is de les van QS8-283.** Er stónd al een test die `not_owner` verwachtte,
maar die toetst een fóutreden: haal de poort weg en de weekdagtoets erachter
weigert op een andere grond, en dan is de test rood zonder dat er iets over het
effect gezegd is. De nieuwe test kiest een cyclusstart die samenvalt met de
gemiste week, zet de effect-asserties vóór de reden, en werd bij de mutatie rood
op `expected 'excused' to be 'missed'`. `plan_adempauze()` staat sinds dit issue
ook in het register van `scripts/definers-controle.mjs`: hij schrijft nu in
`weekly_goals` en `points_ledger` en stapte daarmee die klasse in.

⚠️ **En één grendel zit in `shared/time`, wat betekent dat dit issue daar een bug
vond.** `userCycleOn()` belooft `Cycle | null`, maar wierp een uitzondering voor
een datum in de laatste week van het jaar 9999 — de cyclus eromheen loopt door in
het jaar 10000 en dat past niet in een `YYYY-MM-DD`. Wie dat in het
adempauzeveld typte, kreeg geen melding maar een leeg scherm. Gevonden door de
test die het plafond van 7a toetst, niet door de review.

⚠️ **Grendel 6 was er niet, en dat kwam uit de ijking.** De overlapcontrole
stond er al sinds 0048 en had geen enkele test. Dat viel niet op zolang een
pauze hoogstens twee cycli duurde en vooruit gepland moest worden: botsen kostte
moeite. Met vrije datums en meerdere pauzes naast elkaar is elkaar overlappen de
gewóne fout geworden. **Een grens verandert van gewicht als de feature eromheen
verandert, ook als de grens zelf hetzelfde blijft.**

⚠️ **En één test moest in tweeën, ook uit de ijking.** Eén test voerde rommel in
het beginveld met een leeg eindveld; toen de null-controle op het begin werd
weggehaald, bleef hij groen — een leeg eindveld valt terug op de begindatum, dus
de tweede controle ving hem alsnog af. Dat is de vorm die CLAUDE.md bij regel 18
beschrijft: een ijking die zijn geval door een pad voert dat een éérdere grendel
al afvangt, bewaakt niets van wat hij belooft.

## 6. Rollback

In de kop van `supabase/migrations/0165_...sql`. Terugzetten laat reeds
herstelde weken op `excused` staan mét hun correctierij — dat is geschiedenis en
hoort niet teruggedraaid te worden (domeinregel 6).

---

## 7. De grenzen die er ná de review bij zijn gekomen

De security-review van 06-09-2026 vond vier dingen die met dit besluit meelifden
zonder dat iemand ze gekozen had. Alle vier zijn tegen de gedéployde stand
gemeten, niet tegen de migratiebestanden.

### 7a. Een plafond van een jaar — een bewuste afwijking van "elke lengte"

Het issue zegt "elke lengte". Er staat nu toch een grens van 52 cycli, en de
reden is niet misbruik maar **onomkeerbaarheid**:

`annuleer_adempauze()` (0048) weigert alles waarvan `starts_cycle <= vandaag`.
Een pauze die in het verleden begint is dus **nooit meer te annuleren** — een
regel die klopte zolang je alleen vooruit kon plannen, en die met dit besluit
iets heel anders betekent. Combineer dat met de overlapcontrole en één verkeerd
getypt jaartal zet het doel permanent op pauze, zonder weg terug in de app. De
review plande er een van `2030-01-07` tot `9999-12-27`: 415853 weken.

Het getal staat op twee plekken, en dat is een bewuste kopie: `c_max_cycli` in
`plan_adempauze()` dwingt hem af, `MAX_ADEMPAUZE_CYCLI` in
`adempauze-periode.ts` laat het scherm hem tónen vóór de knop — want een veld
waarin `9999` mag en dat daarna weigert, is geen vrije invoer maar een val. De
naad tussen die twee staat onder test: `tests/rls/adempauze-grendels.test.ts`
leest de constante uit de gedeployde functie en legt hem naast de client.

⚠️ **Dit is de plek om terug te komen als Quinten het er niet mee eens is.** Het
alternatief is de grens weghalen en `annuleer_adempauze()` verruimen, en dat is
een groter besluit: intrekken van een pauze die al weken heeft vrijgesteld,
vraagt dat die weken teruggezet worden, en dat botst met domeinregel 6.

### 7b. De overlapcontrole was een volgorde-aanname

`if exists (...) then return 'overlapt'` en de `insert` erna zijn twee losse
statements. In read committed ziet de ene transactie de ongecommitte rij van de
andere niet, dus komen twee gelijktijdige aanroepen er allebei door. Gemeten met
twee parallelle sessies: twee overlappende adempauzes op hetzelfde doel.
`breathers_geen_dubbele_start` vangt dat niet af zodra de begindatums verschillen.

Dit stond er al sinds 0048 en het werd pas nu iets: zolang een pauze hoogstens
twee cycli duurde en vooruit gepland moest worden, kostte botsen moeite. **Een
grens verandert van gewicht als de feature eromheen verandert, ook als de grens
zelf hetzelfde blijft.**

Opgelost met `pg_advisory_xact_lock` op het doel, vóór de controle. Geen
`exclude`-constraint met `daterange`: die vraagt `btree_gist`, en dit project
draait op nul extensies — een eerste extensie op de gratis tier is een groter
besluit dan deze bug rechtvaardigt. De grendel staat onder test met twee echte
sessies en een `statement_timeout`, en is geijkt.

### 7c. `carried` hoorde in de herstellus, en de motivering om hem eruit te laten was onjuist

De eerste versie schreef dat `carried` "als nieuwe rij in een latere cyclus staat
en geen minpunt heeft om terug te draaien". Nagemeten klopt dat niet:
`schuif_weekdoel_door()` weigert alles wat niet `missed` is en zet díe rij dan op
`carried`, zónder het al geboekte `cycle_missed` aan te raken. En
`herbereken_reeks()` telt `carried` óók als gemist.

Een adempauze over een doorgeschoven week deed dus niets, terwijl de RPC
`ok: true` gaf en het scherm zei dat gemiste weken erin vrijgesteld werden. Nu
zit `carried` in de lus; `cancelled` blijft er met reden buiten en daar staat een
must-not-do-test op.

⚠️ **Dit is regel 18 vraag 2 in het klein.** De motivering was een bewering over
een ánder onderdeel (`schuif_weekdoel_door`), opgeschreven zonder hem te meten.
Een commentaarregel die een feit over de buurman claimt, hoort net zo goed
nagemeten te worden als een assertie.

### 7d. Een som die aan een aanname hing

De correctie-subquery telde alle `cycle_missed`-rijen bij dat weekdoel op,
ongeacht `user_id`, terwijl de correctie op `v_uid` landt. Vandaag onbereikbaar —
`weekly_goals` heeft geen eigen `user_id` en `goals.owner_id` staat niet in de
kolomgrant van `authenticated`, dus eigendom is niet over te dragen. Er staat nu
`and pl.user_id = v_uid` bij: het kost niets en het maakt van een aanname een
voorwaarde.

### 7e. Wat er níét gerepareerd is, en waarom

| Bevinding | Wat ermee gedaan is |
|---|---|
| De teller van De Ketting kan nu midden in een groepsperiode verspringen, doordat een pauze over de lópende week een lid per direct uit `in_aanmerking` haalt | Rij in `docs/ENGINEER-REVIEW.md`. Het is een aggregaat en geen rij over één persoon, maar CLAUDE.md noemt die teller wél bij de zes oppervlakken die dicht blijven — dus het hoort in de afweging en niet in een commit |
| `points_ledger_dedupe_idx` (0001) is wat een gelijktijdige dubbele correctie tegenhoudt, en 0165 noemt hem nergens | Rij in `docs/ENGINEER-REVIEW.md`. Verdwijnt die index ooit bij een refactor van de dedupe-strategie, dan is dit stil een puntenautomaat |

⚠️ **Punten verdienen kan niet.** De review probeerde het langs vijf routes —
herhaald aanroepen, gelijktijdig, de week terugzetten op `missed`, een andere
`reason`, en annuleren-en-opnieuw — en alle vijf zitten dicht: de
overlapcontrole, de dedupe-index uit 0001, de kolomgrant op `weekly_goals` (geen
`status`, geen `points_miss`), de harde filter op `cycle_missed`, en
`annuleer_adempauze`. De grants op `plan_adempauze()` zijn ongewijzigd correct
(`CREATE OR REPLACE` behoudt de ACL uit 0048).
