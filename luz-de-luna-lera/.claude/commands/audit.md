---
description: Wekelijkse gezondheidscheck van de codebase en de funnel — draai dit elke vrijdag
---

Voer een wekelijkse audit uit. Schrijf zelf geen code; lever een rapport.

> ⚠️ De meeste controles draaien in CI bij elke push (`npm run poort`). Deze
> audit hoeft ze niet over te doen; ga er langs als een uitkomst je verbaast, en
> besteed de tijd aan wat CI **niet** ziet: wat er draait, wat er verstuurd is,
> en wat er van mensen terugkomt.

## Twee manieren om jezelf een vals alarm aan te praten (geleerd in GoalBuddies)

1. **Toets een weigering nooit op een lege tabel.** RLS weigert een UPDATE of
   DELETE niet — hij filtert de rijen weg. Zet er eerst een echte rij in, doe dan
   de poging, en tel de rijen daarna.
2. **Een grep is geen meting.** Lees de gedeployde functie
   (`pg_get_functiondef()`), de live workflow en de echte mail — niet het bestand
   in de repo. Die twee lopen uit elkaar in beide richtingen.

---

1. **Nieuwe code deze week** — bekijk de commits sinds vorige week. Delegeer aan
   `code-critic` en `security-reviewer` voor een overzichtsreview. Kijk apart naar
   **verhuizingen**: code die naar een ander bestand ging — tests verhuizen mee en
   blijven groen terwijl ze iets anders bewaken.

2. **RLS-dekking** — heeft elke tabel in `supabase/migrations/` een policy voor
   SELECT, INSERT, UPDATE én DELETE? Mag `anon` alleen wat de zelftest nodig heeft?
   Dit is de belangrijkste check van de week.

3. **Webhooks** — is elke inkomende webhook in `n8n/workflows/` nog
   geauthenticeerd? Is er een nieuwe bijgekomen zonder geheim?

4. **Draait wat er in de repo staat?** Vergelijk de exports in `n8n/workflows/`
   met de instantie, en de migratiemap met `schema_migrations` op het project.
   Een workflow die in n8n is aangepast en niet geëxporteerd, bestaat voor de repo
   niet.

5. **Kosten** — AI-calls deze week: aantal, kosten per lead, cache-hits. Nieuwe
   externe calls zonder cache, quotum of rate limiting?

6. **Tier-afhankelijkheden** — verzamel alle `TODO(paid-tier)`.

7. **Testgezondheid** — draai de suite. Welke tests zijn geskipt of uitgezet?
   Welke controles stonden "ongemeten"?

8. **Privacy in de praktijk** — zijn afmeldingen doorgewerkt in n8n én de
   database? Zijn bewaartermijnen uitgevoerd? Staat er PII in n8n-executielogs of
   foutmeldingen? Delegeer bij twijfel aan `privacy-reviewer`.

9. **De funnelcijfers** — zelftests gestart en afgerond, spiegel-mails
   afgeleverd (bounces!), funnelmails geopend waar dat legaal meetbaar is,
   kennismakingen en intakes geboekt, betalingen. Zet ze naast de doelen in het
   PRD. Dit is de enige stap die zegt of het product werkt.

10. **Overdrachtsdocumenten** — `npm run docs:controle` draait in CI; controleer
    met de hand of issues die op Done staan, in de documenten ook als af
    beschreven worden. Een script vangt alleen wat een patroon heeft.

11. **ENGINEER-REVIEW.md** — `npm run review:controle` bewaakt de vorm. Lees de
    `Wordt zwaarder als`-voorwaarden één keer door tegen wat er deze week gebouwd
    is. Een rij waarvan de aanname vervallen is, is geen Laag meer.

12. **Wat een mens heeft gezien** — is er iemand door de flow gelopen sinds de
    vorige audit? Een groene suite meet niet of de site te gebruiken is. Zo niet:
    doe het nu, op een telefoon, vanaf een Instagram-link.

Rapporteer in maximaal één A4. Bovenaan: de drie dingen die Quinten deze week
moet oplossen. Als er niets urgents is, zeg dat kort.
