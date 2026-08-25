import { t } from '../../shared/i18n';

import type { Json } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import type { Resultaat } from './api';
import { invoerfout } from '../../shared/api';
import {
  interviewSchema,
  LEEG_INTERVIEW,
  type InterviewInvoer,
} from './interview-schemas';

/**
 * Het zes-vragen-interview bij een doel — QS8-37.
 *
 * ⚠️ Twee opslagplaatsen, en dat is geen duplicatie maar het onderscheid tussen
 *    momentopname en werkende waarde:
 *
 *      - `goal_interviews.answers` bewaart alle zes de antwoorden zoals ze
 *        gegeven zijn, met een tijdstempel. Dat is geschiedenis en wordt nooit
 *        overschreven — elke keer opnieuw invullen levert een nieuwe rij op.
 *      - `goals.identity_statement` en `goals.available_hours_per_week` dragen
 *        de huidige waarde. Daar leest de rest van de app uit, en de
 *        Risico-radar (EPIC 12) rekent met dat aantal uren.
 *
 *    Dat is dezelfde vorm als voltooiingen tegenover punten: de gebeurtenis
 *    blijft staan, de afgeleide waarde is actueel.
 *
 * ⚠️ De twee schrijfacties zitten niet in één transactie — de client kan dat
 *    niet. De volgorde is daarom bewust: eerst het interview (de geschiedenis,
 *    en het antwoord dat de gebruiker net getypt heeft), dan de spiegeling naar
 *    `goals`. Faalt de tweede, dan is het antwoord niet kwijt en is alleen de
 *    afgeleide waarde achterhaald; andersom zou de gebruiker zijn tekst
 *    kwijtraken. Zie ook `docs/ENGINEER-REVIEW.md`.
 */

export interface Interview {
  readonly goalId: string;
  readonly antwoorden: InterviewInvoer;
  readonly ingevuldOp: string | null;
}

/**
 * Leest het laatste interview van een doel.
 *
 * ⚠️ `goal_interviews` heeft geen unieke sleutel op `goal_id`: er kunnen meer
 *    rijen zijn omdat opnieuw invullen een nieuwe rij schrijft. De laatste telt.
 *    Een `limit(1)` met `order` is hier dus geen optimalisatie maar de definitie.
 */
export async function fetchInterview(goalId: string): Promise<Interview | null> {
  const { data, error } = await supabase()
    .from('goal_interviews')
    .select('answers, created_at')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    reportError(error, 'goals.interview.fetch', { goal_id: goalId, code: error.code });
    return null;
  }

  if (data === null) return null;

  const gelezen = interviewSchema.safeParse(data.answers);

  return {
    goalId,
    // ⚠️ Bij een rij die niet door het schema komt geven we het lege interview
    //    terug in plaats van null. Een oud of half antwoord mag het scherm niet
    //    laten crashen; de gebruiker vult hooguit opnieuw in.
    antwoorden: gelezen.success ? gelezen.data : LEEG_INTERVIEW,
    ingevuldOp: data.created_at,
  };
}

/**
 * Bewaart een interview bij een doel.
 *
 * Alles overslaan mag: een leeg interview is geldige invoer en levert een rij op
 * die vastlegt dát de vragen gesteld zijn.
 */
export async function bewaarInterview(
  goalId: string,
  invoer: InterviewInvoer,
): Promise<Resultaat<Interview>> {
  const gevalideerd = interviewSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const antwoorden = gevalideerd.data;

  const { data, error } = await supabase()
    .from('goal_interviews')
    .insert({ goal_id: goalId, answers: antwoorden as unknown as Json })
    .select('created_at')
    .single();

  if (error) {
    reportError(error, 'goals.interview.save', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('interview.opslaan_mislukt') };
  }

  await spiegelNaarDoel(goalId, antwoorden);

  return { ok: true, waarde: { goalId, antwoorden, ingevuldOp: data.created_at } };
}

/**
 * Zet de twee antwoorden die de rest van de app gebruikt op het doel zelf.
 *
 * ⚠️ Een overgeslagen vraag overschrijft niets. Wie bij het tweede interview de
 *    urenvraag overslaat, houdt het getal uit het eerste — anders zou overslaan
 *    stilletjes gegevens wissen, en dat is precies wat "overslaan mag" niet
 *    hoort te betekenen.
 *
 * ⚠️ Faalt dit, dan is het interview al veilig opgeslagen. We melden het en
 *    laten de gebruiker doorgaan: de Doelcoach werkt met de antwoorden, en de
 *    Risico-radar bestaat nog niet.
 */
async function spiegelNaarDoel(goalId: string, antwoorden: InterviewInvoer): Promise<void> {
  const patch: { identity_statement?: string; available_hours_per_week?: number } = {};
  if (antwoorden.identity !== null && antwoorden.identity !== '') {
    patch.identity_statement = antwoorden.identity;
  }
  if (antwoorden.hours_per_week !== null) {
    patch.available_hours_per_week = antwoorden.hours_per_week;
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase().from('goals').update(patch).eq('id', goalId);
  if (error) {
    reportError(error, 'goals.interview.mirror', { goal_id: goalId, code: error.code });
  }
}
