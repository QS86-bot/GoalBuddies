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

import { now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  anonDb,
  createTestUser,
  inviteCode,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

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
  /** Een gewoon chatbericht van bob, in de gedeelde groep. */
  chatMessageId: string;
  /** De cyclus waarin de fixture leeft; nodig om ermee te sjoemelen. */
  cycleStart: string;
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
 * Een groep aanmaken loopt via `create_group` (migratie 0009), en dat is geen
 * gemak maar noodzaak.
 *
 * ⚠️ Bevinding van deze suite: met losse inserts kán het niet. `groups_select`
 *    eist `is_group_member(id)`, en `group_members_insert_founder` controleert
 *    het oprichterschap met een subquery op `groups` die zelf ook onder RLS
 *    draait. De oprichter moest dus lid zijn om zijn groep te mogen zien, en
 *    zijn groep zien om lid te mogen worden.
 *
 *    Dat deze functie via de gewone client van de eigenaar draait — en niet via
 *    de systeemclient — is dus zelf een test: hij bewijst dat de RPC het gat
 *    dicht.
 */
async function createGroup(owner: TestUser, name: string): Promise<{ id: string; code: string }> {
  const code = inviteCode();

  const groep = mustId(
    await owner.db
      .rpc('create_group', { group_name: name, invite_code: code })
      .select('id')
      .single(),
    `groep ${name}`,
  );

  return { id: groep, code };
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

  const chatMessageId = mustId(
    await bob.db
      .from('chat_messages')
      .insert({ group_id: group.id, sender_id: bob.id, body: 'Hoi allemaal' })
      .select('id')
      .single(),
    'chatbericht',
  );

  return {
    alice,
    bob,
    carol,
    chatMessageId,
    cycleStart: cycle.startDate,
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

    // ⚠️ Deze test heette eerst "weigert zelfgoedkeuring op de policy", en dat
    //    was niet waar. Postgres draait `before insert`-triggers vóór de RLS
    //    `with check`, dus `fill_approval_subject()` gooit als eerste — precies
    //    zoals in de test hieronder. De clausule `c.user_id <> auth.uid()` in
    //    `completion_approvals_insert` is vanuit de client niet los te toetsen:
    //    haal hem weg en deze suite blijft groen.
    //
    //    Wat hier wél bewezen wordt is dat de eigenaar er langs geen enkele weg
    //    doorheen komt. Dat is het gedrag dat telt. Dat de policy ook nog een
    //    slot is, staat in docs/ENGINEER-REVIEW.md als onbewezen genoteerd.
    it(
      'weigert zelfgoedkeuring, hoe de eigenaar het ook probeert',
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

        // ⚠️ Geen vast aantal. Sinds migratie 0014 boekt de trigger er zelf een
        //    bij zodra bob goedkeurt, en dat aantal is de eigenschap niet die
        //    deze test bewijst. Waar het om gaat: alice ziet haar eigen
        //    boekingen, bob ziet er nul van haar.
        expect(mine).toBeGreaterThan(0);
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
    //    docs/Q-TODO.docx.
    //
    //    Zodra 0005 gedraaid is slaat déze regel om: `it.fails` faalt dan zelf,
    //    want de test slaagt. Dat is de bedoeling — het dwingt af dat de
    //    markering verdwijnt in plaats van jarenlang blijft staan.
    it(
      'laat de groep de reeks zien maar nooit het puntentotaal',
      async () => {
        const { data, error } = await f.bob.db
          .from('group_visible_streaks')
          .select('*')
          .eq('user_id', f.alice.id);

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        // Het getal komt van herbereken_reeks (migratie 0014) en niet uit de
        // fixture: user_streaks is cache, geen waarheid. Dát de reeks zichtbaar
        // is voor een groepsgenoot, is wat deze test bewijst — niet welke stand
        // hij heeft.
        expect(typeof data?.[0]?.current_streak).toBe('number');
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

  // -------------------------------------------------------------------------
  // Rechten binnen een groep — kan een lid meer dan een lid hoort te kunnen?
  // -------------------------------------------------------------------------

  describe('rechten binnen een groep', () => {
    /**
     * Elke test hier krijgt een eigen groep. Zonder dat besmetten ze elkaar:
     * lukt de rechtenverhoging in de eerste test, dan is de tweede test daarna
     * geen test meer maar een gevolg.
     */
    async function verseGroepMetBob(naam: string): Promise<string> {
      const groep = await createGroup(f.alice, naam);
      mustOk(await f.bob.db.rpc('join_group_with_code', { code: groep.code }), `bob in ${naam}`);
      return groep.id;
    }

    // ⚠️ Dit was een gat, gedicht in migratie 0006. `group_members_update` had
    //    geen `with check`; Postgres gebruikt dan de `using`-expressie ook als
    //    check, en die eist alleen `user_id = auth.uid()`. De kolom `role` stond
    //    nergens vast, dus elk lid maakte zichzelf met één update admin — en kon
    //    daarna de hele groep met alle geschiedenis wissen.
    //
    //    De reparatie is een trigger en niet alleen een policy, want RLS kan geen
    //    kolommen beperken. Die grens komt hieronder nog een paar keer terug.
    it(
      'laat een gewoon lid zichzelf geen admin maken',
      async () => {
        const groupId = await verseGroepMetBob('Groep voor rolverhoging');

        await f.bob.db
          .from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', groupId)
          .eq('user_id', f.bob.id);

        const { data } = await adminDb()
          .from('group_members')
          .select('role')
          .eq('group_id', groupId)
          .eq('user_id', f.bob.id)
          .single();

        expect(data?.role).toBe('member');
      },
      TEST_TIMEOUT,
    );

    // Dit pad is wél dicht, en dat is het vermelden waard: dezelfde policy laat
    // de rol los maar houdt het lidmaatschap vast. Zou dit ook lukken, dan was
    // `join_group_with_code` — in 0002 beschreven als "enige route naar
    // lidmaatschap" — omzeild door iedereen die een group-uuid weet.
    it(
      'laat een lid zichzelf niet naar een andere groep verplaatsen',
      async () => {
        const vanGroep = await verseGroepMetBob('Groep waar bob in zit');
        const naarGroep = await createGroup(f.alice, 'Groep waar bob niet in hoort');

        await f.bob.db
          .from('group_members')
          .update({ group_id: naarGroep.id })
          .eq('group_id', vanGroep)
          .eq('user_id', f.bob.id);

        const admin = adminDb();

        const verplaatst = await admin
          .from('group_members')
          .select('user_id')
          .eq('group_id', naarGroep.id)
          .eq('user_id', f.bob.id);

        // ⚠️ Zonder deze tweede controle bewijst de test niets: nul rijen in de
        //    doelgroep is ook de uitkomst van een update die per ongeluk geen
        //    enkele rij raakte.
        const gebleven = await admin
          .from('group_members')
          .select('user_id')
          .eq('group_id', vanGroep)
          .eq('user_id', f.bob.id);

        expect(verplaatst.data ?? []).toHaveLength(0);
        expect(gebleven.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gewoon lid de groep niet hernoemen of verwijderen',
      async () => {
        const groupId = await verseGroepMetBob('Groep om te hernoemen');

        const hernoemd = await f.bob.db
          .from('groups')
          .update({ name: 'Bobs groep' })
          .eq('id', groupId)
          .select('id');

        const verwijderd = await f.bob.db
          .from('groups')
          .delete()
          .eq('id', groupId)
          .select('id');

        expect(hernoemd.data ?? []).toHaveLength(0);
        expect(verwijderd.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Systeemberichten zijn het vertrouwde kanaal in de groep
  // -------------------------------------------------------------------------

  describe('chat', () => {
    // ⚠️ Dit was het ergste gat van de zeven, gedicht in 0006 en 0010.
    //    `chat_messages_insert` blokkeerde `type = 'system'`, de UPDATE-policy
    //    niet. Een lid plaatste dus een gewoon bericht en werkte het bij naar een
    //    systeembericht.
    //
    //    Systeemberichten zijn in dit product het kanaal dat de groep vertrouwt.
    //    Dit was de directe route om domeinregel 7 van buitenaf te breken:
    //    "Alice heeft haar week gemist", ondertekend door de app zelf.
    it(
      'laat een lid zijn eigen bericht niet omtoveren tot systeembericht',
      async () => {
        await f.bob.db
          .from('chat_messages')
          .update({ type: 'system', system_event: 'week_missed' })
          .eq('id', f.chatMessageId);

        const { data } = await adminDb()
          .from('chat_messages')
          .select('type')
          .eq('id', f.chatMessageId)
          .single();

        expect(data?.type).toBe('text');
      },
      TEST_TIMEOUT,
    );

    // ⚠️ Tweede pad van hetzelfde gat, en het leerzaamste van de reeks.
    //
    //    0006 zette `is_group_member(group_id)` in de `with check`. Dat blokkeert
    //    verplaatsen naar een vréémde groep — maar niet naar een andere groep
    //    waar je zelf ook in zit, want dan slaagt de check gewoon. De test bleef
    //    dus falen ná de reparatie, en dat is precies waarom hij bestaat.
    //
    //    0010 pint daarom `group_id`, `sender_id`, `type` en `created_at` vast in
    //    een trigger. Een bericht hoort bij het gesprek waar het geplaatst is;
    //    je mag je tekst rechtzetten, meer niet.
    it(
      'laat een lid zijn bericht niet naar een andere groep verplaatsen',
      async () => {
        await f.bob.db
          .from('chat_messages')
          .update({ group_id: f.otherGroupId })
          .eq('id', f.chatMessageId);

        const { data } = await adminDb()
          .from('chat_messages')
          .select('group_id')
          .eq('id', f.chatMessageId)
          .single();

        expect(data?.group_id).toBe(f.groupId);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de chat dicht voor wie geen lid is',
      async () => {
        const count = await rowCount(
          f.carol.db.from('chat_messages').select('id').eq('group_id', f.groupId),
        );
        expect(count).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // "Systeem" in de policy-matrix betekent: alleen service_role
  // -------------------------------------------------------------------------

  describe('systeemtabellen', () => {
    // ⚠️ Deze tabellen hebben alleen een SELECT-policy. Schrijven wordt
    //    tegengehouden door default deny — RLS is daar het enige slot, want
    //    Supabase geeft `authenticated` standaard tabel-grants op `public`.
    //    Voegt iemand later één `for all`-policy toe (dat is in 0003 al vier
    //    keer gedaan), dan boekt een gebruiker zichzelf onbeperkt punten.
    //    Dit is de goedkoopste test in het bestand.

    it(
      'laat een gebruiker zichzelf geen punten boeken',
      async () => {
        const { error } = await f.bob.db.from('points_ledger').insert({
          user_id: f.bob.id,
          delta: 9999,
          reason: 'completion_approved_ceiling',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gebruiker zijn eigen reeks niet ophogen',
      async () => {
        const { error } = await f.bob.db
          .from('user_streaks')
          .insert({ user_id: f.bob.id, goal_id: f.sharedGoalId, current_streak: 52 });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gebruiker zichzelf geen weekpassen geven',
      async () => {
        const { error } = await f.bob.db.from('week_pass_events').insert({
          user_id: f.bob.id,
          goal_id: f.sharedGoalId,
          event: 'granted',
          cycle_start_date: f.cycleStart,
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gebruiker geen kettingschakel verzinnen',
      async () => {
        const { error } = await f.bob.db.from('chain_links').insert({
          group_id: f.groupId,
          user_id: f.bob.id,
          group_period_start: f.cycleStart,
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gebruiker geen AI-job aanmaken buiten de Edge Function om',
      async () => {
        // Anders is de quota- en kostenbewaking (CLAUDE.md, regel 6) een
        // suggestie: de client schrijft dan zelf de rij die het geld kost.
        const { error } = await f.bob.db.from('ai_jobs').insert({
          user_id: f.bob.id,
          kind: 'milestones',
          input: {},
          input_hash: 'verzonnen',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt invite_events volledig dicht — ook voor lezen',
      async () => {
        const count = await rowCount(f.bob.db.from('invite_events').select('id'));
        expect(count).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // De uitgelogde bezoeker
  // -------------------------------------------------------------------------

  describe('zonder inloggen', () => {
    it(
      'ziet niets, in geen enkele tabel',
      async () => {
        const anon = anonDb();

        const tabellen = [
          'profiles',
          'goals',
          'groups',
          'group_members',
          'weekly_goals',
          'completions',
          'chat_messages',
          'daily_moves',
          'points_ledger',
          'commitments',
        ] as const;

        for (const tabel of tabellen) {
          const { data } = await anon.from(tabel).select('*').limit(1);
          expect(data ?? [], `${tabel} lekt aan anon`).toHaveLength(0);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'kan geen groep binnenkomen met een geldige code',
      async () => {
        const { error } = await anonDb().rpc('join_group_with_code', {
          code: 'maakt-niet-uit',
        });
        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Waarden die de client kiest maar niet mag kiezen
  // -------------------------------------------------------------------------

  describe('client-gekozen waarden', () => {
    it(
      'staat geen tweede stem van dezelfde goedkeurder toe',
      async () => {
        // CLAUDE.md, correctheidsregel 9: dubbele goedkeuring is onmogelijk.
        // Bob heeft al goedgekeurd in het eerste blok van deze suite.
        const { error } = await f.bob.db.from('completion_approvals').insert({
          completion_id: f.completionId,
          approver_id: f.bob.id,
          subject_id: f.alice.id,
          group_id: f.groupId,
          status: 'more_info',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    // ⚠️ Gedicht in 0006. `commitments_insert` controleerde alleen
    //    doeleigenaarschap — niet de status, en niet of je lid bent van de
    //    begunstigde groep. Een straf was dus direct als `due` aan te maken,
    //    waarna een willekeurige groep meteen leesrecht kreeg op de tekst.
    it(
      'laat een straf niet meteen als verschuldigd aanmaken',
      async () => {
        // Domeinregel 11: een straf treedt alleen in werking bij een verstreken
        // deadline. Kan de client `status` kiezen, dan krijgt een willekeurige
        // groep direct leesrecht op de tekst van het commitment.
        const { error } = await f.alice.db.from('commitments').insert({
          goal_id: f.sharedGoalId,
          type: 'penalty',
          body: 'Direct verschuldigd',
          beneficiary_group_id: f.otherGroupId,
          status: 'due',
          confirmed_at: now().toISOString(),
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    // ⚠️ Gedicht in 0006. `daily_moves_write` checkte alleen
    //    `user_id = auth.uid()`, niet van wie `weekly_goal_id` was.
    it(
      'laat geen dagzet onder andermans weekdoel hangen',
      async () => {
        // Anders kan iemand tekst in de doeldraad van een ander plaatsen — en
        // met domeinregel 7 in het achterhoofd is dat precies het mechanisme om
        // een groepsgenoot publiek af te vallen.
        const { error } = await f.bob.db.from('daily_moves').insert({
          user_id: f.bob.id,
          weekly_goal_id: f.weeklyGoalId,
          body: 'Alice doet niks',
          visibility: 'group',
          local_date: f.cycleStart,
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    // ⚠️ Gedicht in 0007. De enige constraints waren `ceiling >= floor` en
    //    `miss <= 0`, dus een weekdoel met 100.000 punten mocht gewoon.
    it(
      'laat geen absurd puntenplafond op een weekdoel zetten',
      async () => {
        // Domeinregel 10 legt het model vast op +2/+1/−1. Is points_ceiling vrij
        // te kiezen, dan is de score betekenisloos.
        const { error } = await f.alice.db.from('weekly_goals').insert({
          goal_id: f.sharedGoalId,
          title: 'Gratis punten',
          points_ceiling: 100_000,
          cycle_start_date: f.cycleStart,
          cycle_index: 2,
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
