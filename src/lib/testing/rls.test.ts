/**
 * QS8-98 — de RLS-policies, uitgevoerd in plaats van gelezen.
 *
 * Elke test hieronder praat via PostgREST met een echt JWT. Wat hier groen is,
 * is bewezen; wat hier niet staat, is niet bewezen. De policy-matrix in
 * `docs/decisions/001-datamodel.md` §4.2 is de belofte, dit bestand het bewijs.
 *
 * ⚠️ Bij elke weigering hoort een toelating. Een suite van alleen negatieve
 *    tests wordt groen zodra de database stukgaat, en dat is precies het moment
 *    waarop je hem nodig hebt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { now, userCycle } from '../../shared/time';
import {
  adminDb,
  createTestUser,
  inviteCode,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './rls-harness';

/** Een netwerkronde naar Supabase is traag; de opbouw doet er tientallen. */
const SETUP_TIMEOUT = 120_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  alice: TestUser;
  bob: TestUser;
  carol: TestUser;
  /** Groep met alice (oprichter) en bob. Het gedeelde doel hangt hieraan. */
  groupId: string;
  /** Tweede groep met dezelfde twee leden, maar zónder het gedeelde doel. */
  otherGroupId: string;
  /** Groep met een ingetrokken uitnodigingscode. */
  revokedCode: string;
  /** Doel van alice, gekoppeld aan `groupId`. */
  sharedGoalId: string;
  /** Doel van alice, aan geen enkele groep gekoppeld. */
  privateGoalId: string;
  weeklyGoalId: string;
  completionId: string;
  privateMoveId: string;
  sharedMoveId: string;
  commitmentId: string;
}

let f: Fixture;

/** Faalt hard bij een fout. Voor stappen waar niets teruggelezen hoeft. */
function mustOk(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
}

/**
 * De id van een zojuist ingevoegde rij, of een harde fout.
 *
 * ⚠️ De losse `data`-check is geen overdaad. RLS weigert een `RETURNING`-rij met
 *    stilte in plaats van met een fout: geen error, geen data. Zonder deze
 *    controle sneuvelt de opbouw pas drie stappen verderop op `undefined`.
 */
function mustId(
  result: { data: { id: string } | null; error: { message: string } | null },
  what: string,
): string {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
  if (!result.data) throw new Error(`Opbouw mislukte bij ${what}: geen rij teruggekregen`);
  return result.data.id;
}

/**
 * ⚠️ Bevinding van deze suite: een groep aanmaken kán niet vanuit de client.
 *
 * Twee policies bijten elkaar. `groups_select` eist `is_group_member(id)`, en
 * `group_members_insert_founder` controleert het oprichterschap met een subquery
 * op `groups` — die subquery draait óók onder RLS. De oprichter moet dus lid
 * zijn om zijn eigen groep te mogen zien, en zijn groep zien om lid te mogen
 * worden. Daar komt niemand doorheen.
 *
 * De oplossing hoort een RPC te zijn die groep en oprichterslidmaatschap in één
 * transactie zet — dat is toch al nodig, want twee losse inserts kunnen halverwege
 * stranden en laten dan een groep zonder leden achter. Die RPC hoort bij QS8-52.
 * Zolang hij er niet is bouwt deze suite de groep met de systeemclient, precies
 * zoals die RPC dat straks doet.
 */
async function createGroup(owner: TestUser, name: string): Promise<{ id: string; code: string }> {
  const code = inviteCode();
  const id = crypto.randomUUID();
  const admin = adminDb();

  mustOk(
    await admin.from('groups').insert({ id, name, created_by: owner.id, invite_code: code }),
    `groep ${name}`,
  );

  mustOk(
    await admin.from('group_members').insert({ group_id: id, user_id: owner.id, role: 'admin' }),
    `oprichter van ${name}`,
  );

  return { id, code };
}

async function buildFixture(): Promise<Fixture> {
  const admin = adminDb();

  const [alice, bob, carol] = await Promise.all([
    createTestUser('alice'),
    createTestUser('bob'),
    createTestUser('carol'),
  ]);

  // Twee groepen met dezelfde leden. Het verschil is welk doel eraan hangt —
  // daarmee wordt "goedkeuren via de verkeerde groep" toetsbaar.
  const group = await createGroup(alice, 'Testgroep');
  const otherGroup = await createGroup(bob, 'Tweede groep');

  mustOk(await bob.db.rpc('join_group_with_code', { code: group.code }), 'bob wordt lid');
  mustOk(await alice.db.rpc('join_group_with_code', { code: otherGroup.code }), 'alice wordt lid');

  const revoked = await createGroup(alice, 'Ingetrokken groep');
  mustOk(
    await admin
      .from('groups')
      .update({ invite_revoked: true })
      .eq('id', revoked.id)
      .select('id')
      .single(),
    'code intrekken',
  );

  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  const sharedGoalId = mustId(
    await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Gedeeld doel', target_date: cycle.endDate })
      .select('id')
      .single(),
    'gedeeld doel',
  );

  const privateGoalId = mustId(
    await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Privédoel', target_date: cycle.endDate })
      .select('id')
      .single(),
    'privédoel',
  );

  mustOk(
    await alice.db
      .from('goal_group_links')
      .insert({ goal_id: sharedGoalId, group_id: group.id })
      .select('goal_id')
      .single(),
    'doel aan groep koppelen',
  );

  const weeklyGoalId = mustId(
    await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: sharedGoalId,
        title: 'Weekdoel',
        cycle_start_date: cycle.startDate,
        cycle_index: 1,
      })
      .select('id')
      .single(),
    'weekdoel',
  );

  const completionId = mustId(
    await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: weeklyGoalId,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'Gehaald',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'voltooiing',
  );

  mustOk(
    await alice.db
      .from('goal_interviews')
      .insert({ goal_id: sharedGoalId, answers: { measurable: 'ja' } })
      .select('id')
      .single(),
    'interview',
  );

  const privateMoveId = mustId(
    await alice.db
      .from('daily_moves')
      .insert({
        user_id: alice.id,
        weekly_goal_id: weeklyGoalId,
        body: 'Privé dagzet',
        visibility: 'private',
        local_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'privé-dagzet',
  );

  const sharedMoveId = mustId(
    await alice.db
      .from('daily_moves')
      .insert({
        user_id: alice.id,
        weekly_goal_id: weeklyGoalId,
        body: 'Gedeelde dagzet',
        visibility: 'group',
        local_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'gedeelde dagzet',
  );

  const commitmentId = mustId(
    await alice.db
      .from('commitments')
      .insert({
        goal_id: sharedGoalId,
        type: 'penalty',
        body: 'Ik trakteer de groep',
        beneficiary_group_id: group.id,
        confirmed_at: now().toISOString(),
      })
      .select('id')
      .single(),
    'commitment',
  );

  // Systeemrijen: in productie geschreven door een Edge Function, nooit door de
  // client. Daarom hier via de admin-client.
  mustOk(
    await admin
      .from('points_ledger')
      .insert({ user_id: alice.id, goal_id: sharedGoalId, delta: 2, reason: 'completion_approved_ceiling' })
      .select('id')
      .single(),
    'puntenboeking',
  );

  mustOk(
    await admin
      .from('week_pass_events')
      .insert({
        user_id: alice.id,
        goal_id: sharedGoalId,
        event: 'earned',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'weekpas',
  );

  mustOk(
    await admin
      .from('ai_jobs')
      .insert({
        user_id: alice.id,
        goal_id: sharedGoalId,
        kind: 'milestones',
        input: { title: 'Gedeeld doel' },
        input_hash: 'test-hash',
      })
      .select('id')
      .single(),
    'ai-job',
  );

  mustOk(
    await admin
      .from('user_streaks')
      .insert({
        user_id: alice.id,
        goal_id: sharedGoalId,
        current_streak: 3,
        best_streak: 5,
        total_points: 11,
        last_cycle_start: cycle.startDate,
      })
      .select('user_id')
      .single(),
    'reeks',
  );

  return {
    alice,
    bob,
    carol,
    groupId: group.id,
    otherGroupId: otherGroup.id,
    revokedCode: revoked.code,
    sharedGoalId,
    privateGoalId,
    weeklyGoalId,
    completionId,
    privateMoveId,
    sharedMoveId,
    commitmentId,
  };
}

/**
 * Hoeveel rijen levert deze query op? Faalt hard bij een onverwachte fout.
 *
 * RLS weigert lezen niet met een foutmelding maar met stilte: je krijgt de rijen
 * gewoon niet. Nul rijen is dus het antwoord waar de meeste tests hieronder op
 * wachten — en een échte fout mag daar nooit in wegvallen.
 */
async function rowCount(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<number> {
  const { data, error } = await query;
  if (error) throw new Error(`Onverwachte fout bij lezen: ${error.message}`);
  return data?.length ?? 0;
}

describe.skipIf(!rlsTestsConfigured)('RLS-policies met echte JWTs', () => {
  beforeAll(async () => {
    f = await buildFixture();
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Domeinregel 3 — peer-goedkeuring is een autorisatiegrens
  // -------------------------------------------------------------------------

  describe('goedkeuren', () => {
    it(
      'laat een groepsgenoot goedkeuren via de gekoppelde groep',
      async () => {
        // De toelating hoort vóór de weigeringen: zonder dit bewijs kan de rest
        // van dit blok groen zijn omdat er helemaal niets werkt.
        //
        // subject_id wijst hier bewust naar de verkeerde persoon. De client mag
        // die waarde niet kiezen; de trigger hoort hem te overschrijven met de
        // eigenaar van de voltooiing. Zonder dat is de CHECK-constraint
        // `approver_id <> subject_id` te omzeilen door een leugen mee te sturen.
        const { data, error } = await f.bob.db
          .from('completion_approvals')
          .insert({
            completion_id: f.completionId,
            approver_id: f.bob.id,
            subject_id: f.carol.id,
            group_id: f.groupId,
            status: 'approved',
          })
          .select('id, subject_id')
          .single();

        expect(error).toBeNull();
        expect(data?.subject_id).toBe(f.alice.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert zelfgoedkeuring op de policy',
      async () => {
        const { error } = await f.alice.db.from('completion_approvals').insert({
          completion_id: f.completionId,
          approver_id: f.alice.id,
          subject_id: f.bob.id, // gelogen; de trigger zet hem terug
          group_id: f.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert zelfgoedkeuring ook zonder policy, op trigger en constraint',
      async () => {
        // Als service_role: RLS staat erbij en kijkt ernaar. Wat hier weigert,
        // is de trigger die subject_id overschrijft plus de CHECK-constraint.
        // Dat is het tweede slot op dezelfde deur, en het moet los werken.
        const { error } = await adminDb().from('completion_approvals').insert({
          completion_id: f.completionId,
          approver_id: f.alice.id,
          subject_id: f.bob.id,
          group_id: f.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
        expect(error?.message).toContain('Je kunt je eigen voltooiing niet goedkeuren');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert goedkeuring door iemand buiten de groep',
      async () => {
        const { error } = await f.carol.db.from('completion_approvals').insert({
          completion_id: f.completionId,
          approver_id: f.carol.id,
          subject_id: f.alice.id,
          group_id: f.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert goedkeuring via een groep waar het doel niet aan hangt',
      async () => {
        // Bob is lid van beide groepen. Alleen de koppeling doel↔groep ontbreekt.
        const { error } = await f.bob.db.from('completion_approvals').insert({
          completion_id: f.completionId,
          approver_id: f.bob.id,
          subject_id: f.alice.id,
          group_id: f.otherGroupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Domeinregel 7 en 10 — falen is nooit publiek, punten zijn privé
  // -------------------------------------------------------------------------

  describe('privacy van tegenslag', () => {
    it(
      'toont andermans points_ledger niet',
      async () => {
        const mine = await rowCount(f.alice.db.from('points_ledger').select('id').eq('user_id', f.alice.id));
        const theirs = await rowCount(f.bob.db.from('points_ledger').select('id').eq('user_id', f.alice.id));

        expect(mine).toBe(1);
        expect(theirs).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont andermans interviews, weekpassen en AI-jobs niet',
      async () => {
        const interviews = await rowCount(f.bob.db.from('goal_interviews').select('id').eq('goal_id', f.sharedGoalId));
        const passes = await rowCount(f.bob.db.from('week_pass_events').select('id').eq('user_id', f.alice.id));
        const jobs = await rowCount(f.bob.db.from('ai_jobs').select('id').eq('user_id', f.alice.id));

        expect(interviews).toBe(0);
        expect(passes).toBe(0);
        expect(jobs).toBe(0);
      },
      TEST_TIMEOUT,
    );

    // ⚠️ `it.fails` betekent: deze test hoort NU te falen, en dat is een bekend
    //    defect, geen slordigheid. `group_visible_streaks` staat op
    //    `security_invoker = true` en draait daarmee onder de RLS van de
    //    aanroeper. De policy op `user_streaks` is `user_id = auth.uid()`, dus de
    //    view laat iedereen uitsluitend zijn eigen reeks zien — precies het
    //    tegenovergestelde van waar hij voor bedoeld is. Het groepsoverzicht
    //    (QS8-55) en De Ketting (QS8-80) hangen hieraan.
    //
    //    De reparatie is migratie 0005 (view op `security_invoker = false`, zodat
    //    de WHERE-regel `shares_group_with_goal()` de autorisatie draagt en de
    //    projectie het lek dichthoudt). Die migratie wacht op akkoord; zie
    //    docs/Q-TODO.
    //
    //    Zodra 0005 gedraaid is slaat déze regel om: `it.fails` faalt dan zelf,
    //    want de test slaagt. Dat is de bedoeling — het dwingt af dat de
    //    markering verdwijnt in plaats van jarenlang blijft staan.
    it.fails(
      'laat de groep de reeks zien maar nooit het puntentotaal',
      async () => {
        const { data, error } = await f.bob.db
          .from('group_visible_streaks')
          .select('*')
          .eq('user_id', f.alice.id);

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data?.[0]?.current_streak).toBe(3);
        // Niet alleen "de waarde staat er niet", maar "de kolom bestaat niet".
        expect(Object.keys(data?.[0] ?? {})).not.toContain('total_points');
        expect(Object.keys(data?.[0] ?? {})).not.toContain('last_cycle_start');

        // En de tabel eronder blijft dicht.
        const raw = await rowCount(f.bob.db.from('user_streaks').select('user_id').eq('user_id', f.alice.id));
        expect(raw).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt een privé-dagzet privé en een gedeelde zichtbaar',
      async () => {
        const privately = await rowCount(f.bob.db.from('daily_moves').select('id').eq('id', f.privateMoveId));
        const shared = await rowCount(f.bob.db.from('daily_moves').select('id').eq('id', f.sharedMoveId));

        expect(privately).toBe(0);
        expect(shared).toBe(1);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Domeinregel 4 — groepsleden zien elkaars doelen alleen waar dat mag
  // -------------------------------------------------------------------------

  describe('zichtbaarheid van doelen', () => {
    it(
      'toont een gekoppeld doel wel en een niet-gekoppeld doel niet',
      async () => {
        const shared = await rowCount(f.bob.db.from('goals').select('id').eq('id', f.sharedGoalId));
        const hidden = await rowCount(f.bob.db.from('goals').select('id').eq('id', f.privateGoalId));

        expect(shared).toBe(1);
        expect(hidden).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt alles van een vreemde onzichtbaar',
      async () => {
        const goals = await rowCount(f.carol.db.from('goals').select('id').eq('id', f.sharedGoalId));
        const weekly = await rowCount(f.carol.db.from('weekly_goals').select('id').eq('id', f.weeklyGoalId));

        expect(goals).toBe(0);
        expect(weekly).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Domeinregel 11 — een straf bereikt de groep pas als hij verschuldigd is
  // -------------------------------------------------------------------------

  describe('commitments', () => {
    it(
      'verbergt een ingestelde straf voor de begunstigde groep en toont hem zodra hij verschuldigd is',
      async () => {
        const before = await rowCount(f.bob.db.from('commitments').select('id').eq('id', f.commitmentId));
        expect(before).toBe(0);

        mustOk(
          await adminDb()
            .from('commitments')
            .update({ status: 'due' })
            .eq('id', f.commitmentId)
            .select('id')
            .single(),
          'straf verschuldigd maken',
        );

        const after = await rowCount(f.bob.db.from('commitments').select('id').eq('id', f.commitmentId));
        expect(after).toBe(1);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Toetreden tot een groep loopt uitsluitend via de code
  // -------------------------------------------------------------------------

  describe('lidmaatschap', () => {
    it(
      'weigert een directe insert in group_members',
      async () => {
        const { error } = await f.carol.db
          .from('group_members')
          .insert({ group_id: f.groupId, user_id: f.carol.id });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een ingetrokken uitnodigingscode',
      async () => {
        const { error } = await f.carol.db.rpc('join_group_with_code', {
          code: f.revokedCode,
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een code die niet bestaat',
      async () => {
        const { error } = await f.carol.db.rpc('join_group_with_code', {
          code: 'bestaat-niet',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Domeinregel 6 — geschiedenis wordt nooit overschreven
  // -------------------------------------------------------------------------

  describe('append-only', () => {
    it(
      'staat geen UPDATE of DELETE op completions toe',
      async () => {
        const updated = await f.alice.db
          .from('completions')
          .update({ note: 'toch maar niet' })
          .eq('id', f.completionId)
          .select('id');

        const deleted = await f.alice.db
          .from('completions')
          .delete()
          .eq('id', f.completionId)
          .select('id');

        // Zonder policy raakt de rij niet; PostgREST meldt dat als nul rijen.
        expect(updated.data ?? []).toHaveLength(0);
        expect(deleted.data ?? []).toHaveLength(0);

        // En de rij staat er nog, onveranderd.
        const { data } = await f.alice.db
          .from('completions')
          .select('note')
          .eq('id', f.completionId)
          .single();
        expect(data?.note).toBe('Gehaald');
      },
      TEST_TIMEOUT,
    );

    it(
      'staat geen UPDATE of DELETE op een goedkeuring toe',
      async () => {
        const updated = await f.bob.db
          .from('completion_approvals')
          .update({ status: 'more_info' })
          .eq('completion_id', f.completionId)
          .select('id');

        expect(updated.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
});
