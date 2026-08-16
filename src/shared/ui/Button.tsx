import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, useTheme, type Theme } from '../theme';

import { focusRing } from './a11y';

/**
 * De knop.
 *
 * Drie soorten, meer niet. Een vierde variant is bijna altijd een teken dat het
 * scherm te veel gelijkwaardige keuzes aanbiedt.
 */

export type ButtonVariant = 'primair' | 'secundair' | 'stil';

interface Props {
  readonly children: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  /** Toont een spinner en blokkeert een tweede druk. */
  readonly busy?: boolean;
  /** Vult de beschikbare breedte. */
  readonly block?: boolean;
  /** Verplicht zodra het label alleen niet genoeg zegt buiten zijn context. */
  readonly accessibilityLabel?: string;
}

function kleuren(theme: Theme, variant: ButtonVariant) {
  const c = theme.colors;

  switch (variant) {
    case 'primair':
      // ⚠️ De twee modi gebruiken bewust een ándere goudtint, en dat is geen
      //    slordigheid maar de enige combinatie die AA haalt.
      //
      //    Wit op het lichte goud (#a87a22) komt op 3,84 — onder de 4,5 die een
      //    knoplabel nodig heeft. Op het dieper goud (`accentDim`) haalt wit
      //    5,25. In de donkere modus is het omgekeerd: daar is het goud licht en
      //    draagt het de donkere navy-tekst op 8,76.
      //
      //    Beide kleuren komen uit het Q-Projects-stelsel; er is hier niets
      //    bijverzonnen. Vastgelegd in shared/theme/themes.test.ts.
      return theme.dark
        ? { achtergrond: c.accent, rand: c.accent, tekst: '#141e3c' }
        : { achtergrond: c.accentDim, rand: c.accentDim, tekst: '#ffffff' };
    case 'secundair':
      return { achtergrond: c.panel, rand: c.border, tekst: c.text };
    case 'stil':
      return { achtergrond: 'transparent', rand: 'transparent', tekst: c.textSecondary };
  }
}

export function Button({
  children,
  onPress,
  variant = 'secundair',
  disabled = false,
  busy = false,
  block = false,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);

  const kleur = kleuren(theme, variant);
  const uit = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={uit}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="button"
      accessibilityState={{ disabled: uit, busy }}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      style={({ pressed }) => [
        styles.knop,
        block && styles.block,
        {
          backgroundColor: kleur.achtergrond,
          borderColor: kleur.rand,
          // Ingedrukt en uitgeschakeld verschillen bewust: half doorzichtig
          // leest als "kapot", iets doorzichtig als "je raakt hem aan".
          opacity: uit ? 0.45 : pressed ? 0.82 : 1,
        },
        focusRing(theme, heeftFocus),
      ]}
    >
      <View style={styles.inhoud}>
        {busy ? <ActivityIndicator size="small" color={kleur.tekst} /> : null}
        <Text style={[styles.label, { color: kleur.tekst }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  knop: {
    borderWidth: 1,
    borderRadius: radius.base,
    paddingVertical: space.veld.paddingVertical + 3,
    paddingHorizontal: space.veld.paddingHorizontal + 6,
    // 44 punten is de kleinste maat die op een telefoon betrouwbaar te raken is.
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch' },
  inhoud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
