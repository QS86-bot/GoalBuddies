import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@/shared/i18n';
import { space, useTheme } from '@/shared/theme';
import { Body, Button, Card, FloorCeiling, Screen, Subheading } from '@/shared/ui';

/**
 * De uitleg vóór het eerste doel — QS8-26.
 *
 * Vier schermen, altijd over te slaan. Wie doorklikt heeft binnen twee minuten
 * een doel; wie leest snapt de vloer.
 *
 * ⚠️ Scherm 3 is de reden dat deze uitleg bestaat. Vloer en plafond zijn het
 *    minst voor de hand liggende idee in de app, en het enige dat je echt moet
 *    uitleggen. Daarom staat er een échte component en geen plaatje: je ziet
 *    meteen wat je straks te zien krijgt.
 */

interface Stap {
  readonly kop: string;
  readonly tekst: readonly string[];
}

/**
 * De vier stappen.
 *
 * ⚠️ **Een functie en geen constante**, en dat is de eerste valkuil van QS8-115.
 *    Een module-constante met `t()` erin wordt één keer opgebouwd bij het
 *    ímporteren van deze module — vóórdat het profiel geladen is en dus vóórdat
 *    de taal bekend is. Iemand met Engels ingesteld kreeg dan een Nederlandse
 *    onboarding tot hij de app herstartte, zonder dat er iets aan te zien is.
 */
function stappen(): readonly Stap[] {
  return [
    {
      kop: t('onboarding.stap1.kop'),
      tekst: [t('onboarding.stap1.a'), t('onboarding.stap1.b')],
    },
    {
      kop: t('onboarding.stap2.kop'),
      tekst: [t('onboarding.stap2.a'), t('onboarding.stap2.b')],
    },
    {
      kop: t('onboarding.stap3.kop'),
      tekst: [t('onboarding.stap3.a'), t('onboarding.stap3.b'), t('onboarding.stap3.c')],
    },
    {
      kop: t('onboarding.stap4.kop'),
      tekst: [t('onboarding.stap4.a'), t('onboarding.stap4.b')],
    },
  ];
}

export default function Uitleg() {
  const router = useRouter();
  const theme = useTheme();
  const [stap, setStap] = useState(0);

  // ⚠️ Bij elke render opnieuw opgebouwd, en dat is geen verspilling maar de
  //    hele reden dat `stappen()` een functie is: zo volgt de tekst de taal.
  const alle = stappen();
  const huidig = alle[stap];
  const laatste = stap === alle.length - 1;

  function verder() {
    if (laatste) router.replace('/onboarding/profiel');
    else setStap((n) => n + 1);
  }

  return (
    <Screen
      title={huidig?.kop ?? ''}
      eyebrow={t('onboarding.stap_van', { nu: stap + 1, totaal: alle.length })}
    >
      <View style={styles.balk} accessibilityRole="progressbar">
        {alle.map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i <= stap ? theme.colors.accent : theme.colors.panelDark },
            ]}
          />
        ))}
      </View>

      <Card>
        {(huidig?.tekst ?? []).map((regel) => (
          <Body key={regel} muted>
            {regel}
          </Body>
        ))}

        {stap === 2 ? (
          <View style={styles.voorbeeld}>
            <Subheading>{t('onboarding.zo_ziet_eruit')}</Subheading>
            <FloorCeiling
              title={t('onboarding.voorbeeld_titel')}
              floorText={t('onboarding.voorbeeld_vloer')}
              ceilingText={t('onboarding.voorbeeld_plafond')}
              status="approved"
              achieved="floor"
              viewer="owner"
            />
          </View>
        ) : null}
      </Card>

      <View style={styles.knoppen}>
        <Button variant="primair" onPress={verder}>
          {laatste ? t('onboarding.aan_de_slag') : t('onboarding.verder')}
        </Button>
        <Button variant="stil" onPress={() => router.replace('/onboarding/profiel')}>
          {t('onboarding.overslaan')}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balk: { flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  voorbeeld: { gap: 7, paddingTop: space.blokGap - 4 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
