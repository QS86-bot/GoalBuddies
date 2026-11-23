import { View } from 'react-native';

import { valkuilAntwoord, valkuilLabels, VALKUILEN, type Valkuil as ValkuilWaarde } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { stijlen } from '../stijlen';

/**
 * Vraag 4: wat laat jouw gewoontes stuklopen?
 *
 * ⚠️ **Hier zit de waarde van de vragenlijst.** Elk aangevinkt antwoord krijgt meteen
 *    te zien wat de app ertegen heeft (de vloer, de weekpas, peer-goedkeuring, de
 *    adempauze). Er wordt niets aangezet: aanvinken slaat een antwoord op en laat
 *    zien wat er al is.
 */
export function Valkuil({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly ValkuilWaarde[];
  readonly onWissel: (valkuil: ValkuilWaarde) => void;
}) {
  const labels = valkuilLabels();

  return (
    <Card>
      <Subheading>{t('vragenlijst.valkuil.vraag')}</Subheading>
      <Caption>{t('vragenlijst.valkuil.toelichting')}</Caption>

      {VALKUILEN.map((valkuil) => (
        <View key={valkuil} style={stijlen.valkuil}>
          <Button
            variant={gekozen.includes(valkuil) ? 'secundair' : 'stil'}
            keuze={{ vorm: 'wissel', gekozen: gekozen.includes(valkuil) }}
            block
            onPress={() => onWissel(valkuil)}
          >
            {labels[valkuil]}
          </Button>

          {gekozen.includes(valkuil) ? <Body muted>{valkuilAntwoord(valkuil).antwoord}</Body> : null}
        </View>
      ))}
    </Card>
  );
}
