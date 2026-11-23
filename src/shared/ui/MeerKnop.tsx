import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { radius, useTheme } from '../theme';

import { focusRing } from './a11y';
import { standEigenschappen } from './keuze-aria';

/**
 * De knop met drie puntjes: opent de acties van één rij — QS8-773.
 *
 * ⚠️ **Het label is verplicht en noemt de rij.** Drie puntjes zeggen een
 *    schermlezer niets, en een lijst vol knoppen die allemaal "meer" heten is
 *    niet te bedienen. De aanroeper geeft dus per rij zijn eigen zin mee
 *    ("Acties voor Daan Bakker").
 *
 * ⚠️ **Het raakvlak is 44 punten, het teken klein.** De rij blijft daardoor even
 *    hoog als een rij zonder knop (de reden van QS8-773) en de knop is toch te
 *    raken. De kleur komt uit het palet, nooit uit een eigen waarde.
 */

interface Props {
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  /** Staat het menu van deze rij open? Een schermlezer hoort het dan. */
  readonly open: boolean;
}

export function MeerKnop({ onPress, accessibilityLabel, open }: Props) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const kleur = open ? theme.colors.text : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      {...standEigenschappen({ expanded: open }, Platform.OS === 'web').aria}
      style={({ pressed }) => [
        styles.knop,
        { borderColor: open ? theme.colors.textSecondary : theme.colors.border, opacity: pressed ? 0.82 : 1 },
        focusRing(theme, heeftFocus),
      ]}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" aria-hidden importantForAccessibility="no-hide-descendants">
        <Circle cx={5} cy={12} r={2} fill={kleur} />
        <Circle cx={12} cy={12} r={2} fill={kleur} />
        <Circle cx={19} cy={12} r={2} fill={kleur} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  knop: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
