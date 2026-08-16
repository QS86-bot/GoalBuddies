import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { radius, useTheme } from '../theme';

import { initialen } from './naming';

/**
 * Een avatar die altijd iets laat zien.
 *
 * ⚠️ Leerpunt uit de Habit Huddle-analyse: een kapotte of ontbrekende afbeelding
 *    mag nooit een leeg vlak of een gebroken-plaatje-icoon opleveren. Dat maakt
 *    een groepsoverzicht rommelig en laat het lijken alsof er iets stuk is.
 *
 *    Deze component valt daarom terug op nette initialen — óók als de URL er is
 *    maar de afbeelding niet laadt. Dat tweede geval is het geval dat mensen
 *    vergeten: je test met een werkende URL en ziet het probleem nooit.
 */

interface Props {
  readonly name: string;
  readonly url?: string | null | undefined;
  readonly size?: number;
}

export function Avatar({ name, url, size = 34 }: Props) {
  const theme = useTheme();
  const [mislukt, setMislukt] = useState(false);

  const rond = {
    width: size,
    height: size,
    borderRadius: radius.pill,
  };

  if (url && !mislukt) {
    return (
      <Image
        source={{ uri: url }}
        style={[rond, { backgroundColor: theme.colors.panelDark }]}
        onError={() => setMislukt(true)}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      style={[rond, styles.initialen, { backgroundColor: theme.colors.panelDark }]}
      accessibilityLabel={name}
    >
      <Text style={[styles.letters, { color: theme.colors.textSecondary, fontSize: size * 0.4 }]}>
        {initialen(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initialen: { alignItems: 'center', justifyContent: 'center' },
  letters: { fontWeight: '700' },
});
