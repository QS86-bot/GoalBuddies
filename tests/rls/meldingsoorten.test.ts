import { describe, expect, it } from 'vitest';

import { MELDINGSOORTEN } from '../../src/modules/notifications/regels';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De soorten in de code en de CHECK in de database zijn dezelfde lijst — QS8-298.
 *
 * ⚠️ **Waarom deze test er pas nu is.** `Melding` in `regels.ts` was al sinds
 *    EPIC 11 een kopie van `notifications_sent_kind_bekend` (0053), en de twee
 *    liepen niet uit de pas. Maar er was ook niets dat het gemerkt zou hebben:
 *    beide helften waren op zichzelf correct en getest, en de naad ertussen niet.
 *    Regel 18, vraag 1 — daar waar twee correcte onderdelen aan elkaar knopen,
 *    hoort een test, en niet alleen op weerszijden ervan.
 *
 * ⚠️ **En het is geen theoretische naad.** Een soort die alleen in de code
 *    bestaat, laat de INSERT in `notifications_sent` omvallen op de CHECK — dus
 *    er komt geen rij, dus er is geen ontdubbeling, dus de uurjob stuurt hem
 *    élke ronde opnieuw. Een soort die alleen in de database bestaat, is dode
 *    ruimte waar niemand een tekst voor geschreven heeft. Allebei stil.
 *
 * ⚠️ **De lijst wordt aan beide kanten uitgelezen en niet overgetypt.** Aan de
 *    codekant `MELDINGSOORTEN`, aan de databasekant `pg_get_constraintdef()`.
 *    Een derde lijst hier zou de fout van 0032/0034 herhalen: twee lijsten die
 *    uit elkaar lopen, waarbij de test er een met zichzelf vergelijkt.
 *
 * IJKING — met de hand gedraaid op 07-09-2026:
 *
 *   A  `'commitment_witness'` uit `MELDINGSOORTEN` halen
 *      → 1 rood: de database kent er een die de code niet kent
 *   B  een zesde waarde aan de CHECK toevoegen
 *      → 1 rood: de code kent er een minder
 *   C  de afleiding uit de CHECK stukmaken (constraintnaam verkeerd)
 *      → 2 rood: de ondergrens noemt de oorzaak, de vergelijking het gevolg
 *
 * ⚠️ C is de grendel die telt. Hernoemt iemand de constraint, dan vindt deze
 *    test nul soorten en zou hij zonder die ondergrens vrolijk melden dat de
 *    twee lege lijsten gelijk zijn.
 *
 * ⚠️ **En muteer bij C alléén de afleiding, niet ook de beschikbaarheidsvraag
 *    bovenaan.** Die eerste poging veranderde beide, waarop de hele suite zich
 *    netjes oversloeg — "no tests" in plaats van rood. Een ijking die zijn geval
 *    door een eerdere grendel voert, bewaakt niets van wat hij belooft.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'notifications_sent_kind_bekend'",
  import.meta.url,
);

/** De waarden uit de CHECK, uit de catalogus gelezen en niet overgetypt. */
function soortenUitDeDatabase(): string[] {
  const def = psql(
    "select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_sent_kind_bekend'",
  );

  return [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1] as string).sort();
}

describe.skipIf(!beschikbaar)('de meldingsoorten in de code en in de database', () => {
  it(
    'vindt de soorten in de CHECK',
    () => {
      expect(
        soortenUitDeDatabase().length,
        'geen enkele soort gevonden in notifications_sent_kind_bekend',
      ).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'zijn dezelfde lijst',
    () => {
      expect(soortenUitDeDatabase()).toEqual([...MELDINGSOORTEN].sort());
    },
    TEST_TIMEOUT,
  );
});
