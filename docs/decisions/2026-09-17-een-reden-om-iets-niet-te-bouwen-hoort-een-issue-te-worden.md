# Een reden om iets niet te bouwen hoort een issue te worden

**17-09-2026 — QS8-527.** Twee open **Middel**-rijen in `docs/ENGINEER-REVIEW.md`
gaan over onwrikbare regel 20, en allebei noemen ze een controle die er niet was.
Die bestaat sinds 10-09-2026. Geen van beide rijen wist het.

## 1. Wat er gemeten is

| | rij 231 zei | 17-09-2026 gemeten |
|---|---|---|
| `0094` regel 127 | kale `create unique index` | `create unique index **if not exists** …` |
| `0059` regel 203 | kale `create function` | `create **or replace** function …` |
| de controle | *"bewust niet gebouwd"* | `npm run idempotent:controle`, in de poort én in CI |
| de dekking | — | **289** migraties, elk twee keer, groen in **22 s** |

📏 Geijkt met één mutatie per geval dat de rij noemt, in een `git worktree`:

| mutatie | uitslag |
|---|---|
| `if not exists` weg uit 0094 | exitcode **1**, `0094_…sql botst op zichzelf bij een tweede run` |
| `or replace` weg uit 0059 | exitcode **1**, `0059_…sql botst op zichzelf bij een tweede run` |
| allebei teruggezet | exitcode **0**, 289 migraties |

Twee losse mutaties en niet één: de rij noemt twee gevallen, en een mutatie per
grendel is de huisregel. Beide keren viel precies het eigen bestand om.

## 2. De kostenschatting van rij 557 zat er een orde naast

De rij stelde zijn eigen reparatie voor en schatte hem te duur in:

> De echte vangst zou zijn: elke migratie twee keer afspelen op een verse
> database. Dat is wat `rls:stack` al doet voor ronde één; **ronde twee kost
> dezelfde tijd nog eens.**

📏 Het is **2 seconden** (23,3 s → 25,3 s), want beide passes gaan in één
`psql`-sessie en de tweede is per definitie bijna helemaal no-op. De hele
controle kost vandaag 22 seconden.

⚠️ **Een geschatte prijs die een reparatie tegenhoudt, hoort gemeten te worden
voordat hij als reden wordt opgeschreven.** Hier stond een factor-30-verschil
tussen de schatting en de meting, en die schatting stond drie weken in een rij
die precies daarom openbleef.

## 3. De les eronder, en waarom die breder is dan deze twee rijen

Rij 231 schreef zijn eigen reden op om de controle niet te bouwen:

> Een controle erbij is goedkoop (de twee greps hierboven zijn hem al bijna),
> maar `scripts/` was deze week het werkgebied van een parallelle sessie, dus dat
> is bewust niet gebouwd.

Die reden was **juist**, en de zin is precies zoals dit project het graag doet:
de afweging staat erbij, niets is stilzwijgend. En toch:

- de zin heeft er **drie weken** gestaan;
- de controle kwam er uiteindelijk langs een heel andere weg (QS8-413, uit de
  botsing van migratie 0252) en niet doordat iemand deze zin terugvond;
- niemand werkte de rij bij, dus de rij bleef vragen om iets dat er al was.

> **Een zin in een dossierrij die zegt "dit bouwen we later" is geen
> werkvoorraad. Hij wordt alleen gelezen door wie die rij toevallig openslaat.**

Wat er wél werkt is een issue: dat staat in de lijst waar `/verder` uit put, en
het draagt zijn eigen acceptatiecriteria. Vandaar dat het openstaande deel van
rij 557 hier **QS8-528** is geworden en geen tweede zin.

⚠️ Dit is dezelfde asymmetrie als bij rij 748: een nieuwe bevinding opschrijven
is goedkoop, want je hebt hem net gevonden. Terugvinden wat je eerder besloot uit
te stellen is een opzoekactie in achthonderd regels — en wat een opzoekactie
kost, gebeurt onregelmatig.

## 4. Wat rij 557 openhoudt

`idempotent:controle` vraagt **of een migratie omvalt** bij een tweede run, niet
**of de eindtoestand gelijk is**. Een `update t set n = n + 1` draait twee keer
zonder klacht en laat iets anders achter.

📏 Die restklasse heeft vandaag **nul instanties**. Van 289 migratiebestanden
dragen er **9** topniveau-DML — geteld ná het wegknippen van dollar-quoted
functielichamen en commentaar — en alle negen zijn met de hand nagelezen:

| migratie | vorm | waarom idempotent |
|---|---|---|
| 0126, 0222, 0227, 0240 | `insert into storage.buckets` | `on conflict … do update set` |
| 0164 | `update goals` / `groups` / `profiles` | `where category in (<oude waarden>)` |
| 0204 | `update group_members` | `where status = 'paused'` |
| 0211 | `delete` + `update … set token = btrim(token)` | `btrim` is een vast punt |
| 0213 | `update chat_messages set body = <vaste tekst>` | vaste waarde |
| 0257 | `update points_ledger` | `where … is distinct from true` |

**Nul instanties en niets dat de tiende tegenhoudt** — de vorm die CLAUDE.md bij
QS8-417 benoemt: de instanties opgeruimd, het mechanisme niet.

## 5. Wat dit besluit niet is

- **Geen nieuwe controle in deze PR.** Het register dat die restklasse afdekt
  staat als QS8-528 en raakt `package.json` en `scripts/ci-controles.mjs`, en
  dat is vandaag het werkgebied van de parallelle sessie. **Het verschil met rij
  231 is dat het nu een issue is en geen zin.**
- **Geen oordeel over welke vorm die controle krijgt.** Een register met een
  reden per rij is goedkoper; een echte eindtoestandsvergelijking is eerlijker
  maar kost de 2 seconden die deze controle juist zo goedkoop maken. Die afweging
  hoort in het issue en niet hier.
