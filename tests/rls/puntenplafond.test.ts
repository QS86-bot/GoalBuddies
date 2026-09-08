/**
 * Het model bepaalt de punten, niet de client — QS8-352.
 *
 * ⚠️ **Domeinregel 10 is het puntenmodel:** plafond `+2`, vloer `+1`, gemist
 *    `−1`. Tot deze migratie stonden `points_ceiling` en `points_floor` in de
 *    INSERT-kolomgrant van `authenticated`, en `award_points_on_approval()`
 *    boekt wat er in de rij staat (`punten := w.points_ceiling`). Daarmee was
 *    het plafond een invoerveld.
 *
 * 📏 Gemeten vóór de reparatie, met echte JWT's en zonder enige truc — drie
 *    gewone verzoeken van twee gewone accounts:
 *
 *      weekdoel met points_ceiling=5   -> 201
 *      voltooiing (achieved_level=ceiling) -> 201
 *      goedkeuring door de buddy       -> 201
 *      points_ledger: delta=5, reason=completion_approved_ceiling
 *
 * ⚠️⚠️ **De belofte is de geboekte delta en niet de kolomwaarde**, en dat is het
 *    verschil tussen deze test en een die alleen kijkt of de kolom op 2 staat.
 *    Regel 18 vraag 2: "de kolom staat goed" is een eigenschap van het
 *    onderdeel; "het model bepaalt wat er geboekt wordt" is de belofte. Een
 *    latere wijziging die de kolom netjes laat en tóch iets anders boekt, moet
 *    hier rood worden.
 *
 * ⚠️ De must-allows staan er even hard in. De kolommen dragen defaults die het
 *    model zíjn (2 en 1), dus een gewone aanmaak hoort gewoon te werken en die
 *    waarden te krijgen — en de definer-RPC's die weekdoelen maken, mogen niet
 *    geraakt worden door een grant die alleen over `authenticated` gaat.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  id: string;
  code: string;
}

let anna: TestUser;
let bram: TestUser;
let groep: Groep;
let doelId: string;

const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

describe.runIf(rlsTestsConfigured)('het model bepaalt de punten, niet de client', () => {
  beforeAll(async () => {
    anna = await createTestUser('plafond-anna');
    bram = await createTestUser('plafond-bram');

    const g = await anna.db.rpc('create_group', { group_name: 'Plafondproef' });
    if (g.error) throw new Error(`groep: ${g.error.message}`);
    const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);
    groep = { id: uit.group.id, code: uit.group.invite_code };

    const mee = await bram.db.rpc('join_group_with_code', { code: groep.code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    const doel = await anna.db
      .from('goals')
      .insert({ owner_id: anna.id, title: 'Plafond', target_date: cyclus.endDate })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);
    doelId = doel.data.id;

    const link = await anna.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: groep.id });
    if (link.error) throw new Error(`koppeling: ${link.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de belofte: een client kiest zijn eigen plafond niet', () => {
    it(
      'weigert een weekdoel waarin de client points_ceiling meestuurt',
      async () => {
        const { error } = await anna.db.from('weekly_goals').insert({
          goal_id: doelId,
          title: 'eigen plafond',
          cycle_start_date: addDays(cyclus.startDate, -7),
          points_ceiling: 5,
        });

        expect(error?.code, 'de client mocht zijn eigen plafond zetten').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De waarde is met opzet de default, en dat is een gerepareerde
     *    ijking.** Hier stond eerst `points_floor: 5`, en 📏 die gaf vóór de
     *    reparatie `23514` in plaats van "toegelaten": een vloer boven het
     *    plafond valt op `weekly_goals_points_bounded`. Dan meet deze test de
     *    CHECK en niet het recht — en na de reparatie was niet te zien wélk slot
     *    dichtzat. Met de defaultwaarde kan geen enkele CHECK bezwaar maken, dus
     *    het ontbrekende INSERT-recht is het enige dat hem nog kan weigeren.
     */
    it(
      'weigert een weekdoel waarin de client points_floor meestuurt',
      async () => {
        const { error } = await anna.db.from('weekly_goals').insert({
          goal_id: doelId,
          title: 'eigen vloer',
          cycle_start_date: addDays(cyclus.startDate, -14),
          points_floor: 1,
        });

        expect(error?.code, 'de client mocht zijn eigen vloer zetten').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De hele keten, en de gebóekte delta.** Dit is het geval uit de
     *    meting: aanmaken, afvinken, laten goedkeuren, en dan kijken wat er in
     *    `points_ledger` staat. Vóór de reparatie stond daar 5.
     */
    it(
      'boekt +2 voor een gehaald plafond, ongeacht wat de client wilde',
      async () => {
        const week = await anna.db
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'de keten',
            cycle_start_date: addDays(cyclus.startDate, -21),
          })
          .select('id, points_ceiling, points_floor')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);

        expect(week.data.points_ceiling, 'de default draagt domeinregel 10').toBe(2);
        expect(week.data.points_floor, 'de default draagt domeinregel 10').toBe(1);

        const vol = await anna.db
          .from('completions')
          .insert({
            weekly_goal_id: week.data.id,
            user_id: anna.id,
            achieved_level: 'ceiling',
            note: 'af',
            cycle_start_date: addDays(cyclus.startDate, -21),
          })
          .select('id')
          .single();
        if (vol.error) throw new Error(`voltooiing: ${vol.error.message}`);

        const keur = await bram.db.from('completion_approvals').insert({
          completion_id: vol.data.id,
          group_id: groep.id,
          approver_id: bram.id,
          subject_id: anna.id,
          status: 'approved',
        });
        if (keur.error) throw new Error(`goedkeuring: ${keur.error.message}`);

        // ⚠️ De boeking verwijst naar het **weekdoel** en niet naar de
        //    voltooiing (`ref_type='weekly_goal'`, `ref_id = w.id`) — nagelezen
        //    in `award_points_on_approval()`. Op de voltooiing zoeken gaf nul
        //    rijen en leek een ontbrekende boeking.
        const boeking = await adminDb()
          .from('points_ledger')
          .select('delta, reason')
          .eq('user_id', anna.id)
          .eq('ref_type', 'weekly_goal')
          .eq('ref_id', week.data.id);
        if (boeking.error) throw new Error(`boeking lezen: ${boeking.error.message}`);

        expect(boeking.data, 'er hoort precies één boeking te staan').toHaveLength(1);
        expect(boeking.data[0]?.delta, 'het plafond boekt +2 en niet wat de client koos').toBe(2);
        expect(boeking.data[0]?.reason).toBe('completion_approved_ceiling');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de must-allows', () => {
    it(
      'laat een gewoon weekdoel gewoon aanmaken, met het model uit de defaults',
      async () => {
        const week = await anna.db
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'gewoon',
            cycle_start_date: addDays(cyclus.startDate, -28),
          })
          .select('points_ceiling, points_floor, points_miss')
          .single();

        expect(week.error, 'een gewone aanmaak hoort te werken').toBeNull();
        expect(week.data?.points_ceiling).toBe(2);
        expect(week.data?.points_floor).toBe(1);
        expect(week.data?.points_miss).toBe(-1);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ `schuif_weekdoel_door()` is `SECURITY DEFINER` en maakt zelf een
     *    weekdoel aan. Een `revoke` op `authenticated` hoort hem dus niet te
     *    raken — maar dat is een aanname over hoe definer-functies met
     *    kolomgrants omgaan, en die hoort gemeten te worden en niet aangenomen.
     */
    it(
      'laat schuif_weekdoel_door() nog een opvolger maken',
      async () => {
        const week = await anna.db
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'door te schuiven',
            cycle_start_date: addDays(cyclus.startDate, -35),
          })
          .select('id')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);

        const gemist = await adminDb()
          .from('weekly_goals')
          .update({ status: 'missed' })
          .eq('id', week.data.id);
        if (gemist.error) throw new Error(`op missed zetten: ${gemist.error.message}`);

        const door = await anna.db.rpc('schuif_weekdoel_door', {
          p_weekly_goal_id: week.data.id,
          p_cycle_start_date: cyclus.startDate,
        });

        expect(door.error, 'de RPC hoort nog te werken').toBeNull();
        const uit = (door.data ?? {}) as { ok?: boolean; reason?: string };
        expect(uit.ok, `doorschuiven mislukte: ${uit.reason ?? '-'}`).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });
});
