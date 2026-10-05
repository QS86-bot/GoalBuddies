// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

/**
 * De periodeband van een streefdatum: hoe ver ligt een doel weg?
 *
 * ⚠️ **Dit is de spiegel van `public.doelperiode(date, date)` uit migratie 0299,
 *    en dat betekent dat er twee implementaties van één belofte bestaan.** De
 *    SQL-kant bestaat omdat de matcher over duizenden wachtrijrijen groepeert en
 *    dat niet rij-voor-rij naar een Edge Function kan halen (onwrikbare regel 12);
 *    deze kant bestaat omdat het scherm dezelfde band moet kunnen noemen.
 *
 *    Lopen ze uiteen, dan belooft het scherm een andere bak dan de matcher
 *    gebruikt — en dat is precies de klasse waar onwrikbare regel 18 over gaat:
 *    beide onderdelen kloppen op zichzelf, de belofte niet. De naadtest in
 *    `tests/beloftes/de-periodeband-is-aan-twee-kanten-dezelfde.test.ts` legt ze
 *    over hetzelfde datumraster naast elkaar.
 *
 * ⚠️ **Hij kent de tijd niet.** Het peilmoment komt als argument binnen, precies
 *    zoals in de SQL-versie. Daarmee is dit geen tweede klok naast `userCycle()`
 *    maar een indeling van een afstand in dagen, en hij is te toetsen zonder
 *    `freezeNow()`.
 */

/** De vier banden. `null` betekent: de streefdatum is verstreken. */
export type Periodeband = 0 | 1 | 2 | 3;

/** De bovengrenzen in dagen, oplopend. De laatste band heeft er geen. */
const GRENZEN: readonly number[] = [90, 180, 365];

const MS_PER_DAG = 86_400_000;

/**
 * Het aantal hele dagen tussen twee kalenderdata, in UTC gerekend.
 *
 * ⚠️ Beide argumenten worden op middernacht UTC genormaliseerd vóór het
 *    aftrekken. Zonder dat zou een zomertijdsprong tussen de twee data een
 *    verschil van 89,96 dagen opleveren, en dan valt een doel van precies
 *    negentig dagen in de verkeerde band — een fout van één dag die alleen
 *    optreedt in de weken rond de overgang, en dus de soort die je pas in
 *    productie vindt.
 */
function dagenTussen(vanaf: Date, tot: Date): number {
  const a = Date.UTC(vanaf.getUTCFullYear(), vanaf.getUTCMonth(), vanaf.getUTCDate());
  const b = Date.UTC(tot.getUTCFullYear(), tot.getUTCMonth(), tot.getUTCDate());
  return Math.round((b - a) / MS_PER_DAG);
}

/**
 * De band waarin een streefdatum valt, gemeten vanaf een peildatum.
 *
 * Geeft `null` als de streefdatum vóór de peildatum ligt of als een van beide
 * geen geldige datum is — dezelfde drie gevallen als de SQL-versie.
 */
export function doelperiodeBand(streefdatum: Date | null, peildatum: Date | null): Periodeband | null {
  if (streefdatum === null || peildatum === null) return null;
  if (Number.isNaN(streefdatum.getTime()) || Number.isNaN(peildatum.getTime())) return null;

  const dagen = dagenTussen(peildatum, streefdatum);
  if (dagen < 0) return null;

  const band = GRENZEN.findIndex((grens) => dagen <= grens);
  return band === -1 ? 3 : (band as Periodeband);
}
