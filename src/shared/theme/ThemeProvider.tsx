import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  STANDAARD_THEMAKEUZE,
  themeFor,
  themeVoorKeuze,
  type Theme,
  type Themakeuze,
} from './themes';

/**
 * Het actieve thema, afgeleid van een keuze die van buiten komt.
 *
 * ⚠️ **Dit component bewaart niets en praat niet met een account** (QS8-731). Tot dan las het
 *    `goalbuddies.thema` uit AsyncStorage; dat kon het alleen omdat het niets van een gebruiker wist. De keuze
 *    hoort bij een account, en een gedeelde laag mag de datalaag niet importeren — dus staat de opslag in
 *    `modules/uiterlijk/react.tsx` (`UiterlijkProvider`), en dit component krijgt de keuze als prop.
 *
 * ⚠️ Donkere modus blijft een volwaardige stand en geen filter over de lichte: elk uiterlijk levert beide
 *    paletten (`uiterlijken.ts`). `weergave: 'systeem'` volgt het toestel, ook als dat 's avonds omschakelt;
 *    daarom is "systeem" een echte keuze en geen eenmalige afspraak.
 */

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({
  keuze = STANDAARD_THEMAKEUZE,
  children,
}: {
  /** Zonder keuze geldt B en donker. */
  readonly keuze?: Themakeuze | undefined;
  readonly children: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const theme = useMemo(() => themeVoorKeuze(keuze, scheme), [keuze, scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Het actieve thema.
 *
 * Werkt ook zonder provider — dan volgt hij simpelweg de systeeminstelling. Dat
 * is bewust: een los gerenderde component in een test hoort niet om te vallen
 * omdat er geen provider omheen staat.
 */
export function useTheme(): Theme {
  const uitContext = useContext(ThemeContext);
  const scheme = useColorScheme();
  return uitContext ?? themeFor(scheme);
}
