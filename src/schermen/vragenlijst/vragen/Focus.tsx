import { View } from 'react-native';

import { CATEGORIE_GROEPEN, categorieLabels, MAX_FOCUSGEBIEDEN, type Categorie } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Button, Caption, Card, Subheading } from '@/shared/ui';

import { stijlen } from '../stijlen';

/** Vraag 1: waar wil je je op richten? Maximaal drie. */
export function Focus({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly Categorie[];
  readonly onWissel: (gebied: Categorie) => void;
}) {
  const labels = categorieLabels();

  return (
    <Card>
      <Subheading>{t('vragenlijst.focus.vraag')}</Subheading>
      <Caption>{t('vragenlijst.focus.toelichting')}</Caption>

      {CATEGORIE_GROEPEN.map((groep) => (
        <View key={groep.sleutel} style={stijlen.gebieden}>
          {groep.leden.map((gebied) => (
            <Button
              key={gebied}
              variant={gekozen.includes(gebied) ? 'secundair' : 'stil'}
              gekozen={gekozen.includes(gebied)}
              onPress={() => onWissel(gebied)}
            >
              {labels[gebied]}
            </Button>
          ))}
        </View>
      ))}

      {gekozen.length >= MAX_FOCUSGEBIEDEN ? <Caption>{t('vragenlijst.focus.vol')}</Caption> : null}
    </Card>
  );
}
