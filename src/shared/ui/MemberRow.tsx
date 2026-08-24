import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { initiaalVan } from '../tekst';
import { radius, space, useTheme } from '../theme';

import { StreakCounter } from './StreakCounter';
import { Body, Caption } from './Text';

/**
 * Eén lid in het groepsoverzicht.
 *
 * ⚠️ Deze rij is de gevaarlijkste plek in de app voor domeinregel 7. Alles wat
 *    hier zichtbaar is, is zichtbaar over iemand ánders. Daarom draagt hij
 *    uitsluitend positieve signalen: de reeks (opdagen) en of er deze periode
 *    iets is afgerond. Nooit een gemiste week, nooit een puntentotaal, nooit
 *    "loopt achter".
 *
 *    Een rij zonder vinkje betekent hier "nog niets binnen deze periode" en niet
 *    "deze persoon faalt" — en de tekst moet dat ook zeggen.
 */

interface Props {
  readonly name: string;
  /** Cycli op rij. Komt uit `group_visible_streaks`, nooit uit `user_streaks`. */
  readonly streak: number;
  /** Heeft dit lid deze groepsperiode iets afgerond? */
  readonly closedThisPeriod: boolean;
  /** Loopt er een aangekondigde adempauze? Neutraal, geen tegenslag. */
  readonly onBreather?: boolean;
}

export function MemberRow({ name, streak, closedThisPeriod, onBreather = false }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.rij}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.panelDark }]}>
        <Caption muted={false}>{initiaalVan(name)}</Caption>
      </View>

      <View style={styles.midden}>
        <Body>{name}</Body>
        <StreakCounter cycles={streak} compact />
      </View>

      {onBreather ? (
        <Caption>{t('lid.adempauze')}</Caption>
      ) : closedThisPeriod ? (
        <View style={[styles.vinkje, { backgroundColor: theme.roles.progress }]} />
      ) : (
        // Bewust niets. Geen grijs kruisje, geen "nog niet": een leeg vak zegt
        // al genoeg en beschuldigt niemand.
        <View style={styles.vinkje} />
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  rij: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: space.rij.paddingVertical + 3,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  midden: { flex: 1, gap: 3 },
  vinkje: { width: 10, height: 10, borderRadius: radius.pill },
});
