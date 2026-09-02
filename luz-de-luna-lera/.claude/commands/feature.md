---
description: Bouwt een complete feature van spec tot review-klare PR via de volledige agentketen
---

Bouw de feature beschreven in: $ARGUMENTS

Doorloop deze keten strikt in volgorde. **Stop en rapporteer aan Quinten zodra een
stap BLOKKEREND oplevert of een `## Beslissing nodig` bevat.** Ga niet zelf door
met fixen zonder te melden.

**Stap 1 — Plan**
Delegeer aan `spec-planner`. Toon het plan. Bevat het een
`## Beslissing nodig van Quinten of Evianne`? Dan stop je daar: dat is grens 1 uit
`CLAUDE.md` (wat een klant beloofd of in rekening gebracht wordt, wat geld kost,
een eerste mail naar echte mensen).

**Stap 2 — Implementatie**
Delegeer per laag: `backend-engineer` (Supabase), `automation-engineer` (n8n),
`frontend-engineer` (Bolt-prompt en export). Datamodel eerst als de rest ervan
afhangt. Elke laag levert zijn proefpad op: hoe draai je dit veilig zonder een
echt mens te raken.

**Stap 3 — Tests**
Delegeer aan `test-engineer`. Alle tests groen én de belofte één keer met de hand
gebroken vóór stap 4.

**Stap 4 — Review, naar risico**
- Raakt de wijziging auth, RLS, betalingen, boekingen, webhooks, een AI-prompt of
  gebruikersdata? Dan **direct** `security-reviewer` én `privacy-reviewer`.
- `code-critic` en `critical-user` draaien één keer per milestone, samen in één
  opdracht — tenzij dit de laatste feature van een milestone is; dan nu.
- Verifieer elke bevinding zelf voordat je hem verwerkt. Ze hebben het ook mis.

**Stap 5 — Verwerking**
- Fix alles wat BLOKKEREND of KRITIEK is. Draai stap 3 en 4 opnieuw voor het gewijzigde deel.
- Alles onder "Aandacht" dat je niet fixt → `docs/ENGINEER-REVIEW.md` met datum,
  bestand, risico en één regel uitleg; bij Laag met `**Wordt zwaarder als:** …`.

**Stap 6 — Poort en oplevering**
`npm run poort` moet groen zijn én niets "ongemeten" laten. Branch met de naam
die Linear voorstelt (`gitBranchName` op het issue), commit in het Nederlands
(eerste regel wat, daarna waarom), en een PR-beschrijving:

```
## Wat
## Hoe (architectuurkeuzes in 3 regels: wat in Supabase, wat in n8n, wat in Bolt)
## Testdekking
## Proefpad (hoe je dit draait zonder een echt mens te raken)
## Reviewuitkomst
- security-reviewer: <oordeel of n.v.t.>
- privacy-reviewer: <oordeel of n.v.t.>
- code-critic / critical-user: <oordeel of "volgt bij milestone">
## Voor Quinten  ← max 3 punten
## Naar ENGINEER-REVIEW.md geschreven
## Follow-up issues
```
