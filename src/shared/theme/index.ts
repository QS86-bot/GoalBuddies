import { useColorScheme, type ColorSchemeName } from 'react-native';

import { navy, navyLight, roles, shadow, type Palette } from './tokens';

/**
 * De publieke rand van het design system.
 *
 * ⚠️ Componenten lezen kleuren uitsluitend hiervandaan. Een hexwaarde in een
 *    component is een fout: de twee Q-Projects-apps delen dit stelsel, en een
 *    losse kleur laat ze uit elkaar lopen.
 */

export type { Palette } from './tokens';
export { fontMono, fontSans, radius, roles, space } from './tokens';
export { contrastRatio, WCAG } from './contrast';

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
 * systeem niets zegt — `null` op web, of `'unspecified'` op native.
 */
export function themeFor(scheme: ColorSchemeName): Theme {
  return scheme === 'light' ? navyLightTheme : navyTheme;
}

/** Het actieve thema, volgend op de systeeminstelling van de gebruiker. */
export function useTheme(): Theme {
  return themeFor(useColorScheme());
}
