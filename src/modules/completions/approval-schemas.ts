import { z } from 'zod';

import { t } from '../../shared/i18n';

/**
 * De invoerregels van een peer-oordeel — QS8-121.
 *
 * ⚠️ Los van `approvals.ts` zodat deze regels testbaar zijn zonder de
 *    Supabase-client en React Native mee te trekken. Zie `completion-schemas.ts`.
 *
 * ⚠️ **Domeinregel 3: dit is een autorisatiegrens, geen werkstroom.** Wat hier
 *    níét in staat is even belangrijk als wat er wel in staat. Er is geen
 *    `rejected` en geen `denied`: een buddy kan bevestigen of om meer informatie
 *    vragen, en dat is alles. Afkeuren bestaat niet, want een afwijzing is een
 *    publiek faalsignaal (domeinregel 7).
 *
 *    De echte grendel is de CHECK `completion_approvals_status_valid` plus
 *    `completion_approvals_not_self` in de database; dit schema is de zin die de
 *    gebruiker te zien krijgt in plaats van een Postgres-fout.
 */

export const oordeelSchema = z.object({
  status: z.enum(['approved', 'more_info']),
  comment: z
    .string()
    .trim()
    .max(1000, { error: () => t('validatie.reactie_lang') })
    .nullable(),
});

export type OordeelInvoer = z.infer<typeof oordeelSchema>;
