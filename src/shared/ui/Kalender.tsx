import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { Body, Caption } from './Text';

/**
 * De dagen waarop je hebt opgedaagd, als raster — QS8-256.
 *
 * ⚠️ **Eén hue, licht naar donker, en dat is geen smaak maar de vorm die bij dit
 *    gegeven hoort.** Een kalender met aantallen is een *magnitude*-vraag, en
 *    daarvoor is een sequentiële schaal in één kleur de juiste keuze — nooit een
 *    reeks verschillende kleuren, want die suggereert categorieën die er niet
 *    zijn.
 *
 * ⚠️ **De schaal loopt via dekking en niet via nieuwe kleurwaarden.** Dat is de
 *    enige manier om hier stappen te krijgen zonder een tint te verzinnen, en de
 *    kop van `tokens.ts` verbiedt dat laatste met zoveel woorden. De ondergrond
 *    is het paneel, dus een lage dekking is letterlijk "bijna niets".
 *
 * ⚠️ **Een lege dag is een vlakje en geen gat.** Domeinregel 7 gaat over wat de
 *    groep ziet en dit scherm is van jou alleen — maar de toon geldt ook hier.
 *    Een rooster met gaten leest als een aanklacht; een rooster met lichte
 *    vlakjes leest als een rooster.
 *
 * ⚠️ **Geen weeknummers en geen maandkoppen.** Dit blok beantwoordt "hoe vaak
 *    dagen achter elkaar" en niet "welke datum". Wie de datum wil, krijgt hem
 *    van de schermlezer; wie hem op het scherm wil, vraagt om een tweede
 *    component.
 */

export interface KalenderDag {
  /** `YYYY-MM-DD`, aangeleverd door de aanroeper uit `shared/time`. */
  readonly datum: string;
  /** Hoeveel er die dag is afgevinkt. Nul is een geldige waarde. */
  readonly aantal: number;
}

/**
 * ⚠️ Vier stappen en niet meer. Meer stappen zijn op een vlakje van elf pixels
 *    niet te onderscheiden, en dan doet de schaal alsof hij preciezer is dan hij
 *    kan zijn.
 */
function dekking(aantal: number): number {
  if (aantal <= 0) return 0.1;
  if (aantal === 1) return 0.45;
  if (aantal === 2) return 0.72;
  return 1;
}

export function Kalender({ dagen }: { readonly dagen: readonly KalenderDag[] }) {
  const theme = useTheme();

  if (dagen.length === 0) {
    return <Body muted>{t('overzicht.kalender_leeg')}</Body>;
  }

  return (
    <View style={styles.blok}>
      <View style={styles.raster} accessibilityRole="list">
        {dagen.map((dag) => (
          <View
            key={dag.datum}
            accessible
            accessibilityRole="text"
            accessibilityLabel={
              dag.aantal > 0
                ? t('overzicht.dag_label', { datum: dag.datum, aantal: dag.aantal })
                : t('overzicht.dag_leeg_label', { datum: dag.datum })
            }
            style={[
              styles.vak,
              { backgroundColor: theme.roles.progress, opacity: dekking(dag.aantal) },
            ]}
          />
        ))}
      </View>

      <Caption>{t('overzicht.kalender_uitleg')}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 4 },
  raster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // ⚠️ Twee pixels, net als bij de balken: zonder tussenruimte lopen twee
    //    volle dagen in elkaar over en lees je één blok in plaats van twee dagen.
    gap: 2,
  },
  vak: { width: 11, height: 11, borderRadius: radius.sm },
});
