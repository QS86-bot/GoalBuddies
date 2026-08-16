import { StyleSheet, View } from 'react-native';

import { space, useThemePreference, type ThemePreference } from '@/shared/theme';
import { Body, Button, Caption, Card, Screen, StreakCounter, Subheading } from '@/shared/ui';

/**
 * Profiel — reeks, punten, weekpassen en instellingen.
 *
 * ⚠️ Dit is de enige plek waar punten mogen staan. `points_ledger` en het
 *    puntentotaal zijn uitsluitend voor de eigenaar leesbaar (domeinregel 10):
 *    een dalend totaal is zichtbaar bewijs van een gemiste week, en dat botst
 *    met domeinregel 7. De groep ziet De Ketting en mijlpalen, nooit dit scherm.
 */
export default function Profiel() {
  return (
    <Screen title="Profiel">
      <Card>
        <Subheading>Jouw reeks</Subheading>
        <StreakCounter cycles={0} />
        <Caption>
          Zodra je eerste week telt, begint hij hier te lopen. Een weekpas
          beschermt je reeks als je een week mist — het punt niet, want anders
          zegt de score niets meer.
        </Caption>
      </Card>

      <ThemaKeuze />

      <Card nested>
        <Subheading>Week-startdag</Subheading>
        <Body muted>
          Bepaalt wanneer jouw week begint en wanneer je punten tellen. Losstaand
          van de huddledag van je groep. Instelbaar zodra je een account hebt.
        </Body>
      </Card>
    </Screen>
  );
}

const OPTIES: readonly { readonly waarde: ThemePreference; readonly label: string }[] = [
  { waarde: 'systeem', label: 'Systeem' },
  { waarde: 'navy', label: 'Donker' },
  { waarde: 'navy-licht', label: 'Licht' },
];

function ThemaKeuze() {
  const { preference, setPreference, ready } = useThemePreference();

  return (
    <Card>
      <Subheading>Weergave</Subheading>
      <Body muted>
        Donker is de standaard van dit stelsel. Kies je Systeem, dan volgt de app
        de instelling van je toestel — ook als die &apos;s avonds omschakelt.
      </Body>

      <View style={styles.keuzes}>
        {OPTIES.map(({ waarde, label }) => (
          <Button
            key={waarde}
            variant={preference === waarde ? 'primair' : 'secundair'}
            disabled={!ready}
            onPress={() => setPreference(waarde)}
            accessibilityLabel={`Weergave: ${label}`}
          >
            {label}
          </Button>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
