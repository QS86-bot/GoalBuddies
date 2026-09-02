---
description: Werkt een onderzoeksvraag uit de vergadering uit tot een beslisdocument met opties, aanbeveling en beslispunt
---

Onderzoek: $ARGUMENTS

De open onderzoeksvragen staan in `docs/research/README.md`, elk met een slug en
een omschrijving van wat "klaar" is. Zonder argument pak je de eerste die nog
niet af is en die het meeste werk blokkeert (privacy en betalen blokkeren het meest).

## Werkwijze

1. Lees `docs/research/README.md`, `docs/VERGADERING-2026-09-02.md` en het PRD.
   Wat is er al besloten en wat is een open vraag?
2. Zoek de feiten op. Gebruik de gstack-skill `/browse` als die geïnstalleerd is,
   anders WebSearch en WebFetch. Noteer bronnen met datum; prijzen en voorwaarden
   veranderen.
3. Schrijf `docs/research/<slug>.md` in dit formaat:

```
# <Vraag>

**Status:** concept / wacht op besluit / besloten op <datum>
**Blokkeert:** <welke issues uit docs/linear/ISSUES.md>

## Wat de vergadering van 02-09 zei
## De vraag, scherp gesteld
## Opties
Per optie: wat het is, kosten (eenmalig en per maand), wat het betekent voor
privacy, voor betalen, voor de koppeling met n8n en Supabase, en wat je ermee
niet kunt.
## Aanbeveling
Eén optie, met de reden. En de conservatiefste optie die het werk áf maakt als
er geen besluit komt.
## Beslispunt voor Quinten / Evianne
Precies wat er besloten moet worden, in één zin per punt. Wat kost het, wie
tekent ervoor.
## Wat er daarna gebouwd kan worden
## Bronnen
```

4. Zet het beslispunt ook in `docs/WERKVOORRAAD.md` §6 (wat menselijke actie
   vereist) en verwijs vanuit `docs/research/README.md`.

## Harde regels

- Een aanbeveling zonder kosten is geen aanbeveling. Noem bedragen en de datum
  waarop je ze zag.
- Bij privacy: noem het artikel en de praktische consequentie, niet alleen "AVG".
- Bij betalen: noem wat er nodig is om een account te openen (KvK, bankrekening,
  wie de contractpartij is). Dat is grens 1: je adviseert, Evianne besluit.
- Verzin geen leveranciersvoorwaarden. Kun je iets niet vinden, zeg dat.
