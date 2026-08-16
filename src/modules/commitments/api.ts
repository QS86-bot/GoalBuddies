import { z } from 'zod';

import type { Json, Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Commitment devices: een beloning die vrijkomt als je je doel haalt, en een
 * straf die verschuldigd wordt als je hem mist.
 *
 * ⚠️ Domeinregel 5: alles wat een consequentie oplegt moet expliciet bevestigd
 *    zijn, auditeerbaar, en nooit stilzwijgend geactiveerd. Dat is hier geen
 *    afspraak maar een schema-eigenschap: `confirmed_at` is NOT NULL, dus een
 *    commitment zónder bevestiging kán niet bestaan.
 *
 * ⚠️ Domeinregel 11: een straf treedt alleen in werking bij een verstreken
 *    deadline. Een gemiste week kost een minpunt, meer niet. De database dwingt
 *    dat af sinds migratie 0006: de client mag `status` niet kiezen en komt dus
 *    altijd binnen op `set`.
 */

export type Commitment = Tables<'commitments'>;

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

export const commitmentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(3, { error: 'Schrijf op wat je jezelf oplegt.' })
    .max(500, { error: 'Maximaal 500 tekens.' }),
  image_url: z.string().trim().url({ error: 'Dit is geen geldige link.' }).nullable(),
});

export type CommitmentInvoer = z.infer<typeof commitmentSchema>;

export async function fetchCommitments(goalId: string): Promise<readonly Commitment[]> {
  const { data, error } = await supabase()
    .from('commitments')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(error, 'commitments.list', { goal_id: goalId, code: error.code });
    throw new Error('De beloning en straf konden niet geladen worden.');
  }

  return data ?? [];
}

/**
 * Legt een beloning vast — QS8-34.
 *
 * Geen begunstigde groep: een beloning is voor jezelf.
 */
export async function zetBeloning(
  goalId: string,
  invoer: CommitmentInvoer,
): Promise<Resultaat<Commitment>> {
  return await maak(goalId, 'reward', invoer, null);
}

/**
 * Legt een straf vast — QS8-35.
 *
 * ⚠️ De begunstigde groep is verplicht (schema-constraint) en moet een groep
 *    zijn waar je zélf lid van bent. Dat laatste wordt in RLS afgedwongen sinds
 *    0006, niet in de UI: een keuzelijst die alleen jouw groepen toont is
 *    gebruiksgemak, geen beveiliging.
 *
 * ⚠️ De groep krijgt dit commitment pas te zien als het verschuldigd wordt. Tot
 *    die tijd is het alleen van jou (domeinregel 11, afgedwongen in
 *    `commitments_select`).
 */
export async function zetStraf(
  goalId: string,
  invoer: CommitmentInvoer,
  beneficiaryGroupId: string,
): Promise<Resultaat<Commitment>> {
  if (!beneficiaryGroupId) {
    return { ok: false, melding: 'Kies een groep die hiervan profiteert als het niet lukt.' };
  }
  return await maak(goalId, 'penalty', invoer, beneficiaryGroupId);
}

async function maak(
  goalId: string,
  type: 'reward' | 'penalty',
  invoer: CommitmentInvoer,
  beneficiaryGroupId: string | null,
): Promise<Resultaat<Commitment>> {
  const gevalideerd = commitmentSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const { data, error } = await supabase()
    .from('commitments')
    .insert({
      goal_id: goalId,
      type,
      body: gevalideerd.data.body,
      image_url: gevalideerd.data.image_url,
      beneficiary_group_id: beneficiaryGroupId,
      // ⚠️ De bevestiging is het aanmaken zelf: dit wordt pas aangeroepen ná de
      //    aparte bevestigingsstap in de UI, waar de consequentie letterlijk
      //    uitgeschreven staat. `'now'` laat Postgres de tijd zetten.
      confirmed_at: 'now',
      // `status` staat er bewust niet bij. De database staat alleen 'set' toe
      // bij een insert (0006); meesturen zou suggereren dat er iets te kiezen is.
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'commitments.create', { goal_id: goalId, name: type, code: error.code });
    return { ok: false, melding: 'Vastleggen lukte niet. Probeer het opnieuw.' };
  }

  await logCommitmentEvent(data.id, 'confirmed', { type });

  return { ok: true, waarde: data };
}

/**
 * Trekt een commitment in, zolang het nog niet in werking is getreden.
 *
 * ⚠️ Alleen mogelijk op status `set`. Dat is geen UI-regel maar de
 *    `commitments_update`-policy: een straf die verschuldigd is, kun je niet
 *    wegpoetsen. Anders is een commitment device geen commitment device.
 */
export async function trekIn(commitmentId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase()
    .from('commitments')
    .update({ status: 'cancelled' })
    .eq('id', commitmentId)
    .select('id');

  if (error) {
    reportError(error, 'commitments.cancel', { code: error.code });
    return { ok: false, melding: 'Intrekken lukte niet.' };
  }

  if ((data ?? []).length === 0) {
    return {
      ok: false,
      melding: 'Dit commitment is al in werking getreden en kan niet meer worden ingetrokken.',
    };
  }

  await logCommitmentEvent(commitmentId, 'cancelled', null);
  return { ok: true, waarde: true };
}

async function logCommitmentEvent(
  commitmentId: string,
  eventType: 'confirmed' | 'cancelled' | 'edited',
  payload: Json,
): Promise<void> {
  const { error } = await supabase()
    .from('commitment_events')
    .insert({ commitment_id: commitmentId, event_type: eventType, payload });

  if (error) reportError(error, 'commitments.event', { name: eventType, code: error.code });
}
