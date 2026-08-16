import { z } from 'zod';

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
  goal_id: z.uuid({ error: 'Kies een doel.' }),
  /** Hangt het weekdoel onder een mijlpaal, of los onder het hoofddoel? */
  milestone_id: z.uuid().nullable(),
  title: z
    .string()
    .trim()
    .min(3, { error: 'Wat wil je deze week af hebben?' })
    .max(200, { error: 'Maximaal 200 tekens.' }),
  /**
   * De vloer — QS8-44, de belangrijkste import uit Habit Huddle.
   *
   * ⚠️ Optioneel gebleven bij de review van 15-08-2026. Verplicht stellen levert
   *    ingevulde onzin op, en dan is de vloer een formulierveld in plaats van
   *    een vangnet. De UI moedigt hem wél actief aan.
   */
  floor_text: z.string().trim().max(200, { error: 'Hou het kort.' }).nullable(),
  ceiling_text: z.string().trim().max(200, { error: 'Hou het kort.' }).nullable(),
});

export type WeekdoelInvoer = z.infer<typeof weekdoelSchema>;

/**
 * Wat er bij het afronden gekozen wordt — QS8-46.
 *
 * De notitie is standaard verplicht. Per groep instelbaar via
 * `groups.evidence_policy` (6.5); dat schema leeft in de module completions.
 */
export const afrondSchema = z.object({
  achieved_level: z.enum(['floor', 'ceiling']),
  note: z.string().trim().max(2000, { error: 'Maximaal 2000 tekens.' }).nullable(),
});

export type AfrondInvoer = z.infer<typeof afrondSchema>;
