import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * De Doelcoach vanaf de clientkant — QS8-38, QS8-42.
 *
 * ⚠️ **Nooit synchroon in de request** (CLAUDE.md correctheidsregel 8). Een
 *    AI-call duurt hier ongeveer twintig seconden — gemeten, niet geschat — en
 *    dat past in geen enkel verzoek dat een gebruiker afwacht. Het pad is
 *    daarom: `vraag_ai_job()` zet een rij klaar, de Edge Function werkt hem af,
 *    en dit scherm kijkt tot hij klaar is.
 *
 * ⚠️ **De API-sleutel staat nooit aan deze kant.** `doelcoach` leest hem uit de
 *    Supabase-secrets; de client stuurt alleen een job-id mee, met zijn eigen
 *    JWT. De functie controleert daarna zelf of die job van deze gebruiker is.
 *
 * ⚠️ Elke AI-call kost geld (onwrikbare regel 6). De poort telt, dedupliceert en
 *    cachet: tien jobs per dag, dezelfde vraag binnen een dag wordt hergebruikt,
 *    en een vraag die al draait levert dezelfde job op in plaats van een tweede.
 *    Dat zit allemaal in `vraag_ai_job()` en niet hier — een limiet in de client
 *    is een suggestie.
 */

// ⚠️ De statuslijst woont in een bestand dat de client niet importeert, zodat
//    een test hem kan lezen zonder React Native mee te trekken. Zie
//    `job-schemas.ts`.
import type { JobStatus } from './job-schemas';

export interface JobVerwijzing {
  readonly jobId: string;
  /** Kwam dit antwoord uit de cache of stond de job al klaar? */
  readonly hergebruikt: boolean;
}

export type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/**
 * Zet een aanvraag klaar. Geeft de job terug, niet het antwoord.
 *
 * ⚠️ De invoer wordt gehasht en gebruikt als cachesleutel. Twee keer dezelfde
 *    vraag binnen een dag kost dus één AI-call — maar dat betekent ook dat
 *    "opnieuw genereren" met identieke invoer hetzelfde antwoord teruggeeft.
 *    Voor QS8-40 hoort daar iets in de invoer te variëren.
 */
export async function vraagWeekdoelen(
  goalId: string,
  invoer: Record<string, unknown>,
): Promise<Uitkomst<JobVerwijzing>> {
  return vraagJob('weekly_goals', goalId, invoer);
}

/**
 * Vraagt de coach om mijlpalen voor een heel doel — QS8-38.
 */
export async function vraagMijlpalen(
  goalId: string,
  invoer: Record<string, unknown>,
): Promise<Uitkomst<JobVerwijzing>> {
  return vraagJob('milestones', goalId, invoer);
}

/**
 * De gedeelde helft van `vraagMijlpalen()` en `vraagWeekdoelen()`.
 *
 * ⚠️ **`kind` is geen parameter van de publieke rand, en dat is met opzet.** Zou
 *    een aanroeper het kind mogen kiezen, dan is het iets dat een scherm bepaalt
 *    in plaats van iets dat bij de vraag hoort — en dan is er ook geen plek meer
 *    om per soort een andere melding te geven. Twee smalle functies naar buiten,
 *    één brede naar binnen.
 */
async function vraagJob(
  kind: 'milestones' | 'weekly_goals',
  goalId: string,
  invoer: Record<string, unknown>,
): Promise<Uitkomst<JobVerwijzing>> {
  const { data, error } = await supabase().rpc('vraag_ai_job', {
    p_kind: kind,
    p_goal_id: goalId,
    p_input: invoer as never,
  });

  if (error) {
    reportError(error, 'ai.vraag', { goal_id: goalId, kind, code: error.code });
    return { ok: false, melding: t('coach.starten_mislukt') };
  }

  const uit = (data ?? {}) as {
    ok?: boolean;
    job_id?: string;
    hergebruikt?: boolean;
    reason?: string;
    limiet?: number;
  };

  if (uit.ok !== true || uit.job_id === undefined) {
    return { ok: false, melding: aanvraagMelding(uit.reason, uit.limiet) };
  }

  return { ok: true, waarde: { jobId: uit.job_id, hergebruikt: uit.hergebruikt === true } };
}

function aanvraagMelding(reden: string | undefined, limiet: number | undefined): string {
  switch (reden) {
    case 'quota_reached':
      // ⚠️ Het getal komt uit de database mee, zodat deze tekst niet de tweede
      //    plek wordt waar de limiet staat.
      //
      // ⚠️ Stond tot 25-08-2026 als kale zin in dit bestand, vijf regels naast de
      //    `t()`-aanroepen eronder — en `tekst:controle` zag hem niet, want een
      //    `return` van een zin viel buiten élke heuristiek. Zie QS8-115.
      return t('coach.daglimiet', { limiet: limiet ?? 10 });
    case 'not_your_goal':
      return t('coach.niet_jouw_doel');
    case 'not_signed_in':
      return t('coach.niet_ingelogd');
    default:
      return t('coach.starten_mislukt');
  }
}

/**
 * Roept de Edge Function aan die de job afwerkt.
 *
 * ⚠️ Geeft geen antwoord terug — alleen of het afwerken gestart en geslaagd is.
 *    Het resultaat lees je uit de job zelf, want de functie schrijft het daar
 *    weg. Zo is een onderbroken verbinding niet hetzelfde als een verloren
 *    antwoord: de job staat er nog.
 */
export async function werkJobAf(jobId: string): Promise<Uitkomst<true>> {
  const { error } = await supabase().functions.invoke('doelcoach', {
    body: { job_id: jobId },
  });

  if (error) {
    reportError(error, 'ai.afwerken', { job_id: jobId });
    return { ok: false, melding: t('coach.afronden_mislukt') };
  }

  return { ok: true, waarde: true };
}

export interface Job {
  readonly id: string;
  readonly status: JobStatus;
  readonly output: unknown;
  readonly error: string | null;
}

/** Leest de stand van één job. */
export async function fetchJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabase()
    .from('ai_jobs')
    .select('id, status, output, error')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    reportError(error, 'ai.job', { job_id: jobId, code: error.code });
    return null;
  }

  return data === null
    ? null
    : { id: data.id, status: data.status as JobStatus, output: data.output, error: data.error };
}
