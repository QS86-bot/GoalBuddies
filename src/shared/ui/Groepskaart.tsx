import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';

import { Button } from './Button';
import { Card } from './Card';
import { Deelknop } from './Deelknop';
import { groepskaartTeksten } from './groepskaartTeksten';
import { Body, Caption, Subheading } from './Text';

/**
 * De Groepskaart — QS8-751, patroon V6: het sociale oppervlak compact, in één
 * kaart. De teller van de groep, het aantal leden en een uitnodigknop.
 *
 * ⚠️ **Eén kaart, in élke groep, en geen tak op `groups.zichtbaarheid`.** Dit
 *    component krijgt de zichtbaarheid niet eens: wat hij toont is in een
 *    beschermde en een open groep hetzelfde (de teller telt alleen op en staat in
 *    beide tanden, besluit A42), dus er valt niets te variëren. Een prop die dat
 *    wél kon, is hoe een standaard verschuift zonder dat iemand het besloten
 *    heeft.
 *
 * ⚠️ **Geen namen en geen "meedoen"-rij.** Een aantal leden, nooit wie. Wie er
 *    inactief is staat er niet in: `total_members` telt alleen actieve leden.
 *
 * ⚠️ **Geen rood, geen "nog".** Een teller op nul is een begin en geen tekort;
 *    een groep van één lid leest als een uitnodiging en niet als een lege groep.
 *
 * ⚠️ **Loading en error staan niet hier maar bij de aanroeper**, zoals bij elke
 *    kaart op dit scherm: de teller draagt zijn eigen fout, zodat één hik hem
 *    niet met het hele scherm meeneemt. Dit component rendert alleen met data.
 */

interface Props {
  /**
   * De teller van de groep, of `'fout'` als hij niet geladen kon worden. De teller
   * draagt zijn eigen fout: de kaart blijft dan staan, met ledenaantal en
   * uitnodigknop, en alleen het tellergedeelte zegt dat het misging.
   */
  readonly teller: { readonly weken: number; readonly mijlpalen: number } | 'fout';
  readonly onOpnieuw: () => void;
  readonly leden: number;
  /**
   * Het bericht om te delen, of `null` als er geen link is (ingetrokken, of de
   * code ontbreekt). Zonder bericht staat er geen knop: een knop die niets kan
   * delen liegt over wat hij doet.
   */
  readonly uitnodiging: { readonly tekst: string; readonly onderwerp: string } | null;
}

export function Groepskaart({ teller, onOpnieuw, leden, uitnodiging }: Props) {
  const tekst = groepskaartTeksten({
    weken: teller === 'fout' ? 0 : teller.weken,
    mijlpalen: teller === 'fout' ? 0 : teller.mijlpalen,
    leden,
  });

  return (
    <Card accessible accessibilityLabel={tekst.a11y} testID="groepskaart">
      <Subheading>{t('groepskaart.kop')}</Subheading>

      <View style={styles.rij}>
        <View style={styles.vak}>
          {teller === 'fout' ? (
            <>
              <Body muted>{t('klassement.teller_mislukt')}</Body>
              <Button variant="stil" onPress={onOpnieuw}>
                {t('klassement.opnieuw')}
              </Button>
            </>
          ) : (
            <>
              <Body muted={tekst.nogNiets}>{tekst.teller}</Body>
              {tekst.mijlpalen === null ? null : <Caption>{tekst.mijlpalen}</Caption>}
            </>
          )}
        </View>
        <Caption>{tekst.leden}</Caption>
      </View>

      {tekst.uitnodiging === null ? null : <Body muted>{tekst.uitnodiging}</Body>}

      {uitnodiging === null ? null : (
        <Deelknop
          label={t('groepskaart.uitnodigen')}
          titel={uitnodiging.onderwerp}
          tekst={uitnodiging.tekst}
          variant={tekst.uitnodiging === null ? 'secundair' : 'primair'}
        />
      )}

      {uitnodiging === null ? (
        // ⚠️ Een ingetrokken (of ontbrekende) uitnodiging geeft geen knop maar wel
        //    een zin: een link die gegarandeerd niet werkt is erger dan geen link,
        //    en een kaart zonder uitleg laat de lezer raden waar hij is.
        <Caption>{t('groepskaart.uitnodigen_uit')}</Caption>
      ) : (
        <Caption>{t('groepdetail.link_uitleg')}</Caption>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rij: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  vak: { flex: 1, gap: 2 },
});
