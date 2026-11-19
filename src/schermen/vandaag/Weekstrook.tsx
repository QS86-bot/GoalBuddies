import { StyleSheet, View } from 'react-native';

import { opmaaktaal, t, weekdagKort } from '@/shared/i18n';
import { radius, space, useTheme } from '@/shared/theme';
import { toonDatumLang } from '@/shared/time';
import { Caption } from '@/shared/ui';

import type { useVandaag } from './useVandaag';
import { actieveDagen, weekstrook, type Weekdag } from './weekstrook-vorm';

type Gegevens = ReturnType<typeof useVandaag>;

/**
 * De week van de gebruiker als zeven ronde dagen — QS8-746.
 *
 * ⚠️ **Privé, en dat staat hier omdat de component het scherm niet verlaat.** De
 *    gegevens zijn de eigen afvinkingen en Dagzetten (eigenaar-only, domeinregel 9)
 *    en `Weekstrook` neemt alleen `useVandaag()` aan. Hij hoort op geen groepsscherm
 *    (`tests/beloftes/de-weekstrook-blijft-privé.test.ts`).
 *
 * ⚠️ **Een lege dag is leeg en niets anders** (domeinregel 7): een open cirkel,
 *    geen kruis, geen rood, geen woord als "gemist".
 *
 * ⚠️ **Vandaag is een dikke rand, een streepje eronder én een woord in het label.**
 *    Kleur alleen haalt een kleurenblinde gebruiker niets op.
 *
 * ⚠️ **Elke dag leest als één regel** (`weekstrook.dag_*`): datum, of er iets
 *    gedaan is, en of het vandaag is. De letter erboven is versiering.
 */
export function WeekstrookBlok({ v }: { readonly v: Gegevens }) {
  const theme = useTheme();
  const start = v.cyclus?.startDate ?? null;

  if (start === null) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={t('algemeen.laden')} style={styles.rij}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={[styles.cirkel, { borderColor: theme.colors.border, opacity: 0.5 }]} />
        ))}
      </View>
    );
  }

  const dagen = weekstrook(start, v.vandaagLokaal, actieveDagen(v.afvinkingen, v.dagzetten));
  const leeg = !dagen.some((d) => d.actief);

  return (
    <View style={styles.blok}>
      <View style={styles.rij} accessibilityRole="list">
        {dagen.map((dag) => (
          <Dag key={dag.datum} dag={dag} />
        ))}
      </View>
      {v.error !== null && v.error !== undefined ? (
        <Caption>{t('weekstrook.fout')}</Caption>
      ) : leeg && !v.loading ? (
        <Caption>{t('weekstrook.leeg')}</Caption>
      ) : null}
    </View>
  );
}

function Dag({ dag }: { readonly dag: Weekdag }) {
  const theme = useTheme();
  const datum = toonDatumLang(dag.datum, opmaaktaal());
  const staat = dag.actief ? t('weekstrook.dag_actief') : t('weekstrook.dag_rustig');
  const label = dag.isVandaag
    ? t('weekstrook.dag_vandaag', { datum, staat })
    : t('weekstrook.dag', { datum, staat });

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label} style={styles.dag}>
      <Caption muted={!dag.isVandaag}>{weekdagKort(dag.weekdag)}</Caption>
      <View
        style={[
          styles.cirkel,
          {
            borderColor: dag.isVandaag ? theme.colors.accent : theme.colors.border,
            borderWidth: dag.isVandaag ? 3 : 1.5,
            backgroundColor: dag.actief ? theme.roles.progress : 'transparent',
          },
        ]}
      />
      <View
        style={[styles.streepje, { backgroundColor: dag.isVandaag ? theme.colors.accent : 'transparent' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 4 },
  rij: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  dag: { alignItems: 'center', gap: 4, flex: 1 },
  cirkel: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1.5 },
  streepje: { width: 14, height: 3, borderRadius: 2 },
});
