import type { Bewijseis, Vraag } from '@/modules/completions';
import type { Weekdoel } from '@/modules/goals';

/**
 * Vaste terugvallen voor `useAsyncMetTerugval` — QS8-219.
 *
 * ⚠️ **Constanten en geen literalen op de aanroepplek.** Een `[]` in de aanroep
 *    is elke render een nieuwe array; die hook houdt hem daarom buiten `deps`,
 *    en dan hoort de waarde ook echt constant te zijn. Zo staat het verband
 *    zichtbaar in plaats van als afspraak in een kop.
 */
export const GEEN_WEEKDOELEN: readonly Weekdoel[] = [];
export const GEEN_VRAGEN: readonly Vraag[] = [];
export const GEEN_DAGEN: readonly string[] = [];
export const STANDAARD_BEWIJSEIS: Bewijseis = 'note_required';
