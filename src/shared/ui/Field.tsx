import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { Caption, Subheading } from './Text';
import { invoerProps, knopSleutel } from './wachtwoordveld';

/**
 * Eén invoerveld met label en foutmelding.
 *
 * ⚠️ De foutmelding staat onder het veld en is óók aan de rand te zien, want
 *    kleur alleen is geen mededeling voor wie kleurenblind is. En de melding
 *    blijft staan: hem laten verdwijnen zodra iemand begint te typen betekent
 *    dat je hem kwijt bent op het moment dat je hem wilt nalezen.
 *
 * ⚠️ **Een wachtwoordveld hoort hier en niet in het scherm** (QS8-249). Zet
 *    `wachtwoord` in plaats van `secureTextEntry`, dan krijgt élk wachtwoordveld
 *    de spiekknop — nu en bij elk formulier dat er later bij komt. Eén plek die
 *    weet hoe een wachtwoordveld eruitziet.
 */

interface Props extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  readonly label: string;
  /** Korte uitleg onder het label. Voor wat niet in het label past. */
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  /**
   * Verbergt de invoer en tekent een knop om hem tijdelijk te tonen.
   *
   * ⚠️ Gebruik dit in plaats van `secureTextEntry`. Wie die laatste zelf zet,
   *    krijgt een veld zonder knop — en `tests/beloftes/wachtwoordveld.test.ts`
   *    wordt daar rood van.
   */
  readonly wachtwoord?: boolean | undefined;
}

export function Field({ label, hint, error, wachtwoord = false, ...rest }: Props) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);

  // ⚠️ Begint altijd verborgen. Tonen is een handeling, geen stand die je erft.
  const [zichtbaar, setZichtbaar] = useState(false);
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
        {...invoerProps({ wachtwoord, zichtbaar, opgegeven: rest })}
      />

      {/*
        ⚠️ **Niet automatisch weer verbergen na een paar seconden.** Dat is
           precies het moment waarop je nog aan het lezen bent. De knop blijft
           staan tot je hem zelf omzet.
      */}
      {!wachtwoord ? null : (
        <Pressable
          onPress={() => setZichtbaar((z) => !z)}
          accessibilityRole="button"
          accessibilityLabel={t(knopSleutel(zichtbaar))}
          accessibilityState={{ selected: zichtbaar }}
          hitSlop={8}
          style={styles.spiek}
        >
          <Caption>{t(knopSleutel(zichtbaar))}</Caption>
        </Pressable>
      )}

      {error === undefined ? null : (
        <Caption danger>{error}</Caption>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 5 },
  // Rechts uitgelijnd onder het veld: dicht bij wat hij bedient, en hij duwt
  // de foutmelding niet opzij.
  spiek: { alignSelf: 'flex-end', paddingVertical: 2 },
  veld: {
    borderWidth: 1,
    borderRadius: radius.base,
    paddingVertical: space.veld.paddingVertical + 4,
    paddingHorizontal: space.veld.paddingHorizontal,
    fontSize: 15,
    minHeight: 44,
  },
});
