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
  /** Alleen voor een invoerfout. Zie de opmerking bij `Caption`. */
  readonly danger?: boolean;
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

/**
 * Kleine bijtekst: datums, aantallen, toelichting.
 *
 * ⚠️ `danger` is uitsluitend voor een invoerfout — "dit veld klopt niet". Niet
 *    voor een gemiste week, niet voor een achterstand, niet voor iets van een
 *    ander. Rood is in dit stelsel deadline-risico en formulierfout, meer niet
 *    (domeinregel 7).
 */
export function Caption({ children, muted = true, danger = false, ...rest }: Props) {
  const c = useTheme().colors;
  const kleur = danger ? c.red : muted ? c.textSecondary : c.text;

  return (
    <RNText style={[styles.caption, { color: kleur }]} {...rest}>
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
