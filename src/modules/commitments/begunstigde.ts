import { BEGUNSTIGDE_BRON, begunstigdeVan, type StrafBegunstigde } from './begunstigde-bron';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Wie de begunstigde van een straf is, als naam voor de eigenaar — QS8-800.
 *
 * ⚠️ **Geen nieuwe leesroute, en dat is de kern van dit issue.** De naam komt uit
 *    twee bronnen die de eigenaar al mocht lezen (`BEGUNSTIGDE_BRON`). Geen
 *    migratie, geen RPC, geen `security definer`: wat deze functie leest, leest
 *    elk ander account precies zoals vóór QS8-800. Dat toetst
 *    `tests/rls/qs8-800-begunstigde-naam.test.ts` met echte JWT's.
 *
 * ⚠️ **`naam: null` betekent "deze eigenaar mag hem niet (meer) lezen"**, niet
 *    "er is geen begunstigde". Wie de groep verliet of geen groep meer deelt met
 *    zijn getuige, krijgt van RLS nul rijen. Dan noemt de kaart de soort zonder
 *    naam; de app gaat er niet omheen.
 *
 * ⚠️ **Geen begunstigde (beide kolommen leeg) is `null`**: dat is de stuurloze
 *    straf van QS8-333, en die heeft een eigen kaart.
 *
 * Werpt niet: een storing hier mag de strafkaart niet meeslepen.
 */
export interface BegunstigdeNaam {
  readonly soort: 'groep' | 'persoon';
  readonly naam: string | null;
  readonly fout: boolean;
}

export async function fetchBegunstigdeNaam(straf: StrafBegunstigde): Promise<BegunstigdeNaam | null> {
  const wie = begunstigdeVan(straf);
  if (wie === null) return null;

  const bron = BEGUNSTIGDE_BRON[wie.soort];
  const { data, error } = await supabase()
    .from(bron.tabel)
    .select<string, Record<string, string | null>>(bron.kolom)
    .eq('id', wie.id)
    .limit(1);

  if (error) {
    reportError(error, 'commitments.begunstigde', { soort: wie.soort });
    return { soort: wie.soort, naam: null, fout: true };
  }

  const naam = (data ?? [])[0]?.[bron.kolom] ?? null;
  return { soort: wie.soort, naam: naam === '' ? null : naam, fout: false };
}
