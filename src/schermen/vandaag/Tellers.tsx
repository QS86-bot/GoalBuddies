import { StyleSheet, View } from 'react-native';

import { getal, t } from '@/shared/i18n';
import { radius, space, useTheme } from '@/shared/theme';
import { Caption, Subheading } from '@/shared/ui';

import { tellers } from './tellers-vorm';
import type { useVandaag } from './useVandaag';

type Gegevens = ReturnType<typeof useVandaag>;

/**
 * Drie tellers op Vandaag: vangnet, reeks en punten van deze week — QS8-747.
 *
 * ⚠️ **Privé, en dat is een domeinregel.** Punten zijn alleen voor de eigenaar
 *    (domeinregel 10) en een verbruikte weekpas is het bewijs van een gemiste week
 *    (domeinregel 7). Dit blok neemt alleen `useVandaag()` aan en hoort op geen
 *    groepsscherm (`tests/beloftes/de-tellers-blijven-prive.test.ts`).
 *
 * ⚠️ **Geen balk, geen grafiek.** Score kan dalen en voortgang niet; ze staan nooit
 *    in één element (domeinregel 10). Daarom is dit rij van getallen en nergens een
 *    `Voortgangsbalk`.
 *
 * ⚠️ **Vangnet en punten staan los van elkaar**: een weekpas beschermt de reeks,
 *    niet het punt. De label van het vangnet zegt dat met zoveel woorden.
 *
 * ⚠️ **Een lege week leest neutraal**: 0 punten is "0" en niet "geen". Geen
 *    antwoord is een streepje, en geen rood of waarschuwing (domeinregel 7).
 */
export function TellersBlok({ v }: { readonly v: Gegevens }) {
  const t3 = tellers(v.standen);
  const stand = v.standenStatus;
  const puntenWacht = v.puntenLoading;
  const puntenFout = v.puntenError !== null && v.puntenError !== undefined;
  const fout = stand === 'fout' || puntenFout;

  // ⚠️ Zonder doelen is er niets te tellen, en "– – 0" is geen eerste indruk (zelfde
  //    redenering als `StandBlok`). De rij verschijnt met het eerste doel.
  if (stand === 'klaar' && v.standen.size === 0) return null;

  return (
    <View style={styles.blok} accessibilityRole="summary" accessibilityLabel={t('tellers.titel')}>
      <View style={styles.rij}>
        <Teller
          titel={t('tellers.vangnet')}
          uitleg={(n) => t(n === 0 ? 'tellers.vangnet_uitleg_nul' : 'tellers.vangnet_uitleg')}
          waarde={stand === 'klaar' ? t3.vangnet : null}
          wacht={stand === 'laden'}
          label={(n) =>
            n === 0
              ? t('tellers.label_vangnet_nul')
              : n === 1
                ? t('tellers.label_vangnet_een')
                : t('tellers.label_vangnet', { aantal: getal(n, 0) })
          }
        />
        <Teller
          titel={t('tellers.reeks')}
          uitleg={(n) => t(n === 1 ? 'tellers.reeks_uitleg_een' : 'tellers.reeks_uitleg')}
          waarde={stand === 'klaar' ? t3.reeks : null}
          wacht={stand === 'laden'}
          label={(n) =>
            n === 1 ? t('tellers.label_reeks_een') : t('tellers.label_reeks', { aantal: getal(n, 0) })
          }
        />
        <Teller
          titel={t('tellers.punten')}
          uitleg={() => t('tellers.punten_uitleg')}
          waarde={v.puntenDezeWeek ?? null}
          wacht={puntenWacht && !puntenFout}
          label={(n) => t('tellers.label_punten', { aantal: getal(n, 0) })}
        />
      </View>
      {fout ? (
        <Caption>{stand !== 'fout' && puntenFout ? t('tellers.punten_laden') : t('tellers.fout')}</Caption>
      ) : null}
    </View>
  );
}

function Teller({
  titel,
  uitleg,
  waarde,
  wacht,
  label,
}: {
  readonly titel: string;
  readonly uitleg: (n: number | null) => string;
  readonly waarde: number | null;
  readonly wacht: boolean;
  readonly label: (n: number) => string;
}) {
  const theme = useTheme();
  const tekst = waarde === null ? t('tellers.onbekend') : getal(waarde, 0);
  const a11y = waarde === null ? (wacht ? t('algemeen.laden') : `${titel}: ${uitleg(null)}`) : label(waarde);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
      style={[
        styles.teller,
        {
          backgroundColor: theme.colors.panelDark,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Caption>{titel}</Caption>
      <View style={wacht ? styles.wacht : null}>
        <Subheading>{tekst}</Subheading>
      </View>
      <Caption>{uitleg(waarde)}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 4 },
  rij: { flexDirection: 'row', gap: 8 },
  wacht: { opacity: 0.5 },
  teller: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
});
