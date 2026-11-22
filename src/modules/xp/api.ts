import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import { leesXpStand, type XpStand } from './stand';

/**
 * De clientkant van `mijn_xp()` — QS8-734, migratie 0304.
 *
 * ⚠️ Elk resultaat gaat door `leesXpStand()`: een vorm die de client niet kent is
 *    een fout en geen stille nul.
 */
/** Werpt bij een fout: "geen XP" en "XP niet te lezen" zijn twee verschillende dingen. */
export async function haalMijnXp(): Promise<XpStand> {
  const { data, error } = await supabase().rpc('mijn_xp');
  const stand = error ? null : leesXpStand(data);
  if (stand === null) {
    reportError(new Error('De XP-stand kon niet gelezen worden'), 'xp.haalMijnXp', {
      reden: error ? 'rpc' : 'vorm',
    });
    throw new Error('De XP-stand kon niet gelezen worden');
  }
  return stand;
}
