import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De vier leespolicies van domeinregel 7 — QS8-262, ronde 2.
 *
 * ⚠️ **`npm run rls:dekking` mat dat deze vier `using`-helften door geen enkele
 *    test bewaakt worden.** Er is wél dekking op de tabellen: `epic8`,
 *    `goedkeuringsdrempel`, `besluiten` en `seizoensrecap` lezen er allemaal uit.
 *    Maar geen van die tests valt om als je de policy op `using (true)` zet — ze
 *    toetsen dát er iets terugkomt, niet dat de policy is wat een búitenstaander
 *    tegenhoudt.
 *
 *    Dit is de categorie waar dit project het duurst op is gecorrigeerd (0077,
 *    0078, 0089). Elk van deze vier bepaalt wat een groepsgenoot te zien krijgt,
 *    en niets merkte het als het antwoord "alles" werd.
 *
 * ⚠️⚠️ **De tegentest hoort erbij, en zonder die helft bewijst dit bestand
 *    niets.** Een buitenstaander die de rij van een ander niet ziet, kan dat ook
 *    zijn omdat de rij er niet is, omdat zijn filter niet matcht, of omdat een
 *    fixture stilletjes mislukte. Elk geval hieronder stelt daarom éérst vast
 *    dat de rij zichtbaar ís voor wie hem hoort te zien, en pas daarna dat hij
 *    onzichtbaar is voor wie hem niet hoort te zien.
 *
 * ⚠️ **Per helft, niet per policy.** Drie van de vier policies zijn een `or`
 *    van twee clausules: *"ik ben de eigenaar"* óf *"ik deel een groep met dit
 *    doel"*. Die zijn afzonderlijk te breken, dus ze horen afzonderlijk geijkt.
 *    Het doel `soloGoalId` hangt met opzet aan géén enkele groep: daar kán de
 *    groepshelft niets doen, dus wat de eigenaar daar ziet, ziet hij via de
 *    eigenaarshelft.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van beide doelen, lid van de groep. */
  eigenaar: TestUser;
  /** Lid van dezelfde groep — hoort mee te kijken waar de groepshelft geldt. */
  groepsgenoot: TestUser;
  /** Zit in een ándere groep en deelt niets. Ziet niets. */
  buitenstaander: TestUser;
  groupId: string;
  /** Gekoppeld aan de groep: hier werkt de groepshelft. */
  groepsGoalId: string;
  /** Aan géén groep gekoppeld: hier kán alleen de eigenaarshelft werken. */
  soloGoalId: string;
  groepsCompletionId: string;
  /**
   * Een voltooiing op het níet-gekoppelde doel.
   *
   * ⚠️ **Deze bestaat puur om de eigenaarshelft te kunnen breken.** Met alleen
   *    de voltooiing op het gekoppelde doel bleef `completion_approval_rules_select`
   *    groen als je `g.owner_id = auth.uid()` weghaalde: de eigenaar is óók lid
   *    van die groep, dus de groepshelft dekte hem. Gemeten, en daarom staat
   *    deze rij er — anders bewaakte dit bestand vijf van de zes helften en
   *    beweerde het er zes.
   */
  soloCompletionId: string;
  seizoenStart: IsoDate;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de leesgrenzen van domeinregel 7', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('lees-eigenaar');
    const groepsgenoot = await createTestUser('lees-genoot');
    const buitenstaander = await createTestUser('lees-buiten');

    const admin = adminDb();
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Leesgrenzen' });
    const gd = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await groepsgenoot.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    const meeUit = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (meeUit.ok !== true) throw new Error(`genoot: ${meeUit.reason ?? '?'}`);

    // De buitenstaander krijgt een eigen groep, zodat hij een gewone gebruiker is
    // en niet iemand zonder enige groep — dat laatste zou een tweede verschil
    // introduceren waar de test niets over zegt.
    const eigen = await buitenstaander.db.rpc('create_group', { group_name: 'Leesgrenzen-buiten' });
    const ed = eigen.data as unknown as { ok?: boolean };
    if (ed.ok !== true) throw new Error(`buitengroep: ${JSON.stringify(eigen.data)}`);

    const maakDoel = async (titel: string): Promise<string> => {
      const d = await eigenaar.db
        .from('goals')
        .insert({ owner_id: eigenaar.id, title: titel, target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return d.data.id;
    };

    const groepsGoalId = await maakDoel('LEES-GROEP');
    const soloGoalId = await maakDoel('LEES-SOLO');

    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: groepsGoalId, group_id: gd.group.id });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    // --- een voltooiing op het gekoppelde doel, voor completion_approval_rules
    const week = await admin
      .from('weekly_goals')
      .insert({
        goal_id: groepsGoalId,
        title: 'LEESWEEK',
        points_ceiling: 2,
        points_floor: 1,
        points_miss: -1,
        cycle_start_date: vandaag,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

    const voltooiing = await eigenaar.db
      .from('completions')
      .insert({
        weekly_goal_id: week.data.id,
        user_id: eigenaar.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: vandaag,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing: ${voltooiing.error?.message}`);
    }

    // Dezelfde keten op het níet-gekoppelde doel, zie `soloCompletionId`.
    const soloWeek = await admin
      .from('weekly_goals')
      .insert({
        goal_id: soloGoalId,
        title: 'LEESWEEK-SOLO',
        points_ceiling: 2,
        points_floor: 1,
        points_miss: -1,
        cycle_start_date: vandaag,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (soloWeek.error || soloWeek.data === null) {
      throw new Error(`weekdoel solo: ${soloWeek.error?.message}`);
    }

    const soloVoltooiing = await eigenaar.db
      .from('completions')
      .insert({
        weekly_goal_id: soloWeek.data.id,
        user_id: eigenaar.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: vandaag,
      })
      .select('id')
      .single();
    if (soloVoltooiing.error || soloVoltooiing.data === null) {
      throw new Error(`voltooiing solo: ${soloVoltooiing.error?.message}`);
    }

    // ⚠️ `group_id` is NOT NULL op deze tabel, dus de rij noemt een groep ook
    //    waar het doel er niet aan hangt. Dat is precies wat hem bruikbaar
    //    maakt: `shares_group_with_goal()` kijkt naar de kóppelingen van het
    //    doel, en die zijn er niet — dus alleen de eigenaarshelft kan hem tonen.
    const soloRegel = await admin.from('completion_approval_rules').insert({
      completion_id: soloVoltooiing.data.id,
      group_id: gd.group.id,
      approvals_required: 1,
    });
    if (soloRegel.error) throw new Error(`drempel solo: ${soloRegel.error.message}`);

    // --- de vier rijen, alle vier via `adminDb()` ---------------------------
    // ⚠️ De schrijfroute doet hier niet ter zake: dit bestand toetst wie ze
    //    mag lézen. Ze via de echte RPC's maken zou de opstelling laten
    //    afhangen van vier andere autorisatiepaden.
    const adempauzes = await admin.from('breathers').insert([
      {
        user_id: eigenaar.id,
        goal_id: groepsGoalId,
        starts_cycle: vandaag,
        ends_cycle: addDays(vandaag, 7),
      },
      {
        user_id: eigenaar.id,
        goal_id: soloGoalId,
        starts_cycle: vandaag,
        ends_cycle: addDays(vandaag, 7),
      },
    ]);
    if (adempauzes.error) throw new Error(`adempauzes: ${adempauzes.error.message}`);

    const gebeurtenissen = await admin.from('goal_events').insert([
      { goal_id: groepsGoalId, actor_id: eigenaar.id, event_type: 'deadline_moved' },
      { goal_id: soloGoalId, actor_id: eigenaar.id, event_type: 'deadline_moved' },
    ]);
    if (gebeurtenissen.error) throw new Error(`goal_events: ${gebeurtenissen.error.message}`);

    const seizoenStart = addDays(vandaag, -90);
    const recap = await admin.from('season_recaps').insert({
      group_id: gd.group.id,
      season_start: seizoenStart,
      season_end: addDays(vandaag, -1),
      weken: 12,
      mijlpalen: 3,
      schakels: 8,
    });
    if (recap.error) throw new Error(`seizoensrecap: ${recap.error.message}`);

    w = {
      eigenaar,
      groepsgenoot,
      buitenstaander,
      groupId: gd.group.id,
      groepsGoalId,
      soloGoalId,
      groepsCompletionId: voltooiing.data.id,
      soloCompletionId: soloVoltooiing.data.id,
      seizoenStart,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Hoeveel rijen ziet deze gebruiker, gefilterd op de kolom die de rij aanwijst? */
  async function telZichtbaar(
    wie: TestUser,
    tabel: 'breathers' | 'goal_events' | 'season_recaps' | 'completion_approval_rules',
    kolom: string,
    waarde: string,
  ): Promise<number> {
    const { data, error } = await wie.db.from(tabel).select('*').eq(kolom, waarde);
    if (error) throw new Error(`${tabel} lezen: ${error.message}`);
    return (data ?? []).length;
  }

  describe('breathers — een adempauze is van jou, en van wie je groep met je deelt', () => {
    it(
      'de eigenaar ziet zijn adempauze op een doel zonder enige groep',
      async () => {
        expect(
          await telZichtbaar(w.eigenaar, 'breathers', 'goal_id', w.soloGoalId),
          'dit doel hangt aan geen groep, dus dit kan alleen de eigenaarshelft zijn',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de adempauze op het gekoppelde doel',
      async () => {
        expect(await telZichtbaar(w.groepsgenoot, 'breathers', 'goal_id', w.groepsGoalId)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een buitenstaander ziet geen van beide',
      async () => {
        expect(
          await telZichtbaar(w.buitenstaander, 'breathers', 'goal_id', w.groepsGoalId),
          'hij deelt deze groep niet',
        ).toBe(0);
        expect(
          await telZichtbaar(w.buitenstaander, 'breathers', 'goal_id', w.soloGoalId),
          'en dit doel deelt hij al helemaal niet',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de adempauze op een niet-gekoppeld doel níet',
      async () => {
        expect(
          await telZichtbaar(w.groepsgenoot, 'breathers', 'goal_id', w.soloGoalId),
          'lid zijn van een groep geeft geen zicht op doelen die er niet aan hangen',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('goal_events — het spoor van een doel volgt hetzelfde spoor', () => {
    it(
      'de eigenaar ziet de gebeurtenis op zijn niet-gekoppelde doel',
      async () => {
        expect(await telZichtbaar(w.eigenaar, 'goal_events', 'goal_id', w.soloGoalId)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de gebeurtenis op het gekoppelde doel',
      async () => {
        expect(await telZichtbaar(w.groepsgenoot, 'goal_events', 'goal_id', w.groepsGoalId)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een buitenstaander ziet geen van beide',
      async () => {
        expect(await telZichtbaar(w.buitenstaander, 'goal_events', 'goal_id', w.groepsGoalId)).toBe(
          0,
        );
        expect(await telZichtbaar(w.buitenstaander, 'goal_events', 'goal_id', w.soloGoalId)).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('completion_approval_rules — de drempel hoort bij de voltooiing', () => {
    it(
      'de eigenaar ziet de drempel van zijn eigen voltooiing',
      async () => {
        expect(
          await telZichtbaar(
            w.eigenaar,
            'completion_approval_rules',
            'completion_id',
            w.groepsCompletionId,
          ),
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet hem ook — hij mag straks beoordelen',
      async () => {
        expect(
          await telZichtbaar(
            w.groepsgenoot,
            'completion_approval_rules',
            'completion_id',
            w.groepsCompletionId,
          ),
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar ziet de drempel op een doel zonder groep — dat kan alleen de eigenaarshelft zijn',
      async () => {
        expect(
          await telZichtbaar(
            w.eigenaar,
            'completion_approval_rules',
            'completion_id',
            w.soloCompletionId,
          ),
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een buitenstaander ziet hem niet',
      async () => {
        expect(
          await telZichtbaar(
            w.buitenstaander,
            'completion_approval_rules',
            'completion_id',
            w.groepsCompletionId,
          ),
        ).toBe(0);
        expect(
          await telZichtbaar(
            w.buitenstaander,
            'completion_approval_rules',
            'completion_id',
            w.soloCompletionId,
          ),
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de drempel op een niet-gekoppeld doel níet',
      async () => {
        expect(
          await telZichtbaar(
            w.groepsgenoot,
            'completion_approval_rules',
            'completion_id',
            w.soloCompletionId,
          ),
          'de rij noemt wel zijn groep, maar het doel hangt er niet aan',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('season_recaps — een seizoensrecap is van de groep', () => {
    it(
      'een lid ziet de recap van zijn groep',
      async () => {
        expect(await telZichtbaar(w.groepsgenoot, 'season_recaps', 'group_id', w.groupId)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een buitenstaander ziet hem niet',
      async () => {
        expect(await telZichtbaar(w.buitenstaander, 'season_recaps', 'group_id', w.groupId)).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });
});
