# Engineer Review — agenda voor november

Alles waar ik (Quinten) of de agents niet 100% zeker over zijn.
Aanvullen tijdens het bouwen, niet achteraf reconstrueren.

| Datum | Bestand / module | Waar ik onzeker over ben | Risico |
|---|---|---|---|
| 2026-08-15 | `shared/time` | Twee klokken naast elkaar: persoonlijke cyclus én groepsperiode. Dit is de duurste keuze in het project. Als de scheiding niet scherp blijft, sijpelt de ene klok de andere in en wordt elke week-afhankelijke query verdacht. | Hoog |
| 2026-08-15 | `docs/decisions/001-datamodel.md` | `weekly_goals.status` is een cache van `completions` + `completion_approvals`. Bewuste denormalisatie voor lijstschermen. Loopt hij uit de pas, dan klopt de UI niet meer met de waarheid. Er moet een herstelscript zijn en een test die de cache tegen de gebeurtenissen aan houdt. | Middel |
| 2026-08-15 | `completion_approvals` | Zelfgoedkeuring wordt geblokkeerd via een `CHECK` op een **gedenormaliseerde** `subject_id`, omdat een `CHECK` geen subquery mag doen. Een trigger vult en bewaakt die kolom. Als de trigger fout gaat, verdwijnt de belangrijkste autorisatiegrens in de app stilletjes. | Hoog |
| 2026-08-15 | RLS-hulpfuncties | `is_group_member()` en `shares_group_with_goal()` zijn `SECURITY DEFINER` om RLS-recursie op `group_members` te vermijden. `SECURITY DEFINER` omzeilt RLS — deze twee functies moeten regel voor regel nagelopen worden. | Hoog |
| 2026-08-15 | Risico-radar (EPIC 12) | De haalbaarheidsberekening is een heuristiek die ik zelf bedacht heb. Er is geen validatie dat de vier standen iets zinnigs zeggen. Bij een verkeerde "deadline onhaalbaar" verliezen we vertrouwen op precies het verkeerde moment. | Middel |
| 2026-08-15 | Twee ritmes (Dagzet + weekcyclus) | Productbeslissing, geen technische. Als gebruikers de Dagzet gaan zien als "de check-in die telt", ondermijnt dat de weekcyclus. Meten hoe dit uitpakt vóór er meer op de Dagzet gebouwd wordt. | Middel |
| 2026-08-15 | Groepsoverzicht (QS8-55) | Klassieke N+1. Eén query over `group_members → goal_group_links → goals → user_streaks` met een `LATERAL` op `weekly_goals`. Moet met een queryteller getest worden, niet op het oog. | Middel |
