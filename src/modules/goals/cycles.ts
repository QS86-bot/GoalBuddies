import {
  closableUserCycle,
  isWithinGrace,
  now,
  userCycle,
  type Cycle,
  type UserClock,
} from '../../shared/time';

/**
 * De cyclusvragen die een scherm stelt, los van de database.
 *
 * ⚠️ Staat apart van `weekly.ts` omdat dat bestand de Supabase-client importeert
 *    en daarmee React Native meetrekt. Deze functies zijn puur en horen
 *    testbaar te zijn zonder renderer — en juist híér zit de logica die stuk kan.
 */

/** De cyclus waarin de gebruiker zich nu bevindt — QS8-45. */
export function huidigeCyclus(klok: UserClock): Cycle {
  return userCycle(klok, now());
}

/**
 * De cyclus die de gebruiker op dit moment nog mag afsluiten — QS8-51.
 *
 * ⚠️ Binnen twaalf uur ná de rollover is dat nog de vórige cyclus. Zondagavond
 *    klaar, maandagochtend gelogd: niets verloren. De vertaling van Habit
 *    Huddle's "Night Owl Checkins".
 *
 *    De UI moet erbij zeggen om welke week het gaat, anders lijkt het alsof je
 *    per ongeluk de verkeerde week afsluit.
 */
export function afsluitbareCyclus(klok: UserClock): Cycle {
  return closableUserCycle(klok, now());
}

/** Zit de gebruiker nu in de coulanceperiode? Bepaalt de tekst op het scherm. */
export function inCoulanceperiode(klok: UserClock): boolean {
  return isWithinGrace(klok, now());
}
