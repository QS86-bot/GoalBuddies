import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  parsePreference,
  themeFor,
  themeForPreference,
  type Theme,
  type ThemePreference,
} from './themes';

/**
 * Donkere modus als volwaardige stand, niet als filter over de lichte.
 *
 * ⚠️ De PRD had dit op P1. Hier staat het op P0 en meteen aan het begin, omdat
 *    achteraf omzetten betekent dat je elk scherm opnieuw aanraakt. Bovendien is
 *    dit een app die 's avonds gebruikt wordt: donker is hier de primaire modus
 *    en licht de variant, niet andersom.
 *
 * De voorkeur is drie standen en niet een schakelaar: "systeem" moet een echte
 * keuze zijn, anders bevriest de eerste aanraking van de knop de app in één
 * stand terwijl het toestel 's avonds omschakelt.
 */

const OPSLAGSLEUTEL = 'goalbuddies.thema';

interface ThemeContextWaarde {
  readonly theme: Theme;
  readonly preference: ThemePreference;
  readonly setPreference: (next: ThemePreference) => void;
  /** Is de opgeslagen voorkeur al ingelezen? Voorkomt een flits bij het opstarten. */
  readonly ready: boolean;
}

const ThemeContext = createContext<ThemeContextWaarde | undefined>(undefined);

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('systeem');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let levend = true;

    AsyncStorage.getItem(OPSLAGSLEUTEL)
      .then((raw) => {
        if (levend) setPreferenceState(parsePreference(raw));
      })
      .catch(() => {
        // Opslag stuk of geweigerd: dan volgen we het systeem. Geen reden om de
        // gebruiker hiermee lastig te vallen, wel om het niet stil te laten
        // mislukken in de logs.
        console.warn('Themavoorkeur kon niet gelezen worden; systeeminstelling wordt gevolgd.');
      })
      .finally(() => {
        if (levend) setReady(true);
      });

    return () => {
      levend = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    // Eerst de UI, dan de opslag. Een trage schijf mag een tik niet vertragen.
    setPreferenceState(next);
    AsyncStorage.setItem(OPSLAGSLEUTEL, next).catch(() => {
      console.warn('Themavoorkeur kon niet bewaard worden.');
    });
  }, []);

  const waarde = useMemo<ThemeContextWaarde>(
    () => ({
      theme: themeForPreference(preference, scheme),
      preference,
      setPreference,
      ready,
    }),
    [preference, scheme, setPreference, ready],
  );

  return <ThemeContext.Provider value={waarde}>{children}</ThemeContext.Provider>;
}

/**
 * Het actieve thema.
 *
 * Werkt ook zonder provider — dan volgt hij simpelweg de systeeminstelling. Dat
 * is bewust: een los gerenderde component in een test hoort niet om te vallen
 * omdat er geen provider omheen staat.
 */
export function useTheme(): Theme {
  const uitContext = useContext(ThemeContext);
  const scheme = useColorScheme();
  return uitContext?.theme ?? themeFor(scheme);
}

/**
 * De voorkeur zelf, voor het instellingenscherm.
 *
 * Deze vraagt wél om een provider: een schakelaar die nergens op aangesloten is,
 * hoort stuk te gaan tijdens het bouwen en niet stilletjes niets te doen.
 */
export function useThemePreference(): Omit<ThemeContextWaarde, 'theme'> {
  const waarde = useContext(ThemeContext);
  if (!waarde) {
    throw new Error('useThemePreference() vraagt een <ThemeProvider> erboven.');
  }
  const { preference, setPreference, ready } = waarde;
  return { preference, setPreference, ready };
}
