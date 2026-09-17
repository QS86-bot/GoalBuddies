import { z } from 'zod';
import { t } from '../../shared/i18n';
import { telTekens, schoneVrijeTekst } from '../../shared/tekst';

/**
 * De invoerregels van een afronding en van de Dagzet — QS8-121.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `api.ts`. Zou het dat wel doen, dan
 *    trekt elke test die deze regels wil controleren `lib/supabase` mee, en
 *    daarmee de Supabase-client, AsyncStorage en React Native — in een test die
 *    in Node draait. Zelfde reden als `chat-schemas.ts`, `weekafsluiting-
 *    schemas.ts` en `deadline-schemas.ts`.
 *
 * ⚠️ `dagzetSchema.visibility` bepaalt of een Dagzet de groep bereikt en raakt
 *    daarmee domeinregel 7 én 9. De standaard is privé; die keuze hoort bij de
 *    aanroeper te liggen en niet hier, maar dat er maar twee waarden bestaan
 *    staat vast — hier én als CHECK `daily_moves_visibility_valid`.
 */

export const afrondSchema = z.object({
  achieved_level: z.enum(['floor', 'ceiling']),
  note: z
    .string()
    // ⚠️ Eerst schoonmaken, dán oordelen — QS8-506.
    .transform(schoneVrijeTekst)
    .refine((v) => telTekens(v) <= 2000, { error: () => t('validatie.notitie_lang') })
    .nullable(),
});

export type AfrondInvoer = z.infer<typeof afrondSchema>;

export const dagzetSchema = z.object({
  body: z
    .string()
    // ⚠️ Zichtbaar voor de groep zodra `visibility = 'group'` — QS8-507, 0284.
    .transform(schoneVrijeTekst)
    .refine((v) => telTekens(v) >= 1, { error: () => t('validatie.dagzet_leeg') })
    .refine((v) => telTekens(v) <= 2000, { error: () => t('validatie.notitie_lang') }),
  weekly_goal_id: z.uuid().nullable(),
  visibility: z.enum(['private', 'group']),
});

export type DagzetInvoer = z.infer<typeof dagzetSchema>;
