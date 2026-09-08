import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De groepsklok is geen instelling van een beheerder — QS8-355, migratie 0202.
 *
 * ⚠️ **De belofte is niet "er staat geen kolomrecht meer op `tz`".** Dat is een
 *    eigenschap van het onderdeel. De belofte is: *één beheerder verschuift de
 *    weekgrens van de hele groep niet met één verzoek.* `groups.tz` is de tweede
 *    klok van domeinregel 1 — `currentGroupPeriod()` leest hem, en daarmee hangen
 *    de huddledag, de weekafsluiting, De Ketting en het groepsoverzicht eraan,
 *    voor élk lid.
 *
 * ⚠️⚠️ **Wat er kon, gemeten met een echte sessie van de beheerder:**
 *
 *      create_group('Klokgroep')                   -> tz Europe/Amsterdam
 *      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
 *      groepsdatum(gid)                            -> 2026-09-09
 *
 *    De serverdatum was 2026-09-08. Eén PATCH en de groep staat een dag verder.
 *
 * ⚠️⚠️ **Waarom de foutcode hier een assertie is en niet decor.** Er zijn twee
 *    grendels: de kolomgrant (weigert luid) en de pin in `guard_group_update()`
 *    (zet stil terug). Toetst deze suite alleen dat de wáárde niet verandert, dan
 *    blijft ze groen als de grant terugkomt en alleen de pin het werk doet — en
 *    dan krijgt de client een `200` op een verzoek dat niets deed. Dat is de
 *    klasse "succes dat er geen is" waar dit project al drie keer op gestruikeld
 *    is (QS8-314, QS8-326, QS8-342). De pin zelf staat onder test in
 *    `tests/rls/groepspin.test.ts`, die het kolomrecht juist tijdelijk teruggeeft.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart:
 *
 *   A  `grant update (tz) on groups to authenticated`
 *      → 1 rood: 'een beheerder verzet de groepsklok niet met een kale PATCH'
 *      (de update slaagt dan stil: geen fout, en de waarde blijft staan door de
 *      pin — precies het geval dat deze test moet vinden)
 *   B  `new.tz := old.tz` uit `guard_group_update()` halen
 *      → 1 rood in `groepspin.test.ts`: 'tz is niet door een client te wijzigen'
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Ver van de serverzone, zodat een geslaagde verzetting meteen een andere dag geeft. */
const ANDERE_ZONE = 'Pacific/Kiritimati';
const EIGEN_ZONE = 'Europe/Amsterdam';

let beheerder: TestUser;
let groupId: string;

describe.skipIf(!rlsTestsConfigured)('de groepsklok is geen instelling van een beheerder', () => {
  beforeAll(async () => {
    beheerder = await createTestUser('klok-beheerder');

    const groep = await beheerder.db.rpc('create_group', {
      group_name: 'Klokgroep',
      huddle_day: 1,
      tz: EIGEN_ZONE,
    });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = gd.group.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een beheerder verzet de groepsklok niet met een kale PATCH',
    async () => {
      const { error } = await beheerder.db
        .from('groups')
        .update({ tz: ANDERE_ZONE })
        .eq('id', groupId);

      // ⚠️ De foutcode eerst. Zonder deze regel is een stille pin ook groen, en
      //    dan krijgt de client een 200 op een verzoek dat niets deed.
      expect(error, 'de PATCH hoort geweigerd te worden en niet stil te slagen').not.toBeNull();
      expect(
        error?.code,
        `42501 is de kolomgrant. Iets anders betekent dat de grant terug is en ` +
          `alleen de pin het werk doet (kreeg ${error?.code}: ${error?.message})`,
      ).toBe('42501');

      const na = await adminDb().from('groups').select('tz').eq('id', groupId).single();
      expect(na.data?.tz, 'de groepsklok is alsnog verzet').toBe(EIGEN_ZONE);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: naam en huddledag blijven gewoon te wijzigen',
    async () => {
      // ⚠️ Dit is wat het groepsinstellingenscherm werkelijk schrijft — zie
      //    `src/modules/buddies/wijzigen.test.ts`, die vastlegt dat de helper
      //    alleen `huddle_day` en `name` meestuurt. Zou de `revoke` van 0202 te
      //    breed zijn geweest, dan breekt hier het scherm en niet de aanval.
      const { error } = await beheerder.db
        .from('groups')
        .update({ name: 'Klokgroep hernoemd', huddle_day: 3 })
        .eq('id', groupId);

      expect(error, `het instellingenscherm hoort te blijven werken: ${error?.message}`).toBeNull();

      const na = await adminDb()
        .from('groups')
        .select('name, huddle_day, tz')
        .eq('id', groupId)
        .single();
      expect(na.data?.name).toBe('Klokgroep hernoemd');
      expect(na.data?.huddle_day).toBe(3);
      expect(na.data?.tz, 'de klok is meegeschoven met een ándere wijziging').toBe(EIGEN_ZONE);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: aanmaken zet de klok nog wél, en de groep rekent ermee',
    async () => {
      // ⚠️ De grens loopt tussen aanmaken en wijzigen, niet tussen mag en mag
      //    niet. `create_group()` krijgt de zone van het apparaat mee
      //    (`api.ts` → `apparaatTijdzone()`); zou de INSERT-kant meegesneuveld
      //    zijn, dan staat elke nieuwe groep op de standaardzone en merkt niemand
      //    het tot de eerste weekafsluiting.
      const verweg = await beheerder.db.rpc('create_group', {
        group_name: 'Klokgroep ver weg',
        huddle_day: 1,
        tz: ANDERE_ZONE,
      });
      const gd = verweg.data as unknown as { ok?: boolean; group?: { id: string } };
      if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(verweg.data)}`);

      const gezet = await adminDb().from('groups').select('tz').eq('id', gd.group.id).single();
      expect(gezet.data?.tz, 'aanmaken zet de zone niet meer').toBe(ANDERE_ZONE);

      // En de groepsklok rekent er ook echt mee: `groepsdatum()` is wat
      // `currentGroupPeriod()` in de database gebruikt.
      const datum = await beheerder.db.rpc('groepsdatum', { gid: gd.group.id });
      if (datum.error) throw new Error(`groepsdatum: ${datum.error.message}`);
      expect(datum.data, 'groepsdatum() leest de zone van de groep niet').not.toBeNull();
    },
    TEST_TIMEOUT,
  );
});
