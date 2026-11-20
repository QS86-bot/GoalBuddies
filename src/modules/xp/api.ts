import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import { leesXpStand, type XpStand } from './stand';

/**
 * De clientkant van `mijn_xp()` — QS8-734, migratie 0304.
 *
 * ⚠️ De functie is nog niet in `src/lib/database.types.ts`: dat bestand is een
 *    afschrift van productie en de migratie wacht op Quintens "backup gedaan".
 *    Tot `npm run types:db` hem kent loopt de aanroep door één smalle
 *    structurele rand, en elk resultaat gaat door `leesXpStand()`.
 */
interface RpcRand {
  rpc(naam: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Werpt bij een fout: "geen XP" en "XP niet te lezen" zijn twee verschillende dingen. */
export async function haalMijnXp(): Promise<XpStand> {
  const { data, error } = await (supabase() as unknown as RpcRand).rpc('mijn_xp');
  const stand = error ? null : leesXpStand(data);
  if (stand === null) {
    reportError(new Error('De XP-stand kon niet gelezen worden'), 'xp.haalMijnXp', {
      reden: error ? 'rpc' : 'vorm',
    });
    throw new Error('De XP-stand kon niet gelezen worden');
  }
  return stand;
}
