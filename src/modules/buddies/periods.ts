import {
  groupPeriod,
  localDateIn,
  now,
  type Cycle,
  type GroupClock,
  type Weekday,
} from '../../shared/time';

/**
 * De tweede klok — QS8-58.
 *
 * ⚠️ De groepsperiode is níét de persoonlijke cyclus, en de twee mogen nooit
 *    door elkaar. De persoonlijke cyclus bepaalt wanneer weekdoelen resetten en
 *    wanneer punten tellen; de groepsperiode bepaalt de weekafsluiting, De
 *    Ketting en het groepsoverzicht (domeinregel 1).
 *
 *    Sloot jij je eigen week op donderdag af en is de huddledag zondag, dan telt
 *    die afsluiting mee in de periode die zondag begon. Dat is de hele reden dat
 *    deze klok apart bestaat: leden mogen alle zeven een andere week-startdag
 *    hebben zonder dat het groepsritme uit elkaar valt.
 *
 * ⚠️ Staat apart van `api.ts` om dezelfde reden als `goals/cycles.ts`: dat
 *    bestand importeert de Supabase-client en trekt daarmee React Native mee.
 *    Deze functies zijn puur en moeten zonder renderer te testen zijn.
 */

/** De klok van een groep, uit de kolommen `huddle_day` en `tz`. */
export function groepsklok(groep: {
  readonly huddle_day: number;
  readonly tz: string;
}): GroupClock {
  return { huddleDay: (groep.huddle_day % 7) as Weekday, tz: groep.tz };
}

/** De periode waarin de groep zich nu bevindt. */
export function huidigeGroepsperiode(groep: {
  readonly huddle_day: number;
  readonly tz: string;
}): Cycle {
  return groupPeriod(groepsklok(groep), now());
}

/**
 * De groepsperiode waarin een willekeurig moment viel.
 *
 * Bestaat naast `huidigeGroepsperiode` omdat "nu" niet te testen valt zonder de
 * klok vast te zetten, en omdat de weekafsluiting (EPIC 7) straks ook naar een
 * moment in het verleden moet kunnen kijken.
 */
export function groepsperiodeVan(
  groep: { readonly huddle_day: number; readonly tz: string },
  moment: Date,
): Cycle {
  return groupPeriod(groepsklok(groep), moment);
}

/**
 * Is `moment` de huddledag van deze groep? — QS8-199.
 *
 * ⚠️ **Geen weekdagrekenwerk, en dat is het hele punt.** De verleiding is
 *    `new Date().getDay() === groep.huddle_day`, en die is op drie manieren fout:
 *    hij rekent in de tijdzone van het toestel in plaats van die van de groep,
 *    hij kent de coulanceperiode niet, en hij is een tijdberekening buiten
 *    `shared/time` — correctheidsregel 7 verbiedt dat met zoveel woorden.
 *
 *    Wat er wél staat is een vergelijking: de groepsperiode begínt op de
 *    huddledag, dus "vandaag is de huddledag" is precies "de lokale datum van de
 *    groep is de startdatum van de lopende periode". Eén bron van waarheid, en
 *    hij verschuift vanzelf mee als de definitie van een periode ooit wijzigt.
 *
 * ⚠️ **`periode.tz` en niet `groep.tz`.** Dezelfde waarde vandaag, maar de eerste
 *    komt uit de klok die de periode zélf berekend heeft. Zou `groepsklok()` de
 *    tijdzone ooit normaliseren, dan volgt deze vergelijking dat; met `groep.tz`
 *    zou hij stil op de rauwe kolom blijven kijken.
 */
export function isHuddledagOp(
  groep: { readonly huddle_day: number; readonly tz: string },
  moment: Date,
): boolean {
  const periode = groepsperiodeVan(groep, moment);
  return localDateIn(periode.tz, moment) === periode.startDate;
}

/**
 * Is het vandaag de huddledag van deze groep?
 *
 * Bestaat naast `isHuddledagOp` om dezelfde reden als `huidigeGroepsperiode`
 * naast `groepsperiodeVan`: "nu" valt niet te testen zonder de klok vast te
 * zetten.
 */
export function isHuddledagVandaag(groep: {
  readonly huddle_day: number;
  readonly tz: string;
}): boolean {
  return isHuddledagOp(groep, now());
}
