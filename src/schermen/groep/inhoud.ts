import type { Sleutel } from '@/shared/i18n';

/**
 * Wat er op de groepspagina staat, als rij onder de kop — QS8-778 (besluit Quinten 20-11-2026, optie A).
 *
 * ⚠️ **De rij noemt alleen wat er in déze groep ook echt staat.** Het klassement en de helden bestaan alleen in een
 *    open groep (besluit A41, A54): in een beschermde groep geven de RPC's nul rijen en rendert de pagina niets. Een
 *    rij die ze toch noemt, belooft een onderdeel dat er niet is en laat een lid zich afvragen waarom hij het niet
 *    ziet. Uitnodigen staat er alleen als de groep een deelbare uitnodiging heeft.
 *
 * ⚠️ Teksten komen uit de catalogus en zijn dezelfde sleutels als de koppen van de onderdelen zelf, zodat de rij en de
 *    kop eronder niet uiteen kunnen lopen. `tests/beloftes/groepspagina-inhoud.test.ts` legt dat naast de pagina.
 */
export function groepInhoud(stand: {
  readonly open: boolean;
  readonly kanUitnodigen: boolean;
}): readonly Sleutel[] {
  return [
    'ketting.kop',
    'groepscherm.wie_meedoen',
    ...(stand.open ? (['klassement.kop', 'groepshelden.kop'] as const) : []),
    'groepdetail.gesprek',
    ...(stand.kanUitnodigen ? (['groepdetail.inhoud_uitnodigen'] as const) : []),
  ];
}
