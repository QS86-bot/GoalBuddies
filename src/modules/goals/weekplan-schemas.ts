import { z } from 'zod';

import { t } from '../../shared/i18n';

/**
 * Geplande weekstappen — QS8-203, migratie 0138.
 *
 * ⚠️ De grenzen zijn met opzet identiek aan die van `weekdoelSchema`. Een
 *    geplande stap wordt letterlijk een weekdoel: de rollover kopieert titel,
 *    vloer en plafond ongewijzigd naar `weekly_goals`. Een ruimere grens hier is
 *    dus geen soepelheid maar een storingsmelding die een week later afgaat, op
 *    een moment dat de gebruiker niets aan het invullen is.
 *
 *    Er zijn drie plekken waar deze grens staat en ze horen gelijk te blijven:
 *    dit schema, `weekly_plan_steps_title_len` c.s. in 0138, en dezelfde
 *    constraints op `weekly_goals` (0001 en 0123). De test naast dit bestand
 *    houdt de eerste twee tegen elkaar.
 */

/**
 * ⚠️ Een plan reikt hoogstens een jaar vooruit — `weekly_plan_steps_order_bereik`
 *    in 0138. Het getal staat hier ook, want een formulier dat 53 stappen
 *    accepteert en dan een `23514` uit de database terugkrijgt, vertelt de
 *    gebruiker niets.
 */
export const MAX_PLANSTAPPEN = 52;

export const weekplanstapSchema = z.object({
  goal_id: z.uuid({ error: () => t('validatie.kies_doel') }),
  /** Hangt de stap onder een mijlpaal, of los onder het hoofddoel? */
  milestone_id: z.uuid().nullable(),
  title: z
    .string()
    .trim()
    .min(3, { error: () => t('validatie.weekdoeltitel') })
    .max(200, { error: () => t('validatie.weekdoeltitel_lang') }),
  floor_text: z
    .string()
    .trim()
    .max(200, { error: () => t('validatie.vloer_plafond_kort') })
    .nullable(),
  ceiling_text: z
    .string()
    .trim()
    .max(200, { error: () => t('validatie.vloer_plafond_kort') })
    .nullable(),
});

export type WeekplanstapInvoer = z.infer<typeof weekplanstapSchema>;

/**
 * Een heel plan in één keer — wat de Weekcoach oplevert.
 *
 * ⚠️ De bovengrens staat op het aantal stappen en niet alleen op elke stap
 *    apart. Zonder deze regel is "neem het plan over" een lus die de dagrem uit
 *    0091 leegtrekt met één druk op de knop.
 */
export const weekplanSchema = z
  .array(weekplanstapSchema.omit({ goal_id: true, milestone_id: true }))
  .min(1, { error: () => t('validatie.weekplan_leeg') })
  .max(MAX_PLANSTAPPEN, { error: () => t('validatie.weekplan_lang') });

export type WeekplanInvoer = z.infer<typeof weekplanSchema>;

/**
 * De redenen die `start_weekplanstap()` en `activeer_weekplanstap()` teruggeven.
 *
 * ⚠️ Deze lijst is een kopie van wat 0138 kan antwoorden en staat onder test.
 *    Loopt hij achter, dan valt een reden in de UI stil terug op "er ging iets
 *    mis" terwijl de database precies verteld heeft wát er mis was — en dat is
 *    de klasse fout waar regel 18 over gaat.
 */
export const PLANSTAP_REDENEN = [
  'not_logged_in',
  'not_owner',
  'onbekend',
  'al_verbruikt',
  'al_geactiveerd',
  'doel_niet_actief',
  'geen_stap',
  'ongeldige_cyclus',
  'te_veel_deze_dag',
] as const;

export type PlanstapReden = (typeof PLANSTAP_REDENEN)[number];

/** Herkent een reden uit de database; alles anders is onbekend gebied. */
export function isPlanstapReden(waarde: unknown): waarde is PlanstapReden {
  return typeof waarde === 'string' && (PLANSTAP_REDENEN as readonly string[]).includes(waarde);
}

/**
 * De melding bij een geweigerde activatie.
 *
 * ⚠️ Elke reden uit 0138 heeft hier een eigen zin. Een `default` die alles
 *    opvangt zou een nieuwe reden stil laten verdwijnen achter "er ging iets
 *    mis" — en dan heeft de database precies verteld wat er aan de hand was en
 *    ziet de gebruiker het niet.
 */
export function meldingBijReden(reden: unknown): string {
  if (!isPlanstapReden(reden)) return t('weekplan.starten_mislukt');

  const zinnen: Record<PlanstapReden, string> = {
    not_logged_in: t('weekplan.niet_ingelogd'),
    not_owner: t('weekplan.niet_van_jou'),
    onbekend: t('weekplan.niet_van_jou'),
    al_verbruikt: t('weekplan.al_ingeschoven'),
    al_geactiveerd: t('weekplan.deze_week_al'),
    doel_niet_actief: t('weekplan.doel_niet_actief'),
    geen_stap: t('weekplan.geen_stap'),
    ongeldige_cyclus: t('weekplan.starten_mislukt'),
    te_veel_deze_dag: t('weekplan.te_veel_deze_dag'),
  };

  return zinnen[reden];
}
