# De vragenlijst heeft een vaste ingang op Profiel — QS8-817

Datum: 23-11-2026. Bouwt voort op QS8-805, zie
`docs/decisions/2026-11-23-een-instap-gaat-voor-de-vragenlijst-komt-later.md`.

## Wat er misging

De vragenlijst belooft *"je kunt het later invullen"*. Na QS8-805 was de enige weg erheen, naast het afronden
van het profiel, de kaart "Zodat de app je kent" op Vandaag. Wie daar op "Niet nu" tikte, zag die kaart op dat
apparaat nooit meer terug, en wie één vraag beantwoordde ook niet. Dan was er geen knop meer naar
`/onboarding/vragenlijst`.

## Besluit van Quinten (23-11-2026, 17:06 UTC, meerkeuze via de hoofdorchestrator)

Twee varianten zijn als afdruk op 390 en 1280 voorgelegd: https://claude.ai/artifact/AJ7mEd2P1nw9pRahHQ5Qzz

1. **Plek: variant B.** Een kaart op Profiel, direct onder de kaart Instellingen. Variant A was een kaart
   onderaan Instellingen › "Taal en tijd".
2. **Na afloop: (ii).** Wie via deze kaart komt, gaat na "Bewaren en verder" terug naar Profiel, zonder de
   verwijzing naar de belofte van QS8-762. Na de onboarding en via de kaart op Vandaag blijft het eindpunt
   `/doelen?belofte=na-vragenlijst`.

## Wat er gebouwd is

- `src/schermen/vragenlijst/VragenlijstIngang.tsx`: de kaart. Hij staat er voor iedereen en altijd, ook na
  "Niet nu" en ook na invullen. Zonder een enkel antwoord staat erop "Vragen beantwoorden", met minstens één
  antwoord "Antwoorden aanpassen". De grens is `heeftVragenlijstAntwoord()`, dezelfde als die van de kaart op
  Vandaag, zodat de twee nooit iets anders zeggen.
- `src/schermen/vragenlijst/herkomst.ts`: de knop opent `/onboarding/vragenlijst?van=profiel`. De vragenlijst
  leest die parameter op twee plekken: het eindpunt in `useVragenlijst()` en de terugknop in
  `app/onboarding/vragenlijst.tsx`.
- Geen migratie. De vragenlijst laadde bestaande antwoorden al in (`useAntwoorden(profiel)`) en begint bij een
  volledig ingevuld profiel op de samenvatting (`beginStap()`).

## Keuzes die niet vanzelf spreken

- **Een parameter en geen `router.back()`.** "Terug naar waar je vandaan kwam" is hier een vaste plek,
  Profiel. `router.back()` heeft op web geen geschiedenis na een herlaad of een diepe link, en dan is de
  bestemming onbepaald. Dezelfde reden staat bij `Terug` in `src/shared/ui/Screen.tsx` (QS8-211).
- **Een allowlist van één waarde.** Alleen precies `van=profiel` telt. Een andere waarde, een lijst of geen
  parameter geeft het oude eindpunt. Zo kan een link van buiten de vragenlijst alleen naar een van de twee vaste
  plekken sturen.
- **Het eindpunt na de onboarding verandert niet.** De regel `router.replace(doelenNaVragenlijst())` staat er
  nog woordelijk; `tests/beloftes/belofteverwijzing-schrijft-niets.test.ts` en
  `tests/beloftes/onboarding-eindigt-ergens.test.ts` lezen hem zo.
- **De terugknop valt alleen terug op Profiel als er geen geschiedenis is.** `useTerug()` doet eerst
  `router.back()`; de `naar` geldt alleen bij een lege geschiedenis. Dat is bestaand gedrag en hier niet
  veranderd.

## Hoe het getoetst is

| Test | Wat hij bewaakt |
| --- | --- |
| `tests/render/vragenlijst-ingang.test.ts` | De echte kaart en de echte route `app/onboarding/vragenlijst.tsx`: de knop opent de vragenlijst (0 antwoorden, 1 antwoord, alles ingevuld), en wat de knop meegeeft stuurt na "Bewaren en verder" naar `/profiel`. Zonder parameter blijft het Doelen met de verwijzing. |
| `tests/beloftes/vragenlijst-vaste-ingang.test.ts` | De kaart staat in `app/(tabs)/profiel.tsx` direct na `<InstellingenIngang />`, zonder voorwaarde. Een brontoets, omdat dat scherm onder de rendermocks niet laadt. |
| `src/schermen/vragenlijst/herkomst.test.ts` | De allowlist en dat de ingang naar een bestaande route wijst. |

**IJking**, met de hand, één mutatie per belofte. Elke mutatie maakte de bedoelde test rood:

| Mutatie | Rood |
| --- | --- |
| De `komtVanProfiel`-tak in `useVragenlijst()` uitgeschakeld | terug naar Profiel |
| De knop zonder `van=profiel` | terug naar Profiel |
| De kaart achter een voorwaarde op Profiel | direct onder Instellingen, zonder voorwaarde |
| De kaart van Profiel gehaald | direct onder Instellingen, zonder voorwaarde |
| Altijd "Vragen beantwoorden" | beide "Antwoorden aanpassen"-gevallen, en terug naar Profiel |
| `komtVanProfiel()` accepteert elke waarde | telt alleen precies "profiel" |

## Wat niet gemeten is

- Een web-export tegen een lokale database: PostgREST kon in deze sessie niet worden opgehaald. De afdrukken
  komen van de web-export met een nagebootste backend in Playwright.
- Native en productie.
