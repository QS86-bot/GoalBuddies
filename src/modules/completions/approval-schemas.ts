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

/**
 * Zolang je een goedkeuring nog kunt intrekken, in minuten.
 *
 * ⚠️ **De database is de bron; dit is de kopie voor de schermtekst.** Het getal
 *    staat in `intrekvenster_minuten()` (migratie 0099) en `trek_goedkeuring_in()`
 *    rekent daarmee. Deze constante bestaat alleen om
 *    `beoordeling.terugdraai_venster` te kunnen invullen zonder een netwerkronde
 *    voor één bijschrift.
 *
 * ⚠️ **Dat is een kopie, en dus een naad.** Tot 27-08-2026 stond de gelijkheid
 *    alleen in een comment ("gelijk aan de RPC") en toetste niets hem. Loopt hij
 *    uit de pas, dan belooft het scherm een venster dat de database niet geeft —
 *    en dat merkt de gebruiker precies op het moment dat hij een vergissing wil
 *    herstellen. `tests/rls/intrekvenster.test.ts` legt de twee nu naast elkaar.
 *
 * ⚠️ Staat hier en niet in `approvals.ts`, want dat bestand trekt de
 *    Supabase-client mee en is daardoor niet te importeren vanuit de RLS-suite.
 *    Een getal hoort geen runtime nodig te hebben.
 */
export const INTREKVENSTER_MINUTEN = 15;
