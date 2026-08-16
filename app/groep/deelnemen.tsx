import { useRouter } from 'expo-router';
import { useState } from 'react';

import { neemDeel, toonCode } from '@/modules/buddies';
import { Body, Button, Caption, Card, Field, Screen, Subheading } from '@/shared/ui';

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
    <Screen title="Deelnemen" eyebrow="MET EEN CODE">
      <Card>
        <Field
          label="Uitnodigingscode of -link"
          hint="Twaalf tekens. Streepjes, spaties en de hele link mogen; die halen we er zelf af."
          value={invoer}
          onChangeText={setInvoer}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="VYHC-2X9G-SRVH"
          {...(fout === null ? {} : { error: fout })}
        />

        {invoer.trim() === '' ? null : <Caption>Herkend als: {toonCode(invoer) || '—'}</Caption>}

        <Button variant="primair" block busy={bezig} onPress={() => void verzend()}>
          Deelnemen aan deze groep
        </Button>
      </Card>

      <Card nested>
        <Subheading>Werkt de code niet?</Subheading>
        <Body muted>
          Een link kan ingetrokken zijn, of vervangen door een nieuwe. Vraag degene die je
          uitnodigde om de link nog eens te sturen — die is dan meteen de geldige.
        </Body>
      </Card>

      <Button variant="stil" block onPress={() => router.back()}>
        Terug
      </Button>
    </Screen>
  );
}
