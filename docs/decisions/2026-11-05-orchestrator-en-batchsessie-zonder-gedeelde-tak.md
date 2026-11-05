# Orchestrator en batchsessie zonder gedeelde tak — 05-11-2026

**Beslist door:** de sessie die dit opzette, in opdracht van Quinten ("zet voor GoalBuddies een zelfde manier van werken op als in het Status Tracker project, met een Orchestrator en een Batchsessie; zondag 08-11-2026 is er een review"). Binnen de beslisbevoegdheid van `CLAUDE.md`: geen commitment device, geen kosten, niets onomkeerbaars.

## Wat er besloten is

De rollen uit de Status Tracker (orchestrator, bouwsessies die zonder PR afleveren, batchsessie, Quinten die merget) komen hier. De **mechaniek** wijkt op twee punten af: er is geen gedeelde tak `integratie` en geen nachtworkflow. De uitwerking staat in `docs/PROMPT-SESSIE.md` §12.

## Waarom niet één-op-één overgenomen

1. **Een gedeelde tak is hier een conflictpunt dat dit project al kent.** `docs/PROMPT-SESSIE.md` §4 en §5 beschrijven hoe meerdere schrijvers op dezelfde plek botsen, ook waar git geen conflict ziet.
2. **Of een cloudsessie naar een derde tak mag pushen is niet gemeten.** Wat wel gemeten is: een cloudsessie krijgt 403 op het verwijderen van een branch (QS8-240). Een model dat daarop leunt is een aanname.
3. **De nachtworkflow zou dubbel werk doen.** Gelezen op 05-11-2026: `.github/workflows/ci.yml` draait op `push` voor elke branch en op `pull_request` naar `main`. De batch-PR krijgt dus al de volledige set, inclusief de database-jobs.
4. **De aanleiding in de Status Tracker (opgebrande GitHub-minuten) is hier niet gemeten.** Zie het slot van deze tekst.

## Wat dit niet doet

* Het raakt `CLAUDE.md` niet. Een regel die bepaalt wat er mag landen verandert hier niet: werk landt via een PR met een merge-commit.
* Het raakt `.github/` niet.
* Het versoepelt onwrikbare regel 19 niet. De batchsessie draait één ronde `code-critic` op de PR als geheel; `security-reviewer` draait per bouwsessie direct bij auth, RLS, punten, goedkeuring, commitments en groepszichtbare oppervlakken, en opnieuw op de batch als die ze combineert.

## Aannames, als aanname

* Dat de bouwsessie op haar eigen tak mag pushen. Dat is de tak die het platform haar geeft.
* Dat `npm run claim` een afgeleverde, nog niet gemerged tak als bezet leest en na de merge via de claim-commit als gelaand (QS8-611). Nog niet waargenomen in een echte ronde.
* Dat Actions-minuten hier niet schaars zijn. Zijn ze dat wel, dan is de eerste maatregel het `push`-filter in `ci.yml` beperken. Dat is een besluit van Quinten en een wijziging in `.github/`.

## Terugdraaien

Verwijder §12 uit `docs/PROMPT-SESSIE.md`, de twee commando's `.claude/commands/orkestrator.md` en `.claude/commands/batch.md`, dit bestand en de verwijzing in `.claude/commands/verder.md`. Er is geen migratie, geen workflow en geen data bij betrokken.
