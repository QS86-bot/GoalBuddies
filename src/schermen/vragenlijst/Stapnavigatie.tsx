import { View } from 'react-native';

import { t } from '@/shared/i18n';
import { Button, Caption } from '@/shared/ui';

import { FOCUS, isVraag, SAMENVATTING, type Stap } from './stappen';
import { stijlen } from './stijlen';

interface Props {
  readonly stap: Stap;
  readonly bezig: boolean;
  /** De huidige stap is niet geldig (bijvoorbeeld een te lange tekst). */
  readonly geblokkeerd: boolean;
  readonly onVolgende: () => void;
  readonly onVorige: () => void;
  readonly onOverslaan: () => void;
  readonly onBewaar: () => void;
}

/** Vorige, volgende en overslaan; op de samenvatting "Bewaren en verder". */
export function Stapnavigatie({ stap, bezig, geblokkeerd, onVolgende, onVorige, onOverslaan, onBewaar }: Props) {
  const laatste = stap === SAMENVATTING;

  return (
    <View style={stijlen.knoppen}>
      {laatste ? (
        <Button variant="primair" block busy={bezig} onPress={onBewaar}>
          {t('vragenlijst.samenvatting.bewaren')}
        </Button>
      ) : (
        <Button variant="primair" block disabled={geblokkeerd} busy={bezig} onPress={onVolgende}>
          {t('vragenlijst.volgende')}
        </Button>
      )}

      {stap === FOCUS ? null : (
        <Button variant="stil" block onPress={onVorige}>
          {t('vragenlijst.vorige')}
        </Button>
      )}

      {/* ⚠️ Overslaan staat op elke vraag: wie bij vraag drie besluit dat het genoeg is,
          hoeft niet nog zes schermen door. */}
      {isVraag(stap) ? (
        <Button variant="stil" block onPress={onOverslaan}>
          {t('vragenlijst.overslaan')}
        </Button>
      ) : null}

      {isVraag(stap) ? <Caption>{t('vragenlijst.alles_overslaan')}</Caption> : null}
    </View>
  );
}
