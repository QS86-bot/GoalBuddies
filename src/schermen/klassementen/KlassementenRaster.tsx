import { StyleSheet, View } from 'react-native';

import type { Klassementkaart } from '@/modules/buddies';
import { space } from '@/shared/theme';

import { KlassementKaart } from './KlassementKaart';

/**
 * De kaarten onder elkaar of in kolommen — QS8-666 (A57b), 3c-ui. Het aantal kolommen komt van buiten (`kolommenVoor()`): één breekpunt voor de
 * hele app, dat van de taakbalk, en geen eigen breedtegetal hier.
 */
export function KlassementenRaster({
  kaarten,
  kolommen,
  onAlleLeden,
}: {
  readonly kaarten: readonly Klassementkaart[];
  readonly kolommen: 1 | 2 | 3;
  readonly onAlleLeden: (groupId: string) => void;
}) {
  const breedte = `${100 / kolommen}%` as const;
  return (
    <View style={styles.raster}>
      {kaarten.map((kaart) => (
        <View key={kaart.groupId} style={[styles.cel, { width: breedte }]}>
          <KlassementKaart kaart={kaart} onAlleLeden={onAlleLeden} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  raster: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.blokGap / 2 },
  cel: { paddingHorizontal: space.blokGap / 2, paddingBottom: space.blokGap },
});
