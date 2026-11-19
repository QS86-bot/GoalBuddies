/**
 * De publieke rand van het design system.
 *
 * ⚠️ Componenten lezen kleuren uitsluitend hiervandaan. Een hexwaarde in een
 *    component is een fout: de twee Q-Projects-apps delen dit stelsel, en een
 *    losse kleur laat ze uit elkaar lopen.
 */

export type { Categoriekleuren, Heldkleuren, Heldpalet, Palette } from './tokens';
export {
  categoriekleurenNavy,
  categoriekleurenNavyLight,
  fontMono,
  fontSans,
  heldkleurenNavy,
  heldkleurenNavyLight,
  afstand,
  cijfer,
  HELDPALETSLEUTELS,
  PALETSLEUTELS,
  radius,
  roles,
  space,
} from './tokens';
export { contrastRatio, WCAG } from './contrast';
export { heldVlak, type HeldVlak } from './heldenbord';
export {
  allePaletten,
  STANDAARD_MODUS,
  STANDAARD_UITERLIJK,
  uiterlijkVoorVoorkeur,
  MODI,
  schaduwVoor,
  UITERLIJK_IDS,
  UITERLIJKEN,
  uiterlijk,
  type Modus,
  type Uiterlijk,
  type UiterlijkId,
  type UiterlijkPalet,
} from './uiterlijken';

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
