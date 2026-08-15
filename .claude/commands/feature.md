---
description: Bouwt een complete feature van spec tot review-klare PR via de volledige agentketen
---

Bouw de feature beschreven in: $ARGUMENTS

Doorloop deze keten strikt in volgorde. **Stop en rapporteer aan Quinten zodra een
stap BLOKKEREND oplevert.** Ga niet zelf door met fixen zonder te melden.

**Stap 1 — Plan**
Delegeer aan `spec-planner`. Toon het plan. Wacht op akkoord vóór stap 2.
Bevat het plan een `## Beslissing nodig van Quinten`? Dan stop je daar sowieso.

**Stap 2 — Implementatie**
Delegeer het backend-deel aan `backend-engineer` en het frontend-deel aan
`frontend-engineer`. Backend eerst als het frontend ervan afhangt.

**Stap 3 — Tests**
Delegeer aan `test-engineer`. Alle tests groen vóór stap 4.

**Stap 4 — Review (alle drie verplicht)**
Delegeer aan `code-critic`, `security-reviewer` en `critical-user`.

**Stap 5 — Verwerking**
- Fix alles wat BLOKKEREND of KRITIEK is. Draai stap 3 en 4 opnieuw voor het gewijzigde deel.
- Alles onder "Aandacht" dat je niet fixt → toevoegen aan `docs/ENGINEER-REVIEW.md`
  met datum, bestand en één regel uitleg.

**Stap 6 — Oplevering**
Branch `feat/<issue-id>-<korte-naam>`, commit, en een PR-beschrijving:

```
## Wat
## Hoe (architectuurkeuzes in 3 regels)
## Testdekking
## Reviewuitkomst
- code-critic: <oordeel>
- security-reviewer: <oordeel>
- critical-user: <oordeel>
## Voor Quinten  ← max 3 punten waar jij naar moet kijken
## Naar ENGINEER-REVIEW.md geschreven
## Follow-up issues
```
