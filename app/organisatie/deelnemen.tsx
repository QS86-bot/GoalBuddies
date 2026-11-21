import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { toonCode } from '@/modules/buddies';
import { openstaandeWerkcode, vergeetWerkcode, wordOrganisatielid } from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { Button, Caption, Card, Field, Screen } from '@/shared/ui';

/**
 * Lid worden van een organisatie met een code — QS8-657.
 *
 * ⚠️ Een onbekende, ingetrokken en "je bent eruit gezet"-code geven dezelfde
 *    zin: de invoer is anders een orakel over wie er lid was.
 */
export default function OrganisatieDeelnemen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [invoer, setInvoer] = useState(typeof code === 'string' ? code : '');
  useVoorinvulling(code, setInvoer);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verzend() {
    setBezig(true);
    setFout(null);

    const uitkomst = await wordOrganisatielid(invoer);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    await vergeetWerkcode();
    router.replace(`/organisatie/${uitkomst.waarde}`);
  }

  return (
    <Screen
      title={t('organisatie.deelnemen_titel')}
      eyebrow={t('organisatie.eyebrow')}
      terug={{ naar: '/profiel' }}
    >
      <Card>
        <Field
          label={t('organisatie.code_label')}
          hint={t('organisatie.code_hint')}
          value={invoer}
          onChangeText={setInvoer}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="VYHC-2X9G-SRVH"
          {...(fout === null ? {} : { error: fout })}
        />
        {invoer.trim() === '' || toonCode(invoer) === '' ? null : (
          <Caption>{toonCode(invoer)}</Caption>
        )}
        <Button variant="primair" block busy={bezig} onPress={() => void verzend()}>
          {t('organisatie.deelnemen_knop')}
        </Button>
      </Card>
    </Screen>
  );
}

/**
 * QS8-663: een code die op het aanmeldscherm onthouden is, staat hier al
 * ingevuld. Alleen invullen: lid worden blijft een druk op de knop.
 */
function useVoorinvulling(
  code: string | undefined,
  setInvoer: (f: (huidig: string) => string) => void,
) {
  useEffect(() => {
    if (typeof code === 'string') return;
    void openstaandeWerkcode().then((bewaard) => {
      if (bewaard !== null) setInvoer((huidig) => (huidig === '' ? bewaard : huidig));
    });
  }, [code, setInvoer]);
}
