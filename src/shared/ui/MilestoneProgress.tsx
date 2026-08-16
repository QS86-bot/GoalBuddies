import { Platform, StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';

import { useReducedMotion } from './a11y';
import { milestoneProgress } from './metrics';
import { Caption } from './Text';

/**
 * Voortgang naar een doel.
 *
 * ⚠️ Heet bewust `MilestoneProgress` en niet `ProgressBar`. Domeinregel 10:
 *    score en voortgang zijn twee dingen. Voortgang is mijlpaalgebaseerd en loopt
 *    alleen omhoog; de score kan dalen. Worden die twee in één balk gepropt, dan
 *    lijkt het alsof je doel achteruitgaat omdat je één week miste — en dat is
 *    het gevoel dat mensen deze app laat verwijderen.
 *
 *    De naam is de bescherming. Een component die `ProgressBar` heet, krijgt
 *    ooit een puntentotaal gevoerd; deze niet.
 */

interface Props {
  readonly done: number;
  readonly total: number;
  /** Laat het aantal erbij zien. Uit in compacte lijsten. */
  readonly showCount?: boolean;
}

export function MilestoneProgress({ done, total, showCount = true }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  const deel = milestoneProgress(done, total);
  const percentage = Math.round(deel * 100);

  return (
    <View
      style={styles.blok}
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} van ${total} mijlpalen gehaald`}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
    >
      <View style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}>
        <View
          style={[
            styles.vulling,
            {
              backgroundColor: theme.roles.progress,
              width: `${percentage}%`,
              ...(reduced || Platform.OS !== 'web' ? {} : { transitionDuration: '260ms' }),
            },
          ]}
        />
      </View>

      {showCount ? (
        <Caption>
          {total === 0 ? 'Nog geen mijlpalen' : `${done} van ${total} mijlpalen`}
        </Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 5 },
  spoor: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: '100%', borderRadius: radius.pill },
});
