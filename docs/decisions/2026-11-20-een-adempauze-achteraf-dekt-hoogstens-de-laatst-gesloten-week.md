# Een adempauze achteraf dekt hoogstens de laatst gesloten week (QS8-770, migratie 0328)

## Het besluit

Quinten, 20-11-2026, vorm A: een adempauze die je achteraf zet, dekt hoogstens de laatst gesloten
week. Weken die verder terug liggen blijven gemist. De rem leunt niet op de groep: de groep ziet
niets (0307). Tekst in het formulier: "Een adempauze achteraf kan alleen de afgelopen week dekken."

## Waarom

Sinds 0307 was er geen enkele rem op een pauze achteraf (B2 in
`2026-11-19-de-adempauze-is-van-jou-alleen.md`): een lid kon een gemiste week van maanden terug op
`excused` zetten, het minpunt laten terugboeken en de reeks laten doorlopen. Dat is domeinregel 10:
missen is niet gratis.

## Wat er gebouwd is

* `plan_adempauze()` weigert met `te_ver_terug` als `starts_cycle` vóór de laatst gesloten week ligt,
  dus vóór `lopende cyclusstart - 7`. De lopende cyclus komt uit `week_start_day` en de klok van de
  eigenaar (`eigenaarsdatum()`), de SQL-kant van `currentUserCycle` (domeinregel 1). Het lichaam is
  dat van 0216, de laatste definitie.
* De tekst staat in `adempauze.te_ver_terug` (nl, en) en onder de bestaande melding "deze weken zijn
  al voorbij" in het formulier; `planMelding()` kent de reden.
* ⚠️ Twee zinnen die "elke datum mag" beloofden zijn aangepast (`adempauze.uitleg`,
  `adempauze.vanaf_hint`); de formulering is van de bouwsessie, de regel van Quinten.

## Toetsen

* `tests/rls/adempauze-rem.test.ts`: beide kanten van de grens, met twee week-starts (maandag en
  donderdag), grens uit `userCycle()` van `shared/time`. Geijkt met de oude functie: beide gevallen rood.
* Acht bestaande toetsen in `tests/rls/epic8.test.ts` planden pauzes 4 tot 11 weken terug; ze gebruiken nu
  de laatst gesloten week (het gedrag dat ze toetsen, het terugdraaien van het minpunt, is gelijk).

## Aannames, niet gemeten

* Dat `week_start_day` in de database dezelfde nummering gebruikt als `Weekday` in `shared/time`
  (gemeten voor 1 en 4: ze vallen samen).
* Bestaande pauzes die verder terug liggen blijven staan; de rem kijkt alleen naar een nieuwe aanroep.
* Productie draait 0328 nog niet.
