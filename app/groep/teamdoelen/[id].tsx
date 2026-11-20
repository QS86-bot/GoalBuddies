import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { fetchTeamdoelen, type Teamdoel } from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { AsyncView, Button, Caption, Card, Screen, useBladerlijst } from '@/shared/ui';

/**
 * De teamdoelen van een teamgroep — QS8-658.
 *
 * ⚠️ **Een lijst van titels en streefdatums, en verder niets.** Geen balk per rij
 *    en geen aandeel: de balk is één verzoek per teamdoel, en een lijst met een
 *    balk per rij is precies de N+1 die groepsoverzichten hier niet mogen hebben.
 *    De balk staat op het teamdoel zelf.
 *
 * ⚠️ **Geen streefdatum in de rij** (V15-A, besluit van Quinten, 20-11-2026). Een
 *    lijst met datums toont welke teamdoelen hun datum niet haalden, en in een klein
 *    team wijst dat naar wie. Het teamdoel zelf noemt de datum zolang hij nog komt
 *    (`datumregel()` in de module).
 *
 * ⚠️ Elk lid mag een teamdoel aanmaken (besluit 20); de server toetst het
 *    lidmaatschap, en een niet-lid krijgt hier een lege lijst.
 */
export default function Teamdoelen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const lijst = useBladerlijst((na) => fetchTeamdoelen(id, na), [id]);

  return (
    <Screen
      title={t('teamdoel.lijst_titel')}
      eyebrow={t('teamdoel.lijst_eyebrow')}
      terug={{ naar: `/groep/${id}` }}
    >
      <Button variant="primair" block onPress={() => router.push(`/teamdoel/nieuw?groep=${id}`)}>
        {t('teamdoel.aanmaken_knop')}
      </Button>
      <AsyncView
        loading={lijst.loading}
        error={lijst.error}
        data={lijst.rijen}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={lijst.herlaad}
        empty={{
          title: t('teamdoel.lijst_leeg_titel'),
          body: t('teamdoel.lijst_leeg_tekst'),
        }}
      >
        {(rijen) => (
          <View style={styles.lijst}>
            {rijen.map((doel) => (
              <Teamdoelrij key={doel.id} doel={doel} />
            ))}
            {lijst.heeftMeer ? (
              <View style={styles.lijst}>
                {lijst.meerFout ? <Caption danger>{t('teamdoel.meer_mislukt')}</Caption> : null}
                <Button
                  variant="secundair"
                  busy={lijst.bezig}
                  onPress={() => void lijst.laadMeer()}
                >
                  {t('teamdoel.meer_laden')}
                </Button>
              </View>
            ) : null}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

function Teamdoelrij({ doel }: { readonly doel: Teamdoel }) {
  const router = useRouter();

  return (
    <Card>
      <Button variant="stil" block onPress={() => router.push(`/teamdoel/${doel.id}`)}>
        {doel.titel}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
});
