# Een migratie die op zichzelf botst — 10-09-2026

**Issue:** QS8-413
**Raakt:** `scripts/schema-opbouwen.sh` (`--dubbel`), `scripts/idempotent-controle.mjs` (nieuw), `tests/scripts/idempotent-controle.test.ts` (nieuw), `.github/workflows/ci.yml`

---

## 1. Wat er stuk was

Migratie `0252` maakt twee objecten die van elkaar afhangen: een
`unique (id, user_id)` op `completions` en een foreign key op
`completion_approvals` die daarnaar wijst. De opruiming stond netjes per blok —
elke `add constraint` had zijn eigen `drop constraint if exists` erboven. Bij een
tweede run:

```
ERROR:  cannot drop constraint completions_id_gebruiker_uniek on table completions
        because other objects depend on it
DETAIL:  constraint completion_approvals_subject_is_eigenaar depends on index
         completions_id_gebruiker_uniek
```

De unieke constraint kan niet weg zolang de foreign key eraan hangt. Dat is
gerepareerd in het bestand zelf (beide drops bovenaan, in omgekeerde
afhankelijkheidsvolgorde). **De klasse stond er nog**, en daar gaat dit besluit
over.

## 2. Waarom de statische grendel dit niet kan zien, en dat is gemeten

`bezwarenIn()` in `tests/migraties/idempotentie.ts` vraagt per object of er een
`drop … if exists` vóór de `create` staat. Bij `0252` stónd die er, voor allebei
de constraints.

📏 **Nagemeten en niet aangenomen** (10-09-2026): met de oude vorm van `0252`
teruggezet — de opruiming weer per blok — blijft
`tests/migraties/idempotentie.test.ts` **groen op 23 tests**, terwijl de nieuwe
dynamische controle rood wordt en het bestand bij naam noemt.

De fout zit in de volgorde **tussen twee objecten** en is daarmee een eigenschap
van het gehéél. Een per-object-regel blijft daar per definitie groen op —
onwrikbare regel 18, vraag 2. Uitbreiden van `bezwarenIn()` met constraints
(richting A uit het issue) zou op eigen kracht zinnig zijn, maar dékt dit geval
niet; het is daarom niet gebouwd.

## 3. De vorm: elk bestand direct ná zichzelf

`scripts/schema-opbouwen.sh --dubbel` speelt elk migratiebestand tweemaal af
vóórdat de volgende aan de beurt is.

**"Direct" is het hele ontwerp.** CLAUDE.md beschermt met zoveel woorden een
uitzonderingsklasse: een migratie die botst omdat een **latere** migratie de vorm
van hetzelfde object veranderd heeft. Die weigering *is* de beveiliging — bij
`group_visible_streaks` zou hij een domeinregel-7-besluit terugdraaien — en die
fout mag nooit weggenomen worden. Door elk bestand direct na zichzelf te draaien
kan die klasse hier niet optreden: de latere migratie heeft nog niet gedraaid.

📏 **Het verschil is gemeten en het is groot.** Op dezelfde boom van 255
migraties:

| Vorm | Bestanden die omvallen |
| -- | -- |
| Naïef: alles nog eens afspelen ná de opbouw | **14** (`0002 0003 0008 0013 0016 0024 0043 0044 0050 0109 0125 0146 0234 0237`) |
| Deze controle: elk bestand direct ná zichzelf | **0** |

Veertien valse meldingen is precies het aantal waarbij je een controle leert
uitzetten.

⚠️ Het issue noemde er vijf, op gezag van de oudere aantekening in
`idempotentie.test.ts`. Dat getal is meegegroeid met de boom. Hier staat de
meting van vandaag; wie hem opnieuw nodig heeft, meet opnieuw.

## 4. Wat het kost, en waarom dat in de poort past

📏 Een gewone opbouw duurt **23,3 s**; met `--dubbel` **25,3 s**. Beide passes
gaan in **één** psql-sessie (`-f bestand -f bestand`), dus er komen geen 255
processen bij en de tweede pass is per definitie bijna helemaal no-op.

Twee seconden is goedkoop genoeg om altijd te draaien, dus staat de controle in
de poort en niet achter een vlag die je vergeet.

**Een eigen database.** `goalbuddies_dubbel` wordt weggegooid en opnieuw
opgebouwd; de stack waar de RLS-suite tegen draait blijft onaangeraakt. Zou de
controle de stack gebruiken, dan sloopt een poortrun de opstelling waar de
suite daarna tegen meet — en dan is die suite groen over een schema dat er net
niet meer was.

**En in CI, in de RLS-job.** Daar staat de Postgres al; een eigen job zou een
tweede container starten voor twee seconden rekenwerk. De stap staat *ná*
`rls:lokaal`, zodat een rode uitslag hier niet verwart met een suite die
misschien niet gemeten heeft.

## 5. De ijking

| Grendel | Mutatie | Uitslag |
| -- | -- | -- |
| A — een bestand dat op zichzelf botst | de oude vorm van `0252` teruggezet (opruiming per blok) | rood, noemt `0252…sql` |
| A′ — en de statische grendel ziet het níét | dezelfde mutatie | `idempotentie.test.ts` **groen op 23 tests** |
| B — de uitzonderingsklasse blijft met rust | 14 bestanden die bij een naïeve herhaling omvallen | **groen** |
| C — exitcode 0 zonder slotregel | een opbouw die halverwege stopt | rood, "halverwege" |
| C′ — de slotregel van een énkele opbouw telt niet | `✓ 255 migraties afgespeeld …` | rood |
| D — geen server | `PGPORT=5499` | **OVERGESLAGEN**, niet rood |
| E — een geweigerde gebruiker | `PGUSER=bestaatniet` | **GEWEIGERD**, rood |

D en E zijn de erfenis van QS8-268: alleen "geen server" en "geen database" heten
overgeslagen. Een geweigerde gebruiker is een kapotte instelling, en die als
"ongemeten" tellen is dezelfde onwaarheid één laag hoger.

C′ verdient een woord. Zonder die grens zou `schema-opbouwen.sh` **zónder**
`--dubbel` als bewijs doorgaan — de controle zou dan groen zijn over precies de
opbouw die hij niet doet. Vandaar dat de slotregel van de dubbele opbouw anders
luidt dan die van de enkele, en dat `KLAAR` op díé zin staat.

## 6. Wat dit niet is

Geen uitbreiding van `bezwarenIn()` met constraints (richting A): zinnig op eigen
kracht, maar het dekt deze klasse niet, en het vraagt eerst een meting van
hoeveel bestaande migraties er rood van worden. Dat blijft een eigen issue.

Geen uitspraak over of een migratie *inhoudelijk* hetzelfde doet bij een tweede
run — alleen dat hij niet omvalt. Een ongegarandeerde `insert` die rijen
verdubbelt zou hier doorheen komen; 📏 vandaag staat er geen enkele `insert` op
migratieniveau (ze staan alle in functielichamen), maar dat is een meting en geen
grendel.
