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
  /** Waarom de knop uit staat of wat hij doet, voor wie het scherm niet ziet. */
  readonly accessibilityHint?: string | undefined;
  /** Voor een keuzeknop: is deze gekozen? Zonder dit leest een schermlezer elke keuze als ongekozen. */
  readonly selected?: boolean | undefined;
}

function kleuren(theme: Theme, variant: ButtonVariant) {
  const c = theme.colors;

  switch (variant) {
    case 'primair':
      // ⚠️ De combinatie vulling/tekst staat in het palet (`knop`, `knopTekst`) en
      //    niet meer hier, want elk uiterlijk heeft een ander accent. Per palet
      //    gemeten in `uiterlijken.test.ts`: tekst op vulling haalt 4,5. Bij het
      //    oorspronkelijke goud was dat de reden voor twee tinten: wit op het lichte
      //    goud (#a87a22) komt op 3,84, op het diepere goud op 5,25 (QS8-723 verhuisde
      //    de keuze naar het palet; de waarden zijn ongewijzigd).
      return { achtergrond: c.knop, rand: c.knop, tekst: c.knopTekst };
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
  accessibilityHint,
  selected,
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
      accessibilityState={{ disabled: uit, busy, ...(selected === undefined ? {} : { selected }) }}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
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
