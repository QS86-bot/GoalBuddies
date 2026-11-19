import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Het verloop van uiterlijk C (QS8-724): achtergrond, knop of voortgangsstreep.
 *
 * ⚠️ **Dit component krijgt de kleuren van het palet en kent er zelf geen.** Een hexwaarde hier is een
 *    fout: `uiterlijken.test.ts` toetst contrast en afstand van de tinten, en een kleur die het palet niet
 *    kent, ontsnapt aan die toetsen. Een uiterlijk zonder verloop (A en B, `null`) rendert een gewone `View`-kleur
 *    via de aanroeper; dit component wordt dan niet gebruikt.
 *
 * ⚠️ **Nog niets in de app kiest uiterlijk C.** De schakelaar is QS8-729 en QS8-731; tot dan staat dit component
 *    klaar en rendert hij nergens. Niet gemeten: hoe het verloop op een echt toestel oogt (hier alleen typecheck en unit-tests; de web-export draait in CI).
 */
interface Props {
  /** Uit `uiterlijk(...).verloop` (`achtergrond` of `accent`); nooit een eigen kleur. */
  readonly kleuren: readonly [string, string];
  readonly richting?: 'diagonaal' | 'horizontaal';
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

export function Verloop({ kleuren, richting = 'diagonaal', style, children }: Props) {
  const horizontaal = richting === 'horizontaal';
  return (
    <LinearGradient
      colors={[kleuren[0], kleuren[1]]}
      start={{ x: 0, y: 0 }}
      end={horizontaal ? { x: 1, y: 0 } : { x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

