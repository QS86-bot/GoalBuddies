import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';

import { isHeldsleutel, type Heldbron, type Heldsleutel } from './helden';

/**
 * Welke held van wie is — de clientkant van `hero_profiles` (migratie 0264,
 * QS8-471). QS8-474.
 *
 * ⚠️⚠️ **`.upsert()` werkt hier niet, en dat is gemeten en niet beredeneerd.**
 *    📏 Op 14-09-2026 tegen de lokale PostgREST, als een echte `authenticated`:
 *    een kale insert geeft 201, een kale PATCH geeft 204, en
 *    `Prefer: resolution=merge-duplicates` geeft **403 met 42501, "permission
 *    denied for table hero_profiles"**.
 *
 *    De reden is de vorm van de grants van 0264: `insert (user_id, hero_key,
 *    source)` maar `update (hero_key, source)` — `user_id` mág je zetten bij het
 *    aanmaken en daarna nooit meer. PostgREST zet bij `merge-duplicates` élke
 *    payload-kolom in de `on conflict do update set`-lijst, en `user_id` moet in
 *    die payload staan want het is de conflictkolom. Postgres eist dan
 *    UPDATE-recht op `user_id`, dat er niet is, en weigert de héle rij.
 *
 *    Vandaar insert-en-dan-update. Dat is één aanroep in het gewone geval (de
 *    eerste keer) en twee bij het opnieuw doen van de quiz.
 *
 * ⚠️ **Niet "kijken of hij er al is en dan kiezen".** Dat leest natuurlijker en
 *    het is een race: tussen de leesactie en de schrijfactie kan een tweede
 *    tabblad de rij aanmaken, en dan valt de insert alsnog om op 23505 — maar
 *    dan zónder dat er iets is dat hem opvangt. De sleutel is hier de
 *    scheidsrechter, en 23505 is zijn antwoord.
 */

export interface Heldprofiel {
  readonly held: Heldsleutel;
  readonly bron: Heldbron;
}

export type HeldUitkomst = { ok: true } | { ok: false; melding: string };

/** Postgres' code voor een schending van een unieke sleutel. */
const AL_AANWEZIG = '23505';

/**
 * De held van deze gebruiker, of `null` als hij er geen heeft.
 *
 * ⚠️ **`null` is een geldig antwoord en geen fout.** Wie alle vier de
 *    heldenvragen overslaat, krijgt geen rij — acceptatiecriterium 3 van
 *    QS8-474. Elke aanroeper hoort dat geval te tekenen en niet te melden.
 *
 * ⚠️ `maybeSingle()` en niet `single()`: die tweede maakt van nul rijen een
 *    PGRST116-fout, en dan meldt de app een storing waar "je hebt nog geen held"
 *    hoort te staan.
 */
export async function heldprofiel(userId: string): Promise<Heldprofiel | null> {
  const { data, error } = await supabase()
    .from('hero_profiles')
    .select('hero_key, source')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    reportError(error, 'helden.heldprofiel', { user_id: userId });
    return null;
  }

  if (data === null || !isHeldsleutel(data.hero_key)) return null;

  return {
    held: data.hero_key,
    bron: data.source === 'keuze' ? 'keuze' : 'quiz',
  };
}

/**
 * Legt de held van deze gebruiker vast, of vervangt de held die er al stond.
 *
 * `bron` is `quiz` als de vragenlijst één koploper aanwees en `keuze` als de
 * gebruiker bij gelijkspel zelf koos. Dat onderscheid staat in de database en
 * niet in de app, omdat het de enige plek is waar later te zien is welke van de
 * twee het was.
 *
 * ⚠️ `chosen_at` gaat hier met opzet niet mee. Die kolom staat in geen enkele
 *    grant, en een payload die hem tóch noemt wordt door Postgres geweigerd op
 *    de héle rij — niet stil gecorrigeerd. De trigger `hero_profiles_tijd` zet
 *    hem, bij de insert én bij de update.
 */
export async function bewaarHeld(
  userId: string,
  held: Heldsleutel,
  bron: Heldbron,
): Promise<HeldUitkomst> {
  const nieuw = await supabase()
    .from('hero_profiles')
    .insert({ user_id: userId, hero_key: held, source: bron });

  if (!nieuw.error) return { ok: true };

  if (nieuw.error.code !== AL_AANWEZIG) {
    reportError(nieuw.error, 'helden.bewaarHeld.insert', { user_id: userId });
    return { ok: false, melding: t('vragenlijst.held.opslaan_mislukt') };
  }

  const bestaand = await supabase()
    .from('hero_profiles')
    .update({ hero_key: held, source: bron })
    .eq('user_id', userId);

  if (bestaand.error) {
    reportError(bestaand.error, 'helden.bewaarHeld.update', { user_id: userId });
    return { ok: false, melding: t('vragenlijst.held.opslaan_mislukt') };
  }

  return { ok: true };
}
