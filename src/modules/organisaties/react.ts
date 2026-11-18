import { useEffect, useState } from 'react';

import { useAsync } from '../../shared/ui';

import type { Bladzijde } from './api';

/**
 * Een lijst met "Meer laden" op een cursor — QS8-657.
 *
 * De eerste pagina loopt door `useAsync` en dus door loading, error en empty
 * van `AsyncView`. Elke volgende pagina hangt eraan met de cursor van de vorige.
 * Een fout bij "Meer laden" laat wat er staat staan en meldt zichzelf; wie de
 * hele lijst kwijtraakt omdat pagina twee faalde, heeft een erger scherm dan
 * een knop die opnieuw kan.
 *
 * ⚠️ De cursor is een waarde en geen paginanummer: een lid dat tussen twee
 *    pagina's vertrekt, verschuift niets.
 */
export function useBladerlijst<T>(
  laad: (na: string | null) => Promise<Bladzijde<T>>,
  deps: readonly unknown[],
) {
  const eerste = useAsync(() => laad(null), deps);
  const [extra, setExtra] = useState<Bladzijde<T> | null>(null);
  const [bezig, setBezig] = useState(false);
  const [meerFout, setMeerFout] = useState(false);

  // Een nieuwe eerste pagina (herladen na uitzetten) vervangt wat er extra stond.
  useEffect(() => {
    setExtra(null);
    setMeerFout(false);
  }, [eerste.data]);

  const volgende = extra === null ? (eerste.data?.volgende ?? null) : extra.volgende;
  const rijen =
    eerste.data === undefined ? undefined : [...eerste.data.rijen, ...(extra?.rijen ?? [])];

  async function laadMeer() {
    if (volgende === null) return;
    setBezig(true);
    setMeerFout(false);
    try {
      const pagina = await laad(volgende);
      setExtra((vorige) => ({
        rijen: [...(vorige?.rijen ?? []), ...pagina.rijen],
        volgende: pagina.volgende,
      }));
    } catch {
      // De api heeft de fout al gemeld; hier alleen laten zien dat het niet lukte.
      setMeerFout(true);
    } finally {
      setBezig(false);
    }
  }

  return {
    rijen,
    loading: eerste.loading,
    error: eerste.error,
    herlaad: eerste.herlaad,
    heeftMeer: volgende !== null,
    laadMeer,
    bezig,
    meerFout,
  };
}
