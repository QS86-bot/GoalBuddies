import { View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Sleutel } from '@/shared/i18n';
import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { AsyncView, Body, Caption, Card, Subheading } from '@/shared/ui';

import { BelofteMaken } from './BelofteMaken';
import { BestaandeBelofte } from './BestaandeBelofte';
import { useBelofte, type Beloftegegevens } from './useBelofte';

/**
 * Het beloftescherm van één doel — QS8-761 (x.4 van de poort QS8-744).
 *
 * ⚠️ **Leeg betekent: geen getuige, of geen doel. En leeg heeft geen
 *    verzendknop** (criterium 1), alleen de weg naar je groepen. Een lopende
 *    belofte is nooit leeg, ook als de groep intussen weg is: intrekken moet
 *    kunnen tot ze in werking gaat (`belofteaanbod()`).
 */
export function Beloftescherm({ goalId }: { readonly goalId: string }) {
  const router = useRouter();
  const { afstand } = useTheme();
  const { data, loading, error, herlaad } = useBelofte(goalId);
  const nietGevonden = data?.doelGevonden === false;

  return (
    <View style={{ gap: afstand.l }}>
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(d) => !d.doelGevonden || d.aanbod.soort === 'geen_getuige'}
        onRetry={herlaad}
        empty={
          nietGevonden
            ? { title: t('belofte.niet_gevonden_titel'), body: t('belofte.niet_gevonden') }
            : {
                title: t('belofte.geen_getuige_titel'),
                body: t('belofte.geen_getuige'),
                action: { label: t('straf.naar_groepen'), onPress: () => router.push('/(tabs)/groep') },
              }
        }
      >
        {(d) => <Inhoud d={d} goalId={goalId} onKlaar={herlaad} />}
      </AsyncView>
    </View>
  );
}

/** De uitleg bij een aanbod dat de database zou weigeren: uitleg en geen knop. */
const UITLEG: Readonly<Record<string, Sleutel>> = {
  doel_niet_actief: 'belofte.doel_niet_actief',
  datum_voorbij: 'belofte.datum_voorbij',
  doelstraf: 'belofte.doelstraf',
};

function Inhoud({
  d,
  goalId,
  onKlaar,
}: {
  readonly d: Beloftegegevens;
  readonly goalId: string;
  readonly onKlaar: () => void;
}) {
  const { aanbod } = d;
  if (aanbod.soort === 'loopt' || aanbod.soort === 'deze_week_al') {
    return <BestaandeBelofte belofte={aanbod.belofte} klok={d.klok} onKlaar={onKlaar} />;
  }
  if (aanbod.soort === 'kan') {
    return <BelofteMaken goalId={goalId} lijsten={d.lijsten} klok={d.klok} onKlaar={onKlaar} />;
  }
  const sleutel = UITLEG[aanbod.soort];
  return (
    <Card nested>
      <Subheading>{t('belofte.titel')}</Subheading>
      {sleutel === undefined ? <Caption>{t('belofte.fout.laden')}</Caption> : <Body muted>{t(sleutel)}</Body>}
    </Card>
  );
}
