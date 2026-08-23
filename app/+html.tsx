import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * De HTML-schil om elke statisch geëxporteerde route — QS8-117.
 *
 * ⚠️ **Dit bestand draait alleen op de server, tijdens `expo export`.** Er is
 *    hier geen browser, geen thema-context en geen profiel: alles wat je hier
 *    zet, staat identiek in álle 23 geëxporteerde pagina's. Geen `useState`,
 *    geen `t()`, geen kleur uit `useTheme()`.
 *
 * ⚠️ De kleuren staan daarom hardgecodeerd, en dat is de énige plek waar dat
 *    mag. `theme_color` en `background_color` worden door het besturingssysteem
 *    gelezen vóórdat er één regel JavaScript draait — het opstartscherm en de
 *    systeembalk zijn er al voordat de app weet welk thema de gebruiker koos.
 *    De waarde is letterlijk `navy.bg` uit `src/shared/theme/tokens.ts`.
 *
 * ⚠️ **Zonder `rel="manifest"` en `apple-touch-icon` is er op iOS geen web push.**
 *    Safari levert geen meldingen aan een gewoon tabblad; de site moet aan het
 *    beginscherm zijn toegevoegd en dan als zelfstandige app openen. Zie QS8-117.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0e1730" />

        {/* iOS leest het manifest-icoon niet voor het beginscherm. Zonder deze
            regel zet het toestel een schermafdruk op de tegel. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/favicon.png" />

        {/* De legacy-schakelaar van iOS. Het manifest is sinds iOS 16.4 leidend,
            maar oudere toestellen kijken hier nog naar en het kost niets. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GoalBuddies" />

        {/*
          ⚠️ Van Expo zelf: zet het scrollgedrag van `body` goed bij
             `ScrollView`-gebruik. Weghalen breekt de scroll op web.
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
