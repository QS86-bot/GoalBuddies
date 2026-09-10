# De goedkeuring wijst naar de eigenaar van de voltooiing

**Datum:** 10-09-2026 · **Issue:** QS8-182 · **Migratie:** 0252

## De vraag die dit issue stelde

Zelfgoedkeuring wordt geblokkeerd via een CHECK op een **gedenormaliseerde**
`subject_id`, omdat een CHECK geen subquery mag doen. Een trigger vult die kolom.
De rij vroeg een reviewer te wegen **of dat de juiste vorm is** — een oordeel, en
geen meting.

Op 27-08 was al gemeten dat de vrees *"stilletjes"* niet meer klopt: drie sloten
staan er, en `domeinregel3_bewaking()` wordt rood zodra er één verdwijnt.

## Wat er gemeten is, en wat dat opleverde

De vraag is niet of de trigger werkt — die werkt. De vraag is wat het **schema
zelf** tegenhoudt, want dat is waarom domeinregel 3 een tweede grendel eist:

> Afgedwongen in RLS **én** met een database-constraint, niet alleen in de UI.

📏 **Gemeten op 10-09-2026**, met `completion_approvals_subject` uitgezet:

| wat er gelogen wordt | vóór 0252 |
|---|---|
| `subject_id` naar de goedkeurder zelf | `23514` (`not_self`) |
| `subject_id` naar een **derde** | **toegelaten** |
| de eerlijke rij | toegelaten |

**De tweede grendel droeg dus maar de helft van wat de regel belooft.**
`completion_approvals_not_self` is `approver_id <> subject_id`, en die vraagt
nergens of dat subject de eigenaar van de voltooiing ís.

⚠️ **Dat is geen theoretisch geval.** Een goedkeuring die zegt over iemand te gaan
die de voltooiing niet bezit, is geen goedkeuring — hij hangt een oordeel aan een
naam die er niets mee te maken heeft. En een tweede grendel bestaat juist voor het
moment dat de eerste wegvalt: een `security definer`-functie die er ooit omheen
gaat, een trigger die uitgezet wordt, een migratie die de vulling verandert.

## De keuze

Twee vormen zijn gewogen.

**Nog een trigger.** Afgewezen: een trigger is wat er al staat. Nog één die
hetzelfde bewaakt maakt het net niet dichter, alleen dikker — en hij deelt de
zwakte van de eerste, namelijk dat hij uitgezet of omzeild kan worden.

**Een samengestelde foreign key.** Gekozen. `unique (id, user_id)` op
`completions`, en `foreign key (completion_id, subject_id) references
completions (id, user_id)` op `completion_approvals`. De database bewaakt het
verband dan zélf: die kan niet vergeten worden en overleeft elke functie die er
langs komt.

📏 **De prijs is gemeten en niet geschat:** één extra unieke index op
`completions`, een tabel die veel schrijft. Op productie staan er vandaag **nul
rijen** in `completions` en **nul** in `completion_approvals` (gemeten tegen
`wehgocadxehottiiyvsc`), dus de migratie voegt toe aan lege tabellen en heeft
geen herschrijving nodig.

⚠️ **`on update cascade` en niet `restrict`.** `completions.user_id` verandert
vandaag nergens, en dat is juist waarom `cascade` de veilige keuze is: gebeurt het
ooit tóch, dan schuift de goedkeuring mee in plaats van de wijziging te blokkeren
met een fout die niemand verwacht.

⚠️ Beide kolommen zijn `not null` — 📏 nagemeten — dus er is geen
MATCH-SIMPLE-uitweg waarlangs een rij met één lege helft ongetoetst doorglipt.

## Wat er nu gemeten wordt

📏 **Ná 0252**, dezelfde opzet:

| wat er gelogen wordt | ná 0252 |
|---|---|
| `subject_id` naar de goedkeurder zelf | `23514` |
| `subject_id` naar een **derde** | **`23503`** |
| de eerlijke rij | toegelaten |

`tests/rls/goedkeuring-wijst-naar-de-eigenaar.test.ts` legt alle drie vast, plus
een **tegenproef**: hetzelfde geval met de nieuwe constraint binnen de transactie
gedropt, en dan wordt het weer toegelaten.

⚠️ **Die tegenproef hoort in de suite en niet alleen in een commit-bericht.**
Zonder hem bewijst de must-deny niet dat 0252 het geval tegenhoudt — hij zou ook
groen zijn als een héél andere grendel het afving. Dat is precies de fout die
eerder vandaag in de ijking van QS8-194 gemaakt is: *breek de grendel die de
ijking noemt, niet zomaar iets.*

## Twee dingen die onderweg misgingen, en wat ze leren

* **`disable trigger user` zet álle triggers uit**, niet alleen die ene. De eerste
  meting gaf op alle drie de gevallen `23502` — een lege `group_id`, want die
  wordt ook door een trigger gevuld. Een meting die de opzet stukmaakt, meet de
  opzet en niet de vraag.
* **Een `raise notice` gaat naar stderr**, en `execFileSync` geeft alleen stdout
  terug. De eerste versie van de test las een lege string en dacht dat de opzet
  stuk was. De uitkomst loopt nu via een tijdelijke tabel.

## ⚠️ Deze keuze was geparkeerd, en door wie hij losgemaakt is

**Dit hoort hier te staan, want zonder deze alinea leest de rest als een keuze
die vanzelf sprak.** Dat was hij niet.

In de reactie op QS8-182 van 10-09-2026 15:40 staat met zoveel woorden:

> ⚠️ **Dit issue gaat terug naar Backlog en niet naar Done.** De keuze tussen
> trigger en foreign key is het oordeel dat deze rij met opzet voor de engineer
> parkeert.

Die reactie is ook waar het declaratieve alternatief vandaan komt — inclusief
`unique (id, user_id)`, de samengestelde foreign key én de aantekening dat hij
`on update cascade` hoort te dragen. De drie metingen hierboven zijn er dus niet
voor het eerst gedaan; ze zijn onafhankelijk herhaald op de lokale stack en ze
komen op hetzelfde uit (`23514` / toegelaten / toegelaten, en `23503` met de FK).

**Wat de parkering heeft opgeheven** is Quintens opdracht van 10-09-2026 dat elk
issue met het label `review:november` nu uitgevoerd mag worden. QS8-182 draagt
dat label. Een issue uitvoeren betekent hier onvermijdelijk de vorm kiezen, dus
die opdracht sluit het parkeren van precies deze keuze uit.

⚠️ **Wat dat níét is: een besluit dat de engineer overslaat.** De dossierrij
blijft staan op **Laag** met de vormvraag erin — is een CHECK op een
gedenormaliseerde kolom hier überhaupt de mooiste constructie — en dit document
geeft de engineer de meting, de prijs en het rollback-pad om hem terug te
draaien. Wat er verdwijnt uit de agenda is de vraag over **dekking**, want die is
nu gemeten. De vraag over **stijl** blijft.

⚠️ **Eén gevolg voor een overweging uit diezelfde reactie.** Daar stond een
vierde slot in `domeinregel3_bewaking()` als overwogen-en-niet-gedaan, met erbij:
*"komt de FK er, dan vervalt de blinde vlek helemaal."* Dat is nu het geval. De
blinde vlek was dat `new.subject_id := owner` ooit `if new.subject_id is null
then …` wordt zonder dat één slot verdwijnt; met 0252 is de tweede helft van
domeinregel 3 niet meer afhankelijk van dat trigger-lichaam. Het vierde slot is
daarmee overbodig geworden in plaats van uitgesteld — en dat is precies wat die
overweging als voorwaarde noemde.

## Wat hiermee níét beantwoord is

⚠️⚠️ **Domeinregel 3 is hiermee niet af, en een eerdere versie van dit document
suggereerde dat wel.** Daar stond *"beide helften van domeinregel 3 worden vanaf
nu door de database afgedwongen"*. Dat is te ruim gelezen en de
security-ronde op deze branch heeft het terecht teruggeduwd. De regel heeft twee
clausules:

| clausule | hoe afgedwongen ná 0252 |
|---|---|
| *"Nooit jezelf"* — en breder: het subject ís de eigenaar | CHECK **plus** de nieuwe foreign key: declaratief |
| *"Alleen een lid van dezelfde buddy-groep mag goedkeuren"* | **uitsluitend RLS** |

Wat 0252 sluit is de eerste rij. De tweede staat er onveranderd. 📏 Gemeten met
dezelfde opzet als hierboven — trigger uit, en een goedkeurder die géén lid van
de groep is:

    insert into completion_approvals (completion_id, approver_id, subject_id, …)
    values (<voltooiing van Alice>, <Mallory>, <Alice>, <groep zonder Mallory>, 'approved');
    -> TOEGELATEN

⚠️ **En dat weegt zwaarder door het dreigingsmodel dat deze migratie zélf
aanneemt** — *"een `security definer`-functie die er ooit omheen gaat"*. 📏
Gemeten:

    completions          | rls=true | force=false | eigenaar=postgres
    completion_approvals | rls=true | force=false | eigenaar=postgres

`relforcerowsecurity` staat op `false` en beide tabellen zijn van `postgres`, dus
een `security definer`-functie draait langs de policies heen. Valt de trigger weg
**én** loopt het via zo'n functie, dan houdt niets tegen dat een wildvreemde als
goedkeurder in de rij staat.

**0252 maakt dit strikt beter en introduceert er niets van.** Maar het is geen
"QS8-182 heeft domeinregel 3 dichtgezet", en zo hoort het ook niet gelezen te
worden. De clausule over groepslidmaatschap krijgt een eigen rij op de agenda in
plaats van weggeschreven te worden als opgelost.

Wat er verder blijft liggen: of een CHECK op een gedenormaliseerde kolom hier
*überhaupt* de mooiste vorm is. Dat is een oordeel voor de review. Wat er
verandert is dat de **dekkingsvraag** voor clausule 1 nu gemeten is in plaats van
aangenomen.

## Wat de security-ronde opleverde

Onwrikbare regel 19 eist hem direct bij een autorisatiegrens. Hij was
**blokkerend**, en dat was terecht.

📏 **Het defect: deze migratie kon geen tweede keer draaien.** De twee
opruimregels stonden per blok in plaats van bovenaan, dus de unieke constraint
werd gedropt terwijl de foreign key er dertig regels lager nog op leunde:
`2BP01`. Gerepareerd, en nagemeten met drie schone herhalingen op rij. De uitleg
staat in de kop van 0252.

⚠️ **Twee bevindingen zijn nagemeten en klopten niet — en dat is precies waarom
CLAUDE.md eist dat je elke bevinding zelf verifieert.**

* *"De test verdwijnt geruisloos zodra je de constraint weghaalt die hij
  bewaakt."* 📏 Gemeten door de constraint écht te droppen: met `RLS_DOEL` gezet
  wordt het bestand **rood** (`de proef gaf "0" in plaats van "1"`), want
  `stackOordeel()` werpt op elke stand behalve één. Zonder `RLS_DOEL` slaat hij
  over, en dát is de regel van QS8-270 zelf — zwijgen mag alleen als niemand
  beweerde te meten. De poort en CI zetten hem. De meting staat nu als ijking B
  in de test.
* *"De idempotentiegrendel kent geen constraints en liet daardoor het defect
  door."* De eerste helft klopt, de tweede niet. `bezwarenIn()` toetst of er vóór
  elke `create` een `drop … if exists` staat — 📏 en die stónd er, voor allebei
  de constraints (regels 65 en 93 van de oude versie). Een regel van die vorm was
  dus groen gebleven. De fout zit in de volgorde **tussen twee objecten**, een
  klasse die geen enkele statische regel van die vorm ziet. Dat is een eigen
  issue waard, maar niet met die onderbouwing — het staat als **QS8-413**, met
  dat onderscheid erin, en het gat in het psql-register als **QS8-414**.
