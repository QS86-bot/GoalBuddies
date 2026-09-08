# `paused` was de adempauze op de verkeerde korrel

**Datum:** 08-09-2026 · **Issue:** QS8-325 · **Migratie:** 0204

`group_members.status` kende drie waarden. Eén ervan, `paused`, had geen enkele
schrijver en vier lezers. Dit document legt vast waarom hij weggaat in plaats van
er een schrijver bij te krijgen, en wat dat besluit níét is.

## 1. Wat er gemeten is

📏 Op de lokale stack, tegen `pg_get_functiondef()`, en met een grep over `src/`,
`app/` en `scripts/`:

| | |
|---|---|
| `group_members_status_valid` | `check (status in ('active','inactive','paused'))` |
| functies die `paused` **schrijven** | geen |
| client-code die `paused` schrijft | geen |
| functies met een `'paused'`-literal | `guard_group_member_update`, `join_group_with_code`, `ketting_stand` |
| objectcommentaren die hem noemen | `shares_group_with_user`, `join_group_with_code` |
| rijen op `paused` in productie | geen — `group_members` is er in het geheel leeg |

`verlaat_groep()` verwijdert de rij, `verwijder_lid()` zet `inactive`. Sinds 0199
werpt de beheerderstak van de guard bovendien `pauze_van_een_ander` en de
niet-beheerderstak `geen_groepsbeheerder`. Er was dus ook voor `service_role`
geen weg naar die stand — alleen met de hand, in een `adminDb()`-aanroep in een
test.

## 2. Waarom hij weggaat

**De adempauze die het product bedoelt, bestaat al en is bereikbaar.**
`docs/PRODUCT-PROPOSAL.md` regel 70 zet "Vacation Mode (14 dagen)" van de
concurrent tegenover onze **Adempauze**: *tot 2 cycli, vooraf aangekondigd aan je
groep*. Dat is letterlijk `breathers` — hele cycli (`breathers_hele_cycli`),
aangekondigd (`announced_at`), met `plan_adempauze()`, `annuleer_adempauze()` en
een aanroeper in `src/modules/goals/adempauze.ts`.

Daarmee is de vraag die dit issue stelde — *wat moet "gepauzeerd" betekenen?* —
al ergens anders beantwoord. `ketting_stand()` liet dat het duidelijkst zien: hij
droeg twee vrijstellingen naast elkaar voor dezelfde gedachte.

```sql
and m.status not in ('inactive', 'paused')     -- de onbereikbare
and not exists (select 1 from breathers b …)   -- de werkende
```

⚠️ `group_members.status = 'paused'` is dus **niet** een half gebouwde feature,
maar dezelfde feature op de verkeerde korrel: per lidmaatschap in plaats van per
doel, uit 0001, van vóór `breathers`.

## 3. Waarom er geen schrijver bij komt

Een schrijver bouwen is geen kleiner besluit dan dit, maar een groter — en het is
er een dat dit issue niet kan nemen:

1. **Het raakt domeinregel 7.** Een pauze is groepszichtbaar: `ketting_stand()`
   haalde een gepauzeerd lid uit de noemer van De Ketting. Wie de knop bouwt,
   beslist daarmee of "even niet meedoen" voor de groep afleesbaar wordt.
2. **De vraag uit `docs/decisions/2026-08-28-de-grens-in-de-functie.md` staat
   nog open:** een gepauzeerd lid houdt zijn koppelingen, dus zijn openstaande
   week blijft op het beoordelijstje van de anderen staan. Zonder knop is dat een
   ontwerpvraag; mét knop is het een defect.
3. **Er is geen scherm.** Een RPC zonder aanroeper is precies de vorm die QS8-351
   ("een recht zonder aanroeper gaat weg") en QS8-292 als schuld tellen. Dit
   issue zou de halve toestand dan met de andere helft naar voren verplaatsen.

Komt die feature er ooit, dan komt de stand terug mét zijn schrijver, zijn
antwoord op punt 2 en zijn RLS. Dat is één migratie werk — 0204 is precies zo
klein.

## 4. Wat dit besluit níét is

⚠️⚠️ **Geen uitspraak dat `<> 'inactive'` voortaan `= 'active'` mag heten.** Die
twee vallen vanaf nu samen, en juist dáárom blijft de grens staan zoals hij
staat. Zeven hulpfuncties trekken hem op `<> 'inactive'` (0029, 0066/M1, 0102,
0160); geen ervan is aangeraakt. Komt er ooit een derde stand, dan is het
verschil weer een verschil, en dan hoort de code er al naar geschreven te zijn.

⚠️ **Geen verruiming van wat een beheerder mag.** De `pauze_van_een_ander`-tak
uit 0199 is niet zomaar weggehaald maar vervangen door een bredere: een
restweigering die élke statuswaarde buiten `active` en `inactive` afwijst met
`onbekende_lidstatus`.

📏 Die kwam uit de security-review op deze branch, en hij had gelijk om een reden
die ik zelf gemeten heb: mét een derde waarde in de CHECK landde de PATCH van een
beheerder op de rij van een ánder **zonder fout en zonder spoor** —
`meld_uitzetting` vuurt alleen op `→ inactive` en `meld_nieuw_lid` alleen op
`inactive → active`. De tak van 0199 verbood één waarde; wat eronder wegviel was
het vangnet voor alle andere. Dat vangnet staat er nu, en het is geijkt op een
schema dat vandaag niet bestaat: de toets verruimt de CHECK binnen een
teruggedraaide transactie, want een grendel die nooit rood is geweest is een
aanname.

## 5. Wat het opruimde

Drie open rijen in `docs/ENGINEER-REVIEW.md` gingen hierop dicht of lichter:

| Rij | Wat er stond |
|---|---|
| 08-09 | Een beheerder kan zichzelf op `paused` zetten en een ander van `paused` naar `active` — beide randen bestaan niet meer |
| 04-09 | `te_beoordelen_voor()` eist `= 'active'`, `openstaande_beoordelingen()` `<> 'inactive'`: *een lid met een adempauze mág beoordelen maar wordt er nooit over gemeld*. De twee grenzen vallen nu samen |
| 07-09 | Een openstaand lidmaatschapsverzoek blijft `pending` — het geval "ontstaat pas bij `paused`" |

## 6. De grendel, en hoe hij geijkt is

`tests/rls/pauze-bestaat-niet.test.ts` toetst twee helften, want elk op zich is
groen te houden terwijl de belofte breekt:

* **Er is geen schrijver** — als gewoon lid (de guard weigert), als beheerder over
  een ander (de CHECK weigert), en als `service_role`, dat door de guard heen
  loopt op `auth.uid() is null` en dus alleen de CHECK tegenkomt. Die derde
  draagt de belofte.
* **Er is geen lezer** — geen functie in `public` vertakt nog op de literal, en
  geen policy weegt hem mee.

⚠️ **De bronscan strípt commentaar, en dat is een besluit.** Een migratie die
opschrijft wát er weg is ("hier stond `not in ('inactive', 'paused')`") is
documentatie en geen lezer; `ketting_stand()` draagt zo'n regel. Zou de toets die
meetellen, dan leert hij je de geschiedenis uit de code te halen om hem groen te
krijgen.

📏 **Acht mutaties, één per grendel, elk apart gemeten:**

| Mutatie | Wat er rood werd |
|---|---|
| `paused` terug in de CHECK | de `service_role`-test en de CHECK-toets — **niet** de test op de guard, en dat is het bewijs dat die de guard meet |
| de restweigering uitgezet | de toets op de onbekende stand **en** de beheerderstest — die valt dan terug op de CHECK (23514) en niet op `onbekende_lidstatus` |
| een functie met de literal in haar lichaam | de bronscan |
| dezelfde literal alleen in commentaar | niets — zoals bedoeld |
| een policy die `paused` noemt | de policyscan |
| `on conflict` uit `join_group_with_code()` | het actieve lid dat de code nog eens aanbiedt |
| de `removed`-uitgang eruit | het uitgezette lid dat de code aanbiedt |

## 7. Wat er blijft staan

⚠️ Twee commentaren in het *lichaam* van `getuigenissen_voor()` en
`verlaat_groep()` noemen `paused` nog als bestaande stand. Ze zijn niet
aangeraakt, en dat is een regel en geen vergeetpunt: **een functie wordt
vervangen als haar lichaam verandert, en een commentaar erin wordt bijgewerkt bij
de eerstvolgende vervanging.** `verlaat_groep()` is 263 regels; die overschrijven
om één zin te wijzigen begraaft de echte wijzigingen van 0204 in kopieerwerk, en
dat kost een security-review meer dan de zin oplevert. Er staat een rij over in
`docs/ENGINEER-REVIEW.md`.
