import { useProfiel, useSession, userClock } from '@/modules/auth';
import { BADGE_WAARDE, BADGES, fetchBadges } from '@/modules/goals';
import { haalMijnXp } from '@/modules/xp';
import type { TimeZone } from '@/shared/time';
import { useAsync } from '@/shared/ui';

import { prestatiesPerCategorie } from './prestaties-vorm';

/**
 * De gegevens van het Prestatiescherm — QS8-735. Alleen voor jezelf.
 *
 * ⚠️ **Twee aparte ophaalrondes, met opzet.** `mijn_xp()` staat pas op productie als
 *    migratie 0304 is toegepast (wacht op Quinten). Een fout bij het XP-deel mag de
 *    badges niet meenemen: je ziet dan je prestaties zonder niveau, en geen foutscherm.
 * ⚠️ `userId` komt uit de sessie; RLS (`badges_select`, `mijn_xp()`) doet de rest.
 */
export function usePrestaties() {
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const badges = useAsync(
    userId ? async () => prestatiesPerCategorie(await fetchBadges(), BADGES, BADGE_WAARDE) : null,
    [userId],
  );
  const xp = useAsync(userId ? () => haalMijnXp() : null, [userId]);
  // ⚠️ De dag van een datum is de dag in jouw tijdzone, nooit de UTC-dag (domeinregel 2).
  return { badges, xp, tz: profiel ? userClock(profiel).tz : ('UTC' as TimeZone) };
}
