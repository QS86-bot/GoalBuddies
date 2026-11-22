import { fetchMijnGroepen, type Lijstgroep } from '@/modules/buddies';
import { fetchMijnOrganisaties } from '@/modules/organisaties';

import { groepSecties, type Groepsectie } from './secties';

export interface Groepenlijst {
  readonly groepen: readonly Lijstgroep[];
  readonly secties: readonly Groepsectie[] | null;
}

/**
 * Wat het tabblad Groepen laadt — QS8-775.
 *
 * ⚠️ **De organisaties alleen als er een teamgroep is** (security-ronde 22-11-2026, punt 2). Wie geen teamgroep heeft,
 *    krijgt precies het verzoek van vóór dit issue en niets meer (criterium 1): een storing op `organizations` raakt
 *    zijn tabblad dan niet, en er gaan geen twee verzoeken over de lijn die niets opleveren.
 *
 * ⚠️ **Faalt het ophalen van de organisaties, dan is dat de foutstaat met herstelknop**, en niet een lijst zonder
 *    namen. "Werk" zonder naam is besloten gedrag voor een organisatie die niet meer actief is; het mag niet ook de
 *    stille uitkomst van een storing zijn. `laden.test.ts` wordt rood als iemand hier een `.catch(() => [])` zet.
 */
export async function laadGroepenlijst(): Promise<Groepenlijst> {
  const groepen = await fetchMijnGroepen();
  if (!groepen.some((g) => g.organization_id !== null)) return { groepen, secties: null };
  const organisaties = await fetchMijnOrganisaties();
  return { groepen, secties: groepSecties(groepen, organisaties) };
}
