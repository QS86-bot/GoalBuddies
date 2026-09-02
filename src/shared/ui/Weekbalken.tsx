import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { Body, Caption } from './Text';
import { balkvorm, WEEKSTANDEN, type Weekstand } from './weekbalk-vorm';

/**
 * Twaalf weken als balken — QS8-256.
 *
 * ⚠️ **Nergens rood, en dat is de kern van dit component.** In dit stelsel
 *    betekent rood uitsluitend een naderende deadline (`tokens.ts` zegt dat met
 *    zoveel woorden). Een week die niet is afgerond krijgt een láge grijze balk:
 *    zichtbaar, want het is je eigen terugblik en die hoort eerlijk te zijn, maar
 *    geen alarm en geen gat.
 *
 * ⚠️ **De kleur zegt of de week telde, de hoogte hoeveel.** Twee kanalen en niet
 *    één: groen is "deze week telde", grijs is "niet". Wie kleurenblind is leest
 *    de hoogte, wie de hoogte niet vergelijkt leest de kleur, en een schermlezer
 *    krijgt de zin. Er wordt hier dus geen enkele kleur uitgevonden — het zijn
 *    `progress` en `neutral` uit `roles()`.
 *
 * ⚠️ **De vloer is groen en niet iets tussen groen en grijs in.** Domeinregel 8:
 *    vloer gehaald betekent dat de week telt, met dezelfde reeks en dezelfde
 *    goedkeuring. Alleen de punten verschillen, en dat is de hóógte. Zou de
 *    vloerbalk een doffere kleur krijgen, dan zegt het dashboard precies het
 *    tegenovergestelde van wat het product belooft.
 *
 * ⚠️ **Een ingediende week is een omtrek en geen vlak.** Hij telde nog niet — er
 *    moet een buddy langs. Dat verschil in vórm en niet in kleur houdt de
 *    betekenis van groen zuiver: groen is "gehaald", en een omtrek is
 *    "onderweg".
 */

export type { Weekstand };

export interface WeekbalkRegel {
  readonly cyclus: string;
  readonly stand: Weekstand;
}

const VOL_HOOG = 44;

/** Dezelfde verhoudingen als de rij, op legendaformaat. */
const LEGENDA_HOOG = 14;

export function Weekbalken({ regels }: { readonly regels: readonly WeekbalkRegel[] }) {
  if (regels.length === 0) {
    return <Body muted>{t('overzicht.weken_leeg')}</Body>;
  }

  return (
    <View style={styles.blok}>
      <View style={styles.rij} accessibilityRole="list">
        {regels.map((regel) => (
          <Balk key={regel.cyclus} regel={regel} />
        ))}
      </View>

      {/*
        ⚠️ Een legenda hoort erbij zodra er meer dan één betekenis in beeld staat.
           Zonder legenda is de kleur de enige drager, en dan is dit een plaatje
           dat je moet raden.
      */}
      <View style={styles.legenda}>
        {WEEKSTANDEN.filter((stand) => stand !== 'leeg').map((stand) => (
          <LegendaRegel key={stand} stand={stand} />
        ))}
      </View>
    </View>
  );
}

function Balk({ regel }: { readonly regel: WeekbalkRegel }) {
  const theme = useTheme();
  const vorm = balkvorm(regel.stand, theme.roles);

  return (
    <View style={styles.kolom}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={t('overzicht.week_label', {
          datum: regel.cyclus,
          stand: t(`weekstand.${regel.stand}` as never),
        })}
        style={[
          styles.balk,
          {
            height: Math.max(3, Math.round(VOL_HOOG * vorm.hoogte)),
            // Een ingediende week is een omtrek: hij telde nog niet.
            backgroundColor: vorm.omtrek ? 'transparent' : vorm.kleur,
            borderColor: vorm.kleur,
            borderWidth: vorm.omtrek ? 2 : 0,
          },
        ]}
      />
    </View>
  );
}

/**
 * ⚠️ **De legenda tekent hetzelfde merk als de rij, en niet een rond stipje.**
 *    Plafond en vloer delen hun kleur en verschillen in hoogte; een legenda van
 *    stippen zou dus twee identieke stippen met twee verschillende woorden
 *    tonen. Dan legt hij niets uit en moet je alsnog raden.
 */
function LegendaRegel({ stand }: { readonly stand: Weekstand }) {
  const theme = useTheme();
  const vorm = balkvorm(stand, theme.roles);

  return (
    <View style={styles.legendaRegel}>
      <View style={styles.legendaVak}>
        <View
          style={[
            styles.legendaBalk,
            {
              height: Math.max(3, Math.round(LEGENDA_HOOG * vorm.hoogte)),
              backgroundColor: vorm.omtrek ? 'transparent' : vorm.kleur,
              borderColor: vorm.kleur,
              borderWidth: vorm.omtrek ? 2 : 0,
            },
          ]}
        />
      </View>
      <Caption>{t(`weekstand.${stand}` as never)}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 3 },
  rij: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // ⚠️ Twee pixels tussen de vlakken, zodat twee gelijke balken naast elkaar
    //    twee weken blijven en geen blok worden.
    gap: 2,
    height: VOL_HOOG,
  },
  kolom: { flex: 1, justifyContent: 'flex-end' },
  balk: { borderRadius: radius.sm, width: '100%' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 3 },
  legendaRegel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendaVak: { width: 8, height: LEGENDA_HOOG, justifyContent: 'flex-end' },
  legendaBalk: { width: 8, borderRadius: radius.sm },
});
