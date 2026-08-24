import { t } from '../../shared/i18n';

import type { Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { UserClock, Weekday } from '../../shared/time';

import { profielPatchSchema, type ProfielPatch } from './schemas';

/**
 * Het profiel: naam, avatar, tijdzone, week-startdag en herinneringen.
 *
 * ⚠️ Dit bestand levert ook `userClock()`. Dat is de enige plek waar een
 *    profielrij verandert in de klok die `shared/time` verwacht — zodat nergens
 *    anders in de app iemand `weekStartDay` uit een losse kolom vist en er zelf
 *    iets mee gaat rekenen (CLAUDE.md, correctheidsregel 7).
 */

export type Profiel = Tables<'profiles'>;

export async function fetchProfiel(userId: string): Promise<Profiel | null> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    reportError(error, 'profile.fetch', { user_id: userId, code: error.code });
    throw new Error(t('profiel.laden_mislukt'));
  }

  return data;
}

export type ProfielUitkomst = { ok: true; profiel: Profiel } | { ok: false; melding: string };

export async function updateProfiel(
  userId: string,
  patch: ProfielPatch,
): Promise<ProfielUitkomst> {
  const gevalideerd = profielPatchSchema.safeParse(patch);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('auth.fout.invoer') };
  }

  // ⚠️ Veld voor veld, en niet `update(gevalideerd.data)`. Zod maakt van een
  //    optioneel veld `string | undefined`, en met `exactOptionalPropertyTypes`
  //    is dat iets anders dan "afwezig". Zou je het toch doorgeven, dan schrijft
  //    PostgREST `null` in kolommen die de gebruiker niet eens heeft aangeraakt.
  const velden = gevalideerd.data;
  const update: TablesUpdate<'profiles'> = {};
  if (velden.display_name !== undefined) update.display_name = velden.display_name;
  if (velden.week_start_day !== undefined) update.week_start_day = velden.week_start_day;
  if (velden.tz !== undefined) update.tz = velden.tz;
  if (velden.reminder_time !== undefined) update.reminder_time = velden.reminder_time;
  if (velden.reminder_enabled !== undefined) update.reminder_enabled = velden.reminder_enabled;
  if (velden.reminder_tone !== undefined) update.reminder_tone = velden.reminder_tone;
  if (velden.share_moves_by_default !== undefined) {
    update.share_moves_by_default = velden.share_moves_by_default;
  }

  const { data, error } = await supabase()
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'profile.update', { user_id: userId, code: error.code });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  return { ok: true, profiel: data };
}

/**
 * Rondt de onboarding af.
 *
 * ⚠️ Een aparte schrijfactie, ná het opslaan van de profielvelden. Wie halverwege
 *    wegklikt, komt de volgende keer gewoon weer op het onboardingscherm — en
 *    niet in een app waarvan de helft nog niet is ingevuld.
 *
 * ⚠️ `onboarded_at` komt van de databaseklok en niet van het toestel. Een
 *    verkeerd gezette telefoonklok mag geen tijdstempel opleveren waar later een
 *    cyclusberekening op leunt (CLAUDE.md, correctheidsregel 7).
 */
export async function rondOnboardingAf(
  userId: string,
  wantsOwnGoal: boolean,
): Promise<ProfielUitkomst> {
  const { data, error } = await supabase()
    .from('profiles')
    .update({ onboarded_at: 'now', wants_own_goal: wantsOwnGoal })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'profile.onboarded', { user_id: userId, code: error.code });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  return { ok: true, profiel: data };
}

/** Heeft deze gebruiker de onboarding gehad? */
export function isOnboarded(profiel: Profiel | null): boolean {
  return profiel?.onboarded_at != null;
}

/**
 * De persoonlijke klok van een gebruiker, klaar voor `userCycle()`.
 *
 * ⚠️ Klok 1 van de twee. Deze bepaalt wanneer weekdoelen resetten en wanneer
 *    punten tellen. De huddledag van een groep is een ándere klok en komt uit
 *    de module `buddies` — haal ze nooit door elkaar.
 */
export function userClock(profiel: Pick<Profiel, 'week_start_day' | 'tz'>): UserClock {
  return {
    weekStartDay: profiel.week_start_day as Weekday,
    tz: profiel.tz,
  };
}

/**
 * De tijdzone van het toestel, als voorstel bij de onboarding.
 *
 * Een voorstel en geen automatisme: iemand die in Lissabon woont maar zijn
 * telefoon op Amsterdam heeft staan, moet dat kunnen rechtzetten. En wie reist,
 * wil niet dat zijn week verspringt omdat hij een week in Bangkok zat.
 */
export function voorgesteldeTijdzone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
  } catch {
    return 'Europe/Amsterdam';
  }
}
