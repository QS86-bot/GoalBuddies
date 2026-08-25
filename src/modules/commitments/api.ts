import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { invoerfout, type Resultaat } from '../../shared/api';

import { commitmentSchema, type CommitmentInvoer } from './commitment-schemas';

// ⚠️ Opnieuw geëxporteerd zodat de aanroepers via `modules/<naam>/index.ts`
//    ongemoeid blijven. De definitie staat sinds 25-08-2026 in `shared/api`;
//    hij stond hiervoor zeven keer woordelijk in deze codebase.
export type { Resultaat };

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
 *
 * ⚠️ **Het auditspoor staat hier niet meer.** Tot 0057 schreef dit bestand zelf
 *    zijn regels in `commitment_events`, en dat werkte nooit: die tabel heeft
 *    RLS met alleen een SELECT-policy, dus elke insert werd geweigerd met 42501
 *    en door `reportError` opgeslokt. De tabel stond op nul rijen. Sinds 0057
 *    schrijft de trigger `commitments_audit` de regels, met `auth.uid()` als
 *    actor. Dat is ook inhoudelijk beter: een client die zijn eigen audittrail
 *    bijhoudt, kan hem overslaan — en domeinregel 5 vraagt juist dat je dat niet
 *    kunt.
 */

export type Commitment = Tables<'commitments'>;
export type CommitmentGebeurtenis = Tables<'commitment_events'>;


export async function fetchCommitments(goalId: string): Promise<readonly Commitment[]> {
  const { data, error } = await supabase()
    .from('commitments')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(error, 'commitments.list', { goal_id: goalId, code: error.code });
    throw new Error(t('commitment.fout.laden'));
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
    return { ok: false, melding: t('commitment.fout.geen_groep') };
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
    return { ok: false, melding: invoerfout(gevalideerd.error, t('commitment.fout.invoer')) };
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
    return { ok: false, melding: t('commitment.fout.vastleggen') };
  }

  // Geen logregel hier: de trigger `commitments_audit` heeft er al een
  // geschreven, met `auth.uid()` erin (migratie 0057).
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
    return { ok: false, melding: t('commitment.fout.intrekken') };
  }

  if ((data ?? []).length === 0) {
    return {
      ok: false,
      melding: t('commitment.fout.al_afgegaan'),
    };
  }

  // Ook hier geen logregel: `commitments_audit` heeft hem al geschreven.
  return { ok: true, waarde: true };
}

/**
 * Het auditspoor van een commitment — QS8-84, acceptatiecriterium 7.
 *
 * Alleen voor de eigenaar leesbaar (`commitment_events_select`). De begunstigde
 * groep ziet het spoor niet, ook niet nadat een straf verschuldigd is geworden:
 * die groep krijgt de straf zélf te lezen en verder niets.
 */
export async function fetchCommitmentSpoor(
  commitmentId: string,
): Promise<readonly CommitmentGebeurtenis[]> {
  const { data, error } = await supabase()
    .from('commitment_events')
    .select('*')
    .eq('commitment_id', commitmentId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(error, 'commitments.trail', { code: error.code });
    throw new Error(t('commitment.fout.spoor'));
  }

  return data ?? [];
}
