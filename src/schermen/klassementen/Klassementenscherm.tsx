import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { AsyncView, Button, Caption, useTaakbalkVorm } from '@/shared/ui';

import { Filterchips } from './Filterchips';
import { KlassementenRaster } from './KlassementenRaster';
import { useKlassementen, type KlassementenBladzijde } from './useKlassementen';
import { kolommenVoor } from './weergave';

/**
 * Het scherm "Alle klassementen" — QS8-666 (A57b), 3c-ui, variant A: filterchips en een kaart per groep.
 *
 * ⚠️ **Het scherm verbergt niets op eigen gezag.** Een groep zonder klassement ontbreekt omdat de RPC hem niet geeft (de poort is `groep_klassement()`
 *    plus de schakelaar); wie hier een eigen filter op `klassement_aan` bijzet, maakt een tweede poort die kan afwijken.
 *
 * ⚠️ **Eén lege staat voor "geen groepen" en "geen klassementen"**, omdat de RPC die twee niet onderscheidt, en omdat een lid anders kan uitlezen of een groep
 *    een klassement heeft.
 */
export function Klassementenscherm({ laad }: { readonly laad: (na: string | null) => Promise<KlassementenBladzijde> }) {
  const router = useRouter();
  const { userId } = useSession();
  const lijst = useKlassementen(userId ?? '', laad);
  const vorm = useTaakbalkVorm();

  return (
    <AsyncView
      loading={lijst.loading}
      error={lijst.error}
      data={lijst.rijen === undefined ? undefined : lijst.kaarten}
      isEmpty={(kaarten) => kaarten.length === 0}
      onRetry={lijst.herlaad}
      empty={{
        title: t('klassementen.leeg_titel'),
        body: t('klassementen.leeg_tekst'),
        action: { label: t('klassementen.naar_groepen'), onPress: () => router.push('/groep') },
      }}
    >
      {() => (
        <View style={styles.scherm}>
          <Caption>{t('klassementen.uitleg')}</Caption>
          <Filterchips kaarten={lijst.kaarten} totaalGroepen={lijst.totaalGroepen} filter={lijst.filter} onKies={lijst.kies} />
          <KlassementenRaster
            kaarten={lijst.zichtbaar}
            kolommen={kolommenVoor(vorm, lijst.zichtbaar.length)}
            onAlleLeden={(groupId) => router.push(`/groep/${groupId}`)}
          />
          {lijst.meerFout ? <Caption danger>{t('klassementen.meer_mislukt')}</Caption> : null}
          {lijst.heeftMeer ? (
            <Button variant="secundair" block disabled={lijst.bezig} onPress={() => void lijst.laadMeer()}>
              {t('klassementen.meer_groepen')}
            </Button>
          ) : null}
        </View>
      )}
    </AsyncView>
  );
}

const styles = StyleSheet.create({
  scherm: { gap: space.blokGap },
});
