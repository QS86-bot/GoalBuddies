import { StyleSheet, View } from 'react-native';

import { space } from '../theme';

import { Choice, type Optie } from './Choice';
import { Caption, Subheading } from './Text';

/**
 * Een keuze uit te veel opties om naast elkaar te zetten — QS8-224.
 *
 * ⚠️ **`Choice` is de vorm voor twee tot zeven opties.** Bij de taal (twee), de
 *    week-startdag (zeven) en het ritme (drie) klopt dat. Bij vijftien
 *    doelcategorieën wordt het een muur van knoppen waarin je niet meer kiest
 *    maar zoekt — dat is punt 4 van QS8-224, en het is dezelfde afweging die
 *    `TijdzoneKeuze` voor vierhonderd tijdzones al maakte.
 *
 * ⚠️ **Geen zoekveld, en dat verschil met `TijdzoneKeuze` is het punt.** Bij
 *    tijdzones weet je wat je zoekt en typ je het; bij categorieën is de lijst
 *    zélf het aanbod — je moet kunnen zien wat er te kiezen valt. Dus alles
 *    zichtbaar, maar in groepen van drie tot vijf, en dat is weer precies de
 *    maat waar `Choice` goed in is.
 *
 * ⚠️ **Eén `radiogroup` per groep en niet één voor het geheel.** Een schermlezer
 *    kondigt dan "Lichaam en rust, keuze 2 van 4" aan in plaats van "2 van 15",
 *    en dat tweede getal zegt niets. Dat komt vanzelf goed doordat elke groep
 *    een eigen `Choice` is; het is wel de reden dat het er zo uitziet.
 */

export interface Keuzegroep<T extends string> {
  readonly sleutel: string;
  readonly label: string;
  readonly opties: readonly Optie<T>[];
}

interface Props<T extends string> {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly groepen: readonly Keuzegroep<T>[];
  readonly waarde: T;
  readonly onKies: (waarde: T) => void;
  readonly disabled?: boolean;
}

export function GegroepeerdeKeuze<T extends string>({
  label,
  hint,
  groepen,
  waarde,
  onKies,
  disabled = false,
}: Props<T>) {
  return (
    <View style={styles.blok}>
      <Subheading>{label}</Subheading>
      {hint === undefined ? null : <Caption>{hint}</Caption>}

      {groepen.map((groep) => (
        <Choice
          key={groep.sleutel}
          label={groep.label}
          opties={groep.opties}
          waarde={waarde}
          onKies={onKies}
          disabled={disabled}
          subtiel
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap },
});
