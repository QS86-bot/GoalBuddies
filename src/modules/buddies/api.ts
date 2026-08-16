import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Buddy-groepen. Groeit uit tot EPIC 5; dit is wat andere modules nu al nodig
 * hebben.
 */

export type Groep = Tables<'groups'>;

/**
 * De groepen waar deze gebruiker lid van is.
 *
 * ⚠️ Geen filter op `user_id` nodig: `groups_select` laat uitsluitend groepen
 *    door waar je lid van bent. Een filter erbij zou suggereren dat de
 *    beveiliging hier zit, en dat is precies het misverstand dat je niet wilt.
 */
export async function fetchMijnGroepen(): Promise<readonly Groep[]> {
  const { data, error } = await supabase()
    .from('groups')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'groups.mine', { code: error.code });
    throw new Error('Je groepen konden niet geladen worden.');
  }

  return data ?? [];
}
