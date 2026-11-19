import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { opmaaktaal, t } from '@/shared/i18n';
import { radius, space, useTheme } from '@/shared/theme';
import { toonDatumLang } from '@/shared/time';
import { AsyncView, Body, Caption, Card, Choice, Subheading } from '@/shared/ui';

import { PERIODES, type Periode } from './periode-vorm';
import type { Weekcel } from './weekkalender-vorm';
import { DAGDELEN, type Dagdeelstand } from './tijdstip-vorm';
import { useStatistiek, type Statistiek } from './useStatistiek';

/**
 * Je statistieken — QS8-749. Alleen voor jezelf (patroon V7): geen groep, geen percentage,
 * geen punten, geen Dagzet. Een week zonder voltooiing is een open, rustige vorm en geen
 * verwijt (domeinregel 7); wat het scherm toont leest alleen jouw eigen rijen.
 */
export function Statistiekscherm() {
  const [periode, setPeriode] = useState<Periode>('30');
  const { afstand } = useTheme();
  const router = useRouter();
  const { data, loading, error, herlaad } = useStatistiek(periode);

  return (
    <View style={{ gap: afstand.l }}>
      <Card>
        <Choice
          label={t('statistiek.periode_kop')}
          opties={PERIODES.map((waarde) => ({ waarde, label: t(`statistiek.periode_${waarde}`) }))}
          waarde={periode}
          onKies={setPeriode}
        />
      </Card>
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(s) => s.aantalVoltooiingen === 0}
        onRetry={herlaad}
        empty={{
          title: t('statistiek.leeg_titel'),
          body: t('statistiek.leeg_tekst'),
          action: { label: t('statistiek.leeg_actie'), onPress: () => router.push('/') },
        }}
      >
        {(s) => <Inhoud s={s} />}
      </AsyncView>
    </View>
  );
}

function Inhoud({ s }: { readonly s: Statistiek }) {
  return (
    <>
      <Card>
        <Subheading>{t('statistiek.weken_kop')}</Subheading>
        <Body muted>{t('statistiek.weken_uitleg')}</Body>
        <Weekkalender weken={s.weken} />
        <Legenda />
      </Card>
      <Card>
        <Subheading>{t('statistiek.tijdstip_kop')}</Subheading>
        <Body muted>{t('statistiek.tijdstip_uitleg')}</Body>
        <Tijdstippen stand={s.tijdstippen} />
      </Card>
      {s.afgekapt ? <Caption>{t('statistiek.afgekapt')}</Caption> : null}
      <Caption>{t('statistiek.privacy')}</Caption>
    </>
  );
}

function Weekkalender({ weken }: { readonly weken: readonly Weekcel[] }) {
  return (
    <View style={styles.raster} accessibilityRole="list" accessibilityLabel={t('statistiek.weken_kop')}>
      {weken.map((week) => (
        <Week key={week.start} week={week} />
      ))}
    </View>
  );
}

function Week({ week }: { readonly week: Weekcel }) {
  const theme = useTheme();
  const datum = toonDatumLang(week.start, opmaaktaal());
  const staat = week.actief ? t('statistiek.week_actief') : t('statistiek.week_rustig');
  const label = week.isHuidig
    ? t('statistiek.week_huidig', { datum, staat })
    : t('statistiek.week', { datum, staat });

  // ⚠️ Vorm en niet alleen kleur: een week met een voltooiing is een gevuld vlak, een rustige week
  //    een kleine open cirkel. De huidige week heeft een dikke rand.
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label} style={styles.cel}>
      <View
        style={[
          week.actief ? styles.gevuld : styles.open,
          {
            borderColor: week.isHuidig ? theme.colors.accent : theme.colors.border,
            borderWidth: week.isHuidig ? 3 : 1.5,
            backgroundColor: week.actief ? theme.roles.progress : 'transparent',
          },
        ]}
      />
    </View>
  );
}

function Legenda() {
  return (
    <View style={styles.legenda}>
      <Caption>{t('statistiek.legenda_actief')}</Caption>
      <Caption>{t('statistiek.legenda_rustig')}</Caption>
    </View>
  );
}

function Tijdstippen({ stand }: { readonly stand: readonly Dagdeelstand[] }) {
  const theme = useTheme();
  const meeste = Math.max(1, ...stand.map((d) => d.aantal));
  return (
    <View style={styles.tijdstippen}>
      {DAGDELEN.map((dagdeel) => {
        const aantal = stand.find((d) => d.dagdeel === dagdeel)?.aantal ?? 0;
        const naam = t(`statistiek.dagdeel_${dagdeel}`);
        return (
          <View
            key={dagdeel}
            accessible
            accessibilityRole="text"
            accessibilityLabel={t('statistiek.dagdeel_regel', { naam, aantal })}
            style={styles.tijdRegel}
          >
            <Body>{naam}</Body>
            <View style={styles.balkSpoor}>
              <View style={{ flex: aantal, height: 10, borderRadius: radius.pill, backgroundColor: theme.roles.progress }} />
              <View style={{ flex: meeste - aantal }} />
            </View>
            <Caption>{String(aantal)}</Caption>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  raster: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cel: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  gevuld: { width: 20, height: 20, borderRadius: 5 },
  open: { width: 10, height: 10, borderRadius: radius.pill },
  legenda: { gap: 2 },
  tijdstippen: { gap: space.blokGap - 4 },
  tijdRegel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balkSpoor: { flex: 1, flexDirection: 'row' },
});
