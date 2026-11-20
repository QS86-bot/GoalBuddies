import {
  addDays,
  localDateIn,
  userCycleOn,
  type Gebruikerscyclus,
  type UserClock,
} from '@/shared/time';

/**
 * De vier periodes van de statistiekpagina — QS8-749.
 *
 * ⚠️ **Een periode begint op de start van een week en niet midden in een week.** "30 dagen"
 *    is de week waarin de dag van dertig dagen terug valt, volgens de week-start en de
 *    tijdzone van de gebruiker (domeinregel 1 en 2). Anders begint de kalender met een
 *    halve week die er "leeg" uitziet.
 */
export type Periode = '30' | '90' | 'jaar' | 'alles';

export const PERIODES: readonly Periode[] = ['30', '90', 'jaar', 'alles'];

const DAGEN: Record<Exclude<Periode, 'alles'>, number> = { '30': 30, '90': 90, jaar: 365 };

/** De eerste week van de periode, of `null` voor "alles" (dan bepalen de gegevens het begin). */
export function eersteWeek(periode: Periode, klok: UserClock, nu: Date): Gebruikerscyclus | null {
  if (periode === 'alles') return null;
  const vandaag = localDateIn(klok.tz, nu);
  return userCycleOn(klok, addDays(vandaag, -DAGEN[periode]));
}
