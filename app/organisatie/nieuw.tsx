import { useRouter } from 'expo-router';
import { useState } from 'react';

import { maakOrganisatie, ORGANISATIENAAM_MAX } from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { Button, Caption, Card, Field, Screen } from '@/shared/ui';
import { useVolgTaal } from '@/shared/i18n/react';

/**
 * Een organisatie aanmaken — QS8-657.
 *
 * ⚠️ De teller telt codepunten (`telTekens`), want dat is wat `char_length` in
 *    de database telt; de grens van 80 staat in de RPC en dit scherm toetst hem
 *    alleen vooraf. Wie de maker is, wordt beheerder: dat doet de server.
 */
export default function NieuweOrganisatie() {
  useVolgTaal();
  const router = useRouter();
  const [naam, setNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = await maakOrganisatie(naam);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    router.replace(`/organisatie/${uitkomst.waarde}`);
  }

  return (
    <Screen
      title={t('organisatie.nieuw_titel')}
      eyebrow={t('organisatie.eyebrow')}
      terug={{ naar: '/profiel' }}
    >
      <Card>
        <Field
          label={t('organisatie.naam_label')}
          hint={t('organisatie.naam_hint')}
          value={naam}
          onChangeText={setNaam}
          autoCorrect={false}
          {...(fout === null ? {} : { error: fout })}
        />
        <Caption>
          {t('organisatie.naam_teller', { aantal: telTekens(naam), max: ORGANISATIENAAM_MAX })}
        </Caption>
        <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
          {t('organisatie.nieuw_knop')}
        </Button>
      </Card>
    </Screen>
  );
}
