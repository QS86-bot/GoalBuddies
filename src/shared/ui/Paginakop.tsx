import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getal, t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { streakLabel } from './metrics';
import { streepProcent, type Voortgang } from './paginakop-vorm';
import { Caption, Eyebrow, Heading } from './Text';

/**
 * De kop van een hoofdscherm: titel, een dunne voortgangsstreep eronder en
 * rechts de eigen reeks en de meldingen — QS8-726.
 *
 * ⚠️⚠️ **Er is geen prop voor de reeks van een ander, en dat is het ontwerp.**
 *    `reeks` is een getal dat de aanroeper uit de eigen standen haalt. Domeinregel
 *    7: een reeks van een ander zien groepsleden alleen waar A15 dat toelaat, en
 *    dat is een ander oppervlak met een eigen RLS-pad — niet de kop van het
 *    scherm. Een kop die een `userId` of een lid aannam, was een opening die de
 *    volgende schrijver vult.
 *
 * ⚠️⚠️ **`voortgang` is een `Voortgang` en geen `number`**, zie `paginakop-vorm.ts`.
 *    Er is geen punten-prop; een score hoort niet in dezelfde balk (domeinregel 10).
 *
 * ⚠️ `Screen` tekent zelf geen titel zodra dit component meegegeven is, zodat er
 *    nooit twee kopjes staan. De rol `header` zit in `Heading`.
 */
export interface Paginameldingen {
  /** Hoeveel er wachten. Alleen positieve signalen horen hier te tellen. */
  readonly aantal: number;
  readonly onOpen: () => void;
}

interface Props {
  readonly titel: string;
  readonly eyebrow?: string | undefined;
  readonly voortgang?: Voortgang | undefined;
  /** De eigen reeks, in weken. `undefined` of `null`: niets tonen. */
  readonly reeks?: number | null | undefined;
  readonly meldingen?: Paginameldingen | undefined;
}

export function Paginakop({ titel, eyebrow, voortgang, reeks, meldingen }: Props) {
  const heeftRechts = (reeks !== undefined && reeks !== null) || meldingen !== undefined;

  return (
    <View style={styles.kop}>
      <View style={styles.rij}>
        <View style={styles.titel}>
          {eyebrow === undefined ? null : <Eyebrow>{eyebrow}</Eyebrow>}
          <Heading>{titel}</Heading>
        </View>
        {heeftRechts ? (
          <View style={styles.rechts}>
            {reeks === undefined || reeks === null ? null : <Caption>{streakLabel(reeks)}</Caption>}
            {meldingen === undefined ? null : <MeldingenKnop {...meldingen} />}
          </View>
        ) : null}
      </View>
      {voortgang === undefined ? null : <Streep voortgang={voortgang} />}
    </View>
  );
}

function Streep({ voortgang }: { readonly voortgang: Voortgang }) {
  const theme = useTheme();
  const procent = streepProcent(voortgang);

  return (
    <View
      style={[styles.spoor, { backgroundColor: theme.colors.border }]}
      accessibilityRole="progressbar"
      accessibilityLabel={t('paginakop.voortgang')}
      accessibilityValue={{ min: 0, max: 100, now: procent }}
    >
      <View style={[styles.vulling, { width: `${procent}%`, backgroundColor: theme.roles.progress }]} />
    </View>
  );
}

function MeldingenKnop({ aantal, onOpen }: Paginameldingen) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('paginakop.meldingen', { aantal: getal(aantal, 0) })}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      hitSlop={space.blokGap}
      style={({ pressed }) => [
        styles.knop,
        { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
        focusRing(theme, heeftFocus),
      ]}
    >
      <Caption muted={false}>{t('paginakop.meldingen_knop', { aantal: getal(aantal, 0) })}</Caption>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kop: { gap: space.blokGap - 3, paddingBottom: 2 },
  rij: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.blokGap },
  titel: { flex: 1, gap: 3 },
  rechts: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap },
  spoor: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: 4, borderRadius: radius.pill },
  knop: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: space.blokGap,
  },
});
