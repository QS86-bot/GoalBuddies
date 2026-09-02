# 001 — Beslisbevoegdheid: één grens in plaats van een lijst

| | |
|---|---|
| **Status** | vastgesteld 02-09-2026 (overgenomen uit GoalBuddies, besluit van Quinten van 22-08-2026, vertaald naar dit project) |
| **Raakt** | `CLAUDE.md` — sectie Beslisbevoegdheid |

> Claude beslist zelf en werkt af. Er zijn precies twee redenen om te stoppen en
> te vragen. Dit document zegt wat die twee hier betekenen, want zonder vertaling
> is grens 1 óf leeg óf alles.

## Het besluit

1. **Stop als de keuze bepaalt wat er tegen een mens beloofd of in rekening
   gebracht wordt.**
2. **Stop als de handeling onomkeerbaar vernietigend is.**

In elk ander geval: kies de conservatiefste optie die het werk áf maakt, bouw
door, en zet de aanname zichtbaar in het issue én in een beslisdocument.

## Waarom

In GoalBuddies verving deze grens een lijst van zeven dingen die niet zonder
toestemming mochten. Die lijst hield vaker op dan hij beschermde: vier van de
zeven kwamen wekelijks langs en het antwoord was vrijwel altijd ja, tegen een
halve dag wachten per keer. Hier is dezelfde reden sterker, want er zijn nu twee
mensen die niet meekijken: Quinten bouwt, Evianne is opdrachtgever.

## De vertaling — wat grens 1 hier is

GoalBuddies had geen klanten; dit project heeft er vanaf de eerste zelftest
wél, en een opdrachtgever die de rekening draagt. Grens 1 is daarom niet leeg
maar precies te benoemen:

- **Wat een klant van Evianne te horen krijgt als belofte of prijs.** De prijs
  van Roots, betalen in termijnen, wat het traject inhoudt, de duur, wat er
  gebeurt bij annuleren, wat de privacyverklaring belooft, wat een mail
  toezegt. Dit staat in het PRD met `[EVIANNE]`-markeringen; zolang zo'n
  markering staat, is het geen belofte.
- **Wat Quinten of Evianne geld kost of extern vastlegt.** Een Mollie-account,
  een n8n-abonnement, een mailtool, een betaalde Supabase-tier, een domein,
  een AI-budget boven het dagquotum, een designtool.
- **Een eerste uitgaande stroom naar echte mensen** die niet terug te nemen is:
  de eerste spiegel-mail naar een echte bezoeker, een nieuwsbrief naar de lijst,
  een automatisch gepubliceerde Instagram-post. Elke automatische verzending
  heeft een proefpad naar een eigen adres; het moment dat hij "aan" gaat is een
  besluit van Evianne.

## Grens 2 vertaalt zichzelf

`drop`, `truncate`, een `delete` zonder filter, een migratie zonder rollback-pad
op een gevulde tabel, bulkverwijdering van contacten, `push --force` over
andermans werk, een sleutel intrekken die iemand buitensluit, de
Fresha-configuratie of de Google Agenda van Evianne aanpassen zonder overleg.

Uitdrukkelijk níét onomkeerbaar: kolommen toevoegen aan een lege tabel, een
workflow exporteren, een testmail naar jezelf.

## Wat gewoon verboden blijft — dat is iets anders dan vragen

- Geen tijd- of datumberekening buiten de gedeelde helper.
- Geen geheim in de webbundel of in een geëxporteerde workflow.
- Geen mail, post of melding naar een echt mens zonder gelogde toestemming.
- Geen persoonsgegevens in logs, foutmeldingen of URL's.
- Geen `REPLICA IDENTITY FULL` op een tabel in een realtime-publicatie.

## Van gate naar afweging

Zelf beslissen, maar verantwoorden in een beslisdocument: een dependency
toevoegen, het datamodel van een bestaande tabel wijzigen, auth-/RLS-logica
aanpassen, een migratie op het echte project draaien, een nieuwe n8n-workflow
die mail verstuurt (met proefpad), meer dan 15 bestanden aanraken.

## Het risico dat we accepteren

Er is geen tweede paar ogen vóór een keuze, alleen erna. De rem is de testsuite,
de reviewagents en dit soort documenten.

## Herbevestigen vóór

De eerste échte klant die betaalt. Dan is er een contract en verandert de afweging.
