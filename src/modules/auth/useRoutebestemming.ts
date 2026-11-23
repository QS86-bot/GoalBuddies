import { useEffect } from 'react';

import { isOnboarded } from './profile';
import { useProfiel } from './ProfielProvider';
import { bestemmingVoor, type Bestemming } from './routewacht';
import { useSession } from './SessionProvider';

/**
 * Waar de routewacht heen stuurt, uit sessie, profiel en de huidige route — QS8-793.
 *
 * ⚠️ **Dit stond in `app/_layout.tsx`, en daar is het niet te toetsen** (die laadt
 *    niet onder de render-opstelling, zie `tests/render/scherm.ts`). De fout van
 *    QS8-793 zat precies hier: op de naad tussen wat het profielscherm in de
 *    provider zet en wat de wacht daaruit afleidt. Als hook naast de provider is
 *    die naad te renderen; `src/modules/auth/routewacht-afronden.test.ts` doet dat.
 *
 * ⚠️ Hij beslist alleen; navigeren doet de aanroeper. Wel ruimt hij de vlag
 *    `netAfgerond` op zodra de vragenlijst in beeld is **of de route de onboarding
 *    uit is**, anders stuurt een latere diepe link naar `/onboarding/profiel` in
 *    dezelfde sessie weer naar de vragenlijst in plaats van naar `/`.
 *
 * ⚠️ Dat tweede geval bestaat echt: `Werkcodewacht` en `Uitnodigingswacht` in
 *    `app/_layout.tsx` starten op dezelfde overgang naar "afgerond" en navigeren
 *    asynchroon, dus later. Wie met een openstaande uitnodiging of werkcode
 *    afrondt, landt daar en niet op de vragenlijst. Dat was vóór QS8-793 ook zo;
 *    of die persoon de vragenlijst hoort te zien is een productvraag, en geen
 *    reden om de vlag te laten hangen.
 *
 * @param segmenten de uitkomst van `useSegments()`: het eerste en tweede segment tellen.
 */
export function useRoutebestemming(segmenten: readonly string[]): Bestemming {
  const { session, loading: sessieLaadt } = useSession();
  const { profiel, loading: profielLaadt, error: profielFout, netAfgerond, afrondenVoorbij } =
    useProfiel();
  const [wortel = '', tak = ''] = segmenten;

  const voorbij = wortel !== 'onboarding' || tak === 'vragenlijst';
  useEffect(() => {
    if (netAfgerond && voorbij) afrondenVoorbij();
  }, [netAfgerond, voorbij, afrondenVoorbij]);

  return bestemmingVoor({
    heeftSessie: session !== null,
    sessieLaadt,
    profielLaadt,
    profielFout,
    isOnboarded: isOnboarded(profiel),
    wortel,
    tak,
    netAfgerond,
  });
}
