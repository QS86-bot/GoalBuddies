import { addDays, type IsoDate } from '../time';

/**
 * Welke dagen van deze week afgevinkt zijn — QS8-301.
 *
 * ⚠️ **Los van het component, en om dezelfde reden als `weekbalk-vorm.ts`.**
 *    Hier staat wát er getoond wordt, en dat is een productbeslissing: de strook
 *    toont **de hele cyclus** en niet alleen de afgevinkte dagen. Een rij die
 *    krimpt naarmate je minder hebt afgevinkt, zegt niet hoeveel er nog kan.
 *
 * ⚠️ **Zeven vakjes, en de eerste is de start van jóuw cyclus.** Niet maandag,
 *    niet zondag: `currentUserCycle()` bepaalt welke dag de week begint
 *    (domeinregel 1). De aanroeper geeft `startDatum` mee uit `shared/time`;
 *    deze module rekent zelf geen dag uit behalve met `addDays()` uit diezelfde
 *    module (correctheidsregel 7).
 *
 * ⚠️ **Een niet-afgevinkte dag is een licht vakje en geen gat.** Zelfde
 *    afweging als in `Kalender`: een rooster met gaten leest als een aanklacht,
 *    een rooster met lichte vlakjes leest als een rooster. Dit scherm is
 *    bovendien alleen van de eigenaar — `day_checkins` is eigenaar-only zonder
 *    tak voor groepsgenoten, óók in een open groep (A41), en een rooster met
 *    gaten is fijnmaziger tegenslag dan een gemiste week.
 */

/** Eén dag in de strook. */
export interface Strookdag {
  /** `YYYY-MM-DD`. */
  readonly datum: IsoDate;
  readonly afgevinkt: boolean;
}

/** Een cyclus is zeven dagen; het getal staat hier zodat de test hem kan noemen. */
export const DAGEN_IN_STROOK = 7;

/**
 * ⚠️ **Een `Set` en geen `includes()` in de lus.** Zeven maal zeven is
 *    verwaarloosbaar, maar dit is de vorm die het bij een langere reeks blijft
 *    doen — en een lus in een lus is precies hoe een N+1 er in het klein uitziet.
 *
 * ⚠️ **Dagen buiten de cyclus tellen niet mee.** De query levert alleen rijen
 *    binnen de cyclus, dus dit kán vandaag niet gebeuren. Zou een aanroeper ooit
 *    een ruimere lijst meegeven, dan hoort de strook nog steeds zeven vakjes te
 *    hebben — hij toont een week, geen verzameling.
 */
export function ritmestrook(
  startDatum: IsoDate,
  afgevinkt: readonly string[],
): readonly Strookdag[] {
  const gevonden = new Set(afgevinkt);

  const dagen: Strookdag[] = [];
  for (let i = 0; i < DAGEN_IN_STROOK; i += 1) {
    const datum = addDays(startDatum, i);
    dagen.push({ datum, afgevinkt: gevonden.has(datum) });
  }
  return dagen;
}
