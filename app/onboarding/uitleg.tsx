import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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

const STAPPEN: readonly Stap[] = [
  {
    kop: 'Eén doel, met een datum erop',
    tekst: [
      'Je begint met één doel dat af moet zijn op een dag die jij kiest. Niet vijf doelen — één.',
      'De Doelcoach hakt het daarna in mijlpalen, en die mijlpalen worden je weekdoelen.',
    ],
  },
  {
    kop: 'De week is de eenheid',
    tekst: [
      'Elke week bepaal je wat je af wilt hebben. Aan het eind van je week vink je af wat gelukt is.',
      'Jouw week begint op de dag die jij kiest. Niet iedereen leeft van maandag tot zondag.',
    ],
  },
  {
    kop: 'Een vloer en een plafond',
    tekst: [
      'Het plafond is wat je wilt halen. De vloer is de versie die je op je slechtste week nóg haalt.',
      'De vloer halen telt: je reeks loopt door en je buddy keurt hem net zo goed. Alleen de punten verschillen.',
      'Dit is het idee waar de app om draait. Je reeks hoort jou te dienen, niet andersom.',
    ],
  },
  {
    kop: 'Een buddy keurt het goed',
    tekst: [
      'Iemand uit je groep bevestigt dat het gelukt is. Jezelf goedkeuren kan niet.',
      'Een week missen kost je één punt en verder niets. Niemand in je groep ziet het.',
    ],
  },
];

export default function Uitleg() {
  const router = useRouter();
  const theme = useTheme();
  const [stap, setStap] = useState(0);

  const huidig = STAPPEN[stap];
  const laatste = stap === STAPPEN.length - 1;

  function verder() {
    if (laatste) router.replace('/onboarding/profiel');
    else setStap((n) => n + 1);
  }

  return (
    <Screen title={huidig?.kop ?? ''} eyebrow={`STAP ${stap + 1} VAN ${STAPPEN.length}`}>
      <View style={styles.balk} accessibilityRole="progressbar">
        {STAPPEN.map((_, i) => (
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
            <Subheading>Zo ziet dat eruit</Subheading>
            <FloorCeiling
              title="Drie keer hardlopen"
              floorText="Eén keer, al is het twintig minuten"
              ceilingText="Drie keer, minstens vijf kilometer"
              status="approved"
              achieved="floor"
              viewer="owner"
            />
          </View>
        ) : null}
      </Card>

      <View style={styles.knoppen}>
        <Button variant="primair" onPress={verder}>
          {laatste ? 'Aan de slag' : 'Verder'}
        </Button>
        <Button variant="stil" onPress={() => router.replace('/onboarding/profiel')}>
          Overslaan
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
