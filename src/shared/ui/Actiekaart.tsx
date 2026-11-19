import { StyleSheet, View } from 'react-native';

import { afstand } from '../theme';

import { Subheading, Caption } from './Text';

/**
 * De indeling van een kaart met één hoofdhandeling — QS8-727, patroon V5: titel
 * en subtitel links in het midden, de hoofdhandeling (een `Afvinkcirkel`) rechts,
 * en daaronder de inhoud die erbij hoort.
 *
 * ⚠️ **Eén `actie`, en geen lijst.** Een tweede primaire handeling op dezelfde
 *    kaart is precies wat deze indeling wil voorkomen; hoort er toch iets bij,
 *    dan is dat een gewone knop onder de inhoud.
 *
 * ⚠️ **Geen punten- of tellerprop.** Score en voortgang staan niet in één element
 *    (domeinregel 10), en de subtitel is tekst en geen getal dat kan dalen.
 *
 * Het is een indeling en geen `Card`: de ouder bepaalt het vlak, zodat de kaart in
 * een bestaande `Card` past zonder een tweede rand.
 */
interface Props {
  readonly titel: string;
  readonly subtitel?: string | undefined;
  readonly actie: React.ReactNode;
  readonly children?: React.ReactNode;
}

export function Actiekaart({ titel, subtitel, actie, children }: Props) {
  return (
    <View style={styles.kaart}>
      <View style={styles.rij}>
        <View style={styles.midden}>
          <Subheading>{titel}</Subheading>
          {subtitel ? <Caption>{subtitel}</Caption> : null}
        </View>
        {actie}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  kaart: { gap: afstand.m },
  rij: { flexDirection: 'row', alignItems: 'center', gap: afstand.l },
  midden: { flex: 1, gap: 2 },
});
