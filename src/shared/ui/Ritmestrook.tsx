import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { radius, useTheme } from '../theme';
import type { IsoDate } from '../time';

import { ritmestrook } from './ritmestrook';

/**
 * De week van één ritme-weekdoel, als zeven vakjes — QS8-301.
 *
 * ⚠️ **Waarom dit blok bestaat.** De teller ernaast zegt *"3 van 5 dagen"*, en
 *    dat is een getal zonder vorm: je ziet niet of die drie achter elkaar zaten
 *    of verspreid, en niet of vandaag er al bij zit. De dagen stonden al in de
 *    database en werden opgehaald; alleen gooide `fetchAfvinkingenPerWeekdoel()`
 *    ze weg om er een aantal van te maken.
 *
 * ⚠️ **Nul extra verzoeken.** De rijen komen uit dezelfde cyclusquery die de
 *    teller al voedde. Een `fetchAfvinkingen(weekdoelId)` per weekdoel zou de
 *    N+1 zijn die die functie juist vermijdt (onwrikbare regel 12) — dat is de
 *    reden dat die functie met dit issue wég is in plaats van aangesloten.
 *
 * ⚠️ **Geen letters in de vakjes.** Een dagletter zou uit een naam uit `Intl`
 *    geknipt moeten worden, en snijden op een tekengrens is in dit project een
 *    eigen valkuil (QS8-118). De datum staat volledig in het
 *    toegankelijkheidslabel; het oog heeft aan de vorm genoeg.
 *
 * ⚠️ **Dit is privé.** `day_checkins` is eigenaar-only, ook in een open groep
 *    (A41). Deze strook hoort daarom nooit op een groepsscherm — een rooster met
 *    gaten is fijnmaziger tegenslag dan een gemiste week, en domeinregel 7 sluit
 *    precies dat uit.
 */
export function Ritmestrook({
  startDatum,
  afgevinkt,
}: {
  /** De eerste dag van de cyclus van deze gebruiker, uit `shared/time`. */
  readonly startDatum: IsoDate;
  readonly afgevinkt: readonly string[];
}) {
  const theme = useTheme();

  return (
    <View style={styles.strook} accessibilityRole="list">
      {ritmestrook(startDatum, afgevinkt).map((dag) => (
        <View
          key={dag.datum}
          accessible
          accessibilityRole="text"
          accessibilityLabel={
            dag.afgevinkt
              ? t('ritme.strook_af', { datum: dag.datum })
              : t('ritme.strook_open', { datum: dag.datum })
          }
          style={[
            styles.vak,
            {
              backgroundColor: theme.roles.progress,
              // ⚠️ Dekking en geen tweede kleurwaarde: `tokens.ts` verbiedt een
              //    zelfbedachte tint, en dit is dezelfde schaal als `Kalender`.
              opacity: dag.afgevinkt ? 1 : 0.14,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Twee pixels, net als in `Kalender`: zonder tussenruimte lopen twee volle
  // dagen in elkaar over en lees je één blok in plaats van twee dagen.
  strook: { flexDirection: 'row', gap: 2 },
  vak: { width: 14, height: 14, borderRadius: radius.sm },
});
