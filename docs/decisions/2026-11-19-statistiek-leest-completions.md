# De statistiekpagina leest `completions` van jezelf — QS8-749

**Besluit (Claude, binnen de beslisbevoegdheid; afweging, geen gate):** `/statistiek`, bereikbaar
vanuit Profiel, toont vier periodetabs (30 dagen, 90 dagen, een jaar, alles), een kalender van weken
en de verdeling van je indientijdstippen over vier dagdelen. Geen migratie, geen nieuwe RPC, view of
policy, geen provider.

## Bron en query

| Wat | Bron |
|---|---|
| Weken | `completions.cycle_start_date`, op het raster van de huidige week-start (`userCycleOn`) |
| Tijdstip | `completions.submitted_at` (server `default now()`, niet in de insert-grant), uur via `lokaalUur()` in `shared/time` |

Eén query: drie kolommen, `.eq('user_id', <sessie>)`, `.gte('submitted_at', <begin eerste week>)`, nieuwste
eerst, pagina's van 500 via `shared/bladeren`, maximaal 10 pagina's. Index: `completions_vers_idx
(user_id, submitted_at desc)` (0203). Geen N+1: één query per tab.

## ⚠️ Wat het privé houdt is een filter, geen RLS

`completions_select` laat ook een groepsgenoot de rijen van een lid lezen (hij moet kunnen goedkeuren).
De pagina is dus alleen van jezelf doordat (a) `userId` uit de sessie komt, nooit uit een route, en (b)
de insert-policy afdwingt dat `user_id` de indiener is. `tests/rls/statistiek-eigen-voltooiingen.test.ts`
legt beide vast, en legt vast dat een groepsgenoot zónder filter de rijen wél ziet. Echte afscherming per
kolom vraagt een eigenaar-only RPC of view en dus een migratie. Doorgegeven als ER-rij.

## Aannames (omkeerbaar)

1. **"Inchecken" is het indienen van een voltooiing** (`submitted_at`). `day_checkins` is afgewezen als bron:
   geen `user_id`, alleen een index op `local_date`; "alles" zou per rij joinen. Een betere bron vraagt een index.
2. **Een week is actief bij elke voltooiing**, ook bij een afgewezen of vervangen. Een vervangen indiening
   (`superseded_by`) telt niet mee voor het tijdstip, zodat één handeling niet twee keer telt.
3. **Het dagdeel gaat in de tijdzone van het profiel**; vier vaste dagdelen: nacht 0-6, ochtend 6-12, middag 12-18, avond 18-24.
4. **"Alles" is begrensd op 5000 rijen** en meldt het als hij afkapt. De kalender tekent hooguit 260 weken.
5. **Wie zijn week-start wijzigt, ziet oude weken op het nieuwe raster.**
6. **Staat boven rust:** een week zonder voltooiing is een klein open rondje, een week met voltooiing een gevuld vlak,
   de huidige week heeft een dikke rand, en elke cel draagt een tekstlabel. Geen "gemist", geen rood, geen percentage,
   geen telling van weken zonder. De tijdstipbalken schalen naar het drukste dagdeel en dragen het aantal als tekst.
7. **De privacytekst belooft geen onzichtbaarheid** ("deze pagina laat alleen jouw eigen weken zien"): de
   onzichtbaarheidsgrendel in `src/shared/i18n/beloftes.test.ts` vroeg om een reden en die is er niet, want
   rij-niveau is het niet waar.

## Domeinregels

1 en 2 (`shared/time`, twee week-starts en een dagwisseling per periode), 7 (geen gemist, geen vergelijking),
9 (Dagzet is geen bron), 10 (geen punten of XP, geen balk met score). Geen nieuw groepsoppervlak, dus geen
nieuwe rij in `002-domeinregel7-oppervlakken.md`.

## Grendels

`tests/beloftes/de-statistiekpagina-blijft-van-jezelf.test.ts`, `src/schermen/statistiek/*.test.ts`,
`src/modules/completions/statistiek.test.ts`, `tests/rls/statistiek-eigen-voltooiingen.test.ts` (databasebaan van CI).
Elke grendel met de hand gebroken: groepsimport, "gemist" in de catalogus, `user_id`-filter weg, kalender op ruwe datum,
vervangen indiening tellen mee: allemaal rood.
