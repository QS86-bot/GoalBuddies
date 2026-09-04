import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

import {
  bindVertrekwacht,
  vertrekstap,
  type Terugknop,
  type Venster,
  type Vertrekwacht,
} from './vertrekwacht';

/**
 * De React-kant van de vertrekwacht.
 *
 * ⚠️ **Waarom dit een eigen bestand is.** `react-native` is in Flow geschreven
 *    en een node-testrunner leest dat niet. Alles wat bewezen moet worden staat
 *    daarom in `vertrekwacht.ts` — dat bestand importeert niets — en hier staat
 *    alleen het aansluiten. Dezelfde scheiding als bij `installatie.ts` en zijn
 *    `huidigInstallatieadvies()`.
 *
 * ⚠️ **`usePreventRemove` komt uit `expo-router/react-navigation` en nergens
 *    anders vandaan.** expo-router heeft geen `exports`-veld, dus een diepe
 *    import als `expo-router/build/react-navigation/core/usePreventRemove`
 *    resolvet gewoon en typecheckt gewoon — en breekt stil bij de volgende SDK,
 *    want dat pad is interne indeling. `react-navigation.js` en
 *    `react-navigation.d.ts` staan in `files` van het pakket, náást `stack`,
 *    `tabs` en `testing-library`: dat is het gepubliceerde toegangspunt.
 *    `npm run typecheck` vangt dit onderscheid niet — de grendel ervoor staat in
 *    `tests/beloftes/de-terugknop-van-de-router.test.ts`.
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

/** Een onthouden vertrekwens. Een object en geen kale functie, zodat twee keer
 *  dezelfde knop indrukken ook twee keer een nieuwe stand is. */
interface Wens {
  readonly doen: () => void;
}

/**
 * De hook voor een scherm met onopgeslagen tekst.
 *
 * Geeft terug hoe je *wél* weggaat: `verlaat(() => router.replace(...))`. Dat is
 * geen gemak maar de nooduitgang — zie `vertrekstap()` voor waarom een scherm
 * niet rechtstreeks mag navigeren zolang zijn eigen wacht staat.
 *
 * ⚠️ **Deze hook hoort in een scherm en niet in een los component.**
 *    `usePreventRemove` leest de route waarin hij staat; buiten een navigator
 *    gooit hij. Dat is de bedoeling: een wacht zonder route weet niet wat er
 *    tegengehouden moet worden.
 *
 * ⚠️ `opGeblokkeerd` staat in een ref en niet in de dependency-lijst. Een scherm
 *    geeft daar bijna altijd een inline pijlfunctie mee, en die is elke render
 *    een nieuwe waarde — dan wordt de luisteraar elke render opnieuw
 *    geregistreerd. Dezelfde val als bij `useAsync`.
 */
export function useVertrekwacht(
  actief: boolean,
  opGeblokkeerd: () => void,
): (weg: () => void) => void {
  const laatste = useRef(opGeblokkeerd);
  const [wens, setWens] = useState<Wens | null>(null);

  // ⚠️ In een effect en niet tijdens de render: een ref bijwerken tijdens de
  //    render is niet veilig onder concurrent rendering, en de lintregel
  //    `react-hooks/refs` verbiedt het terecht. Dit effect staat vóór het
  //    effect dat bindt, dus de wacht ziet altijd de nieuwste callback.
  useEffect(() => {
    laatste.current = opGeblokkeerd;
  });

  // Zodra er een wens ligt, is de wacht van dit scherm klaar met tegenhouden.
  const wacht = actief && wens === null;

  useEffect(
    () =>
      bindVertrekwacht({
        actief: wacht,
        opGeblokkeerd: () => laatste.current(),
        ...huidigePlatformwacht(),
      }),
    [wacht],
  );

  // ⚠️ **Deze aanroep staat met opzet vóór het effect eronder.** Effecten draaien
  //    in de volgorde waarin hun hooks staan, dus `usePreventRemove` heeft zijn
  //    luisteraar al bijgewerkt naar `wacht === false` voordat er genavigeerd
  //    wordt. Anders houdt de wacht de nooduitgang tegen die hij zelf aanbiedt.
  usePreventRemove(wacht, () => laatste.current());

  // ⚠️ Een ref en geen `setWens(null)`: de wens terugzetten in dit effect is een
  //    `setState` in een effect, en `react-hooks/set-state-in-effect` verbiedt
  //    dat terecht. Onthouden welke wens al uitgevoerd is, doet hetzelfde werk
  //    zonder de extra render — en houdt de wacht omlaag, wat klopt: de
  //    gebruiker heeft gezegd dat hij weg wil.
  const gedaan = useRef<Wens | null>(null);

  useEffect(() => {
    // De eerste helft is voor TypeScript en is dood: `gaan` bestaat niet zonder
    // wens. De tweede helft is echt — een tweede tik moet een nieuwe wens zijn.
    if (wens === null || gedaan.current === wens) return;
    if (vertrekstap(wacht, wens) !== 'gaan') return;
    gedaan.current = wens;
    wens.doen();
  }, [wacht, wens]);

  return useCallback((weg: () => void) => setWens({ doen: weg }), []);
}
