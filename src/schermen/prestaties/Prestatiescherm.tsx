import { StyleSheet, Text, View } from 'react-native';

import { opmaaktaal, t } from '@/shared/i18n';
import { radius, space, useTheme } from '@/shared/theme';
import { toonKlokDatum } from '@/shared/time';
import { AsyncView, Body, Button, Caption, Card, Pictogram, Subheading } from '@/shared/ui';
import { badgeLabels, badgeUitleg } from '@/modules/goals';
import { useUiterlijk } from '@/modules/uiterlijk/react';
import type { XpStand } from '@/modules/xp';

import { DeelMetGroep } from './DeelMetGroep';
import { emojiVoorPrestatie } from './prestatie-emoji';
import { niveauVoortgang, type Categorie, type Prestatie } from './prestaties-vorm';
import { usePrestaties } from './usePrestaties';

/**
 * Je prestaties — QS8-735. Alleen voor jezelf (domeinregel 7 en 10): geef dit scherm en zijn
 * types nooit aan een groepscomponent. Wat je nog niet hebt is dezelfde vorm in grijs, geen
 * kruis en geen verwijt; XP staat in een eigen kaart en nooit in één element met je punten.
 */
export function Prestatiescherm() {
  const { badges, xp, tz } = usePrestaties();
  return (
    <View style={{ gap: space.blokGap }}>
      <XpKaart laden={xp.loading} fout={xp.error} stand={xp.data} opnieuw={xp.herlaad} />
      <AsyncView
        loading={badges.loading || tz === null}
        error={badges.error}
        data={badges.data}
        isEmpty={() => false}
        onRetry={badges.herlaad}
        empty={{ title: t('prestaties.leeg_titel'), body: t('prestaties.leeg_tekst') }}
      >
        {(groepen) => tz === null ? null : (
          <>
            {groepen.every((g) => g.prestaties.every((p) => p.behaaldOp === null)) ? (
              <Card>
                <Body muted>{t('prestaties.leeg_tekst')}</Body>
              </Card>
            ) : null}
            {groepen.map((g) => (
              <Categoriekaart key={g.categorie} categorie={g.categorie} prestaties={g.prestaties} tz={tz} />
            ))}
          </>
        )}
      </AsyncView>
      <Caption>{t('prestaties.privacy')}</Caption>
    </View>
  );
}

function XpKaart({ laden, fout, stand, opnieuw }: { readonly laden: boolean; readonly fout: unknown; readonly stand: XpStand | undefined; readonly opnieuw: () => void }) {
  const theme = useTheme();
  if (laden) return <Card><Body muted>{t('prestaties.xp_laden')}</Body></Card>;
  if (fout || !stand) {
    return (
      <Card>
        <Body muted>{t('prestaties.xp_niet_beschikbaar')}</Body>
        <Button variant="secundair" onPress={opnieuw}>{t('laden.opnieuw')}</Button>
      </Card>
    );
  }

  const deel = niveauVoortgang(stand.totaal, stand.drempelHuidig, stand.drempelVolgende);
  const percentage = Math.round(deel * 100);
  const label =
    stand.niveau === 0 && stand.drempelVolgende !== null
      ? t('prestaties.xp_begin', { xp: stand.totaal, volgende: stand.drempelVolgende })
      : stand.drempelVolgende === null
      ? t('prestaties.xp_hoogste', { niveau: stand.niveau, xp: stand.totaal })
      : t('prestaties.xp_voortgang', { niveau: stand.niveau, xp: stand.totaal, volgende: stand.drempelVolgende });
  return (
    <Card>
      <Subheading>{stand.niveau === 0 ? t('prestaties.niveau_nul') : t('prestaties.niveau', { niveau: stand.niveau })}</Subheading>
      <View
        style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: percentage }}
      >
        <View style={[styles.vulling, { backgroundColor: theme.roles.progress, width: `${percentage}%` }]} />
      </View>
      <Caption>{label}</Caption>
    </Card>
  );
}

function Categoriekaart({ categorie, prestaties, tz }: { readonly categorie: Categorie; readonly prestaties: readonly Prestatie[]; readonly tz: string }) {
  return (
    <Card>
      <Subheading>{t(`prestaties.categorie_${categorie}`)}</Subheading>
      <View accessibilityRole="list" style={{ gap: space.blokGap }}>
        {prestaties.map((p) => (
          <Prestatierij key={p.badge} p={p} tz={tz} />
        ))}
      </View>
    </Card>
  );
}

function Prestatierij({ p, tz }: { readonly p: Prestatie; readonly tz: string }) {
  const { voorkeur } = useUiterlijk();
  const emoji = emojiVoorPrestatie(p.badge, p.behaaldOp !== null, voorkeur.emoji);
  const naam = badgeLabels()[p.badge];
  const behaald = p.behaaldOp !== null;
  const zeldzaamheid = t(`prestaties.zeldzaamheid_${p.zeldzaamheid}`);
  const status = behaald
    ? t('prestaties.behaald_op', { datum: toonKlokDatum(p.behaaldOp ?? '', tz, opmaaktaal()) })
    : t('prestaties.nog_te_behalen');
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('prestaties.rij_label', { naam, zeldzaamheid, xp: p.xp, status })}
      style={styles.rij}
    >
      <Pictogram naam={p.pictogram} betekenis="prestatie" grootte={44} vergrendeld={!behaald} decoratief />
      {emoji === null ? null : (
        // ⚠️ Een apart, decoratief veld: verborgen voor schermlezers, de tekstnaam staat in de rij zelf.
        <Text aria-hidden importantForAccessibility="no-hide-descendants" style={styles.emoji}>
          {emoji}
        </Text>
      )}
      <View style={styles.tekst}>
        <Body>{naam}</Body>
        <Caption>{badgeUitleg()[p.badge]}</Caption>
        <Caption>{t('prestaties.zeldzaamheid_xp', { zeldzaamheid, xp: p.xp })}</Caption>
        <Caption>{status}</Caption>
        {behaald ? <DeelMetGroep badge={p.badge} naam={naam} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spoor: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: 10, borderRadius: radius.pill },
  rij: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tekst: { flex: 1, gap: 2 },
  emoji: { fontSize: 24 },
});
