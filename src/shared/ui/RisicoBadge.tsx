import { StyleSheet, Text, View } from 'react-native';

import { radius, space, useTheme, type Theme } from '../theme';

import { risicoLabel, risicoTeken, risicoToon, type RisicoStand } from './risico';
import { Caption } from './Text';

/**
 * De stand van de Risico-radar — QS8-94.
 *
 * ⚠️ **Uitsluitend voor de eigenaar.** Er is met opzet géén `viewer`-prop zoals
 *    bij `FloorCeiling`: dit component hoort niet op een groepsscherm te staan,
 *    en een prop zou suggereren dat er een stand is waarin dat wel mag. De
 *    database dekt het af (`goal_risk` is eigenaar-only sinds migratie 0050);
 *    dit is de tweede grendel, in de vorm van "de vraag kan niet gesteld
 *    worden".
 *
 * ⚠️ Vorm én kleur dragen de betekenis. Het teken vóór het label verschilt per
 *    stand, zodat de vier standen ook zonder kleurwaarneming uit elkaar te
 *    houden zijn.
 */
interface Props {
  readonly stand: RisicoStand;
  /** De uitleg eronder. Weglaten op een kaart in een lijst. */
  readonly uitleg?: string | undefined;
}

function kleurVoor(theme: Theme, stand: RisicoStand): string {
  const toon = risicoToon(stand);
  switch (toon) {
    case 'progress':
      return theme.roles.progress;
    case 'pending':
      return theme.roles.pending;
    case 'atRisk':
      // ⚠️ De enige plek in de app waar rood gebruikt wordt. Zie tokens.ts:
      //    nooit voor een gemiste week, uitsluitend voor deadline-risico.
      return theme.roles.atRisk;
    case 'neutral':
      return theme.colors.grey;
  }
}

export function RisicoBadge({ stand, uitleg }: Props) {
  const theme = useTheme();
  const kleur = kleurVoor(theme, stand);
  const label = risicoLabel(stand);

  return (
    <View style={styles.blok}>
      <View
        style={[styles.badge, { borderColor: kleur, backgroundColor: theme.colors.panelDark }]}
        accessibilityRole="text"
        // Het teken is decoratief zodra het label er staat; een schermlezer die
        // "zwarte driehoek deadline onhaalbaar" voorleest, helpt niemand.
        accessibilityLabel={`Status: ${label}`}
      >
        <Text style={[styles.teken, { color: kleur }]} accessibilityElementsHidden>
          {risicoTeken(stand)}
        </Text>
        <Text style={[styles.label, { color: kleur }]}>{label}</Text>
      </View>

      {uitleg === undefined ? null : <Caption>{uitleg}</Caption>}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.base,
    paddingVertical: space.cel.paddingVertical - 2,
    paddingHorizontal: space.cel.paddingHorizontal,
  },
  teken: { fontSize: 12 },
  label: { fontSize: 13, fontWeight: '600' },
});
