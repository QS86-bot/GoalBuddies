import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';

import { streakLabel } from './metrics';
import { Caption, Subheading } from './Text';

/**
 * De reeksteller. Telt cycli, geen dagen — de week is de enige eenheid die telt.
 *
 * ⚠️ Toont nooit een puntentotaal. Punten zijn privé (domeinregel 10) en een
 *    dalend totaal is zichtbaar bewijs van een gemiste week. Wil je punten laten
 *    zien, dan is dat een eigen component op een eigen scherm, alleen voor de
 *    eigenaar.
 */

interface Props {
  readonly cycles: number;
  /** De beste reeks ooit. Loopt alleen omhoog, dus veilig voor de groep. */
  readonly best?: number | undefined;
  readonly compact?: boolean;
}

export function StreakCounter({ cycles, best, compact = false }: Props) {
  const theme = useTheme();

  // Nul is geen mislukking maar een startpunt: neutraal, niet oranje.
  const kleur = cycles > 0 ? theme.roles.progress : theme.colors.grey;

  return (
    <View style={styles.rij} accessibilityLabel={streakLabel(cycles)}>
      <View style={[styles.stip, { backgroundColor: kleur }]} />

      {compact ? (
        <Caption muted={false}>{streakLabel(cycles)}</Caption>
      ) : (
        <View style={styles.tekst}>
          <Subheading>{streakLabel(cycles)}</Subheading>
          {best !== undefined && best > cycles ? <Caption>Beste reeks: {best}</Caption> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stip: { width: 9, height: 9, borderRadius: radius.pill },
  tekst: { gap: 2 },
});
