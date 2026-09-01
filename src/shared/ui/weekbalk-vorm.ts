/**
 * Hoe een weekstand eruitziet — QS8-256.
 *
 * ⚠️ **Los van het component, en dat is geen netheid.** Hier staat de
 *    belangrijkste regel van dit issue: *nergens rood op een week die niet
 *    afgerond is*. Rood betekent in dit stelsel uitsluitend een naderende
 *    deadline (`tokens.ts`) en domeinregel 7 is de reden. Zolang die regel in
 *    een `.tsx` staat, is hij alleen te toetsen door een scherm te renderen — en
 *    dan wordt hij niet getoetst.
 *
 *    Zelfde afweging en zelfde vorm als `tips.ts` en `metrics.ts`: wát er
 *    getoond wordt is een productbeslissing en die hoort in een test.
 */

export type Weekstand = 'plafond' | 'vloer' | 'ingediend' | 'gemist' | 'leeg';

/** De rollen die deze module nodig heeft, zodat hij geen thema hoeft te kennen. */
export interface Balkrollen {
  readonly progress: string;
  readonly neutral: string;
}

export interface Balkvorm {
  readonly kleur: string;
  /** Deel van de volle hoogte, tussen 0 en 1. */
  readonly hoogte: number;
  /** Een omtrek in plaats van een vlak: telde nog niet. */
  readonly omtrek: boolean;
}

/**
 * ⚠️ `leeg` is niet nul maar een streepje. Een balk van nul hoogte is een gat in
 *    de rij, en dan telt het oog de weken verkeerd.
 *
 * ⚠️ **De vloer is even groen als het plafond en alleen lager.** Domeinregel 8:
 *    vloer gehaald betekent dat de week telt, met dezelfde reeks en dezelfde
 *    goedkeuring — alleen de punten verschillen, en dat is de hoogte. Een doffere
 *    kleur zou het tegenovergestelde zeggen van wat het product belooft.
 */
const HOOGTE: Readonly<Record<Weekstand, number>> = {
  plafond: 1,
  vloer: 0.55,
  ingediend: 0.55,
  gemist: 0.18,
  leeg: 0.06,
};

export function balkvorm(stand: Weekstand, rollen: Balkrollen): Balkvorm {
  const telde = stand === 'plafond' || stand === 'vloer' || stand === 'ingediend';

  return {
    kleur: telde ? rollen.progress : rollen.neutral,
    hoogte: HOOGTE[stand] ?? HOOGTE.leeg,
    omtrek: stand === 'ingediend',
  };
}

/** Alle standen, zodat een test er geen kan vergeten. */
export const WEEKSTANDEN = ['plafond', 'vloer', 'ingediend', 'gemist', 'leeg'] as const;
