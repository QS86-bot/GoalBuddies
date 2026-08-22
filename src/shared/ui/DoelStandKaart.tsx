import { t } from '../i18n';

import { StyleSheet, View } from 'react-native';

import { space, useTheme } from '../theme';

import { puntenUitleg, streakLabel, weekpasReddeDezeCyclus, type WeekpasStand } from './metrics';
import { StreakCounter } from './StreakCounter';
import { Caption, Subheading } from './Text';
import { Weekpas } from './Weekpas';

/**
 * Reeks, punten en weekpassen van één doel — QS8-75.
 *
 * ⚠️ **Privé, en dat is geen detail.** Dit component toont het puntentotaal, en
 *    een dalend totaal is zichtbaar bewijs van een gemiste week (domeinregel 10
 *    en daarmee 7). Er is geen `viewer`-prop en die hoort er ook niet te komen:
 *    dit hoort op het dashboard van de eigenaar en nergens anders. Wat de groep
 *    mag zien is de kale reeks uit `group_visible_streaks`, via `MemberRow`.
 *
 * ⚠️ Score en voortgang staan bewust niet in één balk (domeinregel 10). De
 *    punten staan als getal en niet als meter, juist omdat een meter suggereert
 *    dat er een doel is om vol te maken — en dan leest een daling als verlies
 *    van voortgang, terwijl je doel gewoon even ver is als vorige week.
 *
 * ⚠️ De reeks staat in **cycli** en de tekst zegt dat ook ("6 weken op rij").
 *    Dat is een acceptatiecriterium van QS8-75 en het verschil met elke
 *    dagen-app: een gemiste dág bestaat hier niet.
 */

interface Props {
  readonly titel: string;
  readonly huidigeReeks: number;
  readonly besteReeks: number;
  readonly punten: number;
  readonly weekpas: WeekpasStand | null;
  /**
   * De cyclus die zojuist is afgesloten. Bepaalt of de melding "een weekpas
   * heeft je reeks gered" erbij komt.
   *
   * ⚠️ Komt van buiten en wordt hier niet uitgerekend (correctheidsregel 7).
   */
  readonly afgeslotenCyclus: string | null;
}

export function DoelStandKaart({
  titel,
  huidigeReeks,
  besteReeks,
  punten,
  weekpas,
  afgeslotenCyclus,
}: Props) {
  const theme = useTheme();

  // ⚠️ `huidigeReeks > 0` staat er om een reden die niet cosmetisch is. Zijn er
  //    in één rollover twee weken afgesloten en was er maar één pas, dan is er
  //    wél een pas verbruikt op de zojuist afgesloten week, maar breekt de
  //    ándere week de reeks alsnog. Zonder deze voorwaarde staat er dan
  //    "Een weekpas heeft je reeks gered" onder een teller die "Nog geen reeks"
  //    zegt — het scherm spreekt zichzelf tegen op precies het moment dat
  //    iemand toch al twijfelt. Bevinding van de code-review op QS8-81.
  const gered =
    huidigeReeks > 0 && weekpas !== null && weekpasReddeDezeCyclus(weekpas, afgeslotenCyclus);

  return (
    <View style={styles.blok}>
      <Subheading>{titel}</Subheading>

      {/*
        ⚠️ Zónder `best`. `StreakCounter` zet die er als tweede regel onder, en
           drie centimeter lager staat "Langste reeks" met exact hetzelfde getal
           onder een andere naam. Twee namen voor één getal naast elkaar leest
           als twee verschillende dingen die toevallig gelijk zijn.
      */}
      <StreakCounter cycles={huidigeReeks} />

      <View style={styles.cijfers}>
        <View style={styles.cijfer}>
          {/*
            ⚠️ "Punten" en niet "score". Een score nodigt uit tot vergelijken en
               er is niets om mee te vergelijken: het puntentotaal van een ander
               is onzichtbaar en dat blijft zo.
          */}
          <Caption>{t('stand.punten')}</Caption>
          <Subheading>{punten}</Subheading>
        </View>

        {/*
          ⚠️ Weg bij nul. "Langste reeks — Nog geen reeks" leest als een storing,
             en het is bovendien dezelfde mededeling die er twee regels hoger al
             staat.
        */}
        {besteReeks <= 0 ? null : (
          <View style={styles.cijfer}>
            <Caption>{t('stand.langste_reeks')}</Caption>
            {/*
              ⚠️ Uitgeschreven als weken en niet als kaal getal, om dezelfde
                 reden als de reeksteller: de eenheid is de week.
            */}
            <Subheading>{streakLabel(besteReeks)}</Subheading>
          </View>
        )}
      </View>

      {/*
        ⚠️ Het schaaltje onder het getal. Zonder deze regel is "Punten 12" een
           getal zonder eenheid, en — belangrijker — weet niemand dat een gemiste
           week een minpunt kost tot het gebeurt.
      */}
      <Caption>{puntenUitleg()}</Caption>

      {weekpas === null ? null : (
        <View style={[styles.scheiding, { borderTopColor: theme.colors.border }]}>
          <Weekpas stand={weekpas} reddeVorigeWeek={gered} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 3 },
  cijfers: { flexDirection: 'row', gap: space.blokGap * 2, flexWrap: 'wrap' },
  cijfer: { gap: 2 },
  scheiding: { borderTopWidth: 1, paddingTop: space.blokGap - 3 },
});
