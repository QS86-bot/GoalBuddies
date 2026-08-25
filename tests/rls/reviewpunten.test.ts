/**
 * Migratie 0093 — de rem op `review_given`.
 *
 * ⚠️ **De belangrijkste test hier is niet dat de rem werkt, maar dat hij de
 *    goedkeuring niet raakt.** `award_points_on_approval()` doet twee dingen in
 *    één trigger: het punt voor de beoordelaar, en het goedkeuren van het
 *    weekdoel met de punten voor de eigenaar, de weekpassen en de reeks. Een rem
 *    die per ongeluk het tweede blokkeert, maakt peer-goedkeuring stuk voor wie
 *    veel beoordeelt — en dat is de kern van het product.
 *
 *    Beide helften zitten in dezelfde functie en delen dezelfde `if`-structuur.
 *    Dat is een naad, en dus staat er een test op die ze uit elkaar trekt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Zoals in 0093. Staat hier als spiegel, niet als bron — zie de laatste test. */
const REVIEWLIMIET = 50;

describe.skipIf(!rlsTestsConfigured)('0093 — de rem op reviewpunten', () => {
  let alice: TestUser;
  let bob: TestUser;
  let groupId: string;
  let goalId: string;
  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  /** Een weekdoel van alice met een ingediende voltooiing — dus `pending`. */
  async function ingediendWeekdoel(index: number): Promise<{ weekly: string; completion: string }> {
    const weekly = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: `Week ${index}`,
        cycle_start_date: cycle.startDate,
        cycle_index: index,
      })
      .select('id')
      .single();
    if (weekly.error || weekly.data === null) throw new Error(`weekdoel: ${weekly.error?.message}`);

    const completion = await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: weekly.data.id,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single();
    if (completion.error || completion.data === null) {
      throw new Error(`voltooiing: ${completion.error?.message}`);
    }

    return { weekly: weekly.data.id, completion: completion.data.id };
  }

  async function reviewpuntenVan(gebruiker: TestUser): Promise<number> {
    const { count, error } = await adminDb()
      .from('points_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', gebruiker.id)
      .eq('reason', 'review_given');
    if (error) throw new Error(`tellen: ${error.message}`);
    return count ?? 0;
  }

  beforeAll(async () => {
    alice = await createTestUser('review-alice');
    bob = await createTestUser('review-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Reviewgroep' });
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = g.group.id;

    const mee = await bob.db.rpc('join_group_with_code', { code: g.group.invite_code });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Reviewdoel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    goalId = doel.data.id;

    const koppeling = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: groupId });
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('points_ledger').delete().in('user_id', [alice.id, bob.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'onder de grens levert beoordelen gewoon een punt op',
    async () => {
      const { completion } = await ingediendWeekdoel(1);
      const voor = await reviewpuntenVan(bob);

      const { error } = await bob.db.from('completion_approvals').insert({
        completion_id: completion,
        approver_id: bob.id,
        subject_id: bob.id,
        group_id: groupId,
        status: 'approved',
      });

      expect(error).toBeNull();
      expect(await reviewpuntenVan(bob)).toBe(voor + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'boven de grens vervalt het punt — maar de goedkeuring gaat gewoon door',
    async () => {
      // ⚠️ **De naadtest.** Beide helften van `award_points_on_approval()` hangen
      //    aan dezelfde `w.status = 'pending'`, dus een rem die één regel te ver
      //    reikt zou hier de hele goedkeuring blokkeren. Deze test bewijst dat de
      //    goedkeuring, de punten van de eigenaar en de status van het weekdoel
      //    ongemoeid blijven terwijl het punt van de beoordelaar wegvalt.
      const admin = adminDb();
      const staat = await reviewpuntenVan(bob);
      const vulling = Array.from({ length: REVIEWLIMIET - staat }, () => ({
        user_id: bob.id,
        group_id: groupId,
        delta: 1,
        reason: 'review_given',
        ref_type: 'completion',
        ref_id: crypto.randomUUID(),
      }));
      const gevuld = await admin.from('points_ledger').insert(vulling);
      if (gevuld.error) throw new Error(`opvullen: ${gevuld.error.message}`);

      expect(await bob.db.rpc('reviewpunten_over', { p_user_id: bob.id }).then((r) => r.data))
        .toBe(0);

      const { weekly, completion } = await ingediendWeekdoel(2);
      const puntenVoor = await admin
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', alice.id);

      const { error } = await bob.db.from('completion_approvals').insert({
        completion_id: completion,
        approver_id: bob.id,
        subject_id: bob.id,
        group_id: groupId,
        status: 'approved',
      });

      // De goedkeuring zelf: geen fout, weekdoel op `approved`, punt voor alice.
      expect(error).toBeNull();

      const { data: na } = await admin
        .from('weekly_goals')
        .select('status')
        .eq('id', weekly)
        .single();
      expect(na?.status).toBe('approved');

      const puntenNa = await admin
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', alice.id);
      expect(puntenNa.count).toBe((puntenVoor.count ?? 0) + 1);

      // En het punt van de beoordelaar is er niet bij gekomen.
      expect(await reviewpuntenVan(bob)).toBe(REVIEWLIMIET);
    },
    TEST_TIMEOUT,
  );

  it(
    'de grens in de database is dezelfde die deze test aanneemt',
    async () => {
      // ⚠️ Zelfde naad als in `rem.test.ts` en `doorschuiven.test.ts`: de
      //    constante hierboven is een kopie, en een kopie loopt uit de pas.
      const vers = await createTestUser('review-vers');
      const { data, error } = await vers.db.rpc('reviewpunten_over', { p_user_id: vers.id });

      expect(error).toBeNull();
      expect(data).toBe(REVIEWLIMIET);
    },
    TEST_TIMEOUT,
  );
});
