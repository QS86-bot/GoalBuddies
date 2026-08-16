import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { Caption, Subheading } from './Text';

/**
 * Eén invoerveld met label en foutmelding.
 *
 * ⚠️ De foutmelding staat onder het veld en is óók aan de rand te zien, want
 *    kleur alleen is geen mededeling voor wie kleurenblind is. En de melding
 *    blijft staan: hem laten verdwijnen zodra iemand begint te typen betekent
 *    dat je hem kwijt bent op het moment dat je hem wilt nalezen.
 */

interface Props extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  readonly label: string;
  /** Korte uitleg onder het label. Voor wat niet in het label past. */
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}

export function Field({ label, hint, error, ...rest }: Props) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const c = theme.colors;

  return (
    <View style={styles.blok}>
      <Subheading>{label}</Subheading>
      {hint === undefined ? null : <Caption>{hint}</Caption>}

      <TextInput
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholderTextColor={c.grey}
        accessibilityLabel={label}
        {...(error === undefined ? {} : { accessibilityHint: error })}
        style={[
          styles.veld,
          {
            backgroundColor: c.panelDark,
            borderColor: error === undefined ? c.border : c.red,
            color: c.text,
          },
          focusRing(theme, heeftFocus),
        ]}
        {...rest}
      />

      {error === undefined ? null : (
        <Caption danger>{error}</Caption>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 5 },
  veld: {
    borderWidth: 1,
    borderRadius: radius.base,
    paddingVertical: space.veld.paddingVertical + 4,
    paddingHorizontal: space.veld.paddingHorizontal,
    fontSize: 15,
    minHeight: 44,
  },
});
