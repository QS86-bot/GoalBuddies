import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { space } from '../theme';

import type { BevestigingsTekst } from './acties';
import { Button } from './Button';
import { Card } from './Card';
import { Body, Caption, Subheading } from './Text';

/**
 * De laatste stap vóór iets dat geschiedenis of punten raakt.
 *
 * ⚠️ **In het scherm, niet in een dialoogvenster.** Een `Alert` gedraagt zich op
 *    web anders dan op native, en dat is precies het soort platformverschil dat
 *    `CLAUDE.md` uit de gedeelde UI wil houden. Dit is een blok dat openklapt op
 *    de plek van de knop; het werkt overal hetzelfde en het is met een
 *    schermlezer gewoon te lezen.
 *
 * ⚠️ De uitleg staat er altijd, en hij noemt de prijs. Zie `BEVESTIGING` in
 *    `acties.ts` voor waarom "weet je het zeker?" hier niet volstaat.
 */
interface Props {
  readonly tekst: BevestigingsTekst;
  readonly onBevestig: () => void;
  readonly onAnnuleer: () => void;
  /** Toont een spinner op de bevestigknop en blokkeert een tweede druk. */
  readonly bezig?: boolean;
  /** De melding van de database als het niet lukte. */
  readonly fout?: string | null;
}

export function Bevestiging({ tekst, onBevestig, onAnnuleer, bezig = false, fout = null }: Props) {
  return (
    <Card nested>
      <Subheading>{tekst.titel}</Subheading>
      <Body muted>{tekst.uitleg}</Body>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        {/*
          ⚠️ De doorzetknop is `secundair` en niet `primair`. Goud is in dit
             stelsel de kleur van "dit wil je" — een weekdoel weggooien is niet
             wat je wilt, het is wat je soms moet. Annuleren staat er bewust
             naast als volwaardige tweede knop en niet als klein kruisje.
        */}
        <Button variant="secundair" busy={bezig} onPress={onBevestig}>
          {tekst.bevestig}
        </Button>
        <Button variant="stil" disabled={bezig} onPress={onAnnuleer}>
          {t('bevestiging.annuleren')}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
