import { useRouter } from 'expo-router';
import { useState } from 'react';

import { neemDeel, toonCode } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import {
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  Subheading,
  useTerug,
} from '@/shared/ui';

/**
 * Een code met de hand invoeren — QS8-53.
 *
 * ⚠️ Dit scherm is de terugvalroute, niet de hoofdroute. Die is de link: iemand
 *    tikt hem aan en komt op `/uitnodiging/<code>`. Dit is voor wie de code
 *    voorgelezen krijgt of hem uit een schermafbeelding overtypt.
 *
 * ⚠️ Het veld accepteert een hele link net zo goed als twaalf losse tekens.
 *    `normaliseerCode` haalt er hetzelfde uit — plakken is verreweg het meest
 *    voorkomende gedrag en dat mag niet stuk op een schuine streep.
 */
export default function Deelnemen() {
  const router = useRouter();
  const terug = useTerug('/groep');

  const [invoer, setInvoer] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verzend() {
    setBezig(true);
    setFout(null);

    const uitkomst = await neemDeel(invoer);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    router.replace(`/groep/${uitkomst.waarde}`);
  }

  return (
    <Screen title={t('deelnemen.titel')} eyebrow={t('deelnemen.eyebrow')} terug={{ naar: '/groep' }}>
      <Card>
        <Field
          label={t('deelnemen.code_label')}
          hint={t('deelnemen.code_hint')}
          value={invoer}
          onChangeText={setInvoer}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="VYHC-2X9G-SRVH"
          {...(fout === null ? {} : { error: fout })}
        />

        {/*
          ⚠️ Hier stond een gedachtestreepje als plaatshouder (QS8-218). Een
             leesteken dat "nog niets" moet betekenen, is voor een schermlezer
             een streepje en verder niets; een zin zegt het wel.
        */}
        {invoer.trim() === '' ? null : (
          <Caption>
            {toonCode(invoer) === ''
              ? t('deelnemen.nog_niet_herkend')
              : t('deelnemen.herkend', { code: toonCode(invoer) })}
          </Caption>
        )}

        <Button variant="primair" block busy={bezig} onPress={() => void verzend()}>
          {t('deelnemen.knop')}
        </Button>
      </Card>

      <Card nested>
        <Subheading>{t('deelnemen.werkt_niet')}</Subheading>
        <Body muted>{t('deelnemen.werkt_niet_uitleg')}</Body>
      </Card>

      <Button variant="stil" block onPress={terug}>
        {t('deelnemen.terug')}
      </Button>
    </Screen>
  );
}
