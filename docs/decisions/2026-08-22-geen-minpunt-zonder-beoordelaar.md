# Geen minpunt als niemand je week kon beoordelen

> ⚠️ **Hernummer dit bestand bij het samenvoegen.** Datum in plaats van nummer,
> zoals de andere documenten van vandaag.

**Status:** besloten door Quinten, 22-08-2026 (optie C) · **Issue:** QS8-110
**Migraties:** `0064`, `0065` — beide toegepast
**Onderbouwing vooraf:** `docs/research/wat-krijg-je-bij-een-gehaalde-week.md`

## Het probleem

De hele positieve kant van het puntenmodel hangt aan één trigger,
`award_points_on_approval()` op `completion_approvals`. Wie geen buddy heeft
krijgt nooit een goedkeuring, dus zijn weekdoel blijft eeuwig `pending`: geen
punten, geen weekpas, en `herbereken_reeks()` telt alleen `approved`, dus ook
geen reeks.

De rollover loopt intussen over álle profielen zonder naar groepen te kijken en
boekt het minpunt wél.

| | met buddy | zonder buddy (vóór dit besluit) |
|---|---|---|
| week gehaald | `+1`/`+2`, reeks groeit, weekpas dichterbij | niets |
| week gemist | `−1`, reeks breekt | **`−1`, reeks breekt** |

Een gebruiker zonder buddy kon dus uitsluitend dalen. Dat botst met domeinregel
10 — *"de reeks dient de gebruiker, nooit andersom"* — en met `regels.ts`, dat
solo werken uitdrukkelijk toestaat: *"Wie in geen enkele groep zit, hoort zijn
nudge gewoon te krijgen."* De app moedigde het aan en strafte het af.

## Het besluit

**Geen punten zonder goedkeuring, maar dan ook geen minpunt zonder beoordelaar.**
Symmetrisch: kan er niets omhoog, dan kan er ook niets omlaag.

Uitdrukkelijk níét gekozen:

- *zelf afronden telt, maar minder* — botst met "zelf afvinken is geen
  goedkeuring", dat expliciet in `api.ts` staat;
- *een wachttermijn waarna een voltooiing alsnog telt* — introduceert een tweede
  soort goedkeuring en daarmee een tweede puntenpad.

## ⚠️ De voorwaarde is niet "heeft een groep"

Dat was de eerste formulering en hij is te grof. `completion_approvals_not_self`
verbiedt jezelf goedkeuren, dus alleen in een groep zitten is niet genoeg: er moet
een **ánder actief lid** zijn. Zonder die verfijning kon iemand die alleen in zijn
eigen groep zit nog steeds uitsluitend dalen — dezelfde fout, een laag dieper.

De precieze vraag is dus: *bestaat er een groep waaraan dit doel gekoppeld is, met
minstens één ander actief lid?* Dat is `kan_beoordeeld_worden(goal_id, owner_id)`
uit migratie 0064.

Een slapende groep telt gewoon mee. Slapen onderdrukt nudges (QS8-60); het
ontneemt niemand het recht om te beoordelen.

## Waarom de handhaving in de database zit en niet in de rollover

De rollover is vandaag de enige schrijver van `cycle_missed`. Toch staat de regel
in een trigger op `points_ledger`, om twee redenen:

1. **`supabase/functions/` valt buiten typecheck, lint en CI**, en de repo-versie
   van de rollover loopt aantoonbaar achter op de gedeployde — de repo mist de
   straffen uit 0057 en de risicoherberekening. Een regel die daar staat geldt
   zolang niemand een oude versie deployt.
2. **In de database geldt hij voor elke schrijver, ook een toekomstige.** Dezelfde
   redenering als bij domeinregel 7: de regel is pas afgedwongen als de dátabase
   hem afdwingt.

⚠️ Prijs die we daarvoor betalen: de trigger slaat de rij **stil** over. Gooien
zou de rollover elk uur een fout geven voor elke gebruiker zonder buddy, en dat is
geen storing maar de bedoeling. `raise notice` laat het spoor in de
Postgres-logs achter.

⚠️ Gevolg dat je moet weten: de rollover telt zo'n week nog steeds mee in zijn
`gemist`-teller terwijl er geen punt geboekt is. De statuswijziging naar `missed`
klópt — de week ís gemist — alleen het punt vervalt. Wil je die teller kloppend
maken, dan is dat een wijziging aan de gedeployde Edge Function.

## Wat er niet verandert

- De week gaat nog steeds naar `missed`. Dat is een feit over de week en geen
  straf.
- De reeks breekt nog steeds bij `missed`. Voor een gebruiker zonder buddy is dat
  vandaag zonder gevolg, want zijn reeks staat toch op nul — `herbereken_reeks()`
  telt alleen `approved`. **Dat is de tweede helft van bevinding 1 en die staat
  nog open.**
- De weekpas blijft werken zoals hij werkte: hij beschermt de reeks, niet het
  punt.

## Hoe het getoetst is

Zes gevallen op `kan_beoordeeld_worden()` en vijf op de trigger, allemaal in een
transactie die terugdraait, met de positieve controles ernaast:

| toets | uitkomst |
|---|---|
| geen groep gekoppeld | geen beoordelaar |
| wel groep, alleen ikzelf | geen beoordelaar |
| tweede lid inactief | geen beoordelaar |
| **actief tweede lid** | **wél een beoordelaar** |
| minpunt mét beoordelaar | **blijft staan** |
| minpunt zónder beoordelaar | vervalt |
| pluspunt zónder beoordelaar | **blijft staan** |
| `review_given` zonder `goal_id` | **blijft staan** |
| `cycle_missed` zonder `goal_id` | blijft staan (niet te toetsen, dus ongewijzigd) |

De vier vetgedrukte zijn de positieve controles. Zonder die bewijst "de rij is
weg" niets — een trigger die álles weggooit zou er net zo groen uitzien.

## Wat hierna nog open staat

1. **De reeks van een gebruiker zonder buddy staat nog steeds stil.** Dit besluit
   haalt de straf weg, niet de stilstand. Of dat erg is hangt ervan af of solo
   werken een volwaardige modus moet zijn of een opstap naar een groep.
2. **`milestone_done` en `goal_done` worden nog steeds nergens geschreven** —
   bevinding 2 uit het onderzoek. Punten voor een mijlpaal of een afgerond doel
   bestaan als toegestane reden en zijn nooit ingevuld.
3. **De `+1` voor de beoordelaar geldt ook bij `more_info`.** Verdedigbaar, maar
   nergens als besluit opgeschreven.
