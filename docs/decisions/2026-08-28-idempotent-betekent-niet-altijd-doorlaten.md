# Idempotent betekent niet "altijd doorlaten" — regel 20 gemeten

**Datum:** 28-08-2026
**Aanleiding:** de Middel-rij die in QS8-65 aan `docs/ENGINEER-REVIEW.md` werd
toegevoegd, en die zei dat 26 migratiebestanden onwrikbare regel 20 breken.

## Wat die rij fout had

Ze telde met twee greps — `create index` en `create function` zonder bescherming —
en kwam op 23 + 3. Twintig regels hoger in datzelfde document staat: **een grep
is geen meting.** Dat gold hier ook.

De grep `^create table [a-z"]` matchte bijvoorbeeld `create table if not exists`,
want de `i` van `if` valt binnen `[a-z]`. Van de "acht bestanden met een kale
`create table`" was er nul.

## De meting

Het schema opgebouwd op een lege database uit `supabase/migrations/`
(`scripts/schema-opbouwen.sh`, 109 bestanden), en daarna élk bestand een tweede
keer afgespeeld met `ON_ERROR_STOP=1`.

**Zeven vielen om, en dat zijn twee verschillende dingen.**

### Klasse A — werkelijk niet idempotent (drie regels, twee bestanden)

| Bestand | Regel | Wat er stond |
|---|---|---|
| `0059_systeemberichten_met_parameters.sql` | 176 | `create function public.plaats_systeembericht(` |
| `0059_systeemberichten_met_parameters.sql` | 203 | `create function public.plaats_systeembericht_in_doelgroepen(` |
| `0094_een_reviewpunt_per_buddy_per_cyclus.sql` | 127 | `create unique index points_ledger_review_dedupe_idx` |

Alle drie omgezet naar `create or replace` respectievelijk `if not exists`.
Dit zijn de twee bestanden die het rollback-pad van 0107 lieten stranden: beide
breken af **vóór** de functie die de rollback nodig had, dus na een halve
terugrol stond de helft terug.

⚠️ **De tweede fout in 0059 zat achter de eerste verstopt.** `ON_ERROR_STOP=1`
stopt bij de eerste, dus na de reparatie van regel 203 kwam regel 176 pas boven.
Een meting als deze doe je iteratief, niet één keer.

### Klasse B — vallen om, en dat is de beveiliging (vijf bestanden)

| Bestand | Object | Waarom |
|---|---|---|
| `0002`, `0008` | `join_group_with_code` | geeft vandaag `jsonb` (sinds 0017), de oude versie `uuid` |
| `0016` | `rotate_invite_code` | geeft vandaag `jsonb` (sinds 0018) |
| `0024` | `groepschat` | geeft vandaag een TABLE met 13 kolommen |
| `0003` | view `group_visible_streaks` | heeft vandaag `last_cycle_start` (sinds 0078) |

Deze vijf proberen bij een tweede ronde een **oudere** definitie terug te zetten.
Postgres weigert dat: `cannot change return type of existing function` en
`cannot drop columns from view`.

⚠️ **Die weigering is het enige dat de terugzet tegenhoudt.** Wie ze "idempotent"
maakt met `drop … if exists` gevolgd door `create`, installeert bij een tweede
ronde de oude vorm — stil, zonder fout.

⚠️ **En bij `group_visible_streaks` zou dat een domeinregel-7-besluit
terugdraaien.** 0003 laat `last_cycle_start` er expliciet uit met de reden *"uit
die twee is een gemiste week af te leiden"*. 0078 zette hem er onder besluit A41
weer in, voor open groepen. Een geforceerde tweede ronde zou die verruiming
ongedaan maken zonder dat iemand het besloten heeft — en dat is precies de
beweging waar `CLAUDE.md` bij domeinregel 7 voor waarschuwt.

## Het besluit

**Onwrikbare regel 20 luidt: idempotent tegen de toestand waarvoor de migratie
geschreven is.** Verandert een latere migratie de vorm van hetzelfde object, dan
is de botsing bij herhaling correct gedrag. Die fout neem je nooit weg.

## De grendel

`tests/migraties/idempotentie.ts` met `tests/migraties/idempotentie.test.ts`.
Hij vindt klasse A en meldt klasse B niet — die gebruiken allemaal
`create or replace`, dus statisch zien ze er goed uit, en dat is precies goed.

⚠️ **De drop-uitzondering leest de handtekening, niet alleen de naam.** Een
migratie die de vorm van een functie verandert móet hem eerst droppen; 0059 doet
dat voor `groepschat` en dat is correct. Maar 0059 dropte óók
`plaats_systeembericht(uuid, text, text)` en maakte daarna een versie met zés
argumenten — een andere functie, dus die drop dekte hem niet. **Een controle die
op naam vergelijkt, laat precies de bug door die hij moet vinden.** Daarom
vergelijkt hij genormaliseerde argumenttypes.

⚠️ **In beide richtingen met de hand bewezen**, zoals `CLAUDE.md` eist. Op de
gerepareerde boom meldt hij nul. Draai je één van de drie regels terug, dan wijst
hij precies díe regel aan — en noemt in de melding de handtekening die er had
moeten staan. 23 ijkingsgevallen, waarvan negen vormen die hij moet vinden en
tien die hij met rust moet laten, waaronder een `create function` die alleen in
het rollback-commentaar van de kop staat.

⚠️ **Hij staat in `tests/` en niet in `scripts/`**, want `scripts/` was het
werkgebied van een parallelle sessie. Bijkomend voordeel: als test draait hij mee
in `npm test` en dus bij élke push, terwijl `migraties:controle` alleen in
`/audit` staat. Verhuizen naar `migraties:controle` zodra `scripts/` vrij is —
dan wel met behoud van de ijkingstest.

⚠️ **En hij is meteen op vers werk beproefd.** De meting hierboven ging over 109
bestanden; tijdens het landen van deze reeks groeide de boom naar **115** — zes
migraties erbij van twee sessies. De grendel bleef nul melden, dus die zes
dragen geen klasse A. Dat is de eerste keer dat hij iets bewaakte dat niet uit
de meting kwam waarop hij geijkt is.

## Wat er niet is gedaan

De vijf van klasse B zijn onaangeraakt. Er is bewust géén poging gedaan het
schema "volledig herspeelbaar" te maken; dat zou vragen dat elke migratie de
laatste vorm van elk object kent, en dat is precies wat een migratiereeks niet
is.
