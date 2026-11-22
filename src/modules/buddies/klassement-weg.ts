import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * De uitnodigingskaart van het klassement wegklikken, per beheerder — QS8-784 (A57, P3 c).
 *
 * ⚠️ De tabelnaam staat letterlijk in elke keten: `kolomrechten:controle` en `eenrij:controle` lezen `.from('…')`.
 *
 * ⚠️ **Alleen type-imports**, zodat `tests/rls/klassement-uitnodiging-weg.test.ts` precies deze twee verzoeken onder een
 *    echte JWT afspeelt: de toets raakt de naad tussen het scherm en de RLS, en niet een kopie van de query.
 *    `klassement.ts` legt er de foutmelding en `reportError` omheen.
 *
 * ⚠️ **De database beslist alles wat ertoe doet.** Alleen de eigen rij is leesbaar, alleen een actieve beheerder mag
 *    wegklikken en alleen als het klassement uit staat, en een wissel van `groups.klassement_aan` wist de rijen van de
 *    hele groep: de kaart komt na aan → uit voor iedereen terug (besluit Quinten 22-11-2026). Dit is de knop, niet de grens.
 *
 * ⚠️ Typebrug: de tabel `klassement_uitnodiging_weg` staat nog niet in `src/lib/database.types.ts`; hij komt erin met
 *    `npm run types:db` na de uitrol van de migratie van QS8-784. Tot dan neemt deze module een ongetypeerde client,
 *    en de wekker staat in `BRUGGEN` in `tests/beloftes/typebrug-register.ts`.
 */

export type UitnodigingDb = Pick<SupabaseClient, 'from'>;

const AL_AANWEZIG = '23505';

export type WegUitkomst<T> = { readonly ok: true; readonly waarde: T } | { readonly ok: false; readonly code: string | null };

/** Heeft deze gebruiker de kaart in deze groep weggeklikt? */
export async function leesUitnodigingWeg(
  db: UitnodigingDb,
  groupId: string,
  userId: string,
): Promise<WegUitkomst<boolean>> {
  const { data, error } = await db
    .from('klassement_uitnodiging_weg')
    .select('group_id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) return { ok: false, code: error.code ?? null };
  return { ok: true, waarde: data !== null };
}

/**
 * Klik de kaart weg. Idempotent: een tweede klik krijgt 23505 en telt als gelukt, want de gewenste stand is er
 * (zelfde vorm als `zetGroepGedempt()`).
 */
export async function klikUitnodigingWeg(
  db: UitnodigingDb,
  groupId: string,
  userId: string,
): Promise<WegUitkomst<true>> {
  const { error } = await db.from('klassement_uitnodiging_weg').insert({ user_id: userId, group_id: groupId });
  if (error && error.code !== AL_AANWEZIG) return { ok: false, code: error.code ?? null };
  return { ok: true, waarde: true };
}
