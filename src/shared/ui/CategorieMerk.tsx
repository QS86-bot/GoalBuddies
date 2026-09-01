import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { radius, space, useTheme } from '../theme';

import { categoriemerk } from './categoriemerk';
import { Caption } from './Text';

/**
 * Het gebied van een doel als pictogram in de kleur van zijn familie — QS8-255.
 *
 * ⚠️ **Een pictogram is geen emoji in een label, en dat verschil is de hele
 *    reden dat dit een component is.** De emoji-regel uit QS8-111 blijft staan:
 *    geen emoji in app-tekst, want een schermlezer leest ze midden in een zin
 *    voor. Dit staat *naast* het label, in een eigen element, en `npm run
 *    emoji:controle` blijft daar groen bij.
 *
 * ⚠️ **Het pictogram is decoratief voor een schermlezer, het label is de
 *    informatie.** Vandaar `accessibilityElementsHidden` op het icoon: wie de
 *    app beluistert, hoort "Sport en beweging" en niet "hardlopen, Sport en
 *    beweging". De kleur draagt hier bovendien nooit iets dat niet ook in tekst
 *    staat — de familie is een groepering, geen status.
 *
 * ⚠️ **Drie gebieden hebben geen kleur en dat is zichtbaar met opzet.**
 *    `business`, `study` en `other` vallen buiten de drie families van A55; ze
 *    krijgen het pictogram in de neutrale kleur. Een vierde familiekleur
 *    verzinnen is precies wat `tokens.ts` verbiedt.
 */

interface Props {
  /** De categoriesleutel, bijvoorbeeld `fitness`. */
  readonly categorie: string;
  /** Het vertaalde label; dit component vertaalt niet zelf. */
  readonly label: string;
  /** Zonder label — voor een rij waar de tekst er al naast staat. */
  readonly alleenIcoon?: boolean;
}

export function CategorieMerk({ categorie, label, alleenIcoon = false }: Props) {
  const theme = useTheme();
  const { icoon, familie } = categoriemerk(categorie);
  const kleur = familie === null ? theme.roles.neutral : theme.families[familie];

  return (
    <View
      style={[styles.merk, { borderColor: kleur }]}
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <MaterialCommunityIcons
        name={icoon as never}
        size={13}
        color={kleur}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      {alleenIcoon ? null : <Caption>{label}</Caption>}
    </View>
  );
}

const styles = StyleSheet.create({
  merk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: space.cel.paddingHorizontal - 2,
  },
});
