# Een lidmaatschap is geen foreign key

**Datum:** 14-09-2026 · **Issue:** QS8-480 · **Migratie:** 0262
**Raakt:** domeinregel 3, `completion_approvals`, `fill_approval_subject()`,
`domeinregel3_bewaking()`

---

## De stand vooraf

CLAUDE.md, domeinregel 3:

> *"Alleen een lid van dezelfde buddy-groep mag een voltooiing goedkeuren.
> Nooit jezelf. Afgedwongen in RLS **én** met een database-constraint, niet
> alleen in de UI. Test dit expliciet."*

Twee clausules dus, en tot 0262 had er één een slot buiten RLS. Migratie 0252
sloot **clausule 1** — *nooit jezelf* — met een samengestelde foreign key van
`(completion_id, subject_id)` naar `completions (id, user_id)`. **Clausule 2**
stond er onveranderd en hing volledig aan `completion_approvals_insert`.

📏 **Gemeten op 14-09-2026 tegen de lokale stack op 0261**, met de trigger
`completion_approvals_subject` uitgezet — de vraag was wat het schema zélf
tegenhoudt:

| | Geval | Uitslag |
|---|---|---|
| A | goedkeurder is groepsgenoot (hoort te mogen) | TOEGELATEN |
| B | goedkeurder is **geen lid** van de groep | **TOEGELATEN** |
| C | `group_id` is een groep waar het **doel niet aan hangt** | **TOEGELATEN** |
| D | gelogen `subject_id` (clausule 1) | GEWEIGERD `23503` |

**D is waarom deze tabel iets waard is.** Zonder die vierde meting zou "B en C
worden toegelaten" net zo goed een kapotte opstelling kunnen zijn. Dezelfde
opzet vángt clausule 1 en laat clausule 2 er langs allebei de kanten uit.

⚠️ **C stond niet in de dossierrij en is de bredere van de twee.** De policy
eist dat de voltooiing via `goal_group_links` aan `group_id` hangt; het schema
vroeg daar niets over. Zonder die helft is *"dezelfde buddy-groep"* geen grens
maar een invulveld: je noemt een groep waar je toevallig in zit.

Het dreigingsmodel is dat van 0252 zelf. 📏 `completions` en
`completion_approvals` staan allebei op `relrowsecurity=true` maar
`relforcerowsecurity=false` en zijn allebei van `postgres`, dus élke
`security definer`-functie draait langs de policies heen. 📏 Vandaag schrijft er
**nul** functie in `completion_approvals`, dus dit was een wachtende fout en
geen open deur.

---

## Het besluit: een trigger, en uitdrukkelijk geen foreign key

De dossierrij stelde een foreign key naar `group_members` voor, *"plus een derde
kolom"*. Twee dingen klopten daar niet aan.

### De kolom bestond al, en dat maakt het gevaarlijker

`completion_approvals.group_id` staat er sinds 0001, `not null`, met een FK naar
`groups`. En `group_members` heeft `primary key (group_id, user_id)`. De foreign
key was dus niet alleen mogelijk — hij was **één regel**. Dat is precies de
reden dat hier moet staan waarom hij toch fout is: de volgende lezer ziet een
gratis declaratieve oplossing liggen.

### 📏 Allebei de referentiële acties breken iets

Nagemeten met de FK erin en een goedkeurder die de groep verlaat:

| Variant | Uitslag |
|---|---|
| `on delete cascade` | de goedkeuring verdwijnt: **1 → 0** rijen |
| `on delete restrict` | het vertrek wordt **geblokkeerd** met `23503` |

`cascade` laat een week zijn goedkeuring stilzwijgend verliezen en sloopt
domeinregel 6 (append-only). `restrict` breekt 0102, dat met zoveel woorden
*"een vertrek is een handeling"* heet.

### De reden eronder is principieel

**Lidmaatschap is veranderlijk, en de belofte van clausule 2 is een feit van het
moment van goedkeuren:** *deze goedkeuring is gegeven door een groepsgenoot*.
Een foreign key dwingt *"geldt voor altijd"* af. Dat is iets anders — en iets
strengers — dan wat domeinregel 3 belooft, en die strengheid heeft een
slachtoffer: de gebruiker die zijn groep verlaat.

Clausule 1 kón wél declaratief, omdat eigenaarschap van een voltooiing niet
verschuift. **Dat verschil is de hele beslissing**, en het is geen detail van
deze tabel: het is de vraag die je bij élke tweede grendel moet stellen — geldt
de belofte op een moment, of voor altijd?

Een trigger toetst op precies het moment dat het feit waar moet zijn, en vuurt
óók in een `security definer`-functie.

### Eén trigger en geen tweede

`fill_approval_subject()` draait al `before insert or update` op deze tabel en
werpt er al voor clausule 1. Het argument van 0252 — *"nog een trigger die
hetzelfde bewaakt maakt het net niet dichter, alleen dikker"* — ging over
clausule 1, waar al een trigger stond. Clausule 2 had er nul, dus dat argument
verbiedt deze niet. Maar het pleit wél voor uitbreiden in plaats van een tweede
trigger ernaast: die zou de volgordevraag introduceren en de tabel twee keer
laten lezen voor één rij.

---

## ⚠️⚠️ Een referentiële actie ís een UPDATE, en dat kostte bijna het wisrecht

Dit is de duurste les van dit issue, en hij is niet bedacht maar gemeten.

`completion_approvals.approver_id` staat op `on delete set null`. Als iemand zijn
account opzegt, doet Postgres:

```sql
update only public.completion_approvals set approver_id = null where … = approver_id
```

Dat is een **UPDATE**, en die verándert `approver_id` — dus de hertoets van
clausule 2 vuurde, keek naar het lidmaatschap van `null`, en wierp. 📏 Gevolg:
**niemand die ooit een goedkeuring gaf, kon zijn account nog verwijderen.** Dat
is letterlijk de belofte van QS8-371, over dezelfde kolom.

De reparatie is een `elsif new.approver_id is null`-tak: een `approver_id` die op
`null` gezet wordt is de anonimisering van een vertrokken account en geen nieuwe
bewering. Op een INSERT weigert `null` wél — een goedkeuring zonder goedkeurder
is geen goedkeuring, en clausule 2 zou er anders langs kunnen. **Zonder die
tweede helft is de uitzondering een gat.**

⚠️ **Wat dit leert is breder dan deze tabel.** De dossierrij van QS8-182 had deze
klasse al één keer genoteerd — *"via een referentiële actie en niet via een
functie of een policy, wat de oude formulering niet kon zien"* — en hij ontsnapte
hier alsnog aan het ontwerp. Bij élke trigger die op UPDATE toetst hoort dus de
vraag: **welke `on delete`- en `on update`-acties schrijven in deze tabel, en
wat zetten ze?** Een referentiële actie is code die niemand geschreven heeft en
die in geen enkele functie te grepen is.

📏 En het wérd gevangen — door `tests/rls/opruiming.test.ts`, die over de veeg
gaat en niet over domeinregel 3. De gerichte test staat sindsdien in
`tests/rls/domeinregel3.test.ts`, waar de belofte woont.

---

## De bewaking: van drie sloten naar zes

`domeinregel3_bewaking()` telde drie sloten. Er zijn er nu zes:

| Slot | Clausule | Soort |
|---|---|---|
| `rls` | 1 | de policy-clausule `c.user_id <> auth.uid()` |
| `constraint` | 1 | de CHECK `completion_approvals_not_self` |
| `trigger` | 1 | de trigger die `subject_id` vult |
| `eigenaar-fk` | 1 | de foreign key van 0252 |
| `clausule2-lidmaatschap` | 2 | `from group_members` in het functielichaam |
| `clausule2-koppeling` | 2 | `join goal_group_links` in het functielichaam |

⚠️ **Slot 4 was een gat dat hier boven water kwam en niet in de opdracht stond.**
0252 zette een foreign key neer die clausule 1 draagt, en de bewaking die naar de
sloten van domeinregel 3 kijkt, noemde hem niet. **Een slot dat niemand telt,
raak je stil kwijt** — zelfde vorm als de dossierrijen over grendels die alleen
in een comment staan.

⚠️ **Slot 5 en 6 zijn zwakker dan de andere vier, en dat hoort opgeschreven en
niet weggepoetst.** Ze lezen tekst na een knip van `--`-commentaar. Die knip zou
ook een `--` binnen een stringliteral opeten en de rest van die regel meenemen —
dezelfde klasse als de knip die in QS8-412 een URL opat. Vandaag staat er geen
`--` in een literal in dit lichaam; komt die er ooit, dan meldt het slot ten
onrechte *"ontbreekt"*. **Dat is de veilige richting**: vals alarm en geen
stilte.

De echte grendel is de gedragstest. QS8-182 schreef die blinde vlek zelf al op:
staat de trigger er nog maar is zijn inhoud uitgehold, dan meldt een
structuurcontrole niets.

---

## 📏 De ijking

Zes mutaties, elk apart, en van élke mutatie is eerst op de database bevestigd
dát hij erin zat vóór de suite draaide. Vooraf 18 groen, na herstel 18 groen.

| | Mutatie | Rood |
|---|---|---|
| M1 | de lidmaatschapstoets eruit | 3 — bewakingsslot + twee gedragstests |
| M2 | de koppelingstoets eruit | 2 — bewakingsslot + één gedragstest |
| M3 | de foreign key van 0252 gedropt | 1 — bewakingsslot `eigenaar-fk` |
| M4 | op UPDATE altijd hertoetsen | 1 — de test die het vertrek beschermt |
| M5 | de lidmaatschapstoets omgekeerd | 6, waaronder de controlemeting |
| M6 | de `null`-tak eruit | 5, waarvan **vier over het wisrecht** |

⚠️⚠️ **Eén ding aan die ijking klopte eerst niet, en dat hoort hier te staan.**
De eerste bevestigingsquery voor M4 zocht `toets_clausule2 := true;` in het
functielichaam — maar die regel stáát ook in de ongemuteerde versie, in de
INSERT-tak. Hij las dus `true` in élke stand: **een indicator die nergens op
reageert.** M4 is daarna opnieuw bevestigd op `is distinct from old.group_id`
(`false` met mutatie, `true` na herstel).

Dat is CLAUDE.md bij regel 18 in zijn zuiverste vorm: *een meting die op "er werd
iets rood" leunt, moet weten wát er veranderd is.* Hij ging hier niet mis op de
uitslag — M4 werd terecht rood — maar de **bevestiging** bewees niets, en dat is
niet aan de uitslag te zien.

---

## Wat dit besluit níét is

- **Geen verruiming van wie mag goedkeuren.** Alles wat via RLS al kon, kan nog.
  Het schema weigert voortaan wat de policy ook al weigerde.
- **Geen nieuwe kolom en geen datamodelwijziging.** `group_id` stond er al.
- **Geen belofte dat de trigger onomzeilbaar is.** Wie `alter table … disable
  trigger` mag draaien, is superuser en heeft dan grotere problemen. De belofte
  is: een `security definer`-functie komt er niet langs, en dat was de open deur.
- **Geen uitspraak over `session_replication_role`.** Die zet triggers uit voor
  de hele sessie; niets in dit project gebruikt hem.
