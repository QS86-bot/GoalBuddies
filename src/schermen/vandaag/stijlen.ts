import { StyleSheet } from 'react-native';

import { space } from '@/shared/theme';

export const styles = StyleSheet.create({
  afvinken: { gap: 6, marginTop: 8 },
  lijst: { gap: space.blokGap },
  standen: { gap: space.blokGap + 3 },
  afrond: { gap: space.blokGap - 3, paddingTop: space.blokGap - 4 },
  kop: { gap: 2 },
  toevoegen: { gap: space.blokGap - 5 },
  // `wrap` omdat er nu drie knoppen naast elkaar kunnen staan; op een smalle
  // telefoon vallen ze anders buiten beeld in plaats van door te lopen.
  knoppen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.blokGap - 3,
    alignItems: 'center',
  },
  zetten: { gap: space.blokGap - 4, paddingTop: space.blokGap - 4 },
  zet: { gap: 2 },
});
