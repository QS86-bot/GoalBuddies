/**
 * Besluit A51 (migratie 0094) — één reviewpunt per beoordelaar per buddy per
 * cyclus.
 *
 * ⚠️ **Drie beloftes, en twee ervan zijn naden.**
 *
 *   1. Volume telt niet meer: twee weekdoelen van dezelfde buddy in dezelfde
 *      week leveren samen één punt op, een andere buddy of een andere week wél
 *      een tweede.
 *   2. **De goedkeuring zelf blijft ongemoeid.** `award_points_on_approval()`
 *      doet twee dingen in één trigger, en beide helften hangen aan dezelfde
 *      `w.status = 'pending'`. Een wijziging in de bovenste helft die één regel
 *      te ver reikt, laat een beoordelaar de week van zijn buddy niet meer
 *      goedkeuren — erger dan het probleem dat we oplossen.
 *   3. **De dedupe van de ándere redenen werkt nog.** 0094 versmalt
 *      `points_ledger_dedupe_idx` zodat `review_given` eruit valt. Dat is een
 *      wijziging aan een index waar vijf andere redenen op leunen, en niets in
 *      deze suite zou daar vanzelf rood van worden.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

describe.skipIf(!rlsTestsConfigured)('A51 — één reviewpunt per buddy per cyclus', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let groupId: string;
  let aliceGoal: string;
  let carolGoal: string;
  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
  const vorigeWeek = addDays(cycle.startDate, -7);

  async function maakDoel(eigenaar: TestUser, titel: string): Promise<string> {
    const doel = await eigenaar.db
      .from('goals')
      .insert({ owner_id: eigenaar.id, title: titel, target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppeling = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId });
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

    return doel.data.id;
  }

  /** Een weekdoel met een ingediende voltooiing — dus `pending`. */
  async function ingediend(
    eigenaar: TestUser,
    goalId: string,
    start: string,
    index: number,
  ): Promise<string> {
    const weekly = await eigenaar.db
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: `Week ${index}`,
        cycle_start_date: start,
        cycle_index: index,
      })
      .select('id')
      .single();
    if (weekly.error || weekly.data === null) throw new Error(`weekdoel: ${weekly.error?.message}`);

    const voltooiing = await eigenaar.db
      .from('completions')
      .insert({
        weekly_goal_id: weekly.data.id,
        user_id: eigenaar.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: start,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing: ${voltooiing.error?.message}`);
    }
    return voltooiing.data.id;
  }

  async function keurGoed(
    beoordelaar: TestUser,
    completionId: string,
    status = 'approved',
  ): Promise<{ code?: string } | null> {
    const { error } = await beoordelaar.db.from('completion_approvals').insert({
      completion_id: completionId,
      approver_id: beoordelaar.id,
      subject_id: beoordelaar.id,
      group_id: groupId,
      status,
    });
    return error;
  }

  async function reviewpunten(gebruiker: TestUser): Promise<number> {
    const { count, error } = await adminDb()
      .from('points_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', gebruiker.id)
      .eq('reason', 'review_given');
    if (error) throw new Error(`tellen: ${error.message}`);
    return count ?? 0;
  }

  beforeAll(async () => {
    alice = await createTestUser('a51-alice');
    bob = await createTestUser('a51-bob');
    carol = await createTestUser('a51-carol');

    const groep = await alice.db.rpc('create_group', { group_name: 'A51-groep' });
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = g.group.id;

    for (const wie of [bob, carol]) {
      const mee = await wie.db.rpc('join_group_with_code', { code: g.group.invite_code });
      if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
        throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
      }
    }

    aliceGoal = await maakDoel(alice, 'Doel van alice');
    carolGoal = await maakDoel(carol, 'Doel van carol');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb()
      .from('points_ledger')
      .delete()
      .in('user_id', [alice.id, bob.id, carol.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'twee weken van dezelfde buddy in dezelfde cyclus leveren één punt op',
    async () => {
      // ⚠️ **De hele reden dat A51 bestaat.** Vóór 0094 verdiende bob hier twee
      //    punten, en hing zijn buddy-score dus af van hoeveel weekdoelen alice
      //    toevallig aanmaakt in plaats van van hoe vaak hij opdaagt.
      const voor = await reviewpunten(bob);

      expect(await keurGoed(bob, await ingediend(alice, aliceGoal, cycle.startDate, 1))).toBeNull();
      expect(await keurGoed(bob, await ingediend(alice, aliceGoal, cycle.startDate, 2))).toBeNull();

      expect(await reviewpunten(bob)).toBe(voor + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'een andere buddy in dezelfde cyclus levert wél een tweede punt op',
    async () => {
      const voor = await reviewpunten(bob);

      expect(await keurGoed(bob, await ingediend(carol, carolGoal, cycle.startDate, 3))).toBeNull();

      expect(await reviewpunten(bob)).toBe(voor + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'dezelfde buddy in een andere cyclus levert ook een tweede punt op',
    async () => {
      // ⚠️ Zonder de cyclus in de dedupe-sleutel zou dit stil wegvallen op
      //    `on conflict do nothing`: één punt per buddy vóór altijd in plaats van
      //    per cyclus. Precies de fout die de versmalde `points_ledger_dedupe_idx`
      //    zou hebben gemaakt als hij was blijven staan zoals hij was.
      const voor = await reviewpunten(bob);

      expect(await keurGoed(bob, await ingediend(alice, aliceGoal, vorigeWeek, 4))).toBeNull();

      expect(await reviewpunten(bob)).toBe(voor + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'de boeking draagt de buddy en de cyclus, en geen doel',
    async () => {
      // `review_given` is de enige reden zonder `goal_id`, en dat is nu geen
      // symptoom meer maar de vorm: de boeking gaat over een persoon en een week.
      const { data } = await adminDb()
        .from('points_ledger')
        .select('goal_id, ref_type, ref_id, cycle_start_date')
        .eq('user_id', bob.id)
        .eq('reason', 'review_given')
        .eq('cycle_start_date', vorigeWeek)
        .single();

      expect(data?.goal_id).toBeNull();
      expect(data?.ref_type).toBe('buddy_cycle');
      expect(data?.ref_id).toBe(alice.id);
      expect(data?.cycle_start_date).toBe(vorigeWeek);
    },
    TEST_TIMEOUT,
  );

  it(
    '"vertel me meer" claimt het punt, en de goedkeuring erna telt niet dubbel',
    async () => {
      // ⚠️ Bedoeld gevolg van A51 en niet een randgeval: een echte vraag stellen
      //    ís de aandacht die dit punt beloont. Het haalt bovendien de prikkel weg
      //    om snel af te stempelen om het punt te halen.
      const derde = await createTestUser('a51-dave');
      const { data: g } = await adminDb()
        .from('groups')
        .select('invite_code')
        .eq('id', groupId)
        .single();
      if (!g?.invite_code) throw new Error('opbouw: geen uitnodigingscode');

      const mee = await derde.db.rpc('join_group_with_code', { code: g.invite_code });
      if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
        throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
      }

      const voltooiing = await ingediend(alice, aliceGoal, addDays(cycle.startDate, -14), 5);

      expect(await keurGoed(derde, voltooiing, 'more_info')).toBeNull();
      expect(await reviewpunten(derde)).toBe(1);

      const opnieuw = await ingediend(alice, aliceGoal, addDays(cycle.startDate, -14), 6);
      expect(await keurGoed(derde, opnieuw)).toBeNull();
      expect(await reviewpunten(derde)).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'de goedkeuring zelf gaat gewoon door — ook als het punt al geclaimd is',
    async () => {
      // ⚠️ **De naad die 0093 al bewaakte en die hier opnieuw gebroken kan worden.**
      //    Beide helften van de trigger hangen aan `w.status = 'pending'`. Het
      //    tweede weekdoel van alice in deze cyclus levert bob geen punt meer op,
      //    maar moet wél gewoon goedgekeurd worden, met de punten voor alice.
      const admin = adminDb();
      const voltooiing = await ingediend(alice, aliceGoal, cycle.startDate, 7);
      const { data: rij } = await admin
        .from('completions')
        .select('weekly_goal_id')
        .eq('id', voltooiing)
        .single();

      const puntenVoor = await admin
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', alice.id);
      const reviewVoor = await reviewpunten(bob);

      expect(await keurGoed(bob, voltooiing)).toBeNull();

      const { data: na } = await admin
        .from('weekly_goals')
        .select('status')
        .eq('id', rij?.weekly_goal_id ?? '')
        .single();
      expect(na?.status).toBe('approved');

      const puntenNa = await admin
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', alice.id);
      expect(puntenNa.count).toBe((puntenVoor.count ?? 0) + 1);

      // en bob kreeg er níéts bij, want deze cyclus was al geclaimd
      expect(await reviewpunten(bob)).toBe(reviewVoor);
    },
    TEST_TIMEOUT,
  );

  it(
    'de dedupe van de andere redenen werkt nog',
    async () => {
      // ⚠️ **De naad die 0094 zélf introduceert.** `points_ledger_dedupe_idx` is
      //    versmald zodat `review_given` eruit valt; vijf andere redenen leunen op
      //    diezelfde index. Een fout in die `where` zou hun dedupe stil uitzetten
      //    en niets zou daar vanzelf rood van worden — een dubbele boeking is geen
      //    fout maar een verkeerd totaal.
      const admin = adminDb();
      const rij = {
        user_id: alice.id,
        goal_id: aliceGoal,
        group_id: groupId,
        delta: 2,
        reason: 'completion_approved_ceiling',
        ref_type: 'weekly_goal',
        ref_id: crypto.randomUUID(),
      };

      const eerste = await admin.from('points_ledger').insert(rij);
      expect(eerste.error).toBeNull();

      const tweede = await admin.from('points_ledger').insert(rij);
      expect(tweede.error?.code).toBe('23505');
    },
    TEST_TIMEOUT,
  );

  it(
    'een reviewboeking zonder buddy of zonder cyclus kan niet bestaan',
    async () => {
      // ⚠️ Zonder deze CHECK is de unieke index decoratief: NULL is in een unieke
      //    index niet gelijk aan NULL, dus zulke rijen zouden onbeperkt
      //    dupliceren. De index en de CHECK zijn samen het slot, niet apart.
      const admin = adminDb();

      const zonderBuddy = await admin.from('points_ledger').insert({
        user_id: bob.id,
        group_id: groupId,
        delta: 1,
        reason: 'review_given',
        ref_type: 'buddy_cycle',
        cycle_start_date: cycle.startDate,
      });
      expect(zonderBuddy.error?.code).toBe('23514');

      const zonderCyclus = await admin.from('points_ledger').insert({
        user_id: bob.id,
        group_id: groupId,
        delta: 1,
        reason: 'review_given',
        ref_type: 'buddy_cycle',
        ref_id: alice.id,
      });
      expect(zonderCyclus.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );
});
