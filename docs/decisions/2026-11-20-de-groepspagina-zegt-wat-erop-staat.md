# De groepspagina zegt wat erop staat — QS8-778

Besluit Quinten, 20-11-2026 (optie A van het visuele voorstel): de tab blijft **Groep**; de pagina krijgt de kop
"Jouw groep" en een rij met wat erop staat.

## Wat er gebouwd is

- De kop van de groepspagina (`app/groep/[id].tsx`) is `Jouw groep: {naam}`, en `Jouw groep` zolang de groep laadt.
- Onder de zichtbaarheidsregel staat een rij `Op deze pagina: De Ketting, Wie er meedoen, ..., Het gesprek, Uitnodigen`.
  De lijst komt uit `groepInhoud()` (`src/schermen/groep/inhoud.ts`) en gebruikt de koppen van de onderdelen zelf.
- Het menu, de tabnaam en de route veranderen niet.

## Waarom zo

- **De rij noemt alleen wat er in deze groep staat.** Klassement en helden bestaan alleen in een open groep
  (A41, A54; `groep_klassement()` en `groep_helden()` geven in een beschermde groep nul rijen). Een rij die ze toch
  noemt belooft een onderdeel dat een lid nooit krijgt. Uitnodigen staat er alleen als de groep een deelbare
  uitnodiging heeft. Domeinregel 7: de rij zegt niets over iemands week.
- **Geen tweede bron.** De rij hergebruikt de catalogussleutels van de koppen eronder, zodat rij en kop niet uiteen
  kunnen lopen (`tests/beloftes/groepspagina-inhoud.test.ts`).
- **Geen nieuwe tab, geen hernoeming.** De alternatieven (Samen, Groepen met lijstscherm) raken het menu van
  iedereen of voegen een scherm toe en vragen een eigen besluit.

## Niet gemeten

- De rij en de kop zijn getoetst als bron en als helper; een gerenderde groepspagina is niet gemeten (het scherm laadt
  niet onder de testmocks, `tests/render/scherm.ts`).
- Of "Jouw groep" bij een groepsnaam van tachtig tekens netjes afbreekt is niet gemeten.
