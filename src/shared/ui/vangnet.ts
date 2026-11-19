/**
 * De beslissingen van het vangnet in de wortel — QS8-710.
 *
 * ⚠️ **Een pure module en niet een stuk van de klasse.** Het vangnet zelf is een
 *    React-klasse (`RootVangnet.tsx`). Wat hier staat is wát er beslist wordt:
 *    wanneer een fout een foutstaat wordt en wanneer die weer weggaat. De klasse
 *    verbindt dat met React en tekent. Beide staan onder toets: deze functies
 *    direct, de klasse via `tests/beloftes/root-vangnet.test.ts` met een
 *    `react-native`-stub (zoals `src/modules/auth/servermelding.test.ts`).
 *
 * ⚠️ **De belofte is "een fout laat nooit een wit scherm achter, en een
 *    padwissel haalt de foutstaat weer weg".** Het tweede deel is net zo
 *    belangrijk als het eerste: zonder reset zit je na één fout vast op elk
 *    volgend scherm, ook op het scherm dat wél werkt.
 */

export interface VangnetStand {
  /** Er is een fout gevangen. Los van `fout`, want `throw undefined` bestaat. */
  readonly gevangen: boolean;
  readonly fout: unknown;
  /** Het pad waar deze stand bij hoort. Wijkt het af van het huidige, dan is de fout verouderd. */
  readonly sleutel: string;
}

export function beginStand(sleutel: string): VangnetStand {
  return { gevangen: false, fout: undefined, sleutel };
}

/**
 * Wat er in de stand komt nadat een kind een fout gooide.
 *
 * ⚠️ Alleen `gevangen` en `fout`, de sleutel blijft zoals hij was:
 *    `getDerivedStateFromError` kent de props niet, en hij hoeft ze niet te
 *    kennen, want `naPadwissel` ruimt op.
 */
export function naFout(fout: unknown): Pick<VangnetStand, 'gevangen' | 'fout'> {
  return { gevangen: true, fout };
}

/**
 * De stand na een nieuwe render met een (mogelijk) ander pad.
 *
 * ⚠️ **Zelfde sleutel is dezelfde stand, óók als er een fout in zit.** Anders
 *    zou de foutstaat bij elke render van de ouder verdwijnen en meteen weer
 *    gooien: een lus in plaats van een foutstaat.
 */
export function naPadwissel(stand: VangnetStand, sleutel: string): VangnetStand {
  if (stand.sleutel === sleutel) return stand;
  return beginStand(sleutel);
}

/** De stand na een tik op "opnieuw proberen". */
export function naHerstel(stand: VangnetStand): VangnetStand {
  return beginStand(stand.sleutel);
}
