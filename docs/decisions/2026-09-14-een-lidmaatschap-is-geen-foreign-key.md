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

⚠️ **Eén ding dat bij deze afweging hoort en er niet stond.** Het argument
hierboven is dat een foreign key fout is omdat *"geldt voor altijd"* strenger is
dan de belofte. De trigger legt diezelfde strengheid op aan élke **schrijfactie**,
en dat is niet hetzelfde als aan elke rij — maar het raakt wél één geval dat
telt: 📏 een goedkeuring die legitiem ontstaan is, is niet meer terug te
schrijven zodra de goedkeurder inactief is, vertrokken is, of het doel is
losgekoppeld. Een volledige `pg_restore` gaat goed (triggers zitten in de
post-data-sectie), maar een `--data-only` terugzet van deze tabel valt om. Dat
staat als eigen rij in `docs/ENGINEER-REVIEW.md`.

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

## ⚠️⚠️ Twee verschillende foutmeldingen zijn een orakel

De eerste versie van 0262 wierp twee teksten: één voor het lidmaatschap, één
voor de koppeling. Dat leek behulpzaam en was een **lek** — gevonden door de
security-ronde en daarna zelf nagemeten.

Een BEFORE-trigger draait vóór de RLS `with check`, en hij toetst
`new.approver_id` — een waarde die de client zélf meestuurt.

📏 Gemeten als `authenticated`, met een eigen voltooiing, een vreemd profiel als
goedkeurder en de `group_id` van een groep waar de aanvaller niet in zit:

| Vraag | Antwoord |
|---|---|
| controlemeting: `select count(*) from group_members where group_id = <die groep>` | **0** — RLS weigert |
| is dat profiel lid van die groep? | *"hoort niet bij de opgegeven groep"* |
| is dat profiel géén lid? | *"alleen een lid van dezelfde buddy-groep"* |

Twee antwoorden op een vraag die `group_members_select` juist afschermt. En het
is een **regressie**, geen bestaande stand: 📏 met de functie van vóór 0262
teruggezet gaven allebei de proeven letterlijk *"new row violates row-level
security policy"*. Eén antwoord werd er twee.

⚠️ Er zit geen rem op. `goedkeuringen_rem` en `begrens_goedkeuringen` tellen
rijen die er kómen; een geweigerde probe schrijft niets en telt dus niet mee
voor een dagplafond.

⚠️ **Waarom dit hier zwaarder weegt dan elders.** Groepslidmaatschap is in deze
app gevoelige informatie — of iemand in een groep over afkicken, schulden of
werkstress zit, is precies het soort feit waar domeinregel 7 voor bestaat.

**Dit project had die afweging al gemaakt**, in `vraag_lidmaatschap_aan()`:
*"Eén antwoord voor 'bestaat niet', 'is niet ontdekbaar' en sinds QS8-232 ook
'er zit een blokkade tussen'. Drie antwoorden zouden van deze functie een
aftastinstrument maken."* Zelfde afweging, dus dezelfde uitkomst: **één tekst en
één errcode voor allebei de helften.** Welke helft het was, staat in de tests en
in het migratiebestand — niet in wat de deur uit gaat. In `detail` of `hint`
zetten is geen uitweg: PostgREST geeft die mee.

📏 Na de reparatie geven allebei de proeven `23514` met dezelfde tekst, en
`tests/rls/domeinregel3.test.ts` vergelijkt de twee meldingen **met elkaar** —
niet met een letterlijke zin, want dan blijft hij groen zodra iemand ze allebei
verandert maar verschillend houdt.

---

## Het UPDATE-pad was maar half dicht

Dezelfde ronde vond twee gaten aan de UPDATE-kant, allebei nagemeten:

1. **De `null`-uitzondering keek naar de wáárde, niet naar de situatie.** Eén
   UPDATE die `approver_id` op `null` zet **en** tegelijk `group_id` verplaatst,
   glipte erlangs — met precies de bewering die deze migratie wil toetsen. De
   voorwaarde beschrijft nu de vórm van de referentiële actie: van gevuld naar
   leeg, en `group_id` én `completion_id` blijven staan.
2. **`completion_id` wijzigen werd niet hertoetst.** 📏 Daarmee was een
   goedkeuring te verplaatsen naar een voltooiing van een doel dat aan een
   ándere groep hangt — geval C uit de tabel bovenaan, maar dan op het
   UPDATE-pad. `completion_id` telt nu mee.

⚠️ Geen van beide is vandaag bereikbaar voor een client: `authenticated` heeft
📏 op géén enkele kolom van deze tabel UPDATE-recht. Maar het is wél precies het
dreigingsmodel dat deze migratie zélf opschrijft. **Een slot dat INSERT helemaal
sluit en UPDATE half, is een slot waarvan in de tekst staat dat het er is.**

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

⚠️⚠️ **Slot 3 toetste tot deze ronde alleen de trigger*naam*, en dat is drie keer
te weinig gebleken.** 📏 De security-ronde hield `domeinregel3_bewaking()` op
**nul meldingen** met: de trigger uitzetten (`tgenabled = 'D'`), hem naar een
lege functie laten wijzen, en hem opnieuw aanmaken als `before insert` **only** —
die laatste haalt precies de UPDATE-tak weg die deze migratie zojuist geschreven
heeft. Slot 3 toetst nu ook `tgenabled`, `tgfoid` en `tgtype = 23`
(`ROW|BEFORE|INSERT|UPDATE`), als gelijkheid en niet als masker: erbij komen is
ook een verandering die iemand hoort te zien.

⚠️ **Slot 5 en 6 zijn zwakker dan de andere vier, en dat hoort opgeschreven en
niet weggepoetst.** Ze lezen tekst na een knip van commentaar. De eerste versie
knipte alleen `--` weg, en 📏 de security-ronde hield ze groen door het lichaam
uit te hollen en de twee gezochte zinnen in een `/* … */`-blok te zetten. **Dat
is de stille richting van een te smalle knip**, en de kop redeneerde alleen over
de vals-alarmkant. De knip pakt nu allebei de vormen.

Wat blijft: een `--` binnen een stringliteral zou de rest van die regel meenemen
— dezelfde klasse als de knip die in QS8-412 een URL opat. Vandaag staat er geen
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

Vooraf 20 groen, na herstel 20 groen (`domeinregel3.test.ts` plus
`opruiming.test.ts`, want de `null`-tak raakt het wisrecht).

| | Mutatie | Rood |
|---|---|---|
| M1 | de lidmaatschapstoets eruit | 6 |
| M2 | de koppelingstoets eruit | 4 |
| M3 | de foreign key van 0252 gedropt | 1 — bewakingsslot `eigenaar-fk` |
| M4 | op UPDATE altijd hertoetsen | 2 |
| M5 | de lidmaatschapstoets omgekeerd | 11, waaronder de controlemeting |
| M6 | de `null`-tak eruit | 5, waarvan **vier over het wisrecht** |
| M7 | `completion_id` uit de hertoetsvoorwaarde | 1 |
| M8 | weer twee verschillende foutteksten | 2 |

En vier op de bewaking zelf, die tot de security-ronde alle vier **stil** bleven:

| | Mutatie | Rood |
|---|---|---|
| M9a | de trigger uitgezet | 9 |
| M9b | de trigger opnieuw als `before insert` only | 3 |
| M9c | de trigger naar een lege functie | meldt `trigger` |
| M10 | het lichaam uitgehold, de zinnen in blokcommentaar | 7 |

⚠️⚠️ **Twee bevestigingsquery's klopten niet, en dat hoort hier te staan.** De
eerste zocht `toets_clausule2 := true;` voor M4 — maar die regel stáát ook in de
ongemuteerde versie, in de INSERT-tak. De tweede zocht `old.completion_id then`
voor M7 en trof daarmee de `null`-tak in plaats van de hertoetsvoorwaarde.
Allebei lazen ze `true` in élke stand: **indicatoren die nergens op reageren.**
Opnieuw bevestigd op `is distinct from old.group_id` en op
`or new.completion_id is distinct from old.completion_id`, allebei `false` met
mutatie en `true` na herstel.

De uitslagen waren geen van beide fout — de goede tests werden rood. Maar de
**bevestiging** bewees niets, en dat is aan de uitslag niet te zien. Dat is
CLAUDE.md bij regel 18 in zijn zuiverste vorm: *een meting die op "er werd iets
rood" leunt, moet weten wát er veranderd is.* Twee keer in één issue, dus het is
geen vergissing maar een vorm — **een indicator hoort zelf geijkt, met een
meting vóór de mutatie.**

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
