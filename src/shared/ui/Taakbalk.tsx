import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t, type Sleutel } from '../i18n';
import { space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { actiefTabblad, TABBLADEN, toontTaakbalk } from './taakbalk';

/**
 * De taakbalk, op élk scherm dat er een hoort te hebben — QS8-437.
 *
 * ⚠️ **Dit is de énige tabbalk in de app.** De navigator in
 *    `app/(tabs)/_layout.tsx` tekent zijn eigen balk sinds dit issue niet meer
 *    (`tabBar={() => null}`). Zouden ze allebei tekenen, dan zijn er twee
 *    componenten die er hetzelfde uit moeten zien en is de vraag "waar ben ik"
 *    op twee plekken beantwoord — precies het bezwaar dat het issue tegen deze
 *    vorm opwierp. Eén component en één bron (de router) haalt dat bezwaar weg.
 *
 * ⚠️ **Geen navigator-eigenschap maar een `Link`.** Dat is wat dit betaalbaar
 *    maakt: geen enkele route verhuist, dus geen enkele belofte die aan een
 *    bestandsplek hing raakt los. Regel 18 noemt een verhuizing de gevaarlijkste
 *    beweging die er is, en hier is er geen.
 *
 * ⚠️ **`replace` en niet `push`.** De vijf tabbladen zijn bestemmingen en geen
 *    stappen; met `push` groeit de geschiedenis bij elke tik en wordt de
 *    terugknop van de browser een lijst van tabbladen in plaats van de weg terug.
 *
 * ⚠️ **Hij scrollt liever dan af te kappen.** Vijf labels is krap — dat staat al
 *    als gemeten afweging in de kop van de navigator — en sinds dit issue staat
 *    de balk óók op smalle schermen die hem eerst niet hadden.
 */
export function Taakbalk() {
  const theme = useTheme();
  const pad = usePathname();

  if (!toontTaakbalk(pad)) return null;
  const actief = actiefTabblad(pad);

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.balk,
        { backgroundColor: theme.colors.panel, borderBottomColor: theme.colors.border },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rij}>
        {TABBLADEN.map((tab) => (
          <Tab key={tab.pad} pad={tab.pad} sleutel={tab.sleutel} actief={tab.pad === actief} />
        ))}
      </ScrollView>
    </View>
  );
}

interface TabProps {
  readonly pad: string;
  readonly sleutel: Sleutel;
  readonly actief: boolean;
}

/**
 * ⚠️ **`accessibilityState` en niet alleen een kleur.** Het actieve tabblad is
 *    voor een ziend oog goud en voor een schermlezer niets, tenzij de stand er
 *    met zoveel woorden bij staat. Kleur is nooit de enige drager.
 */
function Tab({ pad, sleutel, actief }: TabProps) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);

  return (
    <Link href={pad} replace asChild>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: actief }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={({ pressed }) => [
          styles.tab,
          { opacity: pressed ? 0.6 : 1 },
          focusRing(theme, heeftFocus),
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: actief ? theme.colors.accent : theme.colors.grey },
          ]}
        >
          {t(sleutel)}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  balk: { borderBottomWidth: StyleSheet.hairlineWidth },
  rij: { flexDirection: 'row', alignItems: 'center' },
  tab: { paddingVertical: 10, paddingHorizontal: space.blokGap },
  label: { fontSize: 12, fontWeight: '600' },
});
