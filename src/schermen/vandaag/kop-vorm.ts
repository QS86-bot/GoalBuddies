import type { Beoordeelstand } from '@/shared/standen';
import type { Paginameldingen } from '@/shared/ui';

import { tellers } from './tellers-vorm';
import type { useVandaag } from './useVandaag';

/**
 * Wat Vandaag in de paginakop zet — QS8-726.
 *
 * ⚠️ **Alles komt uit wat het scherm al heeft; er is geen extra query.** De reeks
 *    is de langste lopende uit de standen (zie `tellers()`), en alleen zodra hij
 *    loopt: een nul bij iemand die net begint is geen mededeling. De meldingen
 *    zijn de oordelen die op jou wachten, een positief signaal; bij een mislukte
 *    telling blijft de knop weg en staat de kaart eronder, niet een getal dat nul
 *    kan liegen. Geen voortgangsstreep: er is hier geen mijlpaalwaarde zonder
 *    nieuwe query (regel 12).
 */
export function vandaagKop(
  v: Pick<ReturnType<typeof useVandaag>, 'standen' | 'standenStatus'>,
  beoordeel: Beoordeelstand,
  open: () => void,
): { reeks: number | null; meldingen: Paginameldingen | undefined } {
  const reeks = v.standenStatus === 'klaar' ? tellers(v.standen).reeks : null;
  return {
    reeks: reeks !== null && reeks > 0 ? reeks : null,
    meldingen: beoordeel.aantal > 0 && !beoordeel.mislukt ? { aantal: beoordeel.aantal, onOpen: open } : undefined,
  };
}
