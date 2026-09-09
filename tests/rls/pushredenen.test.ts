import { describe, expect, it } from 'vitest';

import { PUSH_WEIGERGRONDEN } from '../../src/modules/notifications/push-redenen';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Elke weigergrond van `registreer_push_token()` heeft een zin — QS8-377.
 *
 * ⚠️⚠️ **De functie gaf negen redenen terug en de gebruiker zag er nul van.**
 *    `registreerPushToken()` meldde ze aan Sentry en gaf `void` terug; `Meldingen`
 *    zette daarna onvoorwaardelijk `stand = 'aan'`. Het scherm zei dus dat
 *    meldingen aanstonden terwijl er geen token geregistreerd was — regel 16, en
 *    de ergste vorm ervan: een ontbrekende error-staat die liegt in plaats van
 *    zwijgt.
 *
 * ⚠️ **Deze test legt de kopie naast de bron**, en dat is de naad die telt. De
 *    lijst in `tokens.ts` bepaalt welke zin een gebruiker krijgt; de database
 *    bepaalt welke redenen er bestaan. Lopen die uit elkaar, dan valt een nieuwe
 *    reden stil in de algemene zin — precies zoals `te_veel_tokens` er in 0214
 *    bij kwam zonder dat iemand het merkte.
 *
 * ⚠️ Het issue noemde zes redenen; 📏 het zijn er negen. Een lijst in een issue is
 *    geen dekking.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'registreer_push_token'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('de weigergronden van registreer_push_token', () => {
  it('staan alle negen in de lijst waar de copy op leunt', () => {
    // ⚠️ Commentaar wordt niet gestript en dat hoeft hier niet: er wordt op de
    //    vorm `'reason', '<naam>'` gezocht, en die staat alleen in de
    //    `jsonb_build_object`-aanroepen. Een reden die in een commentaar besproken
    //    wordt zonder die vorm, telt niet mee.
    const uit = psql(
      `select coalesce(string_agg(distinct m.gevonden[1], ',' order by m.gevonden[1]), '')
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join lateral regexp_matches(
           p.prosrc, '''reason'', ''([a-z_]+)''', 'g') as m(gevonden)
        where n.nspname = 'public' and p.proname = 'registreer_push_token'`,
    ).trim();

    const inDeDatabase = uit === '' ? [] : uit.split(',');

    // ⚠️ Eerst de inhoud vastpinnen: een lege uitkomst betekent óók "de functie
    //    bestaat niet meer", en dan is een vergelijking van twee lege lijsten
    //    groen terwijl er niets meer gemeten wordt. Zelfde reden als bij
    //    `goal_events_type_valid` in `policies.test.ts`.
    expect(inDeDatabase).toHaveLength(9);
    expect(inDeDatabase).toEqual([...PUSH_WEIGERGRONDEN].sort());
  }, 120_000);
});
