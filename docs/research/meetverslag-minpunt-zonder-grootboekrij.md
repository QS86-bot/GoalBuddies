# Meetverslag: twee gemiste weken met `points_miss = -1` en geen rij in het grootboek (QS8-774)

Gemeten op **22-11-2026**, productie (`goalbuddies`, ref `wehgocadxehottiiyvsc`, migraties tot en met 0337), **alleen lezen**: uitsluitend `select` en `pg_get_functiondef()`, via de Supabase-MCP. Er is niets geschreven. Rijen worden genoemd bij de eerste acht tekens van hun id, nooit bij naam of e-mail. Repo-stand: `origin/main` op `b636a3bd`.

Aanleiding: het meetverslag van QS8-745 (`docs/research/meetverslag-gat-bij-een-gemiste-week.md`, vraag 3) vond twee `weekly_goals` op `missed` met `points_miss = -1` en nul rijen in `points_ledger`, en liet de oorzaak open.

## Conclusie

**Voor de twee weken: klasse (a), geen fout, geen actie.** Het is ook geen historisch artefact: het is **bedoeld gedrag dat vandaag nog precies zo optreedt.** Beide weken hadden geen beoordelaar. De database slaat het minpunt dan bewust over: QS8-110, optie C, *"zonder buddy geen punten omhoog, dus ook niet omlaag"* (migratie 0065, aangescherpt in 0066).

**Bij het nalopen kwam wel een gat van klasse (b) boven, dat vandaag nog kan optreden:** komt een buddy pas bij de groep nadat het weekdoel is aangemaakt, dan blijft de grendel `false`. Een gemiste week kost dan niets, terwijl die buddy de week wél kan goedkeuren (+2). Dat is de asymmetrie die domeinregel 10 verbiedt (*"anders is missen gratis"*). De productieweken van dit issue vallen hier niet onder: daar is nooit een tweede lid geweest. Zie het hoofdstuk *Het gat: een buddy die later komt*. Voorstel voor een vervolgissue staat daar.

De vraag in het issue ging uit van een aanname die niet klopt: dat `points_miss = -1` betekent dat er een rij in het grootboek hoort te staan. `points_miss` is het bedrag dat een gemiste week **zou** kosten. Of dat bedrag geboekt wordt, beslist de trigger `minpunt_alleen_met_beoordelaar` op `points_ledger`. Het grootboek is de waarheid over de score; `points_miss` wordt nergens in `src/` of `app/` getoond (alleen in de gegenereerde typen).

## De twee weken

| Weekdoel | Doel | Cyclus | Status | `points_miss` | `beoordeelbaar` | Koppelingen | Groepen van de eigenaar tijdens de week |
|---|---|---|---|---|---|---|---|
| `1d18b27e` | `6bebb27e` | 14-09 t/m 20-09 | `missed` | -1 | **false** | 0 | 0 (nooit lid geweest van een groep) |
| `9ad5a49e` | `22921dbe` | 30-09 t/m 06-10 | `missed` | -1 | **false** | 1 | 0: beide groepen bestaan pas sinds **18-11-2026**, en de eigenaar is daarin het enige lid |

Gemeten met `select` op `weekly_goals`, `goals`, `goal_group_links`, `group_members` en `groups` (tijdstempels `groups.created_at` en `group_members.joined_at`), plus `kan_beoordeeld_worden(goal_id, owner_id)`: **false** voor beide doelen, ook vandaag.

Overige standen, ook gemeten: `points_ledger` 0 rijen; `groups` 2, `group_members` 2 (beide van dezelfde eigenaar, `active`); beide eigenaars staan nog in `profiles`.

## Het pad, gemeten op de gedeployde functies

1. **Bij het aanmaken van het weekdoel** zet `zet_beoordeelbaar_bij_insert()` (BEFORE INSERT op `weekly_goals`) `beoordeelbaar := kan_beoordeeld_worden(goal_id, owner_id)`. Die vraagt of het doel gekoppeld is aan een groep met een ánder lid dat niet `inactive` is. Voor beide weken: nee, dus `false`.
2. **De grendel gaat alleen omhoog.** `beoordeelbaar_blijft_staan()` (BEFORE UPDATE) zet hem terug naar `oud or nieuw`. `koppeling_zet_beoordeelbaar_om()` (AFTER INSERT op `goal_group_links`) zet hem alleen om voor weken op `todo` of `cancelled`. De koppeling van `22921dbe` kwam na 18-11, toen die week al `missed` was, dus de grendel bleef `false`. Dat is zo bedoeld: een afgewikkelde week verandert niet met terugwerkende kracht (domeinregel 6, kop van 0066 §3).
3. **Bij het sluiten van de week** zet de rollover de status op `missed` en probeert hij de rij `cycle_missed` met `delta = points_miss` te boeken (vandaag via `sluit_verstreken_weken_af()`, 0335).
4. **De trigger `minpunt_alleen_met_beoordelaar`** (BEFORE INSERT op `points_ledger`, `tgenabled = O`) leest `weekly_goals.beoordeelbaar` via `ref_id`. Is die `false`, dan geeft `geen_minpunt_zonder_beoordelaar()` `return null`: de rij wordt stil overgeslagen, met alleen een `raise notice` in de Postgres-log. De status `missed` blijft staan, want de week ís gemist.

De trigger hangt aan de tabel en niet aan de rollover. Hij geldt voor elke schrijver **die naar het weekdoel verwijst** (`ref_type = 'weekly_goal'` en `ref_id` gevuld). Zonder die verwijzing laat hij de rij bewust door: bij twijfel blijft het minpunt staan. Beide rollovers vulden de verwijzing: de huidige `sluit_verstreken_weken_af()` en de Edge Function-versie die in september en oktober draaide (`ref_type: 'weekly_goal', ref_id: weekdoel.id` in de geschiedenis van `supabase/functions/rollover`; dat is nagelezen door de security-reviewer en niet door mij).

**Vingerafdrukken.** `md5(pg_get_functiondef())` van zeven functies is op productie gelijk aan die op de lokaal opgebouwde database (alle 340 migratiebestanden van `origin/main`):

| Functie | md5 |
|---|---|
| `geen_minpunt_zonder_beoordelaar` | `fa8b8c89de21a620ed819d1ddf790636` |
| `zet_beoordeelbaar_bij_insert` | `294c1a469622f545b377783bf44a086d` |
| `kan_beoordeeld_worden` | `7a4336c22d56a01f9151fdb16fec27c1` |
| `beoordeelbaar_blijft_staan` | `806930be5f63a6091196a94700038485` |
| `koppeling_zet_beoordeelbaar_om` | `1c33e021321e2bdb54ae2259e5752817` |
| `sluit_verstreken_weken_af` | `48f3f52b9a193b01207736f35d2911f7` |
| `noteer_beoordelaar_weg_groep` | `9214f21f2143f64e29a93b38bfe74f6c` |

## De drie kandidaten uit de opdracht

| Kandidaat | Uitkomst | Hoe gemeten |
|---|---|---|
| De weken sloten vóór de migratie die `cycle_missed` boekt | **Verworpen.** `cycle_missed` is een toegestane reden sinds 0001. De boeking zelf deed de rollover (de Edge Function, sinds 0335 via `sluit_verstreken_weken_af()`). De weken sloten na 20-09 en 06-10; `CLAUDE.md` noteert productie op 0282 op 17-09, dus 0065 en 0066 waren al actief. Ook onder de oudere vorm van 0065 (de vraag op het moment van boeken) was het antwoord `false`, want er bestond tot 18-11 geen groep. | migratievolgorde (`list_migrations`), tijdstempels van de groepen |
| Gesloten door een pad dat niet boekt | **Nee, het boekende pad werd geweigerd.** Welk pad de status zette, is niet vast te stellen (`weekly_goals` heeft geen `updated_at` en de Postgres-log van september is weg). Dat maakt voor de uitkomst niet uit: de trigger laat bij `beoordeelbaar = false` geen schrijver door die naar het weekdoel verwijst, en beide rollovers deden dat. | trigger- en functiedefinities op productie; lokale proef, stap 4 |
| Een rij is later weggehaald | **Verworpen als verklaring.** Voor deze weken kon nooit een rij ontstaan (zie hierboven). Daarnaast: `authenticated` heeft op `points_ledger` alleen `SELECT` (één policy, `points_ledger_select`); de opruimregels in `tests/rls/punten-deze-week.test.ts` en `tests/rls/teambonus.test.ts` filteren op testgebruikers; de cascade vanuit `profiles` speelt niet, want beide eigenaars bestaan nog. | `pg_policy`, `role_table_grants`, grep in `tests/` |

⚠️ **Wel gemeten en niet verklaard, en voor deze vraag niet nodig:** `pg_stat_user_tables` toont voor `points_ledger` sinds 24-07-2026 `n_tup_ins = 2956` en `n_tup_del = 3052`. Er is dus veel in en uit dit grootboek geschreven. Waarschijnlijk is dat de RLS-suite, die tot QS8-702 (18-11) standaard tegen productie draaide. Dat het aantal deletes groter is dan het aantal inserts, komt waarschijnlijk door rijen die al vóór de reset van de statistieken bestonden. **Beide verklaringen zijn aannames.** Ze veranderen de conclusie niet, want voor deze twee weken kon geen rij ontstaan.

## Lokale proef

Op een verse lokale Postgres 16 (eigen wegwerpcluster op poort 5433) zijn met `scripts/schema-opbouwen.sh` alle 340 migraties afgespeeld, met de shim `shim_maak_gebruiker()` voor de gebruikers. Daarna draaide de proef hieronder, in één transactie die wordt teruggerold. PostgREST is niet nodig: de vraag gaat over triggers, en die draaien ook als superuser.

Drie gebruikers met elk één doel en één weekdoel in de cyclus van 05-01-2026, en een vierde als buddy:

| Scenario | `beoordeelbaar` vóór sluiten | Na `sluit_verstreken_weken_af(…, 2026-02-01)` | Rijen `cycle_missed` | Som delta |
|---|---|---|---|---|
| **A**: solo, nooit een groep (vorm van `1d18b27e`) | false | `missed`, `points_miss = -1` | **0** | 0 |
| **B**: doel in een groep met een tweede actief lid | true | `missed`, `points_miss = -1` | **1** | -1 |
| **C**: solo tijdens de week, ná het sluiten gekoppeld aan een groep waarin de eigenaar het enige lid is (vorm van `9ad5a49e`) | false, en na de koppeling nog steeds false | `missed`, `points_miss = -1` | **0** | 0 |

Plus een vierde stap: een directe `insert` van een `cycle_missed`-rij voor A (een tweede schrijver, buiten de rollover om) geeft `INSERT 0 0`. Ook die wordt stil overgeslagen.

A en C reproduceren de productietoestand precies. B laat zien dat de boeking in de normale situatie wél werkt. De rollover is dus niet stuk.

<details>
<summary>De proef (psql, teruggerold)</summary>

```sql
\set ON_ERROR_STOP 1
begin;
create temp table v (naam text, uid uuid, goal uuid, wg uuid);
insert into v (naam, uid) values
  ('A_solo',        shim_maak_gebruiker('a@proef.test','A')),
  ('B_met_buddy',   shim_maak_gebruiker('b@proef.test','B')),
  ('C_groep_later', shim_maak_gebruiker('c@proef.test','C')),
  ('buddy',         shim_maak_gebruiker('d@proef.test','D'));
insert into goals (owner_id, title, target_date) select uid, 'Doel '||naam, current_date + 400 from v where naam <> 'buddy';
update v set goal = (select id from goals g where g.owner_id = v.uid);

-- B: doel in een groep met een tweede actief lid, vóór het weekdoel bestaat
insert into groups (id, name, invite_code, created_by) values ('00000000-0000-0000-0000-0000000000b1', 'Groep B', upper(substr(md5('00000000-0000-0000-0000-0000000000b1'),1,10)), (select uid from v where naam='B_met_buddy'));
insert into group_members (group_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000b1', (select uid from v where naam='B_met_buddy'), 'admin', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', (select uid from v where naam='buddy'), 'member', 'active');
insert into goal_group_links (goal_id, group_id) select goal, '00000000-0000-0000-0000-0000000000b1' from v where naam='B_met_buddy';

insert into weekly_goals (goal_id, title, cycle_start_date, status)
  select goal, 'w', date '2026-01-05', 'todo' from v where naam <> 'buddy';
update v set wg = (select id from weekly_goals w where w.goal_id = v.goal);

select naam, (select beoordeelbaar from weekly_goals where id=v.wg) beoordeelbaar_voor from v where wg is not null order by naam;
select v.naam, r.gemist, r.mislukt from v, lateral sluit_verstreken_weken_af(v.uid, date '2026-02-01') r where v.wg is not null order by v.naam;

-- C: pas ná het einde van de week een groep, met de eigenaar als enig lid
insert into groups (id, name, invite_code, created_by) values ('00000000-0000-0000-0000-0000000000c1', 'Groep C', upper(substr(md5('00000000-0000-0000-0000-0000000000c1'),1,10)), (select uid from v where naam='C_groep_later'));
insert into group_members (group_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c1', (select uid from v where naam='C_groep_later'), 'admin', 'active');
insert into goal_group_links (goal_id, group_id) select goal, '00000000-0000-0000-0000-0000000000c1' from v where naam='C_groep_later';

select v.naam, w.status, w.points_miss, w.beoordeelbaar,
       (select count(*) from points_ledger p where p.ref_id = w.id and p.reason='cycle_missed') ledger_rijen,
       (select coalesce(sum(delta),0) from points_ledger p where p.ref_id = w.id) delta
  from v join weekly_goals w on w.id = v.wg order by v.naam;

-- Een tweede schrijver voor A wordt ook overgeslagen
insert into points_ledger (user_id, goal_id, delta, reason, ref_type, ref_id)
  select uid, goal, -1, 'cycle_missed', 'weekly_goal', wg from v where naam='A_solo';
select count(*) from points_ledger p join v on p.ref_id=v.wg where v.naam='A_solo';
rollback;
```

</details>

## Een bijvangst, en die hoort niet bij dit issue

In een eerste versie van de proef koppelde ik C **vóór** het sluiten van de week. Toen werd `beoordeelbaar` `true` en werd het minpunt geboekt, terwijl de eigenaar het enige lid van de groep was. Oorzaak: `koppeling_zet_beoordeelbaar_om()` zet de grendel om bij elke koppeling, zonder te vragen of de groep een tweede lid heeft. `zet_beoordeelbaar_bij_insert()` vraagt dat wél.

Dat is **gedocumenteerd als bewuste keuze** in de kop van 0066 §3 (*"bewust de gulle kant op … dat kan een minpunt opleveren voor een week waarin je feitelijk geen buddy had. De andere kant op fout gaan is erger: dan is missen weer gratis"*). Het verklaart de twee productieweken niet, en het is geen fout. Het is één van de plekken waar de app bewust de gulle kant op kiest: een minpunt zonder dat er een beoordelaar kon zijn. Andere plekken zijn het vertrek van je enige buddy midden in de week (0102, bewust) en, volgens de security-reviewer, een gearchiveerde groep (`kan_beoordeeld_worden()` kijkt niet naar `groups.status`; door mij niet gemeten). Deze kant op is de schade een punt te veel, geen gratis gemiste week.

## Het gat: een buddy die later komt (klasse b)

De gevaarlijke asymmetrie zit aan de andere kant, en de security-reviewer vond haar bij het nalopen van dit verslag. Ik heb haar zelf nagespeeld.

**Volgorde:** doel koppelen aan een groep waarin je het enige lid bent → weekdoel aanmaken (`beoordeelbaar = false`, want `kan_beoordeeld_worden()` vindt geen ander lid) → een buddy komt erbij → de week wordt gemist.

**Lokaal gemeten** (zelfde database, transactie teruggerold):

| Moment | `beoordeelbaar` | `kan_beoordeeld_worden()` | Status | Rijen `cycle_missed` |
|---|---|---|---|---|
| Na de buddy, vóór het sluiten | **false** | **true** | `todo` | 0 |
| Na `sluit_verstreken_weken_af()` | false | true | `missed`, `points_miss = -1` | **0**, met de NOTICE *"minpunt overgeslagen"* |

**Oorzaak, gemeten op productie én lokaal:** geen enkele trigger op `group_members` raakt `beoordeelbaar` (0 op productie). Alleen een nieuwe rij in `goal_group_links` zet de grendel om. De goedkeuringspolicy `completion_approvals_insert` leest de grendel niet (md5 van de WITH CHECK op productie gelijk aan lokaal, `5b298150c296d6ea83c8dd96165b31ea`). Die buddy kan de week dus goedkeuren. **Halen levert +2 op, missen kost 0.** Het kolomcommentaar van 0066 belooft *"stond dit doel tijdens deze cyclus ooit in een groep met een ander niet-inactief lid"*; wat gebouwd is, houdt die belofte niet.

**Hoe het optreedt:**
- *Vanzelf, zonder kwade opzet:* groep aanmaken, doel koppelen, week plannen, vriend uitnodigen. De weken die vóór het toetreden zijn aangemaakt, kosten niets als ze gemist worden. Volgens de reviewer is het venster begrensd tot één cyclus vooruit (`weekdoel_cyclus_klopt`); dat heb ik niet zelf gemeten.
- *Herhaalbaar, met een meewerkende buddy:* de buddy vertrekt, de eigenaar maakt het weekdoel van volgende week aan, de buddy komt terug met de code. De koppeling van de eigenaar blijft staan, dus de koppeltrigger gaat niet af. Dit is de vorm *"vertrek vrijdag, kom maandag terug"* die 0066 en 0102 moesten dichten. Deze route heb ik **niet** apart nagespeeld; de reviewer leidt hem af uit dezelfde oorzaak.

**Voorstel voor een vervolgissue** (onder QS8-110; punten zijn een besluit van Quinten, dus nog niet aangemaakt):

> *Een buddy die later bij de groep komt, zet de grendel op het minpunt om.*
> Acceptatiecriteria:
> 1. Wordt een lid van een groep actief of komt het erbij (insert, of een update van `inactive` naar een andere status), dan wordt `beoordeelbaar` `true` voor elk weekdoel op `todo` of `cancelled` van elk doel dat aan die groep gekoppeld is en van een **ander** lid is.
> 2. Afgewikkelde weken (`missed`, `approved`, `excused`) veranderen niet (domeinregel 6).
> 3. Een RLS-test speelt beide routes na: "buddy komt later" en "buddy vertrekt en komt terug". Beide geven een rij `cycle_missed` met `-1`, en beide worden rood met de oude trigger teruggezet.
> 4. Een lid dat alleen zichzelf toevoegt (de eigenaar), zet niets om.
> 5. Het beslisdocument van de grendel (`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`) noemt de nieuwe trigger en de reden.

## Wat gemeten is en wat een aanname is

**Gemeten:** de tabelstanden en grendelwaarden van beide weken; dat de groepen pas sinds 18-11 bestaan; de gedeployde trigger- en functiedefinities en hun vingerafdrukken (gelijk aan de repo); de policy en de rechten op `points_ledger`; de lokale reproductie van alle drie de scenario's en van de tweede schrijver; het gat van de later komende buddy (lokaal), en op productie dat er geen trigger op `group_members` is en dat de goedkeuringspolicy gelijk is aan de repo.

**Niet gemeten (aannames):**
1. Welk pad de status in september en oktober op `missed` zette (geen `updated_at`, geen log meer). Voor de uitkomst maakt het niet uit: de trigger geldt voor elk pad.
2. De exacte datum waarop 0065 en 0066 op productie zijn uitgerold. `supabase_migrations.schema_migrations` heeft geen tijdstempelkolom. Afgeleid uit de volgorde en uit de stand van 17-09 in `CLAUDE.md`; onder elke versie sinds 0065 is de uitkomst dezelfde.
3. De oorzaak van de verhouding tussen inserts en deletes in `pg_stat_user_tables` (zie hierboven).
4. Dat de eerste week niet door een `notice` in de log is achtergebleven: de log van toen bestaat niet meer, dus de `notice` zelf is niet terug te vinden.

5. Of een gearchiveerde groep goedkeuren blokkeert (zie *Een bijvangst*); niet gemeten.
6. De herhaalbare route van het gat (vertrekken en terugkomen); afgeleid, niet apart nagespeeld.

## Volgende stap

Voor QS8-774 zelf geen bouwwerk: de twee weken zijn verklaard. Voor het gat is een besluit van Quinten nodig (punten, domeinregel 10). Er zijn drie opties:

- **A (advies):** vervolgissue met de acceptatiecriteria hierboven, onder QS8-110. Dat dicht de asymmetrie aan de kant waar missen gratis is.
- **B:** het gat accepteren als bewuste gulheid. Dan hoort de zin in het kolomcommentaar van 0066 eruit, en hoort er een regel in de agenda van de engineer-review met *Wordt zwaarder als*.
- **C:** eerst meten hoe vaak het in productie voorkomt. Met twee profielen is dat vandaag nul, dus dit stelt het besluit uit tot er gebruikers zijn.
