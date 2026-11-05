# Geen stille eerste keuze bij hulpvraag, straf, getuige en taak delen (QS8-651)

Datum: 05-11-2026. Bouwsessie baan A, zonder PR (PROMPT-SESSIE §12).

## Besluit

Bij twee of meer kandidaten vult geen scherm nog de eerste uit de lijst voor.
`geldigeKeuze(kandidaten, keuze)` in `src/modules/buddies/groepskeuze.ts` geeft
dan `''`, en de verzend- of verderknop blijft dicht tot de gebruiker gekozen
heeft. Bij precies één kandidaat verandert niets (de exact-één-regel van
QS8-56, `beslissendeGroep()`).

Vijf plekken, nagelezen op `origin/main` = `8c7d1707`:

| plek | was | nu |
|---|---|---|
| hulpvraag, `app/doel/[id].tsx` | `groepen[0]` als `gekozenGroep` | `geldigeKeuze`; versturen dicht zolang `''` |
| straf-begunstigde groep, idem | `useState(groepen[0]?.id)` | afgeleid via `geldigeKeuze` |
| straf-begunstigde persoon, idem | `mensen[0]` | idem |
| nieuwe getuige (stuurloze straf), idem | `mensen[0]` | idem |
| taak delen, `app/(tabs)/lijst.tsx` | `useState(groepen[0]?.id)` | geen voorselectie; knop was al dicht bij `''` |

## Aannames (geen van deze is gemeten in een draaiende app)

1. **Persoon-standaarden vallen binnen dit issue** (aanname van de orchestrator,
   overgenomen): een straf naar de verkeerde persoon is dezelfde klasse.
2. **Een teamgroep is nooit de standaard, ook niet als enige kandidaat.**
   Teamgroepen bestaan niet; het optionele `soort: 'team'` op `Kandidaat` legt
   de regel vast zonder schema-wijziging. Geen scherm geeft vandaag `soort`
   mee. Bouwt QS8-657 teams, dan moet het scherm `soort` meegeven en bij
   `moetKiezen()` de keuze óók bij één rij tonen. Niet getoetst in een scherm.
3. **`beginfase()` in `samen.ts` is niet aangeraakt.** Het kiest `gekoppeld[0]`
   voor een weergavefase (bestaande koppeling), niet voor een verzending. Dat
   houdt de overlap met de niet-gemergede QS8-233-branch op nul.
4. **Rij 31 en de uitstel-route** (`beslissendeGroep`) waren al goed en zijn niet
   gewijzigd.

## Grendel

`tests/beloftes/geen-stille-eerste-keuze.test.ts` toetst dat de twee schermen
geen `groepen[0]`/`mensen[0]` als waarde lezen (op `lijst.tsx` is één
toegestaan, achter `length === 1`) en dat `geldigeKeuze` er gebruikt wordt.
Met de hand rood gemaakt: `groepen[0]?.id` terug in `Straf` laat twee toetsen
omvallen.

## Wat dit niet is

Geen grens. Autorisatie blijft RLS (`commitments_insert`,
`goal_group_links_insert`, de berichtenpolicy). Geen migratie.
