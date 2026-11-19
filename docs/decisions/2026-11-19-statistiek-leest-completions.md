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

## ⚠️ RLS is de grens; het filter kiest de eigen rijen

`completions_select` laat ook een groepsgenoot de rijen van een lid lezen (hij moet kunnen goedkeuren),
met het statusfilter van `weekly_goals_select` erbij. Dat was al zo en deze pagina verandert het niet: de
drie kolommen die ze leest (`cycle_start_date`, `submitted_at`, `superseded_by`) kon een groepsgenoot al
ophalen. Het `user_id`-filter in de client bepaalt dus wat de pagina vraagt en is **geen beveiliging**; wie het
weghaalt krijgt niets wat RLS hem niet al gaf. Wat de eigen rijen zuiver houdt is dat de insert-policy
afdwingt dat `user_id` de indiener is, en dat `userId` uit de sessie komt. `tests/rls/statistiek-eigen-voltooiingen.test.ts`
legt dat vast. Een pagina die per kolom afgeschermd moet zijn, vraagt een eigenaar-only RPC of view en dus een
migratie; daar is nu geen reden voor (de rijen zijn al leesbaar voor de groep). Geen open risico op deze pagina; wel een observatie voor de engineer-review, doorgegeven als regel `ER-rij:` in het PR-verslag (niet in `docs/ENGINEER-REVIEW.md`, dat is hier niet van deze baan): een groepsgenoot kan via de API al je indientijdstippen lezen, en deze pagina maakt dat patroon zichtbaar voor jezelf.

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
Elke grendel met de hand gebroken (unit en belofte): groepsimport, "gemist" in de catalogus, `user_id`-filter weg, kalender op ruwe datum, vervangen indiening telt mee: allemaal rood. De RLS-test is ongemeten in de cloudsessie; CI is de meting.
