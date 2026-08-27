import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import { bindVertrekwacht, type Terugknop, type Venster, type Vertrekwacht } from './vertrekwacht';

/**
 * De React-kant van de vertrekwacht.
 *
 * ⚠️ **Waarom dit een eigen bestand is.** `react-native` is in Flow geschreven
 *    en een node-testrunner leest dat niet. Alles wat bewezen moet worden staat
 *    daarom in `vertrekwacht.ts` — dat bestand importeert niets — en hier staat
 *    alleen het aansluiten. Dezelfde scheiding als bij `installatie.ts` en zijn
 *    `huidigInstallatieadvies()`.
 */

/**
 * Wat er van het platform beschikbaar is.
 *
 * ⚠️ Per platform precies één mechanisme, want het andere bestaat daar niet:
 *    `beforeunload` is een browsergebeurtenis, en `BackHandler` doet op web en
 *    iOS niets. Dat scheelt een luisteraar die nooit afgaat en verkeerd
 *    vertrouwen wekt.
 */
export function huidigePlatformwacht(): Pick<Vertrekwacht, 'venster' | 'terugknop'> {
  return {
    venster:
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? (window as unknown as Venster)
        : null,
    terugknop: Platform.OS === 'android' ? (BackHandler as Terugknop) : null,
  };
}

/**
 * De hook voor een scherm met onopgeslagen tekst.
 *
 * ⚠️ `opGeblokkeerd` staat in een ref en niet in de dependency-lijst. Een scherm
 *    geeft daar bijna altijd een inline pijlfunctie mee, en die is elke render
 *    een nieuwe waarde — dan wordt de luisteraar elke render opnieuw
 *    geregistreerd. Dezelfde val als bij `useAsync`.
 */
export function useVertrekwacht(actief: boolean, opGeblokkeerd: () => void): void {
  const laatste = useRef(opGeblokkeerd);
  // ⚠️ In een effect en niet tijdens de render: een ref bijwerken tijdens de
  //    render is niet veilig onder concurrent rendering, en de lintregel
  //    `react-hooks/refs` verbiedt het terecht. Dit effect staat vóór het
  //    effect dat bindt, dus de wacht ziet altijd de nieuwste callback.
  useEffect(() => {
    laatste.current = opGeblokkeerd;
  });

  useEffect(
    () =>
      bindVertrekwacht({
        actief,
        opGeblokkeerd: () => laatste.current(),
        ...huidigePlatformwacht(),
      }),
    [actief],
  );
}
