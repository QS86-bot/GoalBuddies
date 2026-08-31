import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { Eyebrow, Heading } from './Text';

/**
 * De buitenrand van elk scherm: achtergrond, veilige zone en de kop.
 *
 * ⚠️ Op één plek, zodat een scherm niet zelf hoeft te bedenken hoeveel ruimte er
 *    onder een notch hoort. Doet elk scherm dat zelf, dan staat het op de ene
 *    telefoon goed en op de andere onder de statusbalk.
 */

/**
 * Waar de terugknop van dit scherm heen gaat — QS8-211.
 *
 * ⚠️ **`naar` is verplicht, en dat is de hele reparatie.** Een terugknop die
 *    alleen `router.back()` doet, is op web een dode knop zodra iemand de URL
 *    rechtstreeks opvraagt — en dat kán, want `scripts/deploy-web.mjs` schrijft
 *    juist een `.htaccess` die elke diepe route naar de app stuurt. Een
 *    verplichte bestemming maakt de lege-geschiedenistoestand onmogelijk in
 *    plaats van onwaarschijnlijk.
 */
export interface Terug {
  /** De bestemming als er geen geschiedenis is om op terug te vallen. */
  readonly naar: Href;
  /** Alleen zetten als "Terug" hier te weinig zegt; wordt het schermlezerlabel. */
  readonly label?: string | undefined;
}

interface Props {
  readonly title: string;
  /** Klein kapitaal boven de titel. Bijvoorbeeld de lopende cyclus. */
  readonly eyebrow?: string | undefined;
  readonly children: React.ReactNode;
  /** Uit voor schermen die zelf scrollen, zoals een chat met omgekeerde lijst. */
  readonly scroll?: boolean;
  /**
   * De terugmogelijkheid van dit scherm — QS8-211.
   *
   * ⚠️ **Weglaten mag alleen als de gebruiker hier niet vandaan hóórt te kunnen.**
   *    Dat zijn de vier tabbladen en het aanmeldscherm; alles daarbuiten zit
   *    zonder deze prop vast. `scripts/uitgang-controle.mjs` bewaakt dat.
   */
  readonly terug?: Terug | undefined;
}

/**
 * Teruggaan, met een bestemming voor als dat niet kan — QS8-211.
 *
 * ⚠️ `canGoBack()` en niet blind `back()`. Op native is de geschiedenis nooit
 *    leeg als je ergens vandaan komt, maar op web is elke route rechtstreeks op
 *    te vragen — vanuit een uitnodigingslink, een bladwijzer of een melding, en
 *    `scripts/deploy-web.mjs` schrijft juist een `.htaccess` die dat mogelijk
 *    maakt. `back()` doet dan niets, en een knop die niets doet is erger dan
 *    geen knop: de gebruiker denkt dat de app hangt.
 *
 * ⚠️ **Geëxporteerd, want een scherm dat zijn eigen "annuleren" tekent moet
 *    dezelfde afweging maken.** Zes schermen deden `router.back()` kaal, en die
 *    zes waren op web precies zo dood als de schermen zónder knop. Eén hook
 *    zodat de volgende schrijver de val niet opnieuw hoeft te vinden.
 */
export function useTerug(naar: Href): () => void {
  const router = useRouter();

  return () => {
    if (router.canGoBack()) router.back();
    else router.replace(naar);
  };
}

/** De terugknop in de kop van elk scherm buiten de tabbladen. */
function TerugKnop({ naar, label }: Terug) {
  const theme = useTheme();
  const terug = useTerug(naar);
  const [heeftFocus, setFocus] = useState(false);

  return (
    <Pressable
      onPress={terug}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('nav.terug')}
      hitSlop={space.shell}
      style={({ pressed }) => [
        styles.terug,
        { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
        focusRing(theme, heeftFocus),
      ]}
    >
      <Text style={[styles.terugTekst, { color: theme.colors.textSecondary }]}>
        {`\u2190  ${label ?? t('nav.terug')}`}
      </Text>
    </Pressable>
  );
}

export function Screen({ title, eyebrow, children, scroll = true, terug }: Props) {
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
        {terug === undefined ? null : <TerugKnop {...terug} />}
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
  terug: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: space.blokGap,
    // ⚠️ Ruimte eronder, niet erboven: de kop heeft al `paddingTop` van de
    //    veilige zone, en een marge erboven duwt de knop onder een notch vandaan
    //    op het ene toestel en er middenin op het andere.
    marginBottom: space.blokGap,
  },
  terugTekst: { fontSize: 14, fontWeight: '600' },
});
