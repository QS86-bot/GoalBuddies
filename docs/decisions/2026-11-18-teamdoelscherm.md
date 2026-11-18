# Het teamdoelscherm en de teambalk

**Datum:** 18-11-2026 · **Issue:** QS8-658 (epic QS8-650) · **Migratie:** geen
**Raakt:** besluit 7, 11, 16, 17, 20 en 21 in `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`; domeinregel 10; rij 43 tot en met 45 in `docs/decisions/002-domeinregel7-oppervlakken.md`
**Status:** gebouwd op `quintenstrijdonk/qs8-658-teamdoelscherm-en-teambalk`, bovenop QS8-657. Niet gemerged.

## Wat er staat

- **De ingang:** op het groepsscherm van een teamgroep staat een kaart *Teamdoelen*. Een gewone groep ziet niets.
- **`/groep/teamdoelen/[id]`:** de teamdoelen van een groep, gepagineerd op id. Elk lid kan er een aanmaken (besluit 20).
- **`/teamdoel/nieuw`:** titel, beschrijving en streefdatum. Het minimum is
  "vandaag" in de tijdzone van de groep, via `shared/time` (besluit 17), en de
  server toetst opnieuw.
- **`/teamdoel/[id]`:** titel, beschrijving, streefdatum, de teambalk als getal
  ("N mijlpalen behaald"), en je eigen aandeel. Heb je er een, dan staat er een
  link naar je doel; anders een knop *Neem een aandeel*.
- **De API** staat in `src/modules/organisaties/teamdoelen.ts`.

## De keuzes

| # | Keuze | Waarom |
|---|---|---|
| 1 | **De balk is een getal zonder noemer, percentage of voortgangsbalk** | Besluit 16 (een teller die alleen optelt) en domeinregel 10 (score en voortgang nooit in één balk; er staan geen punten naast) |
| 2 | **De balk is een merktype (`Teambalk`), dat alleen `laadTeamdoel()` kan maken** | "Geen optimistic update" wordt zo een eigenschap die `tsc` afdwingt, en geen afspraak. De UI kan geen balk samenstellen uit lokale state. Een toets met `@ts-expect-error` bewijst het; zonder die regel geeft `tsc` TS2741 |
| 3 | **Na een aandeel herlaadt het scherm alles**, zonder dat er iets wordt bijgeteld | Besluit 7: een balk die na een refresh terugzakt is precies het signaal dat verboden is |
| 4 | **Geen lijst van wie een aandeel heeft, en geen voortgang van een ander** | Besluit 11 en 21. `team_goal_shares` geeft via RLS alleen je eigen rij |
| 5 | **Geen afrondknop** | Afronden met goedkeuring is QS8-662 |
| 6 | **Aanmaken zit in dit issue** (de spec-planner adviseerde afsplitsen) | Zonder aanmaken is de teamdoelenlijst altijd leeg: een dood eind. Dezelfde afweging als Quinten maakte bij QS8-657 |
| 7 | **De API staat in de organisatiemodule** | Zo blijft er één typebrug en één cast, die in één keer weggaat na de hergeneratie van de types |
| 8 | **Geordend op id** | Stabiel en zonder migratie, maar zonder betekenis voor de lezer. Een index op `(group_id, created_at, id)` is de volgende stap zodra de volgorde ertoe doet |
| 9 | **Geen balk per rij in de lijst** | Dat zou een N+1 zijn (regel 12) |

## Gemeten

- **De belofte "de balk komt van de server":** twee opeenvolgende keren laden
  met een nagebootste teambalk van 5 en daarna 3 geeft 3. Geijkt: laat ik
  `laadTeamdoel()` een `Math.max` met een modulecache gebruiken, dan valt
  precies die toets om.
- **De paginering:** 45 teamdoelen geven drie pagina's (20, 20 en 5), met de
  cursor van de laatste rij, en de select bevat nooit `*` of `created_by`.
  Geijkt: laat ik de cursor weg, dan valt precies die toets om.
- Het merktype is geijkt met `tsc` (TS2741 zonder `@ts-expect-error`).
- Lichte UI-controle op `app/teamdoel/[id].tsx`: de enige lokale staat is
  `bezig` en `fout`. Er is geen setter op een getal, geen noemer, geen score en
  geen aandeel van een ander.

## Niet gemeten

- De schermen zijn niet visueel bekeken, niet op web en niet native.
- Het dagplafond van `goals` geeft bij `neem_aandeel` een `check_violation` in
  plaats van een reden; de gebruiker krijgt dan de algemene zin.

## Het aantal bestanden

Dit issue raakt meer dan 15 bestanden, door keuze 6. Dat is een afweging
volgens *Beslisbevoegdheid* en geen gate.
