import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '../theme';

import { Eyebrow, Heading } from './Text';

/**
 * De buitenrand van elk scherm: achtergrond, veilige zone en de kop.
 *
 * ⚠️ Op één plek, zodat een scherm niet zelf hoeft te bedenken hoeveel ruimte er
 *    onder een notch hoort. Doet elk scherm dat zelf, dan staat het op de ene
 *    telefoon goed en op de andere onder de statusbalk.
 */

interface Props {
  readonly title: string;
  /** Klein kapitaal boven de titel. Bijvoorbeeld de lopende cyclus. */
  readonly eyebrow?: string | undefined;
  readonly children: React.ReactNode;
  /** Uit voor schermen die zelf scrollen, zoals een chat met omgekeerde lijst. */
  readonly scroll?: boolean;
}

export function Screen({ title, eyebrow, children, scroll = true }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // ⚠️ `flex: 1` erbij zodra het scherm níét scrollt, en alleen dan. Dit blok is
  //    dan de enige hoogtehouder, en een View zonder flex krimpt in React Native
  //    naar zijn inhoud — waardoor een lijst die zelf scrollt (de groepschat,
  //    QS8-69) nul hoogte krijgt en er letterlijk niets te zien is. In de
  //    scroll-variant moet het juist niet flexen: daar bepaalt de inhoud de hoogte
  //    en doet de ScrollView de rest.
  const inhoud = (
    <View style={[styles.inhoud, scroll ? null : styles.vult]}>
      <View style={styles.kop}>
        {eyebrow === undefined ? null : <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading>{title}</Heading>
      </View>
      {children}
    </View>
  );

  const buiten = [
    styles.scherm,
    { backgroundColor: theme.colors.bg, paddingTop: insets.top + space.shell },
  ];

  if (!scroll) {
    return <View style={buiten}>{inhoud}</View>;
  }

  return (
    <ScrollView
      style={buiten}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.shell * 3 }}
      // Op web is dit de enige manier om een tik buiten een invoerveld het
      // toetsenbord te laten sluiten zonder dat knoppen twee tikken nodig hebben.
      keyboardShouldPersistTaps="handled"
    >
      {inhoud}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scherm: { flex: 1 },
  vult: { flex: 1 },
  inhoud: {
    paddingHorizontal: space.shell,
    gap: space.blokGap + 3,
    // De app is een leesapp op een telefoon, maar draait ook op een breed
    // scherm. Zonder deze grens worden regels op een monitor onleesbaar lang.
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  kop: { gap: 3, paddingBottom: 2 },
});
