import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/shared/i18n';
import { radius, useTheme, type Theme } from '@/shared/theme';
import { Caption, Subheading } from '@/shared/ui';
import { Verloop } from '@/shared/ui/Verloop';

/**
 * De voorvertoning van het scherm Uiterlijk — QS8-731.
 *
 * ⚠️ **Dezelfde tokens als de echte app, geen eigen kleuren.** Het uiterlijk geldt direct (criterium 3), dus
 *    `useTheme()` ís wat de gebruiker gekozen heeft; er is hier geen tweede afleiding die kan afwijken. Elke
 *    kleur komt uit `theme.colors`, `theme.roles` of `theme.verloop`, elke afstand uit `theme.afstand`.
 *
 * ⚠️ **Geen emoji, ook niet voor de emoji-keuze.** Die geldt alleen voor prestatiekaarten (QS8-732) en een
 *    voorbeeld hier zou de regel breken die het voorbeeld uitlegt.
 */
export function Voorvertoning() {
  const theme = useTheme();
  const { colors: c, afstand: a } = theme;
  const rand = { borderColor: c.border, borderRadius: radius.md, padding: a.l, gap: a.m };

  return (
    <View
      style={[styles.kader, rand, { backgroundColor: c.bg }]}
      accessibilityLabel={t('uiterlijk.voorvertoning_label')}
    >
      <Achtergrond theme={theme} />
      <Subheading>{t('uiterlijk.voorvertoning_kop')}</Subheading>
      <Voortgang theme={theme} />
      <View style={{ flexDirection: 'row', gap: a.s }}>
        <Chip kleur={theme.roles.progress} tekst={t('uiterlijk.voorvertoning_gehaald')} theme={theme} />
        <Chip kleur={theme.roles.pending} tekst={t('uiterlijk.voorvertoning_bezig')} theme={theme} />
      </View>
      <View style={[styles.knop, { backgroundColor: c.knop, paddingVertical: a.s, paddingHorizontal: a.l }]}>
        <Text style={[styles.knopTekst, { color: c.knopTekst }]}>{t('uiterlijk.voorvertoning_knop')}</Text>
      </View>
      <Caption>{t('uiterlijk.voorvertoning_stijl', { uiterlijk: theme.uiterlijk })}</Caption>
    </View>
  );
}

/** Uiterlijk C tekent een verloop achter de kaart; A en B blijven vlak. */
function Achtergrond({ theme }: { readonly theme: Theme }) {
  if (theme.verloop === null) return null;
  return <Verloop kleuren={theme.verloop.achtergrond} style={StyleSheet.absoluteFill} />;
}

function Voortgang({ theme }: { readonly theme: Theme }) {
  const streek = theme.verloop?.accent;
  return (
    <View style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}>
      {streek === undefined ? (
        <View style={[styles.vulling, { backgroundColor: theme.roles.progress }]} />
      ) : (
        <Verloop kleuren={streek} richting="horizontaal" style={styles.vulling} />
      )}
    </View>
  );
}

function Chip({ kleur, tekst, theme }: { readonly kleur: string; readonly tekst: string; readonly theme: Theme }) {
  // De kleur is een lijn en de naam staat erbij: een status is nooit alleen kleur.
  return (
    <View style={[styles.chip, { borderColor: kleur, paddingHorizontal: theme.afstand.m, paddingVertical: theme.afstand.xs }]}>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{tekst}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kader: { borderWidth: 1, overflow: 'hidden' },
  spoor: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: 8, width: '60%', borderRadius: radius.pill },
  chip: { borderWidth: 2, borderRadius: radius.pill },
  knop: { borderRadius: radius.base, alignSelf: 'flex-start' },
  knopTekst: { fontSize: 14, fontWeight: '700' },
});
