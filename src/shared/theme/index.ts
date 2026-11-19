/**
 * De publieke rand van het design system.
 *
 * ⚠️ Componenten lezen kleuren uitsluitend hiervandaan. Een hexwaarde in een
 *    component is een fout: de twee Q-Projects-apps delen dit stelsel, en een
 *    losse kleur laat ze uit elkaar lopen.
 */

export type { Afstandsschaal, Categoriekleuren, Heldkleuren, Heldpalet, Palette } from './tokens';
export {
  categoriekleurenNavy,
  categoriekleurenNavyLight,
  fontMono,
  fontSans,
  heldkleurenNavy,
  heldkleurenNavyLight,
  afstand,
  afstandVoor,
  cijfer,
  HELDPALETSLEUTELS,
  PALETSLEUTELS,
  radius,
  roles,
  space,
} from './tokens';
export { contrastRatio, WCAG } from './contrast';
export { pictogramkleurenDonker, pictogramkleurenLicht, type Pictogramkleuren } from './pictogramkleuren';
export { heldVlak, type HeldVlak } from './heldenbord';
export {
  allePaletten,
  STANDAARD_MODUS,
  STANDAARD_UITERLIJK,
  MODI,
  schaduwVoor,
  UITERLIJK_IDS,
  UITERLIJKEN,
  uiterlijk,
  type Modus,
  type Uiterlijk,
  type UiterlijkId,
  type UiterlijkPalet,
  type Verloop,
} from './uiterlijken';

export {
  navyLightTheme,
  navyTheme,
  STANDAARD_THEMAKEUZE,
  themeFor,
  themeVoorKeuze,
  uiterlijkIdVoor,
  type Dichtheid as ThemaDichtheid,
  type Theme,
  type Themakeuze,
} from './themes';

export { ThemeProvider, useTheme } from './ThemeProvider';
