import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { Caption, Subheading } from './Text';

/**
 * Een keuze uit een handjevol vaste opties.
 *
 * ⚠️ Alle opties tegelijk zichtbaar, geen uitklapmenu. Bij zeven weekdagen of
 *    twee tonen is een dropdown een extra tik en een extra scherm om te lezen.
 *    Bovendien werkt een echte `<select>` op web anders dan een picker op
 *    native, en dan heb je twee dingen om te onderhouden in plaats van één.
 */

export interface Optie<T extends string | number> {
  readonly waarde: T;
  readonly label: string;
}

interface Props<T extends string | number> {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly opties: readonly Optie<T>[];
  readonly waarde: T;
  readonly onKies: (waarde: T) => void;
  readonly disabled?: boolean;
  /**
   * Toont het label als bijschrift in plaats van als kop.
   *
   * ⚠️ Bestaat voor `GegroepeerdeKeuze`, waar deze `Choice` één groep ín een
   *    grotere keuze is. Twee `Subheading`s onder elkaar zeggen dat er twee
   *    even belangrijke koppen staan, en dat is dan niet waar. De rol blijft
   *    `radiogroup` met hetzelfde label — dit is een kwestie van gewicht, niet
   *    van toegankelijkheid.
   */
  readonly subtiel?: boolean;
}

export function Choice<T extends string | number>({
  label,
  hint,
  opties,
  waarde,
  onKies,
  disabled = false,
  subtiel = false,
}: Props<T>) {
  return (
    <View style={styles.blok} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {subtiel ? <Caption>{label}</Caption> : <Subheading>{label}</Subheading>}
      {hint === undefined ? null : <Caption>{hint}</Caption>}

      <View style={styles.rij}>
        {opties.map((optie) => (
          <Knop
            key={String(optie.waarde)}
            optie={optie}
            gekozen={optie.waarde === waarde}
            disabled={disabled}
            onKies={onKies}
          />
        ))}
      </View>
    </View>
  );
}

function Knop<T extends string | number>({
  optie,
  gekozen,
  disabled,
  onKies,
}: {
  readonly optie: Optie<T>;
  readonly gekozen: boolean;
  readonly disabled: boolean;
  readonly onKies: (waarde: T) => void;
}) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const c = theme.colors;

  return (
    <Pressable
      onPress={() => onKies(optie.waarde)}
      disabled={disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="radio"
      accessibilityState={{ selected: gekozen, disabled }}
      style={({ pressed }) => [
        styles.knop,
        {
          // Het accent markeert de keuze via de rand en niet via een vlak: goud
          // draagt geen tekst (contrast.test.ts), en een gevulde knop zou hier
          // dus een leesbaarheidsprobleem opleveren.
          backgroundColor: gekozen ? c.panel : 'transparent',
          borderColor: gekozen ? c.accent : c.border,
          borderWidth: gekozen ? 2 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        focusRing(theme, heeftFocus),
      ]}
    >
      <Text style={[styles.label, { color: gekozen ? c.text : c.textSecondary }]}>
        {optie.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 5 },
  rij: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  knop: {
    borderRadius: radius.base,
    paddingVertical: space.veld.paddingVertical + 2,
    paddingHorizontal: space.veld.paddingHorizontal + 2,
    minHeight: 40,
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
});
