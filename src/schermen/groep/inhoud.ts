import type { Sleutel } from '@/shared/i18n';

/**
 * Wat er op de groepspagina staat, als rij onder de kop — QS8-778 (besluit Quinten 20-11-2026, optie A).
 *
 * ⚠️ **De rij noemt alleen wat er in déze groep ook echt staat.** Het klassement en de helden bestaan alleen in een
 *    open groep (besluit A41, A54): in een beschermde groep geven de RPC's nul rijen en rendert de pagina niets. Een
 *    rij die ze toch noemt, belooft een onderdeel dat er niet is en laat een lid zich afvragen waarom hij het niet
 *    ziet. Uitnodigen staat er alleen als de groep een deelbare uitnodiging heeft.
 *
 * ⚠️ **"Onder meer" en niet "alle".** De pagina heeft ook doel delen, meer-tijd-verzoeken, dempen en verlaten; de rij
 *    noemt de onderdelen die een lid zoekt, niet elke kaart. Wie er een bij zet, werkt deze lijst bij.
 *
 * ⚠️ Teksten komen uit de catalogus en zijn dezelfde sleutels als de koppen van de onderdelen zelf, zodat de rij en de
 *    kop eronder niet uiteen kunnen lopen. `tests/beloftes/groepspagina-inhoud.test.ts` legt dat naast de pagina.
 */
export function groepInhoud(stand: {
  /** Een open groep van vrienden. Een teamgroep is nooit "open" in deze zin: er is daar nooit een klassement (besluit 22). */
  readonly open: boolean;
  readonly kanUitnodigen: boolean;
}): readonly Sleutel[] {
  return [
    'ketting.kop',
    // Zelfde sleutel als de knop zelf, zodat een lid op het woord kan zoeken dat hij ziet. De knop staat in de
    // Groepskaart bovenaan, vóór de ledenlijst.
    ...(stand.kanUitnodigen ? (['groepskaart.uitnodigen'] as const) : []),
    'groepscherm.wie_meedoen',
    ...(stand.open ? (['klassement.kop', 'groepshelden.kop'] as const) : []),
    'groepdetail.gesprek',
  ];
}
