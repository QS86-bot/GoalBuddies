# Een aandeel is niet weg te gooien, alleen los te koppelen (QS8-772, migratie 0329)

## Wat er mis was

De teambalk (`team_progress_events`, 0320) was onbeperkt op te blazen zonder echt werk: `neem_aandeel()`,
mijlpalen aanmaken en op `done` zetten (ze worden geteld), de koppeling van het aandeel aan de teamgroep
verwijderen (de eigenaar mag dat), `verwijder_doel()` binnen de bedenktijd (de mijlpalen gaan mee via de
cascade), en opnieuw `neem_aandeel()`. De getelde rijen blijven staan; `begrens_doelen` en
`begrens_mijlpalen` tellen alleen rijen die nog bestaan en zetten zich elke ronde terug. Dat omzeilde de
fix voor H1 uit de review van QS8-655.

## Besluit

Quinten, 21-11-2026, variant "niet weggooien": `verwijder_doel()` weigert een doel dat in
`team_goal_shares` staat (reden `is_aandeel`). Loskoppelen kan wel. Tekst voor de gebruiker, van Quinten:
"Een aandeel in een teamdoel kun je niet weggooien, alleen loskoppelen."

## Wat gebouwd is

* Migratie 0329: het lichaam van `verwijder_doel()` uit 0190 (laatste definitie) plus één blok, vóór de
  toets op `goal_group_links`. De lus ontkoppelt eerst, dus een toets op de koppeling had het aandeel
  erdoor gelaten; `team_goal_shares` blijft staan tot het teamdoel zelf weg is.
* `planMelding`-tegenhanger `doelVerwijderMelding()` kent `is_aandeel`; `doel.is_aandeel` in nl en en.
* Rij 45 in `002-domeinregel7-oppervlakken.md` bijgewerkt.
* `tests/rls/aandeel-niet-weggooien.test.ts`: de lus over het echte teampad, plus een gewoon doel dat nog
  wel weg kan. Geijkt met de oude functie: de eerste toets wordt rood.

## Afgewezen (de twee andere opties van het issue)

* De teller per aandeel uniek laten tellen: verandert wat de teambalk betekent (0320).
* Een dagteller op `neem_aandeel()`: remt de lus, sluit hem niet.

## Aannames, niet gemeten

* Een gebruiker die een aandeel niet wil, kan het loskoppelen; wat een losgekoppeld aandeel nog in de
  teambalk doet, is ongewijzigd (0320).
* Het scherm toont de reden alleen als de gebruiker een aandeel probeert weg te gooien; of er een knop is
  die dat aanbiedt, is niet nagegaan.
