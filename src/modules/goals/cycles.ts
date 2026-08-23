import {
  closableUserCycle,
  isWithinGrace,
  now,
  previousCycle,
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

/**
 * De cyclus die de rollover zojuist heeft dichtgezet — QS8-81.
 *
 * ⚠️ Dit is **niet** `afsluitbareCyclus()`, en dat verschil kostte de
 *    weekpasmelding zijn hele bestaansrecht. De rollover raakt uitsluitend
 *    weekdoelen met `cycle_start_date < afsluitbaar.startDate` (strikt kleiner),
 *    dus de week die hij afsloot ligt per definitie vóór de week die jij nog mag
 *    afsluiten. Wie de melding "een weekpas heeft je reeks gered" aan de
 *    afsluitbare cyclus hangt, vergelijkt twee datums die nooit gelijk kunnen
 *    zijn: de melding is dan dode code, en de gebruiker ziet wél zijn minpunt en
 *    niet de geruststelling. Precies het moment waarop iemand de app weggooit.
 *
 *    Gevonden door de gebruikersreview op QS8-81, niet door een test — de
 *    unittests voerden `weekpasReddeDezeCyclus()` twee met de hand gelijk
 *    gemaakte datums, dus ze bewezen alleen dat de vergelijking werkt en niet
 *    dat de aanroeper het juiste meegeeft.
 *
 * Klopt in beide standen: binnen de coulanceperiode is de afsluitbare cyclus de
 * vorige week en sloot de rollover die dáárvoor af; erbuiten is de afsluitbare
 * cyclus de lopende week en sloot hij de vorige af.
 */
export function zojuistAfgeslotenCyclus(klok: UserClock): Cycle {
  return previousCycle(afsluitbareCyclus(klok), klok.weekStartDay);
}
