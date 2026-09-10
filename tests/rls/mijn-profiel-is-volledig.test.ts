import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De eigenaar leest zijn hele profiel; anderen lezen drie kolommen — QS8-92.
 *
 * ⚠️⚠️ **`select p.*` in een view is geen levende ster.** Postgres expandeert hem
 *    bij het aanmaken tot een vaste kolomlijst. 📏 Nagemeten op 10-09-2026 met
 *    `pg_get_viewdef()`: `mijn_profiel` had achttien kolommen uitgeschreven staan,
 *    terwijl `src/modules/auth/profile.ts` in zijn kop beweerde dat de view
 *    "letterlijk `select p.*`" was en dat de cast eronder fout zou worden "wordt
 *    de view ooit een projectie". Hij wás het al.
 *
 * ⚠️ **Wat er misgaat als iemand dit vergeet, is precies niets — en dat is het
 *    probleem.** Voeg een kolom toe aan `profiles` en zet de view niet opnieuw:
 *    de kolom bestaat, de grant staat er, de policy klopt, de suite is groen. De
 *    eigenaar kan zijn eigen instelling alleen niet lezen, `fetchProfiel()` cast
 *    naar `Profiel` en belooft een waarde waar `undefined` staat, en het scherm
 *    toont een schakelaar die altijd uit lijkt te staan. Onwrikbare regel 18,
 *    vraag 5: elk onderdeel af, de keten stuk.
 *
 * ⚠️ **Deze test toetst de regel en niet drie namen** (regel 18, vraag 4). Een
 *    test die `notify_cycle_summary` opsomt, bewaakt deze migratie en niet de
 *    vólgende. Wat hier staat is de belofte zelf: *wat een groepsgenoot niet mag
 *    lezen, leest de eigenaar via de view.* Die wordt vanzelf rood bij de eerste
 *    kolom die iemand vergeet.
 *
 * ⚠️ **Met de hand rood gemaakt, en de eerste poging telde niet.** De view
 *    terugzetten met `create or replace` weigert Postgres — *cannot drop columns
 *    from view* — dus die mutatie liet de test groen om een reden die niets met
 *    zijn belofte te maken had. Pas `drop view` + `create view` met de achttien
 *    kolommen van vóór 0235 maakte hem rood, mét de vier ontbrekende kolommen bij
 *    naam in de melding.
 *
 *    Dat is meteen de reden dat het rollback-pad van 0235 asymmetrisch is: de
 *    heenweg mag `create or replace`, de terugweg moet droppen en opnieuw
 *    aanmaken, inclusief de grant.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'mijn_profiel'",
  import.meta.url,
);

function regels(sql: string): string[] {
  return psql(sql)
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

describe.skipIf(!beschikbaar)('`mijn_profiel` geeft de eigenaar zijn hele rij', () => {
  it(
    'bevat elke kolom van `profiles` die een groepsgenoot niet mag lezen',
    () => {
      const alle = regels(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'`,
      );

      const leesbaarVoorAnderen = regels(
        `select column_name from information_schema.column_privileges
          where table_name = 'profiles' and grantee = 'authenticated'
            and privilege_type = 'SELECT'`,
      );

      const inDeView = regels(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'mijn_profiel'`,
      );

      // ⚠️ De vangnetten eerst: een lege lijst maakt de eis hieronder leeg waar,
      //    en dan is dit een grendel die er wel staat en niets bewaakt.
      expect(alle.length).toBeGreaterThan(10);
      expect(leesbaarVoorAnderen.length).toBeGreaterThan(0);

      const alleenVoorMij = alle.filter((k) => !leesbaarVoorAnderen.includes(k));
      const ontbreekt = alleenVoorMij.filter((k) => !inDeView.includes(k));

      expect(
        ontbreekt,
        `deze kolommen staan op profiles maar niet in mijn_profiel: ${ontbreekt.join(', ')}. ` +
          'Zet de view opnieuw met `create or replace view` aan het eind van je migratie.',
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
