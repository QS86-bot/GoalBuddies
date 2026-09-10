# Delen per taak, en met één gekozen groep

**Datum:** 09-09-2026 · **Issue:** QS8-381 (epic QS8-378) · **Migratie:** 0248

De Lijst wordt deelbaar. Dit document legt vast wélke vorm dat kreeg, welke
varianten afvielen en waarom, en wat er onderweg gemeten is.

---

## 1. Het besluit

> *"De gebruiker kan aanvinken welke to-do items hij openbaar wil zetten voor
> zijn groep; welke niet aangevinkt zijn, zijn niet openbaar."*
> — Quinten, 09-09-2026, beslispunt 2 van QS8-378

Dat is **variant B**: delen per taak, standaard uit. Het epic legde vier vormen
voor, en de wens vroeg letterlijk om C.

| # | Wat de groep ziet | Waarom hij afviel |
|---|---|---|
| A | Alleen afgevinkte taken | Volledig binnen domeinregel 7, maar het haalt de helft van het nut weg: *"dit ga ik doen"* is precies wat je met een buddy deelt |
| **B** | **Per taak te delen** | **Gekozen** |
| C | De hele lijst, één schakelaar | Wat de wens letterlijk vroeg. Zie §2 |
| D | C, maar alleen in een open groep | Koppelt delen aan A41, en dat is een ándere vraag. Zie §4 |

## 2. Waarom niet C, terwijl dat gevraagd werd

**Omdat C de eerste plek in dit product zou zijn waar het achterblijven van een
ander zichtbaar wordt.**

Domeinregel 7 zegt dat de groep uitsluitend positieve signalen krijgt, en dat er
precies drie routes zijn waarlangs tegenslag de groep bereikt — alle drie via de
gebruiker zelf. Een gedeelde lijst mét onafgevinkte taken is een vierde route, en
een die je niet per geval aanzet: twaalf open regels waarvan er drie al twee weken
staan, is het schaamtemoment waar de Habit Huddle-analyse voor waarschuwt.

⚠️ **B is niet "C met een extra stap".** Het verschil is wie de regel aanwijst.
Bij C wijst de gebruiker één keer zijn lijst aan en daarna groeit die lijst
zonder dat hij er nog iets voor doet — inclusief de taak die hij vergeet weg te
halen. Bij B is elke regel een aparte handeling. Dat is dezelfde vorm als de drie
bestaande routes, en dáárom is er **geen derde benoemde verruiming van
domeinregel 7 nodig** naast A15 en A7.

De prijs is echt en staat hier zodat niemand hem hoeft te raden: **B is meer werk
voor de gebruiker.** Wie zijn hele lijst wil delen, vinkt regel voor regel aan.
Blijkt dat in gebruik te knellen, dan is de vraag opnieuw open — maar dan als
besluit en niet als gemak.

## 3. Wélke groep — de vraag die het besluit openliet

"Openbaar voor je groep" zegt niet welke, en een gebruiker kan er in meer dan één
zitten. Dat is onwrikbare regel 18 vraag 6: een aanname van *"er is er altijd
precies één"* die naar *"er kunnen er meer zijn"* getild wordt.

📏 Gegrepen vóór het bouwen, zoals die regel voorschrijft. `groepen[0]` staat op
drie plekken in `app/`, en `src/modules/buddies/deling.ts` draagt de reparatie
ervan uit QS8-56:

> *"Tot QS8-56 stond hier `groepen[0]` in het scherm, en dat was een keuze die
> niemand gemaakt had. Het verzoek ging naar de eerste groep uit de lijst, en die
> lijst had niet eens een `order by`."*

| # | Wat het betekent | Waarom niet |
|---|---|---|
| B1 | Zichtbaar voor iedereen met wie je een groep deelt | Eén vinkje bereikt élk gezelschap. CLAUDE.md waarschuwt daar bij domeinregel 7 met zoveel woorden voor: *zit er een leidinggevende in de groep, dan beschermt de regel niet tegen schaamte maar tegen een beoordelingsgesprek.* Je boodschappenlijst en je werkgroep zijn niet hetzelfde publiek |
| **B2** | **De taak draagt de groep waarmee hij gedeeld is** | **Gekozen** |

⚠️ **En de vriendelijke vorm erbij:** bij één groep vraagt de app niets, want dan
is er niets te kiezen. Pas bij twee of meer verschijnt de lijst. Dat is dezelfde
afweging die `beslissendeGroep()` maakt — *"anders zou het scherm een keuze
moeten onthouden die het nooit aan de gebruiker gesteld heeft, en dan is de
stille keuze terug onder een andere naam."*

## 4. Waarom dit niet aan A41 hangt

Besluit A41 laat een groep kiezen tussen **beschermd** en **open**, en varieert
daarop de gevoeligste policies. Delen per taak staat daar los van: een beschermde
groep ziet precies evenveel als een open groep, namelijk wat de eigenaar zelf
heeft aangewezen.

⚠️ Dat is een besluit en geen omissie. De grens die hier telt is *heeft de
eigenaar deze regel aangewezen*, en die vraag heeft met de groepsstand niets te
maken. Wie het er alsnog aan koppelt — *"in een open groep zie je de hele
lijst"* — bouwt variant C onder een andere naam.

Daarom staat `zet_taakzichtbaarheid()` in `GEEN_OPPERVLAK` van
`scripts/zichtbaarheid-controle.mjs` (hij varieert niet op `groups.zichtbaarheid`)
en het oppervlak zélf wél als rij 36 in
`docs/decisions/002-domeinregel7-oppervlakken.md`.

## 5. Hoe het afgedwongen is

**Het schrijfpad is een RPC en geen kolomgrant.** `visibility` en
`shared_group_id` staan in geen enkele grant, en `pin_taak()` weigert ze
bovendien. `zet_taakzichtbaarheid()` komt er langs met een sessiesleutel.

⚠️ **De sleutel draagt het taak-id en niet een vlag.** Een boolean zou binnen
dezelfde transactie élke rij doorlaten; het id laat er precies één door. Dezelfde
vorm als `app.huddledag_verzet` in 0208.

**De policy eist drie dingen tegelijk**: `visibility = 'group'`, een niet-lege
`shared_group_id`, en `mag_groep_lezen(shared_group_id)`.

⚠️ **Twee van die drie zijn overbodig, en dat is gemeten en opgeschreven in
plaats van weggepoetst.** 📏 De eerste twee zijn los weggehaald en daarmee bleef
élke test groen. Ze hebben elk een aanwijsbare oorzaak — de CHECK
`todo_items_groep_hoort_bij_gedeeld` en `mag_groep_lezen(null) = false` — en ze
blijven staan omdat ze zeggen wat de policy bedoelt en dragend worden zodra een
van die oorzaken wegvalt. Wat er getoetst wordt is daarom de **oorzaak** en niet
de conjunct: regel 18 in zijn scherpste vorm, breek de grendel die de ijking
noemt.


**En het delen eindigt met het lidmaatschap eronder.** Een gedeelde taak leunt op
het feit dat de eigenaar lid is van die groep. Eindigt dat, dan valt de grond
onder de toestemming weg, en de trigger `group_members_taken_sluiten` (§5 van de
migratie) zet die taken terug op privé.

⚠️⚠️ **Die grendel hangt aan het feit en niet aan de twee functies die vandaag
een lidmaatschap beëindigen**, en dat is drie keer overwogen. De eerste reden
staat al in rij 30 van `002-domeinregel7-oppervlakken.md`: *"de audit hangt aan
een trigger en niet aan de RPC, want een beheerder kan sinds 0029 met één kaal
verzoek `status = 'inactive'` zetten."* De tweede is gemeten en nieuw: de twee
routes eindigen **verschillend** — `verwijder_lid()` zet `status = 'inactive'`,
`verlaat_groep()` **verwijdert** de rij — dus één trigger op
`after delete or update` dekt allebei, terwijl een regel per functie de helft
dekt en de derde route van morgen mist. De derde is dat `verlaat_groep()` een
lichaam van 263 regels heeft, en zulke lichamen kopiëren is precies de val die
QS8-358 opleverde.

⚠️ **Wat dat kostte aan de pin: dichtdoen mag nu zonder sleutel.** Die trigger
sluit de taken van één lid in één UPDATE en kan dus geen sessiesleutel per rij
zetten; een sleutel die *alle* rijen doorlaat is precies de vorm die de test op
`app.taak_gedeeld` afwijst. De uitzondering staat daarom op de úitkomst: landt de
rij op `('private', null)`, dan mag het. De richting draagt dat — dichtdoen
verkleint wat de groep leest, en daar heeft geen aanvaller iets aan. Openen kan
nog steeds niet, en de kolomgrant staat er toch al vóór.

⚠️ **Niet dezelfde vraag als de gearchiveerde groep.** Een archief blijft
leesbaar (0153), dus een taak die met een gearchiveerde groep gedeeld is, blijft
gedeeld. Wat hier sluit is het lidmaatschap van de eigenaar, en dat is de grond
waarop hij überhaupt mocht delen.

**De invariant staat in de CHECK en niet in een gewoonte.** "Gedeeld" is één feit
dat in twee kolommen staat, en `todo_items_groep_hoort_bij_gedeeld` is daarom een
biconditionaal: `(shared_group_id is not null) = (visibility = 'group')`.

⚠️ De halve vorm stond er eerst, mét het argument dat de andere helft niet kón —
de `set null` van de foreign key zou hem laten afgaan. Dat argument klopte en is
opgelost in plaats van omzeild: `pin_taak()` normaliseert een rij zonder groep
terug naar `private`, en een BEFORE ROW-trigger draait vóór de constraint. Wat de
halve vorm toeliet was `('group', null)` — een taak die zégt gedeeld te zijn
terwijl er niemand meeleest. De policy sloot die netjes af, het scherm niet.

⚠️⚠️ **En die normalisatie is smal en niet breed, en dat verschil komt uit de
tweede security-ronde.** `if new.shared_group_id is null` dekte twee gevallen:
de foreign key die een verdwenen groep achterlaat, én een bevoorrechte schrijver
— `service_role` hééft de kolomgrant — die `visibility = 'group'` zet zonder
groep erbij. Die tweede kreeg dan geen fout maar een stille terugzetting, en dan
zijn *"ik heb gedeeld"* en *"er is niets gebeurd"* niet uit elkaar te houden. De
vorm is nu `old.shared_group_id is not null and new.shared_group_id is null`: hij
normaliseert alleen wat de foreign key achterlaat, en de rest loopt door naar de
CHECK. 📏 Gemeten: `GEWEIGERD 23514 … violates check constraint
"todo_items_groep_hoort_bij_gedeeld"`. De review vroeg om een `raise warning`;
dit is dezelfde reparatie een stap verder, want een waarschuwing was ook afgegaan
op het legitieme pad.

## 6. Wat er onderweg gemeten en gerepareerd is

**De pin blokkeerde de foreign key.** 📏 Gevonden doordat het opruimen van de
RLS-suite met een groep bleef zitten. `on delete set null` op `shared_group_id`
is een gewone UPDATE, die vuurt `pin_taak()`, en de pin weigerde de foreign key
zijn eigen werk — een groep met één gedeelde taak erin was daarmee **nooit meer te
verwijderen**. Een grendel die iets anders vastzette dan hij bewaakte.

⚠️ De reparatie is de vorm die `onveranderlijkheid_bewaking()` herkent
(`old.x is null or new.x is not null`) en niet een eigen variant. Mijn eerste
versie was semantisch identiek en tóch rood: die bewaking eist de letterlijke
vorm, precies zodat er één herkenbare vorm is voor de val die 0031, 0033 en 0059
alle drie maakten.

**De leespolicy stond op de verkeerde helper.** 📏 `archiefleesgat()` werd meteen
rood: *"leespolicy loopt langs `is_group_member()`; die sluit een archief uit."*
De regel die 0153 vestigde is de lees/schrijf-splitsing — een archief blijft
leesbaar, alleen de schrijfkant gaat dicht. De policy staat nu op
`mag_groep_lezen()` en de RPC op `is_group_member()`.

**Een gedeelde taak overleefde het vertrek van zijn eigenaar.** 📏 Gemeten in
een terugrollende transactie: `verwijder_lid(werk, carla, true)` gaf
`{"ok": true}`, het lidmaatschap werd `inactive`, en de taak stond daarna nog op
`visibility = 'group', shared_group_id = werk` — de beheerder las hem gewoon
terug. Elk onderdeel klopte: de RPC deed wat hij belooft, de policy deed wat hij
belooft, en de suite bleef groen. Onwrikbare regel 18 vraag 1 in zijn letterlijke
vorm. De reparatie staat in §5; er staan nu vier tests op die naad, waarvan één
de must-allow ernaast (de taken van wie blíjft, blijven staan).

**En één ijking gaf een vals groen.** Sinds de biconditionaal geven de CHECK en
de `raise` in `pin_taak()` allebei `23514`. 📏 Onder mutatie D (`v_mag_delen`
altijd `true`) weigerde de CHECK het halve dichtdoen met precies datzelfde
nummer, dus een assertie op `sqlstate` alleen bleef groen met een volledig
kapotte pin. De uitslag draagt nu de melding erbij, en die is van niemand anders
dan de pin.

**Een aantekening bij een grendel was onwaar geworden, en dat is gevaarlijker dan
geen aantekening.** Bij `fetchTaken()` stond *"`eq('user_id', …)` is er voor de
index en niet voor de autorisatie — wie hem ooit weghaalt, verandert de snelheid
en niet de grens."* Dat klopte zolang `todo_items` eigenaar-only was; sinds deze
migratie geeft `todo_items_select` je óók de gedeelde taken van je groepsgenoten.
📏 Gemeten als Bob zonder die filter: `ALICE deelt dit | bob eigen taak`.

⚠️ **Dit is regel 18 vraag 4 met de wereld eronder verschoven in plaats van de
code.** De zin verhuisde niet en de test verhuisde niet; wat veranderde was
waaróm de regel eronder er stond. En de zin was precies het argument dat iemand
bij een refactor zou overtuigen hem weg te halen — waarna andermans taken tússen
je eigen taken staan, `count: 'exact'` ze meetelt en `verzetTaak()` op een
buurtaak van een ánder mikt. Er staat nu een test op ('haalt precies de taken van
de opgegeven gebruiker op'), want een gecorrigeerde zin is nog steeds een zin.

**De belofte op het scherm was onwaar geworden.** `lijst.prive_uitleg` zei
*"niemand in je groep ziet je taken. Delen kan nog niet"* — waar op de dag dat
QS8-380 landde, onwaar op de dag dat dit issue landde.
`src/shared/i18n/beloftes.test.ts` werd daar rood van, en dat is precies waarvoor
die test in EPIC 13 gebouwd is: daar bewoog de policy en de zin niet mee.

## 7. Wat er niet in zit

* **Systeemberichten.** *"X heeft een taak gedeeld"* is een nieuw type
  systeembericht en dus een migratie op de allowlist — en het is de vraag of het
  gewenst is. Apart besluit, apart issue.
* **Realtime.** `todo_items` staat niet in de publicatie en dat blijft zo.
* **Reageren op elkaars taken.** Dat is chat, en die bestaat al.
* **Met meer dan één groep tegelijk delen.** Dat is B1 met extra stappen, en het
  maakt de zin op het scherm onwaar. Wil iemand het, dan is dat een besluit.
