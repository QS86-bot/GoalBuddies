/**
 * De klokgrens — wat er in de nacht met een periodestart gebeurt.
 *
 * ⚠️ **De belofte is niet "de grens staat op `current_date + 1`" maar "een
 *    periodestart die in de tijdzone van de groep vandaag is, wordt
 *    geaccepteerd".** `current_date` is de serverdatum in UTC; `groupPeriod()`
 *    rekent in de tijdzone van de groep. In Europe/Amsterdam is een geldige
 *    periodestart tussen 00:00 en 02:00 lokale tijd één dag "in de toekomst",
 *    in Pacific/Auckland twaalf uur lang. Vóór 0037 weigerde de ketting die
 *    aanroepen — het middernachtprobleem uit domeinregel 2, in een grenscontrole
 *    in plaats van in een berekening, en dus precies waar niemand het zoekt.
 *
 * ⚠️ **0037 repareerde het en niets bewaakte het.** Deze suite is die bewaking:
 *    morgen mag, overmorgen niet. Wie de `+ 1` ooit weghaalt omdat hij er
 *    overbodig uitziet, krijgt hier drie rode tests in plaats van een klacht van
 *    een gebruiker in Auckland.
 *
 * ⚠️ De statische helft staat in `scripts/klokgrens-controle.mjs`: elk voorkomen
 *    van `current_date` in het schema met de reden waarom het daar mag staan.
 *    Deze suite toetst de drie grenzen die je van buitenaf kunt bereiken; het
 *    register vangt de dertiende die er ooit bij komt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const UTC = 'UTC' as TimeZone;

/**
 * De serverdatum, aan deze kant van de lijn — `current_date` is niets anders.
 *
 * ⚠️ Bewust in elke test opnieuw en niet één keer in `beforeAll`. Deze suite is
 *    de enige die op één dag scherp staat, en dus de enige die om middernacht
 *    UTC naast kan zitten. Door hem vlak voor de aanroep te lezen is het
 *    tijdvenster waarin dat kan een fractie van een seconde in plaats van de
 *    looptijd van de hele suite.
 */
function serverdatum(): IsoDate {
  return localDateIn(UTC, now());
}

interface Fixture {
  alice: TestUser;
  /** Lid zonder weekafsluiting — zijn schakels worden hier met de hand gezet. */
  bob: TestUser;
  groupId: string;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('De klokgrens rond middernacht UTC', () => {
  let f: Fixture;

  beforeAll(async () => {
    const alice = await createTestUser('klokgrens-alice');
    const bob = await createTestUser('klokgrens-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Klokgrens-test' });
    if (groep.error) throw new Error(`groep aanmaken (HTTP): ${groep.error.message}`);
    const groepData = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    f = { alice, bob, groupId: groepData.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * `ketting_schakel()` — de grens uit de bevinding zelf.
   *
   * ⚠️ Alice heeft hier geen goedgekeurd weekdoel, en dat is met opzet. De
   *    functie toetst op volgorde: lid, dán het venster, dán de cyclus, dán het
   *    weekdoel. Wie `period_out_of_range` níét terugkrijgt, is langs het venster
   *    gekomen — welke reden er daarna ook uitrolt. Zo hoeft deze test niet elke
   *    ándere voorwaarde na te bouwen om over déze grens iets te bewijzen.
   */
  describe('ketting_schakel', () => {
    it(
      'laat een periodestart van morgen door — die is in Auckland vandaag',
      async () => {
        const morgen = addDays(serverdatum(), 1);

        const { data, error } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: morgen,
          p_cycle_start: morgen,
        });

        expect(error).toBeNull();
        expect(uitkomst(data).reason).not.toBe('period_out_of_range');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert overmorgen — geen enkele zone loopt twee dagen voor',
      async () => {
        const overmorgen = addDays(serverdatum(), 2);

        const { data } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: overmorgen,
          p_cycle_start: overmorgen,
        });

        expect(uitkomst(data).reason).toBe('period_out_of_range');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * `bewaak_week_review_periode()` — dezelfde grens, maar als trigger, en die
   * wéigert de rij in plaats van een reden terug te geven.
   */
  describe('de weekafsluiting', () => {
    it(
      'accepteert een weekafsluiting voor de periode van morgen',
      async () => {
        const morgen = addDays(serverdatum(), 1);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: morgen,
          did_text: 'afgesloten op een dag die in UTC nog moet beginnen',
        });

        expect(error).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert er een voor overmorgen',
      async () => {
        const overmorgen = addDays(serverdatum(), 2);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: overmorgen,
          did_text: 'te ver vooruit',
        });

        // 22007 — `invalid_datetime_format`, de code die 0037 meegeeft.
        expect(error?.code).toBe('22007');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * `group_overview()` — dezelfde grens, en hier bepaalt hij wat de groep ziet.
   *
   * ⚠️ Bob krijgt twee schakels met de hand, één op morgen en één op overmorgen.
   *    Dat is wat deze test onderscheidend maakt: de schakel bestáát in beide
   *    gevallen, dus `closed_this_period` kan alleen op de vensterregel afketsen.
   *    Zonder die tweede schakel zou de test net zo groen zijn met een grens op
   *    `current_date`, en dan bewaakte hij niets.
   */
  describe('het groepsoverzicht', () => {
    beforeAll(async () => {
      const vandaag = serverdatum();
      const { error } = await adminDb()
        .from('chain_links')
        .insert([
          { group_id: f.groupId, user_id: f.bob.id, group_period_start: addDays(vandaag, 1) },
          { group_id: f.groupId, user_id: f.bob.id, group_period_start: addDays(vandaag, 2) },
        ]);
      if (error) throw new Error(`schakels zetten: ${error.message}`);
    }, SETUP_TIMEOUT);

    async function geslotenVoor(periode: IsoDate): Promise<boolean | undefined> {
      const { data, error } = await f.alice.db.rpc('group_overview', {
        p_group_id: f.groupId,
        p_period_start: periode,
      });
      if (error) throw new Error(`group_overview: ${error.message}`);

      const rijen = (data ?? []) as { user_id: string; closed_this_period: boolean }[];
      return rijen.find((r) => r.user_id === f.bob.id)?.closed_this_period;
    }

    it(
      'toont de schakel van morgen als afgesloten',
      async () => {
        expect(await geslotenVoor(addDays(serverdatum(), 1))).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont die van overmorgen niet, ook al staat hij in de tabel',
      async () => {
        expect(await geslotenVoor(addDays(serverdatum(), 2))).toBe(false);
      },
      TEST_TIMEOUT,
    );
  });
});
