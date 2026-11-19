import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { reportError } from '../../lib/observability';
import { t } from '../i18n';
import { space } from '../theme';

import { Button } from './Button';
import { Screen } from './Screen';
import { Body, Subheading } from './Text';

/**
 * De foutstaat van een tabblad — QS8-705.
 *
 * ⚠️ **Dit is regel 16 voor de renderlaag.** `AsyncView` vangt een mislukte
 *    query; een fout die tijdens het *tekenen* gegooid wordt (een rij met een
 *    tijdzone die `Intl` niet kent) ving niets, en dan houdt React het hele
 *    scherm leeg. Gemeten op een lokale webexport: `document.body` is dan leeg,
 *    zonder kop, zonder menu en zonder melding. Zie
 *    `docs/decisions/2026-11-18-de-navigatie-is-knoppen-en-een-renderfout-is-een-foutstaat.md`.
 *
 * ⚠️ **Een per tabblad, via `export { TabFout as ErrorBoundary }`, en niet één op
 *    de navigator.** Een boundary op `app/(tabs)/_layout.tsx` vervangt de héle
 *    navigator; de menuknoppen in de foutstaat zouden dan naar een router wijzen
 *    die zelf in de fout staat. Per tabblad blijft de navigator staan en werkt
 *    het menu. `tests/beloftes/tabblad-foutstaat.test.ts` eist dat élk bestand
 *    in `app/(tabs)/` hem exporteert.
 *
 * ⚠️ **Nooit `error.message` tonen.** Dezelfde reden als in `AsyncView`: een
 *    foutmelding kan de waarde bevatten die iets brak. Hij gaat naar
 *    `reportError()`, niet naar het scherm.
 */
export function TabFout({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // Een fout die React vangt bereikt `window.onerror` niet, dus zonder deze
    // regel is het enige bewijs dat hij bestond een gebruiker die hem zag.
    reportError(error, 'tab.render');
  }, [error]);

  return (
    <Screen title={t('tab.fout_kop')}>
      <View style={styles.blok} accessibilityRole="alert">
        <Subheading>{t('laden.kop_mislukt')}</Subheading>
        <Body muted>{t('tab.fout_tekst')}</Body>
        <Button variant="primair" onPress={() => void retry()}>
          {t('tab.fout_opnieuw')}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 3, alignItems: 'flex-start' },
});
