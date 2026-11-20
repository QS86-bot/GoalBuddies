import { StyleSheet } from 'react-native';

import { space } from '@/shared/theme';

export const stijlen = StyleSheet.create({
  knoppen: { gap: space.blokGap - 4 },
  gebieden: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 5 },
  valkuil: { gap: 4 },
  held: { gap: 4 },
  heldkaart: { gap: 2 },
  regel: { gap: 2 },
  helpt: { gap: 4 },
  gevoelen: { gap: space.blokGap - 5 },
});
