import { useState } from 'react';

import { fetchGroepGedempt, zetGroepGedempt } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { AsyncView, Body, Button, Caption, Card, Subheading, useAsync } from '@/shared/ui';

/**
 * De demping van één groep — QS8-752 (domeinregel 7).
 *
 * ⚠️ **Alleen jij ziet deze kaart, en alleen jij ziet de stand.** De rij staat in
 *    `groep_demping` en is voor niemand anders leesbaar; er komt geen bericht in
 *    de groep en het ledenoverzicht verandert niet. De tekst zegt dat met zoveel
 *    woorden, want wie niet weet of de groep het ziet, dempt niet.
 *
 * ⚠️ **De uitleg noemt wat blijft.** Een demping die alleen zegt wat er stopt
 *    laat de lezer raden of ook de goedkeuring van je eigen werk uitgaat.
 */
function useDemping(groupId: string, userId: string) {
  const stand = useAsync(() => fetchGroepGedempt(groupId, userId), [groupId, userId]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zet(gedempt: boolean) {
    setBezig(true);
    setFout(null);
    try {
      await zetGroepGedempt(groupId, userId, gedempt);
      stand.herlaad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : t('demping.zetten_mislukt'));
    } finally {
      setBezig(false);
    }
  }

  return { stand, bezig, fout, zet };
}

export function DempGroep({
  groupId,
  userId,
}: {
  readonly groupId: string;
  readonly userId: string;
}) {
  const { stand, bezig, fout, zet } = useDemping(groupId, userId);

  return (
    <Card>
      <Subheading>{t('demping.titel')}</Subheading>
      <AsyncView
        loading={stand.loading}
        error={stand.error}
        onRetry={stand.herlaad}
        data={stand.data}
        isEmpty={() => false}
        empty={{ title: t('demping.titel'), body: t('demping.laden_mislukt') }}
      >
        {(gedempt) => (
          <>
            <Body muted>{t(gedempt ? 'demping.uitleg_aan' : 'demping.uitleg_uit')}</Body>
            <Caption>{t('demping.blijft')}</Caption>
            <Caption>{t('demping.privacy')}</Caption>
            <Button
              variant="secundair"
              block
              busy={bezig}
              onPress={() => void zet(!gedempt)}
              accessibilityLabel={t(gedempt ? 'demping.opheffen_label' : 'demping.dempen_label')}
            >
              {t(gedempt ? 'demping.opheffen' : 'demping.dempen')}
            </Button>
            {fout ? (
              <Caption danger accessibilityLiveRegion="polite">
                {fout}
              </Caption>
            ) : null}
          </>
        )}
      </AsyncView>
    </Card>
  );
}
