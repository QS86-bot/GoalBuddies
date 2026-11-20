/**
 * De vorm van de paginakop — QS8-726.
 *
 * ⚠️⚠️ **Een voortgangswaarde is een eigen type en geen `number`.** Domeinregel
 *    10: score en voortgang zijn twee dingen. Voortgang loopt alleen omhoog en
 *    is mijlpaalgebaseerd; een score kan dalen. Een `number`-prop op de streep
 *    laat een puntentotaal of een percentage "dat deze week zakte" er zo in
 *    glijden, en dan toont de streep een gemiste week. Het merk hieronder is
 *    uitsluitend te krijgen via `alsVoortgang()`, en die weigert alles buiten
 *    0..1. `milestoneProgress()` (metrics.ts) is de bron waar het in de praktijk
 *    vandaan komt: aantal behaalde mijlpalen gedeeld door het aantal mijlpalen.
 *
 * ⚠️ Er is nergens een prop voor punten, en dat is met opzet geen omissie.
 */
declare const voortgangMerk: unique symbol;

/** Een waarde tussen 0 en 1 die uit mijlpalen komt. Niet te maken zonder `alsVoortgang()`. */
export type Voortgang = number & { readonly [voortgangMerk]: true };

/** `null` bij alles wat geen voortgang kan zijn: NaN, negatief, boven 1. Nooit afkappen. */
export function alsVoortgang(waarde: number): Voortgang | null {
  if (!Number.isFinite(waarde) || waarde < 0 || waarde > 1) return null;
  return waarde as Voortgang;
}

/** Breedte van de gevulde streep, 0..100 (hele procenten). */
export function streepProcent(voortgang: Voortgang): number {
  return Math.round(voortgang * 100);
}
