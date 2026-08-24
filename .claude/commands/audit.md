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
    échte project. Dat is stap 13.

12. **Hardgecodeerde UI-tekst** — draai `npm run tekst:controle`. Die toetst
    criterium 1 van QS8-115: er staat nergens in `src/` of `app/` nog Nederlandse
    schermtekst hard in de code. Alles loopt via `t()` en de catalogus.

    ⚠️ Hij heeft de hele omzetting rood gestaan, met opzet — een controle die je
    aanzet terwijl hij rood staat, leert je om rood te negeren. Sinds 24-08 is
    hij groen en draait hij hier mee.

    ⚠️ **Hij is vier keer geijkt en de laatste keer pas nadat hij groen stond.**
    Die vierde ronde vond zeventien zinnen in mappen die al "af" heetten: ze
    stonden achter een openingstag op dezelfde regel, en dát patroon zag hij nog
    niet. Wordt er een nieuwe vorm zichtbaar, scherp hem dan aan in plaats van
    de treffer weg te schrijven. Een controle die nul meldt terwijl er tekst
    staat, geeft toestemming om te stoppen met kijken.

13. **Repo naast project** — draai `npm run register:controle`. Die legt
    `supabase/migrations/` naast `schema_migrations` op het echte project en
    wordt rood bij een migratie die maar aan één kant bestaat, bij twee namen op
    hetzelfde nummer, en bij een tijdstempel in plaats van een nummer.

    ⚠️ **Zonder credentials slaat hij zichzelf over en dat is geen probleem** —
    zelfde afspraak als de RLS-suite. Maar draai hem dan wél een keer met `.env`
    erbij vóór je de audit afsluit: dit is de enige controle die het gat ziet dat
    twee keer bij toeval gevonden is (`0036`/`0037` en `0057` t/m `0061` stonden
    op het project zonder bestand in de repo).

    ⚠️ Een tijdstempel betekent dat er een migratie is toegepast buiten de
    werkwijze uit `docs/DEPLOY.md` §2.2 om. De MCP-tool doet dat uit zichzelf;
    uitlijnen is één UPDATE en staat daar beschreven.

14. **Bouwt de map het schema nog op?** — `npm run schema:opbouwen`, en daarna
    `scripts/schema-vingerafdruk.sql` op beide databases. Niet elke week nodig,
    wél na een reeks migraties of vóór je iets doet dat een tweede omgeving
    vraagt. Zie `docs/decisions/004-migratieregister.md`.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
