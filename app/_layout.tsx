import Constants from 'expo-constants';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isOnboarded, ProfielProvider, SessionProvider, useProfiel, useSession } from '@/modules/auth';
import {
  fetchUitnodiging,
  neemDeel,
  openstaandeUitnodiging,
  routeVoorUitnodiging,
  vergeetOpenstaandeUitnodiging,
} from '@/modules/buddies';
import {
  expoPush,
  maakWebPushBron,
  registreerPushToken,
  zetPushBron,
} from '@/modules/notifications';
import { clientEnv } from '@/lib/env';
import {
  koppelGlobaleFouten,
  maakSentrySink,
  reportError,
  setErrorSink,
} from '@/lib/observability';
import { apparaatVoorkeuren, t, taalUitApparaat, zetTaal } from '@/shared/i18n';
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
 * ⚠️ **De bron wordt één keer gezet, buiten de component.** Niet in een
 *    `useEffect`, want het is een registratie en geen neveneffect van renderen.
 *    Dit leest als wat het is: de app kiest bij het opstarten zijn pushbron.
 *
 * ⚠️ **Twee bronnen, één interface — precies waar `tokens.ts` op ontworpen was.**
 *    Op web `maakWebPushBron()` (QS8-124), op native `expoPush` (Q-TODO B4,
 *    toestemming van Quinten op 21-08-2026). Eén regel, en verder niets: geen
 *    scherm, geen datalaag, geen Edge Function.
 *
 * ⚠️ `maakWebPushBron()` **vraagt niets en maakt niets aan** — hij leest een
 *    bestaand abonnement. Aanzetten gebeurt achter een klik op het
 *    profielscherm. Bij het opstarten toestemming vragen kost je het kanaal
 *    permanent, want een weggeklikte prompt zet `Notification.permission` op
 *    `denied`. Hij raakt hier bovendien niets aan en geeft alleen een object met
 *    een async functie terug, dus dit is ook veilig tijdens de statische export,
 *    waar geen `navigator` bestaat.
 *
 * ⚠️ Op een echt toestel komt er nog steeds niets binnen: daarvoor is een
 *    EAS-project met FCM- en APNs-sleutels nodig, en dat zit in de build en niet
 *    in de server. `expoPush` geeft dan `null` met een reden in het logboek in
 *    plaats van een fout die op een netwerkprobleem lijkt. Zie `docs/DEPLOY.md`.
 */
/**
 * De bestemming voor foutmeldingen — QS8-24, criterium 1.
 *
 * ⚠️ **Dit ontbrak, en het is de reden dat het criterium openstond.**
 *    `reportError()` bestond, 34 bestanden riepen hem aan, en `setErrorSink()`
 *    werd door niets in de productiecode aangeroepen. Elke gemelde fout eindigde
 *    in `console.error`, op een apparaat dat niemand leest. Elk schakeltje af,
 *    de keten nergens aangesloten — CLAUDE.md regel 18, vraag 5.
 *
 * ⚠️ **Buiten de component, net als `zetPushBron`.** Dit moet vaststaan vóórdat
 *    het eerste scherm rendert, anders is een fout tijdens die eerste render
 *    precies de fout die je niet te zien krijgt.
 *
 * ⚠️ Zonder DSN blijft de sink `undefined` en valt `reportError()` terug op
 *    `console.error`. Dat is in ontwikkeling precies wat je wilt zien.
 */
setErrorSink(
  maakSentrySink({
    dsn: clientEnv().sentryDsn,
    runtime: Platform.OS,
    // ⚠️ De versie uit `app.json`, en weglaten als hij er niet is in plaats van
    //    er iets van te maken. Sentry koppelt source maps aan een release; een
    //    verzonnen versie koppelt ze aan de verkeerde.
    release: versieVanDeApp(),
  }),
);

/** `goalbuddies@0.1.0`, of `undefined` als de versie onbekend is. */
function versieVanDeApp(): string | undefined {
  const versie = Constants.expoConfig?.version;
  return typeof versie === 'string' && versie !== '' ? `goalbuddies@${versie}` : undefined;
}

/**
 * De fouten die niemand opving.
 *
 * ⚠️ Zonder dit meldt de app alleen de fouten waarvan iemand al had bedacht dat
 *    ze konden optreden. Een `TypeError` in een render of een afgewezen `Promise`
 *    zonder `.catch()` komt nergens terecht — en dat zijn nu juist de gevallen
 *    waarin je niet weet dat je iets stuk hebt gemaakt.
 *
 * ⚠️ Alleen op web, en alleen als er een `window` is. Bij de statische export
 *    draait deze module in Node, waar `addEventListener` niet bestaat. Op native
 *    zou dit via `ErrorUtils` gaan; die code is hier niet te toetsen en staat er
 *    daarom niet — zie de kop van `globale-fouten.ts`.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  koppelGlobaleFouten(window, (fout, waar) => {
    reportError(fout, waar);
  });
}

zetPushBron(Platform.OS === 'web' ? maakWebPushBron() : expoPush);

// ⚠️ De taal van het apparaat als startwaarde — QS8-113. Zodra het profiel
//    geladen is en er een keuze in staat, wint die (zie `ProfielProvider`).
//    Buiten de component en niet in een effect: dit moet vaststaan vóórdat het
//    eerste scherm rendert, anders flitst er een Nederlandse regel voorbij bij
//    iemand die Engels heeft ingesteld.
zetTaal(taalUitApparaat(apparaatVoorkeuren()));

function Pushwacht() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;

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

    void (async () => {
      const wachtend = await openstaandeUitnodiging();
      if (!levend || wachtend === null) return;

      // ⚠️ **Besluit A49 (QS8-136), eerste helft: een bewaarde code verloopt.**
      //    Deze opslag bestaat voor één pad — je tikt een uitnodigingslink aan,
      //    maakt een account, bevestigt je mail en komt terug in een verse
      //    sessie. Dat pad duurt minuten. Wie de link twee weken geleden opende
      //    en toen besloot niet mee te doen, hoorde niet alsnog in die groep te
      //    belanden zodra hij zich aanmeldde.
      //
      //    Niet weggooien maar tónen: de gebruiker landt op het
      //    uitnodigingsscherm en drukt zelf. Weggooien zou de uitnodiging
      //    doodmaken, en dat is precies wat deze opslag moest voorkomen.
      // ⚠️ **Tweede helft: een open groep gaat nooit vanzelf.** Toetreden tot een
      //    open groep maakt je gemiste weken, je beste reeks en je historische
      //    aanwezigheid zichtbaar voor de anderen — dezelfde overgang als het
      //    ópenzetten van een groep, waar een beheerder een volledig
      //    bevestigingsblok voor doorloopt (migratie 0076, grens 3). Dan hoort
      //    hier ook een handeling van de gebruiker zelf te staan.
      //
      //    `invite_preview()` draagt de zichtbaarheid sinds migratie 0080, dus
      //    dit kost geen extra rondje: het scherm haalt hem toch al op.
      //
      // ⚠️ Kan de uitnodiging niet opgehaald worden (netwerk, ingetrokken link),
      //    dan ook naar het scherm. Onbekend is hier de kant waar niets
      //    stilzwijgend gebeurt — dezelfde keuze als bij de vervaltermijn.
      //
      // ⚠️ **De beslissing zelf staat in `routeVoorUitnodiging()` en niet hier**,
      //    en dat is sinds 25-08-2026 zo. Ze stond volledig in dit bestand, en
      //    dit bestand is niet te testen: er is geen `.test.tsx` in dit project
      //    en vitest draait in node. De zwaarste helft van A49 was daarmee
      //    structureel onbewaakt. Hier staat nu alleen nog wát er gebeurt, niet
      //    wanneer.
      //
      // ⚠️ Alleen ophalen als het ertoe doet. Is de code verlopen, dan is de
      //    zichtbaarheid niet meer van belang en kost een rondje naar de server
      //    niets dan tijd.
      const uitnodiging = wachtend.automatisch
        ? await fetchUitnodiging(wachtend.code).catch(() => null)
        : null;
      if (!levend) return;

      const route = routeVoorUitnodiging({
        automatisch: wachtend.automatisch,
        zichtbaarheid: uitnodiging?.zichtbaarheid ?? null,
      });

      if (route.soort === 'toon-scherm') {
        router.replace(`/uitnodiging/${wachtend.code}`);
        return;
      }

      const uitkomst = await neemDeel(wachtend.code);
      await vergeetOpenstaandeUitnodiging();
      if (!levend) return;

      if (uitkomst.ok) {
        router.replace(`/groep/${uitkomst.waarde}`);
        return;
      }

      // ⚠️ **Zwijgen is hier het ergste antwoord, en dat deed deze functie tot
      //    24-08.** Bij een mislukking gebeurde er níéts: geen melding, geen
      //    scherm, en de bewaarde code was intussen weggegooid. Het
      //    uitnodigingsscherm belooft "ook als je eerst je e-mail moet
      //    bevestigen, sta je daarna gewoon in de groep" — dus wie zijn mail
      //    bevestigde en terugkwam, stond op een leeg dashboard zonder groep en
      //    zonder uitleg.
      //
      //    Sturen naar het uitnodigingsscherm en niet zelf een melding tonen:
      //    dát scherm laadt de groep opnieuw, zegt wat er aan de hand is en heeft
      //    een knop om het opnieuw te proberen. Deze component rendert `null` en
      //    heeft nergens plek voor een melding.
      //
      //    ⚠️ Bewust géén `reportError` erbij. `neemDeel()` meldt een échte fout
      //    al zelf; wat hier overblijft is een uitkomst — de link is ingetrokken,
      //    de groep is vol — en dat is geen storing maar een antwoord.
      router.replace(`/uitnodiging/${wachtend.code}`);
    })();

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
      accessibilityLabel={t('algemeen.laden')}
    >
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}
