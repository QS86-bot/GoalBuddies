import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { space } from '../theme';
import { apparaatTijdzone } from '../time';

import { Button } from './Button';
import { Field } from './Field';
import { Body, Caption } from './Text';
import { isBruikbareZone, zoekTijdzones } from './tijdzone';

/**
 * De tijdzone met de hand zetten — QS8-27, criterium 1.
 *
 * ⚠️ **Dit was het ontbrekende schrijfpad**, en het is dezelfde vorm als bij de
 *    taalkeuze (QS8-115): `tijdzoneSchema` bestond, `updateProfiel()` nam `tz`
 *    al mee, `isGeldigeTijdzone()` stond klaar — en er was geen scherm. Wie in
 *    Lissabon woont met zijn telefoon op Amsterdam kon dat niet rechtzetten.
 *    Onwrikbare regel 18, vraag 5: elk schakeltje af, en de keten liep nergens
 *    door.
 *
 * ⚠️ **Geen keuzelijst met vierhonderd knoppen.** `Choice` is de vorm voor de
 *    taal (twee) en de week-startdag (zeven); voor tijdzones is hij onbruikbaar.
 *    Vandaar zoeken: je typt een plaatsnaam en krijgt hooguit acht voorstellen.
 *
 * ⚠️ **Het veld is ook de invoer en niet alleen een filter.** Ontbreekt
 *    `Intl.supportedValuesOf` — dat is op oudere toestellen een reëel geval — dan
 *    is `tijdzones()` leeg en zijn er dus geen voorstellen. `Intl.DateTimeFormat`
 *    kent de zone dan nog steeds, dus wie hem intypt mag hem opslaan. Zonder die
 *    uitweg zou juist de oudste telefoon zijn tijdzone niet kunnen zetten.
 *
 * ⚠️ **De knop "de tijdzone van dit apparaat" staat er altijd bij.** Dit veld
 *    bestaat voor het geval dat het apparaat het mis heeft; de weg terug hoort
 *    dan net zo kort te zijn als de weg heen. Zonder die knop moet iemand die
 *    verhuisd is zijn oude zone uit zijn hoofd kennen.
 */

interface Props {
  /** De zone die nu op het profiel staat. */
  readonly waarde: string;
  readonly onKies: (zone: string) => void;
  readonly disabled?: boolean;
}

export function TijdzoneKeuze({ waarde, onKies, disabled = false }: Props) {
  const [zoekterm, setZoekterm] = useState('');

  const voorstellen = zoekTijdzones(zoekterm);
  const apparaat = apparaatTijdzone();

  // ⚠️ Alleen aanbieden als de ingetypte tekst zélf een zone is én er geen
  //    voorstel bij staat dat hetzelfde doet. Anders staat dezelfde zone twee
  //    keer onder elkaar.
  const zelfGetypt =
    isBruikbareZone(zoekterm) && !voorstellen.includes(zoekterm.trim())
      ? zoekterm.trim()
      : null;

  function kies(zone: string) {
    setZoekterm('');
    onKies(zone);
  }

  return (
    <View style={styles.blok}>
      <Field
        label={t('tijdzone.label')}
        hint={t('tijdzone.hint')}
        value={zoekterm}
        onChangeText={setZoekterm}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('tijdzone.zoek_voorbeeld')}
      />

      <Caption>{t('tijdzone.nu', { zone: waarde })}</Caption>

      {zelfGetypt === null ? null : (
        <Button variant="secundair" block disabled={disabled} onPress={() => kies(zelfGetypt)}>
          {t('tijdzone.gebruik_getypt', { zone: zelfGetypt })}
        </Button>
      )}

      {voorstellen.map((zone) => (
        <Button
          key={zone}
          variant="stil"
          block
          disabled={disabled}
          onPress={() => kies(zone)}
        >
          {zone}
        </Button>
      ))}

      {/*
        ⚠️ "Niets gevonden" alleen als er ook echt gezocht is. Een lege lijst bij
           een leeg veld is geen uitkomst maar de begintoestand, en die als
           mislukking tonen is precies het soort ruis dat een scherm onbetrouwbaar
           laat voelen.
      */}
      {zoekterm.trim() !== '' && voorstellen.length === 0 && zelfGetypt === null ? (
        <Body muted>{t('tijdzone.niets_gevonden')}</Body>
      ) : null}

      {waarde === apparaat ? null : (
        <Button variant="stil" block disabled={disabled} onPress={() => kies(apparaat)}>
          {t('tijdzone.van_apparaat', { zone: apparaat })}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 4 },
});
