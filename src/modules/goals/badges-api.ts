import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import { kentBadge, type Badge, type VerdiendeBadge } from './badges';

/**
 * Het ophalen van badges — QS8-78.
 *
 * ⚠️ **Apart van `badges.ts`, en dat is geen smaak.** Die eerste is zuiver en
 *    dus te testen zonder de Supabase-client; dit bestand trekt React Native mee
 *    en kan dat niet zijn. Zelfde splitsing en zelfde reden als bij QS8-120/121,
 *    waar de Zod-schema's aan de client vastzaten en daardoor onbereikbaar waren
 *    voor een unit-test.
 */

/**
 * De badges die jij verdiend hebt, oudste eerst.
 *
 * ⚠️ Eén verzoek, geen lus. En géén `user_id`-filter: `badges_select` doet dat
 *    al, en een filter erbij zou suggereren dat de beveiliging hier zit
 *    (dezelfde afspraak als in `modules/buddies/api.ts`).
 *
 * ⚠️ Onbekende badges vallen weg. Een server die vooruitloopt op een
 *    geïnstalleerde app is een normale toestand, en een badge zonder zin is een
 *    leeg vakje op het scherm.
 */
export async function fetchBadges(): Promise<readonly VerdiendeBadge[]> {
  const { data, error } = await supabase()
    .from('badges')
    .select('badge, earned_at')
    .order('earned_at', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'badges.list', { pgcode: error.code });
    throw new Error(t('badge.laden_mislukt'));
  }

  return (data ?? [])
    .filter((rij) => typeof rij.badge === 'string' && kentBadge(rij.badge))
    .map((rij) => ({ badge: rij.badge as Badge, earned_at: rij.earned_at }));
}
