import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { space } from '../theme';

import { ADEMPAUZE_BERICHT_MAX } from './adempauze-bericht';
import { Button } from './Button';
import { Choice } from './Choice';
import { Field } from './Field';
import { Caption } from './Text';

/**
 * De optionele stap "laat je groep weten dat je even rust neemt" — QS8-753.
 *
 * ⚠️ **Presentatie en niets anders.** Of er verstuurd wordt, naar wie en na welke
 *    handeling, beslist `pauzeMetBericht()` in `modules/goals`; dit component
 *    toont alleen wat de gebruiker kiest. Het staat uit tot hij op "Ja" drukt en
 *    kiest bij twee of meer groepen nooit een groep voor hem (domeinregel 7: de
 *    route loopt via de persoon, en "de eerste" is geen keuze).
 *
 * ⚠️ **Geen groepen, geen stap.** Zonder gedeelde groep is er niemand om iets aan
 *    te kondigen en rendert dit niets.
 *
 * ⚠️ **Na een mislukte verzending toont dit alleen nog de melding en de knop.** De
 *    pauze staat dan al; het formulier opnieuw tonen nodigt uit tot een tweede
 *    "Inplannen". `fout !== null` is die stand, en de keuze blijft in het scherm
 *    zodat "opnieuw" hetzelfde bericht naar dezelfde groep stuurt.
 *
 * ⚠️ **Staat in `shared/ui` zonder iets uit `modules/` te importeren**, dus de
 *    groepen komen binnen als `{ id, name }` en `ADEMPAUZE_BERICHT_MAX` wordt in
 *    `adempauze-bericht.test.ts` aan `BERICHT_MAX` van de chat gebonden.
 */

export interface AdempauzeGroep {
  readonly id: string;
  readonly name: string;
}

interface Props {
  readonly aan: boolean;
  readonly onAan: (aan: boolean) => void;
  readonly tekst: string;
  readonly onTekst: (tekst: string) => void;
  readonly groepen: readonly AdempauzeGroep[];
  /** Het id van de gekozen groep; `''` is "nog niets gekozen". */
  readonly gekozen: string;
  readonly onKies: (groepId: string) => void;
  /** De melding van een mislukte verzending, of `null`. */
  readonly fout: string | null;
  readonly bezig: boolean;
  readonly onOpnieuw: () => void;
  readonly onSluit: () => void;
}

export function AdempauzeBericht(props: Props) {
  const { groepen, fout, bezig, onOpnieuw, onSluit } = props;

  if (groepen.length === 0) return null;

  if (fout !== null) {
    return (
      <View style={styles.blok}>
        <Caption danger>{fout}</Caption>
        <View style={styles.knoppen}>
          <Button variant="primair" busy={bezig} onPress={onOpnieuw}>
            {t('adempauze.bericht_opnieuw')}
          </Button>
          <Button variant="stil" disabled={bezig} onPress={onSluit}>
            {t('adempauze.bericht_laat_maar')}
          </Button>
        </View>
      </View>
    );
  }

  return <Keuze {...props} />;
}

function Keuze({ aan, onAan, tekst, onTekst, groepen, gekozen, onKies, bezig }: Props) {
  // De naam bij één groep komt uit de keuze en niet uit een positie: het scherm bindt `gekozen`
  // via `enigeOfGekozen()`, en dit component kiest nooit zelf.
  const enige = groepen.length === 1 ? groepen.find((g) => g.id === gekozen) : undefined;

  return (
    <View style={styles.blok}>
      <Choice
        label={t('adempauze.bericht_vraag')}
        opties={[
          { waarde: 'nee', label: t('adempauze.bericht_nee') },
          { waarde: 'ja', label: t('adempauze.bericht_ja') },
        ]}
        waarde={aan ? 'ja' : 'nee'}
        onKies={(waarde) => onAan(waarde === 'ja')}
        disabled={bezig}
      />

      {aan ? (
        <>
          <Field
            label={t('adempauze.bericht_label')}
            hint={t('adempauze.bericht_hint')}
            value={tekst}
            onChangeText={onTekst}
            multiline
            numberOfLines={3}
            maxLength={ADEMPAUZE_BERICHT_MAX}
            editable={!bezig}
          />

          {enige !== undefined ? (
            <Caption>{t('adempauze.bericht_gaat_naar', { groep: enige.name })}</Caption>
          ) : (
            <Choice
              label={t('adempauze.bericht_welke_groep')}
              opties={groepen.map((g) => ({ waarde: g.id, label: g.name }))}
              waarde={gekozen}
              onKies={onKies}
              hint={gekozen === '' ? t('adempauze.bericht_kies_eerst') : undefined}
              disabled={bezig}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 3 },
  knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 3 },
});
