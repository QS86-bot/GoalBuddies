import { z } from 'zod';

import { telTekens } from '../../shared/tekst';

/**
 * De invoerregels van een commitment device — QS8-121.
 *
 * ⚠️ Los van `api.ts` zodat deze regels testbaar zijn zonder de Supabase-client
 *    en React Native mee te trekken. Zie `completion-schemas.ts`.
 *
 * ⚠️ **Domeinregel 5, en sinds 22-08 ook de vraaggrens uit `CLAUDE.md`.** Een
 *    commitment device is wat dit product tegen een mens belóóft: een inzet, een
 *    verlies, een straf die verschuldigd wordt. Dat is precies de plek waar een
 *    verkeerde aanname iemand echt raakt, en dus de plek waar de invoerkant
 *    onder test hoort te staan en niet alleen de RLS.
 *
 * ⚠️ `telTekens()` en niet `.min()`/`.max()` — dezelfde reden als in
 *    `deadline-schemas.ts` (QS8-118). Zod telt UTF-16-eenheden, `char_length` in
 *    Postgres telt codepunten. Bij de óndergrens gaat dat verschil de gevaarlijke
 *    kant op: twee emoji halen `.length >= 3` maar `char_length` is dan 2, en
 *    dan laat de client door wat de database weigert.
 *
 *    Tot migratie 0063 kón dat verschil niet opvallen, want `commitments.body`
 *    had helemaal geen lengte-CHECK — deze grenzen bestonden alleen op de client.
 */

export const COMMITMENT_MIN = 3;
export const COMMITMENT_MAX = 500;

export const commitmentSchema = z.object({
  body: z
    .string()
    .trim()
    .refine((tekst) => telTekens(tekst) >= COMMITMENT_MIN, {
      error: 'Schrijf op wat je jezelf oplegt.',
    })
    .refine((tekst) => telTekens(tekst) <= COMMITMENT_MAX, {
      error: `Maximaal ${COMMITMENT_MAX} tekens.`,
    }),
  image_url: z.string().trim().url({ error: 'Dit is geen geldige link.' }).nullable(),
});

export type CommitmentInvoer = z.infer<typeof commitmentSchema>;
