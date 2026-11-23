import {
  closableUserCycleSince,
  isWithinGraceSince,
  now,
  previousCycle,
  userCycle,
  type Gebruikerscyclus,
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
export function huidigeCyclus(klok: UserClock): Gebruikerscyclus {
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
 *
 * ⚠️ **`sinds` is verplicht, en dat is de grendel van QS8-806.** Het is de
 *    `created_at` van het profiel. Een account dat pas in deze cyclus ontstond
 *    heeft geen vorige week, dus ook geen venster: tot QS8-806 zag een account
 *    van vijf minuten oud op maandagochtend "Je vorige week loopt nog even door"
 *    en de kop "Week van" de vorige maandag. Optioneel was hij stil te vergeten;
 *    verplicht is een vergeten aanroeper een fout van `tsc`.
 */
export function afsluitbareCyclus(klok: UserClock, sinds: string): Gebruikerscyclus {
  return closableUserCycleSince(klok, now(), sinds);
}

/**
 * Zit de gebruiker nu in de coulanceperiode? Bepaalt de tekst op het scherm.
 * `sinds` is de `created_at` van het profiel — zie `afsluitbareCyclus()`.
 */
export function inCoulanceperiode(klok: UserClock, sinds: string): boolean {
  return isWithinGraceSince(klok, now(), sinds);
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
 *
 * ⚠️ **Eén uitzondering sinds QS8-806: een account zonder vorige cyclus.** Dan is
 *    de afsluitbare cyclus de lopende week en geeft dit de vorige — terwijl de
 *    rollover, die zonder het account rekent, binnen het venster de week dáárvoor
 *    afsloot. Onschuldig zolang een nieuw account in eerdere weken geen rijen
 *    heeft: er is in geen van beide weken een weekpas die iets gered kan hebben.
 *    Komt er ooit een import van weekdoelen voor nieuwe accounts, kijk hier dan
 *    opnieuw naar.
 */
export function zojuistAfgeslotenCyclus(klok: UserClock, sinds: string): Gebruikerscyclus {
  return previousCycle(afsluitbareCyclus(klok, sinds));
}
