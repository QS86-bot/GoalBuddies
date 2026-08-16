import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '../theme';

/**
 * De typografie van het Q-Projects navy-stelsel.
 *
 * ⚠️ Componenten gebruiken deze en niet de kale `Text` van React Native. Anders
 *    staat er over een half jaar op elk scherm een eigen `fontSize: 15`, en dan
 *    is er geen stelsel meer maar een verzameling meningen.
 */

type Props = Omit<TextProps, 'style'> & {
  readonly children: React.ReactNode;
  /** Zet de kleur naar de zachtere secundaire tekstkleur. */
  readonly muted?: boolean;
  readonly numberOfLines?: number;
};

/** Schermtitel. Eén per scherm. */
export function Heading({ children, muted, ...rest }: Props) {
  const c = useTheme().colors;
  return (
    <RNText
      accessibilityRole="header"
      style={[styles.heading, { color: muted ? c.textSecondary : c.text }]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Kop boven een blok of kaart. */
export function Subheading({ children, muted, ...rest }: Props) {
  const c = useTheme().colors;
  return (
    <RNText style={[styles.subheading, { color: muted ? c.textSecondary : c.text }]} {...rest}>
      {children}
    </RNText>
  );
}

/** Gewone lopende tekst. */
export function Body({ children, muted, ...rest }: Props) {
  const c = useTheme().colors;
  return (
    <RNText style={[styles.body, { color: muted ? c.textSecondary : c.text }]} {...rest}>
      {children}
    </RNText>
  );
}

/** Kleine bijtekst: datums, aantallen, toelichting. */
export function Caption({ children, muted = true, ...rest }: Props) {
  const c = useTheme().colors;
  return (
    <RNText style={[styles.caption, { color: muted ? c.textSecondary : c.text }]} {...rest}>
      {children}
    </RNText>
  );
}

/**
 * Het kleine kapitaal boven een blok.
 *
 * ⚠️ Dit is de enige plek waar goud tekst mag dragen, en alleen omdat het geen
 *    lopende tekst is. `shared/theme/contrast.test.ts` legt die grens vast.
 */
export function Eyebrow({ children, ...rest }: Omit<Props, 'muted'>) {
  const c = useTheme().colors;
  return (
    <RNText style={[styles.eyebrow, { color: c.accent }]} {...rest}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
});
