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

## Wat hiermee níét beantwoord is

Of een CHECK op een gedenormaliseerde kolom hier *überhaupt* de mooiste vorm is,
blijft een oordeel voor de review. Wat er verandert is dat de vraag nu over stijl
gaat en niet meer over dekking: **beide helften van domeinregel 3 worden vanaf nu
door de database afgedwongen**, en dat is gemeten in plaats van aangenomen.
