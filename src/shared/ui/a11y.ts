import { useEffect, useState } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';

import type { Theme } from '../theme';

import { bewegingsDuur } from './beweging';

/**
 * Toegankelijkheid die op web én native hetzelfde moet werken.
 *
 * Twee dingen uit QS8-88 die je niet achteraf toevoegt zonder alles aan te
 * raken: een zichtbare focusring en respect voor `prefers-reduced-motion`.
 */

/**
 * Heeft de gebruiker gevraagd om minder beweging?
 *
 * ⚠️ Niet cosmetisch. Voor mensen met vestibulaire klachten is een
 *    schuivende voortgangsbalk misselijkmakend, en dit is een app die je elke
 *    week opent. React Native Web vertaalt dit naar `prefers-reduced-motion`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let levend = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((waarde) => {
        if (levend) setReduced(waarde);
      })
      .catch(() => {
        // Kan de voorkeur niet gelezen worden, dan animeren we gewoon. Niet
        // stilzwijgend uitzetten: dat maakt de app voor iedereen doffer op basis
        // van een fout die niemand ziet.
        if (levend) setReduced(false);
      });

    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      levend = false;
      abonnement.remove();
    };
  }, []);

  return reduced;
}

/**
 * De focusring.
 *
 * React Native kent geen `:focus-visible`, dus componenten houden zelf bij of ze
 * focus hebben (`onFocus`/`onBlur` op `Pressable`) en zetten deze stijl erop.
 * Goud, want dat is de accentkleur van het stelsel — en met een offset, zodat de
 * ring ook zichtbaar is op een vlak met dezelfde kleur.
 */
export function focusRing(theme: Theme, hasFocus: boolean): ViewStyle {
  if (!hasFocus) return {};
  return {
    borderColor: theme.colors.accent,
    // Geen `outline`: die bestaat niet op native. Een tweede rand doet het overal.
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  };
}

/**
 * Animatieduur in ms, of 0 als de gebruiker om minder beweging heeft gevraagd.
 *
 * ⚠️ Het rekenwerk staat sinds 27-08-2026 in `beweging.ts`, want dít bestand
 *    importeert `react-native` en is daarmee niet te testen. Deze naam blijft
 *    staan omdat hij de publieke rand van `shared/ui` is.
 */
export const motionDuration = bewegingsDuur;
