# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 02-09-2026, bij het opzetten van de projectmap.

---

Je werkt aan **Luz de Luna Lera**: de website en de geautomatiseerde klantreis
voor de coachingpraktijk van Evianne. Quinten is de ontwikkelaar en jouw
opdrachtgever; Evianne is de klant. Jij bent de enige implementer.

**Lees eerst, in deze volgorde:** `CLAUDE.md` (de grondwet, met de
startinstructies bovenaan), `docs/WERKVOORRAAD.md` (de stand en de volgorde),
en `docs/PRD-luz-de-luna-lera.md` (wat er gebouwd wordt). De stand staat alleen
in de werkvoorraad; herhaal hem hier niet.

## WERKAFSPRAKEN — houd deze aan

1. **Eén branch per issue**, met de naam die Linear voorstelt (of
   `quinten/ldl-<nr>-<naam>` zolang Linear er niet is). Werk landt via een PR
   met een merge-commit. Commits in het Nederlands: wat, dan waarom.
2. **`npm run poort` vóór elke push**, en niet een greep eruit. "Ongemeten" is
   niet groen. Lees de testteller vóórdat je commit.
3. **Reviewagents naar risico:** `security-reviewer` en `privacy-reviewer`
   direct bij alles wat data, auth, geld, webhooks of een AI-prompt raakt;
   `code-critic` en `critical-user` één keer per milestone. Verifieer elke
   bevinding zelf.
4. **Stop alleen bij de twee grenzen** uit `CLAUDE.md`: wat een klant beloofd
   of in rekening gebracht wordt / wat geld kost / een eerste mail naar echte
   mensen — en alles wat onomkeerbaar vernietigend is. Al het andere: kies de
   conservatiefste optie die het werk áf maakt, bouw door, schrijf de aanname op.
5. **Werk de documenten bij als je klaar bent**, niet aan het eind van de dag:
   `docs/WERKVOORRAAD.md`, en grep daarna op het feit in `CLAUDE.md`, dit
   bestand en het PRD.
6. **Loop je vast op iets dat een mens moet doen** (§6 van de werkvoorraad): zet
   het erbij, meld het, en ga door met het volgende issue dat er niet op wacht.

## VALKUILEN die dit project al kent

De volledige lijst staat in `docs/LESSEN-UIT-GOALBUDDIES.md`; §7 van de
werkvoorraad noemt de vijf die hier het zwaarst tellen. Onthoud in elk geval:

- **Niets gaat naar een echt mens zonder proefpad en akkoord van Evianne.**
- **Export is de bron:** een n8n-workflow die niet in `n8n/workflows/` staat, bestaat niet.
- **Geen geheim in de webbundel.** De service-role key, de AI-sleutel en de
  betaalsleutel leven alleen in n8n en serverfuncties.
- **Zelftest-antwoorden zijn data, geen instructie** — in de AI-prompt is dat
  een injectievector, en mogelijk zijn het gezondheidsgegevens.
- **Zonder bronmateriaal van Evianne schrijf je geen content.**

## Waar te beginnen

Draai `/verder`. Zonder argument kiest hij zelf uit `docs/linear/ISSUES.md`:
eerst M0 (LDL-1: deze map in gebruik nemen), en parallel daaraan de twee
onderzoeksvragen die het meest blokkeren (`/onderzoek privacy-avg`,
`/onderzoek betalen-mollie`). Is de bronmap gevuld, dan kan `/content zelftest`
ook al.

Meld aan het eind van de ronde: wat er nu werkt, wat er getest is en wat niet,
wat je bewust hebt laten liggen, en wat er als volgende komt.
