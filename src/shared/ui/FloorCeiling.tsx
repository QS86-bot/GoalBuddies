import { Platform, StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { radius, space, useTheme, type Theme } from '../theme';

import { useReducedMotion } from './a11y';
import { FLOOR_MARK, rangeState, type Achieved, type Tone, type Viewer, type WeeklyGoalStatus } from './metrics';
import { Body, Caption } from './Text';

/**
 * Vloer en plafond als één bereik.
 *
 * ⚠️ Dit is het meest eigen visuele idee van de app en het moet één ding blijven,
 *    geen twee losse taken. "Drie keer sporten, en vier als het lukt" is één
 *    voornemen met een ondergrens en een bovengrens. Zet je het als twee vinkjes
 *    neer, dan voelt de vloer als de mislukte versie van het plafond — precies
 *    het tegenovergestelde van waar hij voor bedoeld is.
 *
 * De vloer dient de gebruiker, nooit andersom (domeinregel 8).
 */

interface Props {
  readonly title: string;
  // Uit de database komt hier null en geen undefined; allebei betekenen 'niet
  // ingevuld', en het scherm hoeft dat verschil niet te kennen.
  readonly floorText?: string | null | undefined;
  readonly ceilingText?: string | null | undefined;
  readonly status: WeeklyGoalStatus;
  readonly achieved: Achieved;
  /** Wie kijkt er mee. Bepaalt wat er getoond mág worden (domeinregel 7). */
  readonly viewer: Viewer;
}

function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'progress':
      return theme.roles.progress;
    case 'pending':
      return theme.roles.pending;
    case 'neutral':
      return theme.colors.grey;
  }
}

export function FloorCeiling({
  title,
  floorText,
  ceilingText,
  status,
  achieved,
  viewer,
}: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  const hasFloor = Boolean(floorText);
  const state = rangeState({ status, achieved, hasFloor, viewer });

  // ⚠️ Niets renderen, niet "leeg renderen". Een lege plek naast drie gevulde
  //    plekken is óók een mededeling over iemands week.
  if (state.hidden) return null;

  const kleur = toneColor(theme, state.tone);

  return (
    <View
      style={styles.blok}
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${state.label}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(state.fill * 100) }}
    >
      <Body>{title}</Body>

      <View style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}>
        <View
          style={[
            styles.vulling,
            {
              backgroundColor: kleur,
              width: `${state.fill * 100}%`,
              // Zonder beweging blijft de balk staan waar hij hoort; met beweging
              // groeit hij. Dat verschil zit in de duur, niet in de eindstand.
              ...(reduced || Platform.OS !== 'web' ? {} : { transitionDuration: '220ms' }),
            },
          ]}
        />

        {/*
          De vloermarkering staat alleen op de balk als er een vloer ís. Zonder
          vloer kent het weekdoel maar twee uitkomsten en zou een streepje
          suggereren dat er een tussenstand bestaat die er niet is.
        */}
        {hasFloor ? (
          <View
            style={[styles.vloerstreep, { left: `${FLOOR_MARK * 100}%`, backgroundColor: theme.colors.border }]}
          />
        ) : null}
      </View>

      <View style={styles.regels}>
        {floorText ? <Caption>{t('weekdoel.vloer_regel', { tekst: floorText })}</Caption> : null}
        {ceilingText ? (
          <Caption>{t('weekdoel.plafond_regel', { tekst: ceilingText })}</Caption>
        ) : null}
      </View>

      <Caption muted={state.tone === 'neutral'}>{state.label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 6 },
  spoor: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  vulling: {
    height: '100%',
    borderRadius: radius.pill,
  },
  vloerstreep: {
    position: 'absolute',
    width: 2,
    height: '100%',
  },
  regels: { gap: 2, paddingTop: space.rij.paddingVertical - 3 },
});
