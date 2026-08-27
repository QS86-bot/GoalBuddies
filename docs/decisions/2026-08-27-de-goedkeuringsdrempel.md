# De goedkeuringsdrempel per groep — QS8-65 (PRD 6.4), migratie 0107

**27-08-2026.** Twee acceptatiecriteria: *een regel per groep — één lid,
meerderheid of quorum*, en *wijzigen raakt lopende goedkeuringen niet met
terugwerkende kracht*. Het tweede is het moeilijke, en het bepaalt de vorm van
het eerste.

---

## 0. De kolom lag er al, en dat was bekend

`groups.approval_rule` staat sinds migratie `0001` in het schema, met een CHECK
op `('any', 'majority')` en sinds `0019` een kolomgrant. **Er heeft nooit iets
naar gekeken.**

Dat is dezelfde vorm als QS8-113 — een kolom met een grant en een policy die
niemand kon gebruiken — met één belangrijk verschil: dit lag *bewust* dood, en
`dode-keten-controle` wist het. De uitzondering stond er met een reden en een
vervalvoorwaarde:

> `groups.approval_rule=majority` — *"Wordt een defect zodra iets de kolom gaat
> lézen: dan belooft een groep een regel die de goedkeuring niet uitvoert, en dat
> raakt domeinregel 3."*

Dat is de constructie uit QS8-123 die werkt: een weggelegde bevinding die zelf
zegt wanneer hij terugkomt. Hij is nu teruggekomen.

⚠️ **Die uitzondering is nog niet weggehaald, en dat is opzet.** `scripts/` is
deze week het werkgebied van een parallelle sessie. De regel is inmiddels
onjuist — `'majority'` staat als letterlijke waarde in `src/`, dus de controle
ziet een schrijver en zou ook zonder de uitzondering groen zijn. Staat als
losse regel in `docs/ENGINEER-REVIEW.md`.

---

## 1. Waarom de drempel een getal is en geen regel

Criterium 2 kan niet met een regel die bij het goedkeuren wordt uitgelezen. Zou
`award_points_on_approval()` live in `groups.approval_rule` kijken, dan tilt een
beheerder die midden in de week op `quorum 4` zet de lat op onder een week die al
twee bevestigingen had. De gebruiker heeft niets fout gedaan en zijn week gaat
toch niet door.

⚠️ **En het is niet alleen de regel die schuift.** Bij `majority` beweegt het
getal zonder dat iemand iets instelt: een meerderheid van vier is drie, van zes
is vier. Iemand die zich aanmeldt verhoogt dus de lat van een week die al loopt.
Dezelfde verrassing, andere oorzaak — en één mechanisme dekt ze allebei als je
het **getal** bevriest in plaats van de regel.

Dat gebeurt bij het indienen, per groep waar het doel op dat moment aan hangt, in
`completion_approval_rules`. De tabel heeft géén INSERT-, UPDATE- of
DELETE-policy: de trigger is de enige schrijver. Een client die zijn eigen
`approvals_required` op 1 kan zetten, heeft de hele regel weggeschreven.

---

## 2. Per groep, en niet het strengste over alle groepen

Een doel kan sinds QS8-56 in meer dan één groep staan, en dan is "de regel"
meervoud. Twee modellen:

| | Model | Gevolg |
|---|---|---|
| (a) | Het strengste van alle gekoppelde groepen wint | Zoals `enforce_evidence_policy` voor de bewijseis |
| (b) | Elke groep oordeelt met zijn eigen regel | De week is bevestigd zodra één groep zijn eigen drempel haalt |

**Gekozen: (b).** Deze module zegt op elke andere plek dat elke groep een aparte
toestemming is — `goal_group_links_delete` kijkt naar één rij, het doelscherm
geeft per groep een knop, en de zin over wat je deelt staat per groep. Model (a)
zou de strengheid van groep B laten bepalen of de vrienden in groep A elkaar
mogen geloven, en dat is een ander sociaal contract dan zij gekozen hebben.

⚠️ **Waarom de bewijseis wél het strengste neemt.** Die gaat over wat de
*indiener* moet leveren, en hij levert het één keer voor alle groepen tegelijk.
Een bevestiging is van één groep en telt daar. Het onderscheid is niet
willekeurig: alles wat de indiener één keer doet, moet aan de strengste eis
voldoen; alles wat een groep over hem oordeelt, hoort bij die groep.

⚠️ **Dit is de plek om te kijken als iemand het anders wil.** Het zit in één
functie — `goedkeuringsdrempel_gehaald()` — en dat is met opzet.

---

## 3. Eén bron voor de telling, want dit is een naad

De drempel wordt op twee plekken gelezen:

* bij het **goedkeuren**, in `award_points_on_approval()`;
* bij het **intrekken**, in `trek_goedkeuring_in()`, die tot deze migratie
  `nog_geldig > 0` deed.

Die tweede is de gevaarlijke. Met een drempel boven één leest "er is nog iemand
anders akkoord" als "de regel is nog gehaald" — en dan blijft een week bevestigd
die de meerderheid niet meer heeft. Elk onderdeel klopte; het geheel niet.

Beide roepen nu `goedkeuringsdrempel_gehaald()` aan, en dat is de enige plek waar
geteld wordt. Met de hand gebroken op 27-08: `nog_geldig > 0` terugzetten maakt
precies één test rood (*"zet de week terug zodra een intrekking onder de drempel
duikt"*) en de rest van het bestand groen.

---

## 4. Wat er bewust níét aan de drempel hangt

**Het reviewpunt van de beoordelaar.** Wie als eerste van drie bevestigt heeft
dezelfde aandacht gegeven als wie als derde bevestigt. Zou het punt pas bij het
halen van de drempel vallen, dan betaalt alleen de laatste zich uit en wordt
vroeg kijken onaantrekkelijk. Het punt hangt dus nog steeds aan
`w.status = 'pending'`, precies als vóór 0107.

**Het systeembericht wél.** "X bevestigde de week van Y" hoort pas in de chat als
de week het ook gehaald heeft — anders staat er iets in de groepsfeed dat niet
waar is. Er komt géén nieuw type systeembericht bij, dus de CHECK
`chat_messages_system_event_bekend` is niet aangeraakt.

---

## 5. Twee afkappingen die weken redden

`vereiste_goedkeuringen()` doet twee dingen die makkelijk te vergeten zijn:

1. **De eigenaar telt niet mee als beoordelaar.** Hij mag zijn eigen week niet
   bevestigen (domeinregel 3), dus meetellen zou een meerderheid opleveren die
   niemand kan halen.
2. **Nooit meer vragen dan er beoordelaars zijn.** Een groep die krimpt nadat er
   een quorum van vier is ingesteld, zou anders weken achterlaten die per
   definitie niet meer afkomen. Getest met een quorum van 12 in een groep met één
   beoordelaar.

---

## 6. Wat de gebruiker ervan ziet

Op het beheerscherm een keuze met een uitleg per regel, plus één zin die de
belofte van criterium 2 uitspreekt: *wat je hier kiest geldt vanaf de volgende
week die iemand indient.*

⚠️ **Wél in het gewone formulier en niet in een eigen kaart met een bevestiging,
anders dan de zichtbaarheid.** Het verschil is precies criterium 2: omzetten zet
niets open over anderen en raakt geen lopende week. Er is niets te bevestigen,
alleen iets te weten.

In de beoordelingswachtrij staat **"1 van de 2 bevestigingen"**, en alleen bij een
drempel boven één. Zonder die regel is de feature onzichtbaar: je bevestigt, de
rij verdwijnt uit je lijst, en het weekdoel blijft `pending` zonder dat iemand
vertelt dat dat klopt. Dat is onwrikbare regel 18 vraag 5 — de keten is compleet
en er is geen scherm waarlangs een mens het kan zien.

⚠️ **Geen namen bij dat getal.** Wie er al bevestigd heeft is niet van de groep;
dezelfde grens als bij De Ketting, die aantallen toont en geen namen.

⚠️ **Wat er níét is: de eigenaar ziet het getal niet.** Zijn week staat op
"wacht op bevestiging", en dat is waar — alleen niet precies. Bewust gelaten: het
is informatie en geen grendel, en het vraagt een tweede oppervlak. Staat als
regel in `docs/ENGINEER-REVIEW.md`.

---

## 7. Wat het rollback-pad opleverde

Regel 20 vraagt een rollback-pad in de kop van elke migratie. Dat pad is hier
uitgeprobeerd in plaats van opgeschreven, en dat legde iets anders bloot:
**23 migraties doen `create index` zonder `if not exists`, en 3 doen
`create function` zonder `or replace`.** Onwrikbare regel 20 zegt dat migraties
idempotent zijn; dat is aantoonbaar niet zo, en `migraties:controle` toetst het
niet — die kijkt naar nummering en naar de aanwezigheid van een rollback-kop.

Concreet voor wie 0107 terugrolt: 0094 breekt af op regel 127 en 0059 op regel
203, allebei vóór de functie die je nodig hebt. Neem uit die bestanden alleen het
`create or replace function`-blok. Staat zo in de kop van 0107, en als eigen rij
in `docs/ENGINEER-REVIEW.md`.
