---
description: Wekelijkse gezondheidscheck van de codebase — draai dit elke vrijdag
---

Voer een wekelijkse audit uit. Schrijf zelf geen code; lever een rapport.

1. **Nieuwe code deze week** — bekijk de commits sinds vorige week.
   Delegeer aan `code-critic` en `security-reviewer` voor een overzichtsreview
   van wat er nieuw bij is gekomen.

2. **RLS-dekking** — controleer of elke tabel in `supabase/migrations/` een
   RLS-policy heeft voor SELECT, INSERT, UPDATE én DELETE. Lijst ontbrekende op.
   Dit is de belangrijkste check van de week.

3. **Schaalrisico's** — zoek naar ongepagineerde queries, ontbrekende indexen op
   foreign keys, en N+1-patronen die er sinds vorige week bij zijn gekomen.

4. **Kostenrisico's** — zijn er nieuwe externe/AI-calls zonder cache, quotum of
   rate limiting?

5. **Tier-afhankelijkheden** — verzamel alle `TODO(paid-tier)` markeringen.

6. **Testgezondheid** — draai de suite. Welke tests zijn geskipt of uitgezet?

7. **ENGINEER-REVIEW.md** — is dit bestand bijgewerkt met wat er deze week
   is blijven liggen? Zo niet, vul het aan.

8. **Overdrachtsdocumenten** — draai `npm run docs:controle`. Die toetst of
   `CLAUDE.md`, `docs/WERKVOORRAAD.md` en `docs/VOLGENDE-SESSIE.md` elkaar niet
   tegenspreken: getallen die uiteenlopen, en feiten die in twee documenten
   tegelijk staan. Rood betekent dat een volgende sessie verouderde informatie
   krijgt. Zie QS8-125 en "Wie bezit welk feit" in `CLAUDE.md`.

   ⚠️ Het script vangt alleen wat een patroon heeft. Controleer met de hand of
   issues die in Linear op Done staan, in de documenten ook als af beschreven
   worden — dat is vijf keer misgegaan en geen script ziet het.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
