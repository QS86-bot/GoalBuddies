import { z } from 'zod';

import { telTekens } from '../../shared/tekst';
import { t } from '../../shared/i18n';

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
      error: () => t('validatie.commitment_kort'),
    })
    .refine((tekst) => telTekens(tekst) <= COMMITMENT_MAX, {
      error: () => t('validatie.commitment_lang'),
    }),
  // ⚠️ `.url()` alléén is hier niet genoeg, en dat is geen theorie. In zod 4 is
  //    `z.string().url()` geen schema-allowlist: `javascript:alert(1)`,
  //    `data:text/html,<script>x</script>` en `file:///etc/passwd` komen er alle
  //    drie doorheen (nagemeten met 4.4.3). Een commitment wordt per
  //    domeinregel 11 leesbaar voor de begunstigde groep zodra de straf
  //    verschuldigd wordt, dus zodra iets dit veld als link of `<img>` rendert,
  //    is dat opgeslagen XSS richting je groepsgenoten.
  //
  //    De database controleert het sinds migratie 0068 ook zelf. Dat is geen
  //    dubbelop: dit schema geeft de nette melding, de CHECK geldt ook voor
  //    `service_role` en voor een aanroep die dit schema overslaat.
  image_url: z
    .string()
    .trim()
    .url({ error: () => t('validatie.link') })
    .refine((link) => link.startsWith('https://'), {
      error: () => t('validatie.link_https'),
    })
    .nullable(),
});

export type CommitmentInvoer = z.infer<typeof commitmentSchema>;
