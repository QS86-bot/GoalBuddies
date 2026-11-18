import { useState } from 'react';

import { useAsync } from './useAsync';

/** Eén pagina met een cursor: `volgende` is `null` als er niets meer is. */
export interface Bladzijde<T> {
  readonly rijen: readonly T[];
  readonly volgende: string | null;
}

interface Extra<T> {
  /** De eerste pagina waar dit aan hangt; een nieuwe eerste pagina maakt dit ongeldig. */
  readonly bron: unknown;
  readonly rijen: readonly T[];
  readonly volgende: string | null;
}

/**
 * Een lijst met "Meer laden" op een cursor — QS8-657.
 *
 * De eerste pagina loopt door `useAsync` en dus door loading, error en empty
 * van `AsyncView`. Elke volgende pagina hangt eraan met de cursor van de vorige.
 * Een fout bij "Meer laden" laat wat er staat staan en laat een knop opnieuw
 * toe: wie de hele lijst kwijtraakt omdat pagina twee faalde, heeft een erger
 * scherm dan een knop die opnieuw kan.
 *
 * ⚠️ De cursor is een waarde en geen paginanummer: een rij die tussen twee
 *    pagina's verdwijnt, verschuift niets.
 *
 * ⚠️ Wat er na de eerste pagina bij kwam, hangt aan díé pagina (`bron`). Herladen
 *    geeft een nieuw object en laat de oude extra's dus vanzelf vallen, zonder
 *    een effect dat state zet.
 */
export function useBladerlijst<T>(
  laad: (na: string | null) => Promise<Bladzijde<T>>,
  deps: readonly unknown[],
) {
  const eerste = useAsync(() => laad(null), deps);
  const [extra, setExtra] = useState<Extra<T> | null>(null);
  const [foutBron, setFoutBron] = useState<unknown>(null);
  const [bezig, setBezig] = useState(false);

  const bron = eerste.data;
  const actief = extra !== null && extra.bron === bron ? extra : null;
  const volgende = actief === null ? (bron?.volgende ?? null) : actief.volgende;
  const rijen = bron === undefined ? undefined : [...bron.rijen, ...(actief?.rijen ?? [])];

  async function laadMeer() {
    if (volgende === null || bron === undefined) return;
    setBezig(true);
    setFoutBron(null);
    try {
      const pagina = await laad(volgende);
      setExtra({
        bron,
        rijen: [...(actief?.rijen ?? []), ...pagina.rijen],
        volgende: pagina.volgende,
      });
    } catch {
      // De api heeft de fout al gemeld; hier alleen laten zien dat het niet lukte.
      setFoutBron(bron);
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
    meerFout: foutBron !== null && foutBron === bron,
  };
}
