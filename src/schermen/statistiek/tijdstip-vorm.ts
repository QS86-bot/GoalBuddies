import { lokaalUur, type TimeZone } from '@/shared/time';

/**
 * Wanneer op de dag je indient — QS8-749.
 *
 * ⚠️ **"Inchecken" is het indienen van een voltooiing** (`submitted_at`, door de server gezet).
 *    Een vervangen indiening (`superseded_by`) telt niet mee: dezelfde handeling telt dan
 *    niet twee keer. De Dagzet is geen bron (domeinregel 9).
 *
 * ⚠️ **Het uur komt van `lokaalUur()` in de tijdzone van het profiel** (domeinregel 2),
 *    nooit van het toestel. Vier dagdelen, vast: nacht 0-6, ochtend 6-12, middag 12-18,
 *    avond 18-24.
 */
export type Dagdeel = 'nacht' | 'ochtend' | 'middag' | 'avond';

export const DAGDELEN: readonly Dagdeel[] = ['nacht', 'ochtend', 'middag', 'avond'];

export function dagdeelVanUur(uur: number): Dagdeel {
  if (uur < 6) return 'nacht';
  if (uur < 12) return 'ochtend';
  if (uur < 18) return 'middag';
  return 'avond';
}

export interface Dagdeelstand {
  readonly dagdeel: Dagdeel;
  readonly aantal: number;
}

export function tijdstippen(
  tz: TimeZone,
  momenten: readonly { readonly submitted_at: string; readonly superseded_by: string | null }[],
): readonly Dagdeelstand[] {
  const telling: Record<Dagdeel, number> = { nacht: 0, ochtend: 0, middag: 0, avond: 0 };
  for (const m of momenten) {
    if (m.superseded_by !== null) continue;
    telling[dagdeelVanUur(lokaalUur(tz, m.submitted_at))] += 1;
  }
  return DAGDELEN.map((dagdeel) => ({ dagdeel, aantal: telling[dagdeel] }));
}
