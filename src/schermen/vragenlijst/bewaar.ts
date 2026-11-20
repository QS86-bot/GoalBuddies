import { updateProfiel } from '@/modules/auth';
import { bewaarHeld, teBewarenHeld, type Heldkeuze } from '@/modules/helden';
import { patchUitVragenlijst, type GevoelWissen, type VragenlijstInvoer } from '@/modules/goals';

export type BewaarUitkomst = { readonly ok: true } | { readonly ok: false; readonly melding: string };

/**
 * Tussentijds bewaren bij elke "Volgende": wie halverwege afhaakt, houdt zijn
 * antwoorden (QS8-733, criterium 7). Een overgeslagen antwoord overschrijft niets,
 * dus dit wist niets wat er al stond. De held gaat pas bij het eind: die komt uit
 * álle vier de vragen.
 */
export async function bewaarTussendoor(
  userId: string,
  invoer: VragenlijstInvoer,
  wis: GevoelWissen = {},
): Promise<BewaarUitkomst> {
  const uitkomst = await updateProfiel(userId, patchUitVragenlijst(invoer, wis));
  return uitkomst.ok ? { ok: true } : { ok: false, melding: uitkomst.melding };
}

/** Het eind: de vragen én de held. */
export async function bewaarAlles(
  userId: string,
  invoer: VragenlijstInvoer,
  keuze: Heldkeuze,
  wis: GevoelWissen = {},
): Promise<BewaarUitkomst> {
  const profiel = await bewaarTussendoor(userId, invoer, wis);
  if (!profiel.ok) return profiel;

  // ⚠️ **`null` betekent hier "niets te bewaren" en niet "wis de held".** Wie de
  //    heldenvragen overslaat of een gelijkspel onbeslist laat, houdt de held die
  //    hij al had.
  const teBewaren = teBewarenHeld(keuze);
  if (teBewaren === null) return { ok: true };

  const held = await bewaarHeld(userId, teBewaren.held, teBewaren.bron);
  return held.ok ? { ok: true } : { ok: false, melding: held.melding };
}
