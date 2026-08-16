import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isOnboarded, ProfielProvider, SessionProvider, useProfiel, useSession } from '@/modules/auth';
import { ThemeProvider, useTheme } from '@/shared/theme';

/**
 * De wortel van de app. Alles wat elk scherm nodig heeft, hangt hier.
 *
 * ⚠️ De volgorde van de providers is niet vrij. `ThemeProvider` staat bóven de
 *    navigatie, anders valt hij bij elke routewissel weg en flitst het verkeerde
 *    thema. En `ProfielProvider` staat ónder `SessionProvider`, want zonder
 *    sessie is er geen profiel om te laden.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <ProfielProvider>
            <Shell />
          </ProfielProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const theme = useTheme();

  return (
    // De achtergrondkleur staat óók hier, niet alleen op elk scherm. Tijdens een
    // routeovergang is heel even de laag hieronder zichtbaar, en die hoort niet
    // wit te zijn in de donkere modus.
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Routewacht />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    </View>
  );
}

/**
 * Stuurt de gebruiker naar de plek waar hij hoort.
 *
 * ⚠️ Drie regels, en de volgorde is de hele truc:
 *
 *    1. Zolang de sessie of het profiel laadt: níéts doen. Bij een koude start
 *       is er heel even geen sessie terwijl die wél in de opslag staat. Wie hier
 *       te vroeg beslist, gooit elke ingelogde gebruiker bij elke start terug
 *       naar het inlogscherm.
 *    2. Geen sessie → aanmelden. Behalve op de uitnodigingspagina: die is juist
 *       bedoeld voor iemand die de app nog niet heeft.
 *    3. Wel een sessie maar geen afgeronde onboarding → de uitleg.
 */
function Routewacht() {
  const { session, loading: sessieLaadt } = useSession();
  const { profiel, loading: profielLaadt } = useProfiel();
  const segments = useSegments();
  const router = useRouter();

  const wortel = segments[0] ?? '';
  const opAanmelden = wortel === 'aanmelden';
  const inOnboarding = wortel === 'onboarding';
  const opUitnodiging = wortel === 'uitnodiging';

  useEffect(() => {
    if (sessieLaadt || profielLaadt) return;

    // Een uitnodigingslink is het eerste dat iemand van dit product ziet. Die
    // pagina blijft dus altijd bereikbaar, ingelogd of niet.
    if (opUitnodiging) return;

    if (!session) {
      if (!opAanmelden) router.replace('/aanmelden');
      return;
    }

    if (!isOnboarded(profiel)) {
      if (!inOnboarding) router.replace('/onboarding/uitleg');
      return;
    }

    if (opAanmelden || inOnboarding) router.replace('/');
  }, [
    session,
    profiel,
    sessieLaadt,
    profielLaadt,
    opAanmelden,
    inOnboarding,
    opUitnodiging,
    router,
  ]);

  return null;
}

/** Voor schermen die op de sessie wachten. Geen wit vlak, geen sprong. */
export function Bezig() {
  const theme = useTheme();
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityLabel="Laden"
    >
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}
