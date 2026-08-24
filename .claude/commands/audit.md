---
description: Wekelijkse gezondheidscheck van de codebase — draai dit elke vrijdag
---

Voer een wekelijkse audit uit. Schrijf zelf geen code; lever een rapport.

1. **Nieuwe code deze week** — bekijk de commits sinds vorige week.
   Delegeer aan `code-critic` en `security-reviewer` voor een overzichtsreview
   van wat er nieuw bij is gekomen.

   ⚠️ Kijk daarbij apart naar **verhuizingen**: code die deze week naar een ander
   bestand ging. Tests verhuizen mee en blijven groen, want ze toetsen wat er in
   het bestand staat en niet wat het bestand beloofde. Twee van de drie lekken
   van de week van 24-08 kwamen zo. Zie `CLAUDE.md`, regel 18 uitgeschreven.

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

9. **Emoji** — draai `npm run emoji:controle`. De app gebruikt zelf geen emoji
   in tekst die de gebruiker leest (CLAUDE.md, QS8-111). Commentaar en
   testbestanden tellen niet mee; die gebruiken ze juist met opzet.

10. **Laag-bevindingen** — draai `npm run review:controle`. Elke open
    Laag-rij in `ENGINEER-REVIEW.md` hoort te zeggen wanneer hij zwaarder wordt
    (QS8-123).

    ⚠️ En lees die voorwaarden deze week één keer door tegen wat er gebouwd is.
    Dát is de eigenlijke controle; het script bewaakt alleen dat ze er staan.
    Een rij waarvan de aanname inmiddels vervallen is, is geen Laag meer en
    hoort deze week op tafel.

11. **De migratiemap** — draai `npm run migraties:controle`. Die toetst dat de
    nummering aaneengesloten is, dat er geen twee migraties hetzelfde nummer
    dragen, en dat elke migratie een rollback-pad in zijn kop heeft (onwrikbare
    regel 20).

    ⚠️ Hij is één dag rood geweest en dat was de bedoeling: `0057` t/m `0061`
    stonden op een branch die niet geland was. PR #9 heeft dat op 24-08 gedicht
    en hij meldt nu 74 migraties, aaneengesloten. Wordt hij weer rood, dan
    ontbreekt er echt iets — zet hem niet uit.

    ⚠️ Wat hij niet ziet: of de repo gelijkloopt met `schema_migrations` op het
    échte project. Dat vraagt een service-role-key en die hoort niet in een
    controle die overal draait. Dat is de tweede helft van QS8-122.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
