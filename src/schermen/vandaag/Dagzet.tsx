import { useState } from 'react';
import { View } from 'react-native';

import { zetDagzet, type DagZet } from '@/modules/completions';
import { t } from '@/shared/i18n';
import { Body, Button, Caption, Card, Choice, Field, Subheading } from '@/shared/ui';

import { styles } from './stijlen';

/**
 * De Dagzet — QS8-50.
 *
 * ⚠️ Domeinregel 9: standaard privé, nooit punten, nooit goedkeuring. Een dag
 *    overslaan heeft geen enkel gevolg — er staat dus ook geen teller, geen
 *    reeks en geen inhaalprikkel.
 */
export function DagzetBlok({
  userId,
  localDate,
  zetten,
  onKlaar,
}: {
  readonly userId: string;
  readonly localDate: string | null;
  readonly zetten: readonly DagZet[];
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [delen, setDelen] = useState(false);
  const { bezig, fout, bewaar } = useBewaarDagzet({ userId, localDate, tekst, delen, wis: () => setTekst(''), onKlaar });

  return (
    <Card nested>
      <Subheading>{t('dagzet.titel')}</Subheading>
      <Body muted>{t('dagzet.uitleg')}</Body>

      <Field
        label={t('dagzet.vandaag')}
        value={tekst}
        onChangeText={setTekst}
        placeholder={t('dagzet.voorbeeld')}
      />

      <Choice
        label={t('dagzet.zichtbaarheid')}
        hint={t('dagzet.zichtbaarheid_hint')}
        opties={[
          { waarde: 'prive', label: t('dagzet.alleen_ik') },
          { waarde: 'groep', label: t('dagzet.deel_groep') },
        ]}
        waarde={delen ? 'groep' : 'prive'}
        onKies={(v) => setDelen(v === 'groep')}
      />

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button disabled={tekst.trim() === ''} busy={bezig} onPress={() => void bewaar()}>
        {t('dagzet.vastleggen')}
      </Button>

      <Zetten zetten={zetten} />
    </Card>
  );
}

function Zetten({ zetten }: { readonly zetten: readonly DagZet[] }) {
  if (zetten.length === 0) return null;

  return (
    <View style={styles.zetten}>
      {zetten.map((zet) => (
        <View key={zet.id} style={styles.zet}>
          <Caption>{zet.local_date}</Caption>
          <Body>{zet.body}</Body>
        </View>
      ))}
    </View>
  );
}

function useBewaarDagzet(a: {
  readonly userId: string;
  readonly localDate: string | null;
  readonly tekst: string;
  readonly delen: boolean;
  readonly wis: () => void;
  readonly onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!a.localDate) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await zetDagzet(
      a.userId,
      { body: a.tekst, weekly_goal_id: null, visibility: a.delen ? 'group' : 'private' },
      a.localDate,
    );

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      a.wis();
      a.onKlaar();
    }
    setBezig(false);
  }

  return { bezig, fout, bewaar };
}
