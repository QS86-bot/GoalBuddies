import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';

import { reportError } from '../../lib/observability';
import { t } from '../i18n';
import { fontSans, radius, space } from '../theme/tokens';
import { themeFor } from '../theme/themes';

import { beginStand, naFout, naHerstel, naPadwissel, type VangnetStand } from './vangnet';

/**
 * Het vangnet om de hele app — QS8-710.
 *
 * ⚠️ **De laatste vanger, en daarom zonder iets wat zelf kan breken.** `TabFout`
 *    (QS8-705) vangt een fout op één tabblad en tekent `Screen`, dus ook
 *    `Taakbalk`; gooit het probleem juist daar, dan valt de foutstaat zelf om.
 *    Deze klasse staat boven álles in `app/_layout.tsx` — boven `SafeAreaProvider`,
 *    `ThemeProvider` en de sessie — en gebruikt geen van die dingen.
 *
 * ⚠️ **Geen `Screen`, geen `Taakbalk`, geen `useTheme`, geen `useSafeAreaInsets`.**
 *    De kleuren komen uit `themeFor(Appearance.getColorScheme())`: de
 *    systeemvoorkeur en niet de gekozen themavoorkeur van de gebruiker, want die
 *    leeft in de provider die hier juist niet is. Dat is de prijs van "kan niet
 *    breken", en hij is klein: dit scherm staat er alleen als er iets stuk is.
 *    `tests/beloftes/root-vangnet.test.ts` eist dat deze file die imports niet
 *    krijgt.
 *
 * ⚠️ **Nooit `error.message` tonen** (zelfde reden als `AsyncView`); hij gaat naar
 *    `reportError()`. Een fout die React vangt haalt `window.onerror` niet.
 *
 * ⚠️ **De volgorde met `TabFout` is een keuze.** Een route met een eigen
 *    `ErrorBoundary`-export vangt eerst; dit vangnet krijgt wat daar doorheen
 *    valt of waar geen boundary is. Beide blijven.
 */
interface Props {
  readonly children: ReactNode;
  /** Het huidige pad. Wisselt het, dan verdwijnt de foutstaat. */
  readonly resetSleutel: string;
}

export class RootVangnet extends Component<Props, VangnetStand> {
  override state: VangnetStand = beginStand(this.props.resetSleutel);

  static getDerivedStateFromError(fout: unknown): Partial<VangnetStand> {
    return naFout(fout);
  }

  static getDerivedStateFromProps(props: Props, stand: VangnetStand): VangnetStand | null {
    const volgende = naPadwissel(stand, props.resetSleutel);
    return volgende === stand ? null : volgende;
  }

  override componentDidCatch(fout: unknown, info: ErrorInfo): void {
    reportError(fout, 'root.render', { componentStack: info.componentStack?.slice(0, 1000) });
  }

  private herstel = (): void => {
    this.setState((stand) => naHerstel(stand));
  };

  override render(): ReactNode {
    return this.state.gevangen ? <RootFoutstaat onHerstel={this.herstel} /> : this.props.children;
  }
}

function RootFoutstaat({ onHerstel }: { readonly onHerstel: () => void }) {
  const c = themeFor(Appearance.getColorScheme() === 'light' ? 'light' : 'dark').colors;

  return (
    <View style={[styles.scherm, { backgroundColor: c.bg }]} accessibilityRole="alert">
      <View style={styles.blok}>
        <Text style={[styles.kop, { color: c.text }]}>{t('vangnet.kop')}</Text>
        <Text style={[styles.tekst, { color: c.textSecondary }]}>{t('vangnet.tekst')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onHerstel}
          style={[styles.knop, { backgroundColor: c.panel, borderColor: c.border }]}
        >
          <Text style={[styles.knopTekst, { color: c.text }]}>{t('vangnet.opnieuw')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Eigen opmaak met alleen tokens: `Heading`, `Body` en `Button` lezen `useTheme()`,
// en dat is precies de provider die hier niet mag bestaan.
const styles = StyleSheet.create({
  scherm: { flex: 1, justifyContent: 'center', padding: space.shell },
  blok: { gap: space.blokGap, width: '100%', maxWidth: 620, alignSelf: 'center', alignItems: 'flex-start' },
  kop: { fontFamily: fontSans, fontSize: 22, fontWeight: '700' },
  tekst: { fontFamily: fontSans, fontSize: 15, lineHeight: 22 },
  knop: {
    borderWidth: 1,
    borderRadius: radius.base,
    // 44 punten, zelfde reden als in `Button`.
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.shell,
  },
  knopTekst: { fontFamily: fontSans, fontSize: 15, fontWeight: '600' },
});
