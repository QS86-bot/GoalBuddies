import { z } from 'zod';

import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';

/**
 * Voltooiingen: een weekdoel afronden, met bewijs — QS8-46.
 *
 * ⚠️ Append-only (domeinregel 6). Een correctie is een nieuwe rij plus
 *    `superseded_by` op de oude, nooit een overschrijving. De unieke index
 *    `completions_active_uniq` bewaakt dat er per weekdoel precies één actieve
 *    voltooiing is.
 */

export type Voltooiing = Tables<'completions'>;
export type DagZet = Tables<'daily_moves'>;

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

export const afrondSchema = z.object({
  achieved_level: z.enum(['floor', 'ceiling']),
  note: z.string().trim().max(2000, { error: 'Maximaal 2000 tekens.' }).nullable(),
});

export type AfrondInvoer = z.infer<typeof afrondSchema>;

/** Wat een groep aan bewijs eist, uit `groups.evidence_policy` (6.5). */
export type Bewijseis = 'note_required' | 'note_and_attachment' | 'optional';

/**
 * Rondt een weekdoel af.
 *
 * ⚠️ De status wordt `pending`, nooit direct `approved`. Ook niet als je alleen
 *    werkt: zelf afvinken is geen goedkeuring. Zonder groep blijft het weekdoel
 *    dus op `pending` staan — het telt voor je voortgang, maar levert geen
 *    punten op tot iemand het bevestigt. En het kost ook geen minpunt; een
 *    trage of ontbrekende buddy mag jou niet benadelen.
 *
 * ⚠️ `cycle_start_date` sturen we niet mee. De trigger `pin_completion_cycle`
 *    (migratie 0006) haalt hem uit het weekdoel. Zou de client hem kiezen, dan
 *    is een gemiste week achteraf alsnog te claimen.
 */
export async function rondAf(
  weeklyGoalId: string,
  userId: string,
  invoer: AfrondInvoer,
  eis: Bewijseis,
): Promise<Resultaat<Voltooiing>> {
  const gevalideerd = afrondSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const notitie = gevalideerd.data.note?.trim() ?? '';
  if (eis !== 'optional' && notitie.length === 0) {
    return {
      ok: false,
      melding: 'Schrijf er kort bij wat je gedaan hebt. Je buddy heeft iets nodig om op te reageren.',
    };
  }

  const { data, error } = await supabase()
    .from('completions')
    .insert({
      weekly_goal_id: weeklyGoalId,
      user_id: userId,
      achieved_level: gevalideerd.data.achieved_level,
      note: notitie === '' ? null : notitie,
      // De trigger overschrijft dit met de cyclus van het weekdoel. Meesturen is
      // verplicht (NOT NULL); wat je stuurt maakt niet uit.
      cycle_start_date: '1970-01-01',
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'completions.create', { weekly_goal_id: weeklyGoalId, code: error.code });
    return { ok: false, melding: 'Afronden lukte niet. Probeer het opnieuw.' };
  }

  const { error: statusFout } = await supabase()
    .from('weekly_goals')
    .update({ status: 'pending' })
    .eq('id', weeklyGoalId);

  if (statusFout) reportError(statusFout, 'completions.status', { code: statusFout.code });

  return { ok: true, waarde: data };
}

/**
 * Corrigeert een eerdere voltooiing — domeinregel 6.
 *
 * ⚠️ De oude rij blijft staan en krijgt `superseded_by`. Overschrijven zou de
 *    geschiedenis vervalsen, en juist bij "ik dacht dat ik het plafond had
 *    gehaald maar het was de vloer" wil je later kunnen zien wat er gebeurd is.
 *
 * ⚠️ `completions` heeft geen UPDATE-policy: de client kan `superseded_by` niet
 *    zelf zetten. Dat hoort een Edge Function te doen met de service-role-key.
 *    Zolang die er niet is, geeft deze functie een eerlijke melding in plaats
 *    van een halve correctie. Zie docs/Q-TODO.docx.
 */
export async function corrigeer(): Promise<Resultaat<never>> {
  return {
    ok: false,
    melding:
      'Een voltooiing corrigeren kan nog niet. Vraag je buddy om "vertel me meer" te kiezen; ' +
      'dan kun je hem opnieuw indienen.',
  };
}

export async function fetchVoltooiing(weeklyGoalId: string): Promise<Voltooiing | null> {
  const { data, error } = await supabase()
    .from('completions')
    .select('*')
    .eq('weekly_goal_id', weeklyGoalId)
    .is('superseded_by', null)
    .maybeSingle();

  if (error) {
    reportError(error, 'completions.get', { weekly_goal_id: weeklyGoalId, code: error.code });
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// De Dagzet — QS8-50
// ---------------------------------------------------------------------------

export const dagzetSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Eén regel is genoeg, maar leeg kan niet.' })
    .max(2000, { error: 'Maximaal 2000 tekens.' }),
  weekly_goal_id: z.uuid().nullable(),
  visibility: z.enum(['private', 'group']),
});

export type DagzetInvoer = z.infer<typeof dagzetSchema>;

/**
 * Legt een Dagzet vast.
 *
 * ⚠️ Domeinregel 9: standaard privé, nooit punten, nooit goedkeuring. De Dagzet
 *    is aanwezigheid en geen prestatie — een dagboekregel die je desgewenst
 *    deelt. Een dag overslaan heeft geen enkel gevolg, en er is dus ook geen
 *    reeks en geen inhaalactie.
 *
 * `localDate` komt van de aanroeper: welke dag het is, hangt af van de tijdzone
 * van de gebruiker en dat bepaalt alleen `shared/time`.
 */
export async function zetDagzet(
  userId: string,
  invoer: DagzetInvoer,
  localDate: string,
): Promise<Resultaat<DagZet>> {
  const gevalideerd = dagzetSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const { data, error } = await supabase()
    .from('daily_moves')
    .insert({
      user_id: userId,
      body: gevalideerd.data.body,
      weekly_goal_id: gevalideerd.data.weekly_goal_id,
      visibility: gevalideerd.data.visibility,
      local_date: localDate,
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'moves.create', { user_id: userId, code: error.code });
    return { ok: false, melding: 'Opslaan lukte niet. Probeer het opnieuw.' };
  }

  return { ok: true, waarde: data };
}

/** De Dagzetten van deze cyclus, nieuwste eerst. */
export async function fetchDagzetten(
  userId: string,
  cyclus: Cycle,
): Promise<readonly DagZet[]> {
  const { data, error } = await supabase()
    .from('daily_moves')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', cyclus.startDate)
    .lte('local_date', cyclus.endDate)
    .order('local_date', { ascending: false })
    .limit(50);

  if (error) {
    reportError(error, 'moves.list', { user_id: userId, code: error.code });
    throw new Error('Je Dagzetten konden niet geladen worden.');
  }

  return data ?? [];
}
