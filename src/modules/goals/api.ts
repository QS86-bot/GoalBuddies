import type { Json, Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { IsoDate } from '../../shared/time';

import {
  datumLigtInDeToekomst,
  doelPatchSchema,
  doelSchema,
  type DoelInvoer,
  type DoelPatch,
} from './schemas';

/**
 * Hoofddoelen: aanmaken, bewerken, archiveren en het dashboard.
 *
 * ⚠️ Elke wijziging aan de streefdatum wordt gelogd in `goal_events`. Dat is
 *    geen boekhouding om de boekhouding: zonder die geschiedenis "loopt op
 *    koers" iemand die zijn deadline drie keer verzet, en dat is precies de
 *    zelfmisleiding die de Risico-radar moet zien (EPIC 12).
 */

export type Doel = Tables<'goals'>;

/**
 * Een doel met zijn tellingen, uit de view `goal_dashboard` (migratie 0013).
 *
 * ⚠️ Postgres kent geen NOT NULL op viewkolommen, dus de gegenereerde types
 *    zijn overal nullable. Dat is technisch juist en praktisch onwerkbaar: elk
 *    scherm zou dan `?? ''` moeten strooien over velden die in werkelijkheid
 *    nooit leeg zijn.
 *
 *    De oplossing is niet een cast maar één controle, hier, in `naarDoel()`.
 *    Klopt een rij niet, dan valt hij eruit met een melding — en niet drie
 *    schermen verderop als `undefined`.
 */
export interface DoelMetVoortgang {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string;
  readonly identity_statement: string | null;
  readonly target_date: string;
  readonly status: string;
  readonly available_hours_per_week: number | null;
  readonly max_points: number;
  readonly risk_status: string;
  readonly milestones_total: number;
  readonly milestones_done: number;
  readonly weekly_total: number;
  readonly weekly_approved: number;
}

/** Zet een viewrij om, of geeft `null` als de rij niet compleet is. */
function naarDoel(rij: Tables<'goal_dashboard'>): DoelMetVoortgang | null {
  if (rij.id === null || rij.owner_id === null || rij.title === null || rij.target_date === null) {
    reportError(new Error('Onvolledige rij uit goal_dashboard'), 'goals.parse', {
      goal_id: rij.id ?? 'geen',
    });
    return null;
  }

  return {
    id: rij.id,
    owner_id: rij.owner_id,
    title: rij.title,
    description: rij.description,
    category: rij.category ?? 'other',
    identity_statement: rij.identity_statement,
    target_date: rij.target_date,
    status: rij.status ?? 'active',
    available_hours_per_week: rij.available_hours_per_week,
    max_points: rij.max_points ?? 0,
    risk_status: rij.risk_status ?? 'on_track',
    milestones_total: rij.milestones_total ?? 0,
    milestones_done: rij.milestones_done ?? 0,
    weekly_total: rij.weekly_total ?? 0,
    weekly_approved: rij.weekly_approved ?? 0,
  };
}

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/** Standaard 20 per pagina. Ongepagineerd bestaat niet (CLAUDE.md, regel 10). */
export const PER_PAGINA = 20;

export interface Pagina<T> {
  readonly rijen: readonly T[];
  readonly totaal: number;
  readonly meer: boolean;
}

/**
 * De actieve doelen van één gebruiker, met voortgang.
 *
 * ⚠️ Leest uit `goal_dashboard` en niet uit `goals`, zodat de tellingen in
 *    dezelfde query meekomen. Eén ronde, ongeacht hoeveel doelen er zijn.
 */
export async function fetchDoelen(
  userId: string,
  opties: { readonly pagina?: number; readonly status?: 'active' | 'archived' } = {},
): Promise<Pagina<DoelMetVoortgang>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * PER_PAGINA;

  const { data, error, count } = await supabase()
    .from('goal_dashboard')
    .select('*', { count: 'exact' })
    .eq('owner_id', userId)
    .eq('status', opties.status ?? 'active')
    .order('target_date', { ascending: true })
    .range(van, van + PER_PAGINA - 1);

  if (error) {
    reportError(error, 'goals.list', { user_id: userId, code: error.code });
    throw new Error('Je doelen konden niet geladen worden.');
  }

  const rijen = (data ?? []).map(naarDoel).filter((d): d is DoelMetVoortgang => d !== null);
  const totaal = count ?? rijen.length;

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

export async function fetchDoel(goalId: string): Promise<DoelMetVoortgang | null> {
  const { data, error } = await supabase()
    .from('goal_dashboard')
    .select('*')
    .eq('id', goalId)
    .maybeSingle();

  if (error) {
    reportError(error, 'goals.get', { goal_id: goalId, code: error.code });
    throw new Error('Dit doel kon niet geladen worden.');
  }

  return data === null ? null : naarDoel(data);
}

/**
 * Maakt een hoofddoel aan.
 *
 * `vandaag` komt van de aanroeper omdat alleen `shared/time` mag bepalen welke
 * dag het is in de tijdzone van de gebruiker (CLAUDE.md, correctheidsregel 7).
 */
export async function maakDoel(
  userId: string,
  invoer: DoelInvoer,
  vandaag: IsoDate,
): Promise<Resultaat<Doel>> {
  const gevalideerd = doelSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  if (!datumLigtInDeToekomst(gevalideerd.data.target_date, vandaag)) {
    return { ok: false, melding: 'Kies een streefdatum die nog moet komen.' };
  }

  const { data, error } = await supabase()
    .from('goals')
    .insert({ ...gevalideerd.data, owner_id: userId })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'goals.create', { user_id: userId, code: error.code });
    return { ok: false, melding: 'Je doel kon niet worden opgeslagen. Probeer het opnieuw.' };
  }

  // Het eerste event in de geschiedenis van dit doel.
  await logGoalEvent(data.id, userId, 'created', null, { title: data.title });

  return { ok: true, waarde: data };
}

/**
 * Wijzigt een doel.
 *
 * ⚠️ Verandert de streefdatum, dan komt daar een `deadline_moved`-event bij, mét
 *    de oude en de nieuwe waarde. Dat is een acceptatiecriterium van QS8-32 en
 *    de voeding van de Risico-radar.
 */
export async function wijzigDoel(
  doelId: string,
  huidigeStreefdatum: string,
  patch: DoelPatch,
  actorId: string,
  vandaag: IsoDate,
): Promise<Resultaat<Doel>> {
  const gevalideerd = doelPatchSchema.safeParse(patch);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const velden = gevalideerd.data;

  if (velden.target_date !== undefined && !datumLigtInDeToekomst(velden.target_date, vandaag)) {
    return { ok: false, melding: 'Kies een streefdatum die nog moet komen.' };
  }

  const update: TablesUpdate<'goals'> = {};
  if (velden.title !== undefined) update.title = velden.title;
  if (velden.description !== undefined) update.description = velden.description;
  if (velden.category !== undefined) update.category = velden.category;
  if (velden.target_date !== undefined) update.target_date = velden.target_date;
  if (velden.identity_statement !== undefined) {
    update.identity_statement = velden.identity_statement;
  }
  if (velden.available_hours_per_week !== undefined) {
    update.available_hours_per_week = velden.available_hours_per_week;
  }

  const { data, error } = await supabase()
    .from('goals')
    .update(update)
    .eq('id', doelId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'goals.update', { goal_id: doelId, code: error.code });
    return { ok: false, melding: 'Opslaan lukte niet. Probeer het opnieuw.' };
  }

  if (velden.target_date !== undefined && velden.target_date !== huidigeStreefdatum) {
    await logGoalEvent(
      doelId,
      actorId,
      'deadline_moved',
      { target_date: huidigeStreefdatum },
      { target_date: velden.target_date },
    );
  }

  return { ok: true, waarde: data };
}

/**
 * Archiveert een doel, of haalt het terug.
 *
 * ⚠️ Archiveren is omkeerbaar en verwijderen niet — dat verschil moet in de UI
 *    zichtbaar zijn (QS8-32). Een gearchiveerd doel verdwijnt uit
 *    groepsoverzichten maar houdt zijn hele geschiedenis: voltooiingen,
 *    goedkeuringen en punten blijven staan (domeinregel 6).
 */
export async function zetArchief(
  goalId: string,
  actorId: string,
  gearchiveerd: boolean,
): Promise<Resultaat<Doel>> {
  const { data, error } = await supabase()
    .from('goals')
    .update({ status: gearchiveerd ? 'archived' : 'active' })
    .eq('id', goalId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'goals.archive', { goal_id: goalId, code: error.code });
    return { ok: false, melding: 'Dat lukte niet. Probeer het opnieuw.' };
  }

  if (gearchiveerd) await logGoalEvent(goalId, actorId, 'archived', null, null);

  return { ok: true, waarde: data };
}

/**
 * Schrijft een regel in de audittrail van een doel.
 *
 * Gooit bewust niet: een mislukte logregel mag de handeling zelf niet
 * terugdraaien. Hij wordt wel gemeld, want een gat in de audittrail is iets dat
 * je wilt weten.
 */
async function logGoalEvent(
  goalId: string,
  actorId: string,
  eventType: 'created' | 'deadline_moved' | 'archived' | 'completed' | 'scope_reduced',
  oud: Json,
  nieuw: Json,
): Promise<void> {
  const { error } = await supabase().from('goal_events').insert({
    goal_id: goalId,
    actor_id: actorId,
    event_type: eventType,
    old_value: oud,
    new_value: nieuw,
  });

  if (error) reportError(error, 'goals.event', { goal_id: goalId, name: eventType });
}
