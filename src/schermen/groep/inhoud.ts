import type { Sleutel } from '@/shared/i18n';

/**
 * Wat er op de groepspagina staat, als rij onder de kop — QS8-778 (besluit Quinten 20-11-2026, optie A).
 *
 * ⚠️ **De rij noemt alleen wat er in déze groep ook echt staat.** De helden bestaan alleen in een open groep (besluit
 *    A41); het klassement hangt sinds A57 (QS8-666) aan `groups.klassement_aan` en niet meer aan de zichtbaarheid, dus
 *    een beschermde groep kan het hebben en een open groep ook niet. Een rij die een onderdeel noemt dat er niet is,
 *    belooft iets en laat een lid zich afvragen waarom hij het niet ziet. Uitnodigen staat er alleen als de groep een deelbare uitnodiging heeft.
 *
 * ⚠️ **"Onder meer" en niet "alle".** De pagina heeft ook doel delen, meer-tijd-verzoeken, dempen en verlaten; de rij
 *    noemt de onderdelen die een lid zoekt, niet elke kaart. Wie er een bij zet, werkt deze lijst bij.
 *
 * ⚠️ Teksten komen uit de catalogus en zijn dezelfde sleutels als de koppen van de onderdelen zelf, zodat de rij en de
 *    kop eronder niet uiteen kunnen lopen. `tests/beloftes/groepspagina-inhoud.test.ts` legt dat naast de pagina.
 */
export function groepInhoud(stand: {
  /** Staat het klassement op de pagina? Alleen als `groep_klassement()` rijen gaf (A57): zie `klassementPlek()`. */
  readonly klassement: boolean;
  /** Een open groep van vrienden. Een teamgroep is nooit "open" in deze zin: er is daar nooit een heldenlijst (besluit 22). */
  readonly helden: boolean;
  readonly kanUitnodigen: boolean;
}): readonly Sleutel[] {
  return [
    'ketting.kop',
    // Zelfde sleutel als de knop zelf, zodat een lid op het woord kan zoeken dat hij ziet. De knop staat in de
    // Groepskaart bovenaan, vóór de ledenlijst.
    ...(stand.kanUitnodigen ? (['groepskaart.uitnodigen'] as const) : []),
    'groepscherm.wie_meedoen',
    ...(stand.klassement ? (['klassement.kop'] as const) : []),
    ...(stand.helden ? (['groepshelden.kop'] as const) : []),
    'groepdetail.gesprek',
  ];
}
