import { z } from 'zod';

/**
 * De XP-stand van de ingelogde gebruiker — QS8-734, migratie 0304.
 *
 * ⚠️ **Hier staan geen drempels en geen bedragen, en dat is met opzet.** De
 *    database is de enige bron (`xp_drempels()`, `xp_niveau()`); een tweede lijst
 *    in TypeScript is een constante in twee talen, en die loopt uiteen op het
 *    moment dat iemand een drempel bijstelt. Deze module valideert alleen wat
 *    `mijn_xp()` teruggeeft.
 *
 * ⚠️ **XP is privé voor de eigenaar** (domeinregel 10): alleen het Prestatiescherm
 *    en het eigen profiel tonen dit, nooit een groepscomponent, nooit een menu,
 *    en nooit in één element met de punten.
 */
export const xpStandSchema = z.object({
  totaal: z.number().int().min(0),
  niveau: z.number().int().min(0).max(10),
  drempel_huidig: z.number().int().min(0),
  // null op het hoogste niveau: er is geen volgende drempel.
  drempel_volgende: z.number().int().min(1).nullable(),
});

export interface XpStand {
  readonly totaal: number;
  readonly niveau: number;
  readonly drempelHuidig: number;
  readonly drempelVolgende: number | null;
}

/** `mijn_xp()` geeft één rij, ook zonder XP; een andere vorm is een fout. */
export function leesXpStand(rijen: unknown): XpStand | null {
  const eerste: unknown = Array.isArray(rijen) && rijen.length === 1 ? rijen[0] : null;
  const uit = xpStandSchema.safeParse(eerste);
  if (!uit.success) return null;
  return {
    totaal: uit.data.totaal,
    niveau: uit.data.niveau,
    drempelHuidig: uit.data.drempel_huidig,
    drempelVolgende: uit.data.drempel_volgende,
  };
}
