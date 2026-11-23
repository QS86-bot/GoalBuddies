import { userClock, type Profiel } from '@/modules/auth';
import {
  afsluitbareCyclus,
  huidigeCyclus,
  inCoulanceperiode,
  zojuistAfgeslotenCyclus,
} from '@/modules/goals';
import { localDateIn, now } from '@/shared/time';

/**
 * De klok en de cycli van het Vandaag-scherm, allemaal uit `shared/time`.
 *
 * ⚠️ **Uit `useTijd()` gehaald voor QS8-806, zonder gedragsverandering buiten
 *    `created_at`.** Een hook is zonder renderer niet te testen, en juist híér
 *    zit de naad die stuk was: `shared/time` kon het account meenemen, maar
 *    alleen als iemand het profiel er ook in stopt. `tests/render/vandaag-coulance.test.ts` toetst
 *    dat dit bestand dat doet.
 *
 * ⚠️ **`profiel.created_at` en niets anders.** Een account dat in deze cyclus
 *    ontstond, heeft geen vorige week: geen coulancekaart, en "Week van" is de
 *    lopende week. Zie `afsluitbareCyclus()`.
 */
export function tijdVan(
  profiel: Pick<Profiel, 'week_start_day' | 'tz' | 'created_at'> | null,
) {
  const klok = profiel ? userClock(profiel) : null;
  const sinds = profiel?.created_at ?? '';
  const cyclus = klok ? huidigeCyclus(klok) : null;
  const afTeSluiten = klok ? afsluitbareCyclus(klok, sinds) : null;
  const coulance = klok ? inCoulanceperiode(klok, sinds) : false;

  // ⚠️ De cyclusobjecten worden elke render opnieuw gebouwd, dus als
  //    afhankelijkheid zijn ze waardeloos: het effect zou eindeloos herhalen.
  //    De startdatum is wat er werkelijk verandert, en die is een string.
  const afTeSluitenStart = afTeSluiten?.startDate ?? null;
  const cyclusStart = cyclus?.startDate ?? null;

  // ⚠️ De week die de rollover zojuist dichtzette, en dus níét `afTeSluiten`.
  //    Die twee zijn per definitie verschillend — zie `zojuistAfgeslotenCyclus`.
  const geslotenStart = klok ? zojuistAfgeslotenCyclus(klok, sinds).startDate : null;

  /**
   * De datum van vandaag in de tijdzone van de gebruiker — QS8-253.
   *
   * ⚠️ Uit `shared/time` en nergens anders (correctheidsregel 7). Welke dag het
   *    "hier" is, bepaalt of een afvinking van vandaag is; de server toetst
   *    alleen nog dat die datum binnen de week van het weekdoel valt.
   */
  const vandaagLokaal = profiel ? localDateIn(profiel.tz, now()) : null;

  return {
    klok,
    cyclus,
    afTeSluiten,
    coulance,
    afTeSluitenStart,
    cyclusStart,
    geslotenStart,
    vandaagLokaal,
  };
}
