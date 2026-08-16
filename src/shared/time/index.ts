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
} from './types';
export { GRACE_HOURS } from './types';

export { freezeNow, now, unfreezeNow } from './clock';

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
} from './cycle';

export { addDays, daysBetween, localDateIn, toIsoDate, weekdayOf } from './zoned';
