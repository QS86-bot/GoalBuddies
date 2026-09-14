# Een uitgezette trigger is van iedereen

**14-09-2026 — QS8-481.** Vier oorzaken van kruisbesmetting. Drie stonden er bij
het openen van het issue; de derde is een andere klasse dan de twee ervóór, en de
vierde is gevonden door het acceptatiecriterium zélf — ná de eerste drie
reparaties.

## Wat er gemeten is

📏 Twee volledige suites tegelijk op een verse stack, mét de solo-controlemeting
ernaast — want een rood is niet vanzelf jouw rood:

```
vooraf   run A  2 bestanden / 4 tests rood     run B  2 bestanden / 5 tests rood
         solo   403 bestanden, 5727 tests groen
```

Drie oorzaken, en ze staan in dezelfde drie vormen als de drie die QS8-348
opruimde — zes dagen eerder.

## De twee makkelijke: een gedeelde identiteit die geen uuid is

**`pushtoken-dagteller`.** `proefId()` maakte de gebruiker per run uniek, maar
`token(n)` gaf `ExponentPushToken[aaaa…n]` — een vaste string. En
`registreer_push_token()` doet `on conflict … do update set user_id =
excluded.user_id`, dus de andere run trok de twintig rijen naar zich toe.

⚠️ **Dit is gevaarlijker om te lezen dan de botsing van QS8-348.** Daar wierp
`groups_invite_code_key` een 23505 die naar de oorzaak wees. Hier weigert niets:
de rij verhuist stil, en de test telt `1` waar `20` hoorde.

**`bewijsfotobucket`.** Een vaste bucket- en objectnaam op
`objects_bucket_id_name_key` — letterlijk de vorm van QS8-348, op een andere
tabel.

Allebei opgelost met `proefCode()`, dat sinds QS8-348 al bestond. ⚠️ Dat is het
punt: **het mechanisme was er, en niets dwong af dat je het gebruikt.**

## De derde: gedeeld schema in plaats van gedeelde identiteit

`lidmaatschapsgrens.test.ts` zette `group_members_guard` uit met een losse
`psql()` en zette hem in een `finally` weer aan. Die `psql()` **commit**, en
`alter table … disable trigger` is geen sessie-instelling maar een
schemawijziging: in dat venster schrijft élke andere verbinding ongegrendeld.
📏 `rechten-zonder-aanroeper.test.ts` werd er in de gelijktijdige run twee keer
rood van — en geen van beide bestanden kon zien waaróm.

⚠️ **`proefId` kan hier niets aan doen.** Er is geen identiteit om uniek te
maken. Dat is waarom dit een eigen klasse is en niet een derde instantie.

### De reparatie, en wat ze kost

De `disable`, de poging en de `rollback` gaan in één `psql()`-aanroep. De poging
moet dus mee de transactie in en dus via `psql` in plaats van via PostgREST —
dat is een andere verbinding en zou de uitgezette trigger niet eens zien. De
policy doet in `psql` hetzelfde werk: `set local role authenticated` plus de
jwt-claims geven dezelfde `auth.uid()` en dezelfde RLS.

⚠️⚠️ **De prijs staat erbij, en hij is groter dan hier eerst stond.** Er stond
dat de `disable` een ACCESS EXCLUSIVE-lock neemt en dat een gelijktijdige run
"even wacht — milliseconden". Allebei nagemeten op de lokale stack, en allebei
bijgesteld:

```
mode                  | granted
ShareRowExclusiveLock | t
```

Het is **ShareRowExclusive**, niet ACCESS EXCLUSIVE. Dat verandert wát er
botst — lezers mogen door, schrijvers niet — maar niet dát het botst: de
`RowExclusiveLock` van elke INSERT, UPDATE en DELETE conflicteert ermee.

En "milliseconden" klopte niet. 📏 Een houder met nog 10 s te gaan liet een
schrijver **10058 ms** wachten: **de wachttijd ís de looptijd van de transactie**,
niet een fractie ervan. Voor `lidmaatschapsgrens` is die ruil nog steeds de goede
kant op — daar leeft het slot één `update` lang — maar de zin die er stond,
gold voor die éne omzetting en werd hier opgeschreven als eigenschap van de vorm.

⚠️ **Daarmee is het criterium van dit hele document te ruim.** In-transactie
sluit het **commit-venster**; het sluit het **slot** niet. Een `disable trigger`
in een lange transactie blokkeert elke concurrente schrijver op die tabel, en
`fileParallelism: false` dekt dat alleen bínnen één run — twee runs zijn twee
processen. Een regel in `BEKEND` beantwoordt daarom sinds deze correctie twee
vragen en niet één. De openstaande instantie daarvan
(`goedkeuring-wijst-naar-de-eigenaar` op `completion_approvals`) staat als
QS8-492.

⚠️ **De must-allow houdt.** Twee sloten op één belofte toetsen vraagt dat het
bovenste even weg kan; zonder die wereld bewaakt zo'n test niets. Die opstelling
blijft precies mogelijk — alleen niet meer voor de hele database tegelijk.
📏 Geijkt: de check-helft van `group_members_update` verruimen naar `true` maakt
nog steeds precies dat ene geval rood.

## ⚠️ Het besluit: een register en geen ontleder

De grendel is `npm run triggeruitzetting:controle`. Hij eist per
`disable trigger` in `tests/rls/` één regel die zegt **hoe het geïsoleerd is**.
Hij verbiedt niets.

Waarom geen controle die zélf kijkt of de `disable` binnen een
`begin … rollback` valt: zo'n ontleder moet template-literals volgen die als
losse `const` worden samengesteld, en 📏 twee van de zeven gevallen van vandaag
doen precies dat (`goedkeuring-wijst-naar-de-eigenaar`,
`seizoensrecap-per-groep`). Een ontleder die dát niet aankan, bewaakt vanaf dat
moment de omweg en niet de belofte — de les van QS8-415. Een register kan het
niet mislezen.

⚠️ **De ratel slaat twee kanten op**, en die helft vond meteen een fout van
mijzelf: ik had `remdekking.test.ts` geregistreerd terwijl dat de term alleen in
zijn ijkingskop noemt. De controle meldde dat de regel nergens meer op sloeg.

⚠️ **Vier van de zeven zijn nog niet omgezet, en hun registerregel zegt dat.**
Dat is een meting en geen aanname: bij de twee gelijktijdige runs van vandaag
werd geen van die vier rood en maakte geen van die vier iets anders rood. Zet ze
om zodra dat wél gebeurt. Ze nu allemaal omzetten zou vier opstellingen
herschrijven op grond van een vermoeden.

## Een vierde oorzaak, gevonden door criterium 4 zelf

Na de drie reparaties waren twee gelijktijdige volledige runs nog steeds niet
allebei groen. Dat is de opbrengst van het criterium: het meet de belofte
("twee runs naast elkaar deugen") en niet de reparaties.

**`een-foto-verlaat-zijn-groep-niet`.** Elke telling in dat geval is met
`${groepA}/${vertrekker}/%` op de eigen run ingeperkt — op één na, en die zocht
alleen de letterlijke tekst `kijk hier`. Twee runs, twee rijen, `tekstOver` gaf
`2` waar `1` hoorde.

⚠️ **Dit is de identiteitsklasse, maar op een vorm die `proefId()` en
`proefCode()` niet raken:** er is geen sleutel en geen unieke constraint, alleen
een `where` die te weinig zegt. De reparatie is één kolom erbij.

📏 Geijkt met drie gelijktijdige paren van dat ene bestand, in beide richtingen —
zónder de fix **6 van de 6** rood, mét de fix **6 van de 6** groen, en het rood
was elke keer de toets die de mutatie noemt.

## De klasse, niet de instanties

CLAUDE.md schrijft het bij de CI-controles van 27-08: *"een reparatie die de
instanties opruimt en het mechanisme laat staan, groeit terug — en hij doet dat
onder een rij die 'opgelost' zegt."* QS8-348 ruimde drie instanties op; zes
dagen later stonden er drie nieuwe, twee in exact dezelfde vorm.

Wat hier bij komt is dus niet de reparatie maar de grendel: een nieuwe
`disable trigger` kan er niet meer stil bij. Voor de twee identiteitsvormen
blijft het handwerk — `proefId()` en `proefCode()` bestaan, en niets dwingt af
dat een nieuwe fixture ze gebruikt. ⚠️ **Dat is een bekende grens en hij staat
hier opgeschreven**, want een controle die "elke vaste string in een fixture"
zou melden, meldt alles en leert je hem uitzetten.
