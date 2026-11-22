import { StyleSheet, View } from 'react-native';

import { toonAlleLeden, type Klassementkaart } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { KlassementRegel } from './KlassementRegel';

/**
 * De kaart van één groep: de bovenste vijf, jouw eigen regel als die er niet bij zit, en een link naar de hele groep — QS8-666 (A57b), 3c-ui.
 *
 * ⚠️ **Presentatief.** Hij laadt niets en beslist niets: de kaart bestaat omdat de RPC rijen gaf voor deze groep, en een groep zonder
 *    klassement komt er dus niet in voor (besluit Quinten 22-11-2026). Wie hier een eigen filter op `klassement_aan` bijzet, maakt een
 *    tweede poort die kan afwijken van de database.
 */
export function KlassementKaart({
  kaart,
  onAlleLeden,
}: {
  readonly kaart: Klassementkaart;
  readonly onAlleLeden: (groupId: string) => void;
}) {
  return (
    <Card>
      <Subheading>{kaart.groepnaam}</Subheading>
      {kaart.iedereenOpNul ? (
        <Body muted>{t('klassement.leeg')}</Body>
      ) : (
        <View style={styles.regels}>
          {kaart.bovenste.map((rij) => (
            <KlassementRegel key={rij.userId} rij={rij} />
          ))}
          {kaart.eigen === null ? null : (
            <>
              <Caption>{'…'}</Caption>
              <KlassementRegel rij={kaart.eigen} />
            </>
          )}
        </View>
      )}
      {toonAlleLeden(kaart) ? (
        <Button variant="stil" onPress={() => onAlleLeden(kaart.groupId)}>
          {t('klassementen.alle_leden', { n: kaart.ledental })}
        </Button>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  regels: { gap: space.blokGap - 3 },
});
