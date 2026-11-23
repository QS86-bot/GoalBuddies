/**
 * Waar de naam van een begunstigde vandaan komt — QS8-800.
 *
 * ⚠️ Puur en zonder imports, en dat is met opzet: `tests/rls/qs8-800-begunstigde-naam.test.ts`
 *    leest dezelfde tabel en kolom als de app, met echte JWT's. Verhuist de naam
 *    ooit naar een andere bron, dan verhuist de test mee in plaats van een
 *    route te toetsen die de app niet meer gebruikt (regel 18, vraag 4).
 *
 * ⚠️ Twee bestaande leesroutes, geen nieuwe: `groups_select` →
 *    `mag_groep_lezen()` (0153) en `profiles_select` → `shares_group_with_user()`
 *    met de kolomgrant van 0089 (`display_name`).
 */
export const BEGUNSTIGDE_BRON = {
  groep: { tabel: 'groups', kolom: 'name' },
  persoon: { tabel: 'profiles', kolom: 'display_name' },
} as const;

export interface StrafBegunstigde {
  readonly beneficiary_group_id: string | null;
  readonly beneficiary_user_id: string | null;
}

/** Welke van de twee kolommen geldt. Een CHECK zorgt dat het er hoogstens één is. */
export function begunstigdeVan(
  straf: StrafBegunstigde,
): { readonly soort: 'groep' | 'persoon'; readonly id: string } | null {
  if (straf.beneficiary_group_id !== null) return { soort: 'groep', id: straf.beneficiary_group_id };
  if (straf.beneficiary_user_id !== null) return { soort: 'persoon', id: straf.beneficiary_user_id };
  return null;
}
