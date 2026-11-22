import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';

import { focusRing } from './a11y';

/**
 * Een aan-uitschakelaar voor een instelling van de groep — QS8-666 (A57), keuze B1 van Quinten.
 *
 * ⚠️ **Hij springt niet zelf om.** `onPress` meldt alleen dat de gebruiker wil wisselen; het scherm bepaalt of
 *    daar eerst een bevestiging voor komt. Een instelling die álle leden raakt (domeinregel 5) hoort nooit
 *    omgezet te worden door een tik die de uitleg nog niet heeft laten lezen, en een schakelaar die zelf van
 *    stand verandert vóór het antwoord er is, liegt over wat de database weet.
 *
 * ⚠️ **De stand komt van buiten (`aan`) en niet uit eigen state.** Dit onderdeel onthoudt niets: de bron van
 *    waarheid is de kolom, niet de schakelaar.
 *
 * ⚠️ Geen eigen kleuren: de baan en de knop komen uit het palet (`green` voor aan, `grey` voor uit), net als
 *    de rest van de app. Een kleur die hier ontstaat is een kleur die het uiterlijkenstelsel niet kent.
 */
interface Props {
  /** De huidige stand, zoals de database hem kent. */
  readonly aan: boolean;
  readonly onPress: () => void;
  /** Wat de schakelaar bedient, voor wie hem niet ziet. */
  readonly label: string;
  readonly disabled?: boolean;
}

const BAAN = { breed: 52, hoog: 30 } as const;
const KNOP = 22;
const RAND = 3;

export function Schakelaar({ aan, onPress, label, disabled = false }: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const [heeftFocus, setFocus] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: aan, disabled }}
      // De baan is 30 hoog; de rest van de 44 punten is raakvlak.
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      style={[
        styles.baan,
        {
          backgroundColor: aan ? c.green : c.panelDark,
          borderColor: aan ? c.green : c.border,
          opacity: disabled ? 0.45 : 1,
        },
        focusRing(theme, heeftFocus),
      ]}
    >
      <View
        style={[
          styles.knop,
          { backgroundColor: aan ? c.text : c.grey },
          aan ? styles.knopAan : styles.knopUit,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  baan: {
    width: BAAN.breed,
    height: BAAN.hoog,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  knop: {
    position: 'absolute',
    width: KNOP,
    height: KNOP,
    borderRadius: radius.pill,
  },
  knopUit: { left: RAND },
  knopAan: { left: BAAN.breed - KNOP - RAND - 2 },
});
