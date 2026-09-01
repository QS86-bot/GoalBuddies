import { z } from 'zod';

import { t } from '../../shared/i18n';

import { MAX_DAGEN_PER_WEEK } from './schemas';

/**
 * De invoer van een weekdoel.
 *
 * ⚠️ `cycle_start_date` en `cycle_index` staan er bewust NIET in. Die worden
 *    berekend uit de klok van de gebruiker in `weekly.ts`. Zou de client ze
 *    mogen meesturen, dan is "deze week" iets dat een formulier bepaalt in
 *    plaats van `shared/time` — en dan klopt de hele cyclus niet meer voor
 *    iemand met een andere week-startdag.
 */

export const weekdoelSchema = z.object({
  goal_id: z.uuid({ error: () => t('validatie.kies_doel') }),
  /** Hangt het weekdoel onder een mijlpaal, of los onder het hoofddoel? */
  milestone_id: z.uuid().nullable(),
  title: z
    .string()
    .trim()
    .min(3, { error: () => t('validatie.weekdoeltitel') })
    .max(200, { error: () => t('validatie.weekdoeltitel_lang') }),
  /**
   * De vloer — QS8-44, de belangrijkste import uit Habit Huddle.
   *
   * ⚠️ Optioneel gebleven bij de review van 15-08-2026. Verplicht stellen levert
   *    ingevulde onzin op, en dan is de vloer een formulierveld in plaats van
   *    een vangnet. De UI moedigt hem wél actief aan.
   */
  floor_text: z.string().trim().max(200, { error: () => t('validatie.vloer_plafond_kort') }).nullable(),
  ceiling_text: z.string().trim().max(200, { error: () => t('validatie.vloer_plafond_kort') }).nullable(),

  /**
   * De vloer en het plafond in dagen — besluit A53, migratie 0140.
   *
   * ⚠️ **Allebei leeg is een gewoon weekdoel**, en dat is het normale geval. Is
   *    `ceiling_days` gevuld, dan telt deze week dagen en leidt de database het
   *    bereikte niveau daaruit af in plaats van het aan het formulier te vragen.
   *
   * ⚠️ De grenzen staan ook in `weekly_goals_dagen_geordend` in 0140. Loopt dit
   *    schema daarop achter, dan accepteert het formulier iets wat de database
   *    met een `23514` weigert — en die melding zegt de gebruiker niets.
   */
  floor_days: z
    .number()
    .int({ error: () => t('validatie.dagen_heel') })
    .min(1, { error: () => t('validatie.dagen_bereik') })
    .max(MAX_DAGEN_PER_WEEK, { error: () => t('validatie.dagen_bereik') })
    .nullable()
    .default(null),
  ceiling_days: z
    .number()
    .int({ error: () => t('validatie.dagen_heel') })
    .min(1, { error: () => t('validatie.dagen_bereik') })
    .max(MAX_DAGEN_PER_WEEK, { error: () => t('validatie.dagen_bereik') })
    .nullable()
    .default(null),
})
  /**
   * ⚠️ Dezelfde ordening als de CHECK in 0140, en om dezelfde reden als de
   *    lengtegrenzen hierboven: wat hier doorkomt en daar niet, is een
   *    storingsmelding in plaats van een invoerfout.
   */
  .refine(
    (v) => v.floor_days === null || v.ceiling_days === null || v.floor_days <= v.ceiling_days,
    { error: () => t('validatie.vloer_boven_plafond'), path: ['floor_days'] },
  )
  /**
   * ⚠️ Een vloer zonder plafond bestaat niet. De CHECK weigert hem ook, maar
   *    daar is het een `23514`; hier is het een zin.
   */
  .refine((v) => v.floor_days === null || v.ceiling_days !== null, {
    error: () => t('validatie.vloer_zonder_plafond'),
    path: ['ceiling_days'],
  });

/**
 * ⚠️ `z.input` en niet `z.infer`. Sinds A53 heeft dit schema velden met een
 *    `.default()`, en die zijn aan de invoerkant optioneel en aan de
 *    uitvoerkant gevuld. Met `z.infer` (de uitvoer) zou elke bestaande
 *    aanroeper ineens verplicht een ritme of een dagental moeten meesturen —
 *    en dan is de standaard geen standaard.
 */
export type WeekdoelInvoer = z.input<typeof weekdoelSchema>;

/**
 * Wat er bij het afronden gekozen wordt — QS8-46.
 *
 * De notitie is standaard verplicht. Per groep instelbaar via
 * `groups.evidence_policy` (6.5); dat schema leeft in de module completions.
 */
export const afrondSchema = z.object({
  achieved_level: z.enum(['floor', 'ceiling']),
  note: z.string().trim().max(2000, { error: () => t('validatie.omschrijving_lang') }).nullable(),
});

export type AfrondInvoer = z.infer<typeof afrondSchema>;
