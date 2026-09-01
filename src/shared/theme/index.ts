/**
 * De publieke rand van het design system.
 *
 * ⚠️ Componenten lezen kleuren uitsluitend hiervandaan. Een hexwaarde in een
 *    component is een fout: de twee Q-Projects-apps delen dit stelsel, en een
 *    losse kleur laat ze uit elkaar lopen.
 */

export type { Categoriekleuren, Palette } from './tokens';
export {
  categoriekleurenNavy,
  categoriekleurenNavyLight,
  fontMono,
  fontSans,
  radius,
  roles,
  space,
} from './tokens';
export { contrastRatio, WCAG } from './contrast';

export {
  navyLightTheme,
  navyTheme,
  parsePreference,
  themeFor,
  themeForPreference,
  type Theme,
  type ThemePreference,
} from './themes';

export { ThemeProvider, useTheme, useThemePreference } from './ThemeProvider';
