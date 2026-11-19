import type { DoelStand } from '@/modules/goals';

/**
 * De drie tellers samengevat uit wat de datalaag al levert — QS8-747.
 *
 * ⚠️ **Er wordt niets nieuws berekend.** `DoelStand` komt uit `fetchDoelStanden()`
 *    (de stand per doel die `StandBlok` ook toont); hier staat alleen hoe die
 *    per-doelwaarden op één getal samenkomen. Het puntengetal komt uit
 *    `fetchPuntenDezeWeek()` en passeert deze module niet.
 *
 * ⚠️ **Vangnet is de som, reeks is de hoogste.** Weekpassen zijn per doel en een
 *    pas beschermt de reeks van dát doel, dus "hoeveel vangnet heb ik" is de som.
 *    Een reeks is een eigenschap van een doel en geen optelsom: drie doelen van
 *    vier weken zijn geen reeks van twaalf. Wat bij een samenvatting past is de
 *    langste die nu loopt. (Aanname, vastgelegd in
 *    `docs/decisions/2026-11-19-drie-tellers-op-vandaag.md`.)
 *
 * ⚠️ **`null` is "geen antwoord" en nul is een uitkomst.** Zonder doelen is er
 *    niets te tellen en tonen de tellers een streepje in plaats van 0: een
 *    reeks van nul bij iemand die net begint is geen mededeling over iemand.
 */
export interface Tellers {
  readonly vangnet: number | null;
  readonly reeks: number | null;
}

export function tellers(standen: ReadonlyMap<string, DoelStand>): Tellers {
  if (standen.size === 0) return { vangnet: null, reeks: null };

  let vangnet = 0;
  let reeks = 0;
  for (const stand of standen.values()) {
    vangnet += stand.weekpas?.voorraad ?? 0;
    reeks = Math.max(reeks, stand.huidigeReeks);
  }
  return { vangnet, reeks };
}
