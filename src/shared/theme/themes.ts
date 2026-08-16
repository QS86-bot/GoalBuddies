import type { ColorSchemeName } from 'react-native';

import { navy, navyLight, roles, shadow, type Palette } from './tokens';

/** De twee thema's van het Q-Projects navy-stelsel. */

export interface Theme {
  readonly name: 'navy' | 'navy-licht';
  readonly dark: boolean;
  readonly colors: Palette;
  readonly roles: ReturnType<typeof roles>;
  readonly shadow: (typeof shadow)['navy'] | (typeof shadow)['navyLight'];
}

export const navyTheme: Theme = {
  name: 'navy',
  dark: true,
  colors: navy,
  roles: roles(navy),
  shadow: shadow.navy,
};

export const navyLightTheme: Theme = {
  name: 'navy-licht',
  dark: false,
  colors: navyLight,
  roles: roles(navyLight),
  shadow: shadow.navyLight,
};

/**
 * Het thema dat bij een systeemvoorkeur hoort.
 *
 * Donker is de primaire modus van dit stelsel, dus dat is de terugval zodra het
 * systeem niets zegt: React Native levert dan 'unspecified'.
 */
export function themeFor(scheme: ColorSchemeName): Theme {
  return scheme === 'light' ? navyLightTheme : navyTheme;
}

/**
 * Wat de gebruiker heeft gekozen. `systeem` is de standaard en betekent: volg de
 * instelling van het toestel.
 */
export type ThemePreference = 'systeem' | 'navy' | 'navy-licht';

export function themeForPreference(
  preference: ThemePreference,
  scheme: ColorSchemeName,
): Theme {
  if (preference === 'navy') return navyTheme;
  if (preference === 'navy-licht') return navyLightTheme;
  return themeFor(scheme);
}

/** Herkent een opgeslagen waarde; alles anders valt terug op `systeem`. */
export function parsePreference(raw: string | null): ThemePreference {
  return raw === 'navy' || raw === 'navy-licht' || raw === 'systeem' ? raw : 'systeem';
}
