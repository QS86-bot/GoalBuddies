// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`. Bewerk het
// origineel en draai het script opnieuw; een wijziging hier gaat verloren en,
// erger, laat de app en de rollover-job met verschillende weken rekenen.

/**
 * De publieke rand van `shared/time`.
 *
 * ⚠️ CLAUDE.md, correctheidsregel 7: geen enkele tijd- of weekberekening buiten
 *    deze module. Heb je hier iets nodig dat er niet in zit, breid dan deze
 *    module uit — reken het niet zelf uit in een query of component.
 */

export type {
  Cycle,
  GroupClock,
  IsoDate,
  TimeZone,
  UserClock,
  Weekday,
} from './types.ts';
export { GRACE_HOURS } from './types.ts';

export { freezeNow, now, unfreezeNow } from './clock.ts';

export {
  closableUserCycle,
  cyclesBetween,
  cyclesUntil,
  groupPeriod,
  isWithinCycle,
  isWithinGrace,
  nextCycle,
  previousCycle,
  userCycle,
} from './cycle.ts';

export {
  addDays,
  daysBetween,
  isGeldigeIsoDatum,
  klokTijd,
  localDateIn,
  toIsoDate,
  weekdayOf,
} from './zoned.ts';
