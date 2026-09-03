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

export { freezeNow, now, ouderDan, unfreezeNow } from './clock';

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
  userCycleOn,
} from './cycle';

export {
  toonDatum,
  toonDatumKort,
  toonDatumLang,
  toonMaand,
  toonKlokTijd,
  toonMoment,
  toonTijd,
} from './opmaak';

export {
  addDays,
  apparaatTijdzone,
  normaliseerZone,
  tijdzones,
  daysBetween,
  isGeldigeIsoDatum,
  isGeldigeTijdzone,
  localDateIn,
  toIsoDate,
  weekdagPeildatum,
  weekdayOf,
} from './zoned';

export {
  dagIsTeKiezen,
  eersteVanDeMaand,
  maandErbij,
  maandraster,
  type Maanddag,
  type Maandraster,
} from './maandraster';
