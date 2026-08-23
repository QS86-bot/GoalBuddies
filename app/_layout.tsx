import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isOnboarded, ProfielProvider, SessionProvider, useProfiel, useSession } from '@/modules/auth';
import {
  neemDeel,
  openstaandeUitnodiging,
  vergeetOpenstaandeUitnodiging,
} from '@/modules/buddies';
import { maakWebPushBron, registreerPushToken, zetPushBron } from '@/modules/notifications';
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
      <Uitnodigingswacht />
      <Pushwacht />
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
 * Registreert het pushtoken van dit apparaat zodra er een sessie is — QS8-91.
 *
 * ⚠️ Bij elke start opnieuw, en dat is geen verspilling. `push_tokens.token` is
 *    uniek, dus wie zich het laatst registreert krijgt het token op zijn naam.
 *    Op een gedeeld apparaat is dat precies goed: zonder dit blijft de vorige
 *    gebruiker meldingen krijgen op een telefoon waar hij niet meer op zit.
 *
 * ⚠️ **Op web doet dit sinds QS8-124 wél iets**: `maakWebPushBron()` leest het
 *    bestaande pushabonnement en registreert het. Hij vraagt niets en maakt
 *    niets aan — aanzetten gebeurt achter een klik op het profielscherm. Bij het
 *    opstarten toestemming vragen kost je het kanaal permanent, want een
 *    weggeklikte prompt zet `Notification.permission` op `denied`.
 *
 * ⚠️ **Op native doet dit nog steeds niets**, en dat is bekend.
 *    `expo-notifications` staat niet in `package.json` — een dependency vraagt
 *    eerst toestemming (Q-TODO B4) — dus `geenPush` geeft daar `null` terug. De
 *    rest van de keten (tabel, job, workflow) staat wél; zodra de bibliotheek er
 *    mag komen is het één `zetPushBron(...)` erbij.
 */
function Pushwacht() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    // ⚠️ Eén keer, en vóór het registreren. `zetPushBron` is een zetter op
    //    moduleniveau; hem bij elke sessiewissel opnieuw aanroepen zou werken,
    //    maar het verbergt dat dit een eenmalige bedrading is.
    if (Platform.OS === 'web') zetPushBron(maakWebPushBron());
  }, []);

  useEffect(() => {
    if (userId === null) return;

    // Bewust niet awaiten en bewust stil: geen enkel scherm hangt hiervan af,
    // en de datalaag meldt een fout al via `reportError`.
    void registreerPushToken(userId);
  }, [userId]);

  return null;
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

/**
 * Verzilvert een uitnodiging die op dit apparaat is blijven staan.
 *
 * ⚠️ Waarom dit hier hangt en niet op het uitnodigingsscherm. Iemand tikt een
 *    link aan, drukt op "account maken", krijgt een bevestigingsmail, tikt die
 *    aan — en landt in een verse app-sessie waar dat scherm allang weg is. De
 *    routewacht stuurt hem daarna door de onboarding heen. Zonder deze wacht
 *    komt hij aan het eind op een lege groepenlijst terecht, terwijl de
 *    uitnodigingspagina hem letterlijk beloofde dat hij in de groep zou staan.
 *
 *    Met e-mailbevestiging aan is dat niet het randgeval maar het hoofdpad, en
 *    het is precies de kapotte uitnodigingslink die in de Habit
 *    Huddle-analyse stil elke uitnodiging doodde.
 *
 * ⚠️ Pas ná de onboarding. Eerder zou de routewacht de navigatie meteen weer
 *    wegduwen, en dan is de code verzilverd zonder dat iemand de groep ziet.
 *
 * ⚠️ Eén poging per app-start, bewaakt met een ref. Elke toetreding kost er één
 *    van de twintig per dag, dus een lus die het bij elke render probeert, zet
 *    een nieuwe gebruiker binnen een seconde op slot.
 */
function Uitnodigingswacht() {
  const { session, loading: sessieLaadt } = useSession();
  const { profiel, loading: profielLaadt } = useProfiel();
  const router = useRouter();
  const geprobeerd = useRef(false);

  useEffect(() => {
    if (sessieLaadt || profielLaadt || !session || !isOnboarded(profiel)) return;
    if (geprobeerd.current) return;

    geprobeerd.current = true;
    let levend = true;

    void openstaandeUitnodiging().then(async (code) => {
      if (!levend || code === null) return;

      const uitkomst = await neemDeel(code);
      await vergeetOpenstaandeUitnodiging();

      if (levend && uitkomst.ok) router.replace(`/groep/${uitkomst.waarde}`);
    });

    return () => {
      levend = false;
    };
  }, [session, profiel, sessieLaadt, profielLaadt, router]);

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
