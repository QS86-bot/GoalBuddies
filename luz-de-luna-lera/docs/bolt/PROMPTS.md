# Bolt-prompts — het logboek

> Elke prompt die naar Bolt gaat staat hier, genummerd, mét de export die eruit
> kwam (commit) en wat er daarna met de hand gerepareerd is. Zonder dit logboek
> is `web/` code waarvan niemand meer weet waarom hij zo is.
>
> ⚠️ Een Bolt-export is een eerste versie, geen oplevering. `frontend-engineer`
> beoordeelt hem tegen de acceptatiecriteria en repareert; `npm run poort`
> beslist.

## Het sjabloon

```
# Prompt <nummer> — <pagina of component>   (issue LDL-<nr>)

## Doel
Wat deze pagina in de klantreis doet, in twee zinnen. Voor wie.

## Context die Bolt moet kennen
- Stack: React + TypeScript, statische export (Hostinger). Geen eigen backend,
  geen serverless functions: alle data gaat via één POST naar een n8n-webhook
  (URL uit een env var) of via de publieke Supabase-client.
- Design: <verwijzing naar de lay-out zodra die er is; tot dan: neutraal,
  rustig, veel wit, één accentkleur, systeemfont>.
- Mobiel eerst; de bezoeker komt van Instagram.

## Exacte tekst
Letterlijk, uit docs/content/<...>. Bolt verzint geen copy.

## Gedrag
- Formuliervelden met validatie (client-side is UX; de server valideert opnieuw).
- Wat er gebeurt bij verzenden, bij succes, bij een fout, bij dubbel klikken.
- Laad-, fout- en lege staat, elk uitgeschreven.
- Antwoorden bewaren bij een refresh (localStorage), wissen na succes.

## Wat NIET mag
- Geen secrets, geen hardgecodeerde URL's (alles via import.meta.env / env var).
- Geen emoji in UI-tekst. Geen `any`. Geen `<div onClick>`.
- Geen tracking of externe scripts zonder dat het plan ze noemt.
- Geen tekst afkappen met .slice/.length op wat de bezoeker typt.

## Acceptatiecriteria
Genummerd, uit het implementatieplan.
```

## Logboek

| # | Pagina | Issue | Datum | Export (commit) | Handmatig gerepareerd |
|---|---|---|---|---|---|
| — | nog geen prompts | | | | |

## Eerste drie prompts (concept, in te vullen zodra content en datamodel er zijn)

### Prompt 1 — Landingspagina (LDL-14)
Doel: herkenning in de eerste zin en één knop: "Doe de zelftest". Tekst uit de
landingspagina die Evianne al voor 90% klaar heeft (`docs/content/bron/`).
Gedrag: één pagina, geen formulier, klik meet een event, knop naar `/zelftest`.

### Prompt 2 — Zelftest (LDL-14)
Doel: N stellingen op een schaal van 1–5, één per scherm op mobiel, voortgang
zichtbaar, terug kunnen, antwoorden bewaard bij refresh. Aan het eind: voornaam
(optioneel), e-mailadres, en drie aparte toestemmingen (uitslag per mail;
nieuwsbrief; persoonlijke mails op basis van je antwoorden) met de teksten uit
`docs/content/zelftest/`. Verzenden = één POST naar de n8n-webhook met een
client-gegenereerde zelftest-id (idempotentie). Bij succes naar `/bedankt?id=…`.

### Prompt 3 — Bedankpagina (LDL-14)
Doel: korte uitslag (op basis van de scores, lokaal berekend of uit de
webhook-respons), en de boodschap dat de uitgebreide spiegel per mail komt —
inclusief "kijk in je spam en sleep hem naar je inbox". Geen uitgebreide uitslag
op deze pagina (besluit 4, vergadering 02-09).
