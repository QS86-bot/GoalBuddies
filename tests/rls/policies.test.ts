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

// ⚠️ Rechtstreeks uit schemas.ts en niet via modules/buddies/index.ts. Die
//    laatste re-exporteert ook api.ts en pending.ts, en die trekken de
//    Supabase-client en AsyncStorage mee — en daarmee React Native, in een test
//    die in Node draait. Zelfde reden als de losse client in harness.ts.
import { isCodeVorm, normaliseerCode } from '../../src/modules/buddies/schemas';
import {
  DOELGEBEURTENISSEN,
  STATUSSEN,
} from '../../src/modules/goals/schemas';
import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  anonDb,
  createTestProfile,
  createTestUser,
  onbekendeCode,
  removeTestUsers,
  rlsTestsConfigured,
  verwijderAuthGebruiker,
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
 * De uitkomst van `join_group_with_code`, sinds migratie 0017 een resultaat in
 * plaats van een exception.
 *
 * ⚠️ Die wijziging maakt `mustOk` hier onbruikbaar: een geweigerde toetreding
 *    geeft geen `error` meer, dus `mustOk` zou er stil overheen lopen en de
 *    opbouw drie stappen verderop laten sneuvelen op iets dat er niets mee te
 *    maken heeft. Vandaar `mustJoin`.
 */
interface RpcUitkomst {
  ok?: boolean;
  reason?: string;
  group_id?: string;
  invite_code?: string;
  invite_revoked?: boolean;
}

function uitkomst(data: unknown): RpcUitkomst {
  return (data ?? {}) as RpcUitkomst;
}

function mustJoin(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): void {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);

  const gelukt = uitkomst(result.data);
  if (!gelukt.ok) {
    throw new Error(`Opbouw mislukte bij ${what}: toetreden geweigerd (${gelukt.reason})`);
  }
}

/**
 * Een groep aanmaken loopt via `create_group` (migratie 0009, herzien in 0016),
 * en dat is geen gemak maar noodzaak.
 *
 * ⚠️ Bevinding van deze suite: met losse inserts kán het niet. `groups_select`
 *    eist `is_group_member(id)`, en `group_members_insert_founder` controleert
 *    het oprichterschap met een subquery op `groups` die zelf ook onder RLS
 *    draait. De oprichter moest dus lid zijn om zijn groep te mogen zien, en
 *    zijn groep zien om lid te mogen worden.
 *
 *    Dat deze functie via de gewone client van de eigenaar draait — en niet via
 *    de systeemclient — is dus zelf een test: hij bewijst dat de RPC het gat
 *    dicht. Sinds 0016 is de policy `groups_insert` bovendien `with check
 *    (false)`, dus dit is nu ook letterlijk de enige route.
 *
 * ⚠️ De code komt terug uit de RPC en gaat er niet meer in. Sinds 0016 verzint
 *    de server hem; een aanroeper die zijn eigen code meegeeft, bestaat niet meer.
 */
async function createGroup(owner: TestUser, name: string): Promise<{ id: string; code: string }> {
  const antwoord = await owner.db.rpc('create_group', { group_name: name });

  if (antwoord.error) {
    throw new Error(`Opbouw mislukte bij groep ${name}: ${antwoord.error.message}`);
  }

  // Sinds 0018 geeft de RPC `{ ok, reason }` of `{ ok, group }` terug in plaats
  // van een rij, om dezelfde reden als 0017: een exception rolt de transactie
  // terug en dat is voor een normale uitkomst het verkeerde gereedschap.
  const uit = (antwoord.data ?? {}) as {
    ok?: boolean;
    reason?: string;
    group?: { id: string; invite_code: string };
  };

  if (uit.ok !== true || uit.group === undefined) {
    throw new Error(`Opbouw mislukte bij groep ${name}: ${uit.reason ?? 'geen groep teruggekregen'}`);
  }

  return { id: uit.group.id, code: uit.group.invite_code };
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

  mustJoin(await bob.db.rpc('join_group_with_code', { code: group.code }), 'bob wordt lid');
  mustJoin(await alice.db.rpc('join_group_with_code', { code: otherGroup.code }), 'alice wordt lid');

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

        // ⚠️ **De belofte is op 24-08-2026 van vorm veranderd en niet van
        //    inhoud** (besluit A41, migratie 0078). Hier stond: "niet alleen de
        //    waarde staat er niet, maar de kolom bestáát niet". Sinds de
        //    zichtbaarheidskeuze per groep bestaan `best_streak` en
        //    `last_cycle_start` wél als kolom, en zijn ze `null` buiten een open
        //    groep.
        //
        //    Dat is aantoonbaar zwakker: een kolom die er niet is, kan niet
        //    lekken; een `case`-expressie die verkeerd geschreven wordt wel. De
        //    afweging staat in de kop van 0078 — een tweede view of een functie
        //    zou die eigenschap ook niet gehaald hebben, en zou de definitie op
        //    twee plekken zetten. Wat blijft, is dat déze toets nu op de wáárde
        //    moet en niet meer op het bestaan.
        //
        //    `total_points` heeft die verandering níét meegemaakt: die kolom
        //    staat er nog steeds niet in en komt er ook niet in (besluit A42).
        expect(Object.keys(data?.[0] ?? {})).not.toContain('total_points');
        expect(data?.[0]?.last_cycle_start).toBeNull();
        expect(data?.[0]?.best_streak).toBeNull();

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
        const { data } = await f.carol.db.rpc('join_group_with_code', {
          code: f.revokedCode,
        });

        expect(uitkomst(data).ok).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een code die niet bestaat',
      async () => {
        const { data } = await f.carol.db.rpc('join_group_with_code', {
          code: onbekendeCode(),
        });

        expect(uitkomst(data).ok).toBe(false);
      },
      TEST_TIMEOUT,
    );

    // ⚠️ Ingetrokken en nooit-bestaan geven met opzet hetzelfde antwoord. Zou de
    //    ene "deze link is ingetrokken" zeggen en de andere "onbekende code",
    //    dan is dit eindpunt een orakel dat vertelt welke codes bestaan.
    it(
      'maakt geen verschil tussen een ingetrokken en een onbekende code',
      async () => {
        const ingetrokken = await f.carol.db.rpc('join_group_with_code', {
          code: f.revokedCode,
        });
        const onbekend = await f.carol.db.rpc('join_group_with_code', {
          code: onbekendeCode(),
        });

        expect(uitkomst(ingetrokken.data).reason).toBe('invalid');
        expect(uitkomst(onbekend.data).reason).toBe('invalid');
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
      mustJoin(await f.bob.db.rpc('join_group_with_code', { code: groep.code }), `bob in ${naam}`);
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

  // -------------------------------------------------------------------------
  // EPIC 5 — buddy-groepen (migratie 0016)
  // -------------------------------------------------------------------------
  //
  // ⚠️ Eigen gebruikers, en niet die van de hoofdfixture. Alice zit daar al in
  //    zes groepen en de nieuwe grens ligt op tien; zou dit blok haar erbij
  //    nemen, dan valt de suite over een limiet in plaats van over een policy —
  //    en dan zoek je een uur naar het verkeerde.

  describe('buddy-groepen', () => {
    interface GroepFixture {
      eigenaar: TestUser;
      lid: TestUser;
      buitenstaander: TestUser;
      groupId: string;
      code: string;
      /** Doel van de eigenaar, gekoppeld aan `groupId`. */
      gekoppeldDoelId: string;
      /** Doel van de eigenaar, aan geen enkele groep gekoppeld. */
      losDoelId: string;
    }

    let g: GroepFixture;

    beforeAll(async () => {
      if (!rlsTestsConfigured) return;

      const [eigenaar, lid, buitenstaander] = await Promise.all([
        createTestUser('groep-eigenaar'),
        createTestUser('groep-lid'),
        createTestUser('groep-buiten'),
      ]);

      const groep = await createGroup(eigenaar, 'Buddygroep');
      mustJoin(await lid.db.rpc('join_group_with_code', { code: groep.code }), 'lid treedt toe');

      const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

      const gekoppeldDoelId = mustId(
        await eigenaar.db
          .from('goals')
          .insert({ owner_id: eigenaar.id, title: 'Gekoppeld doel', target_date: cycle.endDate })
          .select('id')
          .single(),
        'gekoppeld doel',
      );

      const losDoelId = mustId(
        await eigenaar.db
          .from('goals')
          .insert({ owner_id: eigenaar.id, title: 'Los doel', target_date: cycle.endDate })
          .select('id')
          .single(),
        'los doel',
      );

      mustOk(
        await eigenaar.db
          .from('goal_group_links')
          .insert({ goal_id: gekoppeldDoelId, group_id: groep.id }),
        'doel koppelen',
      );

      g = {
        eigenaar,
        lid,
        buitenstaander,
        groupId: groep.id,
        code: groep.code,
        gekoppeldDoelId,
        losDoelId,
      };
    }, SETUP_TIMEOUT);

    // -----------------------------------------------------------------------
    // 5.1 — de uitnodigingscode komt van de server
    // -----------------------------------------------------------------------

    describe('de uitnodigingscode', () => {
      it(
        'wordt door de server gemaakt, in het afgesproken formaat',
        async () => {
          // Twaalf tekens uit een alfabet van dertig, zonder 0/O, 1/I/L en U.
          // Dezelfde regel staat in src/modules/buddies/schemas.ts, en daar staat
          // een unittest op die de twee aan elkaar knoopt.
          expect(g.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
        },
        TEST_TIMEOUT,
      );

      /**
       * ⚠️ Deze test is de énige echte koppeling tussen `generate_invite_code()`
       *    in SQL en `isCodeVorm()` in TypeScript. De unittest in
       *    `schemas.test.ts` vergelijkt de constante met een kopie van zichzelf
       *    en merkt een wijziging in de migratie dus niet — dat is een tautologie
       *    en geen bescherming.
       *
       *    Vijf codes en niet één: dat is zestig tekens uit een alfabet van
       *    dertig, genoeg om een fout in één teken eruit te laten komen.
       *
       * ⚠️ Een eigen gebruiker. Zou dit de eigenaar van de fixture gebruiken, dan
       *    eet deze test zijn dagelijkse groepenlimiet op en vallen vier tests
       *    verderop om met "daily_limit" — een reden die niets met die tests te
       *    maken heeft. (Precies dat gebeurde bij de eerste versie.)
       */
      it(
        'levert codes die de app ook echt accepteert',
        async () => {
          const codemaker = await createTestUser('codes');

          for (let ronde = 0; ronde < 5; ronde += 1) {
            const gemaakt = await createGroup(codemaker, `Codegroep ${ronde}`);
            expect(isCodeVorm(gemaakt.code), `code ${gemaakt.code} valt buiten het alfabet`).toBe(
              true,
            );
            expect(normaliseerCode(gemaakt.code)).toBe(gemaakt.code);
          }
        },
        SETUP_TIMEOUT,
      );

      it(
        'maakt de aanmaker beheerder',
        async () => {
          const { data } = await adminDb()
            .from('group_members')
            .select('role')
            .eq('group_id', g.groupId)
            .eq('user_id', g.eigenaar.id)
            .single();

          expect(data?.role).toBe('admin');
        },
        TEST_TIMEOUT,
      );

      // ⚠️ Zonder deze policy loopt de client om create_group() heen: eigen
      //    code, geen dagelimiet, en geen lidmaatschap voor de oprichter.
      it(
        'is niet te omzeilen met een directe insert in groups',
        async () => {
          const { error } = await g.eigenaar.db.from('groups').insert({
            name: 'Zelfgemaakt',
            created_by: g.eigenaar.id,
            invite_code: 'WELKOMWELKOM',
          });

          expect(error).not.toBeNull();
        },
        TEST_TIMEOUT,
      );

      // ⚠️ Dit is de derde keer in dit project dat "RLS kan geen kolommen
      //    beperken" bijt, na 0006 en 0010. `groups_update` laat een beheerder de
      //    rij aanraken en dus ook `invite_code` — een beheerder kon zijn eigen
      //    raadbare code zetten.
      //
      //    Er staan nu twee sloten op: sinds 0019 heeft `authenticated` geen
      //    UPDATE-recht op die kolom (Postgres weigert het verzoek), en de
      //    trigger `groups_guard` zet hem daarnaast terug. Deze test toetst het
      //    resultaat en niet welk van de twee het tegenhield — precies zoals het
      //    hoort, want beide mogen weg zolang de code maar niet verandert.
      it(
        'is ook door een beheerder niet met een UPDATE te overschrijven',
        async () => {
          await g.eigenaar.db
            .from('groups')
            .update({ invite_code: 'WELKOMWELKOM' })
            .eq('id', g.groupId);

          const { data } = await adminDb()
            .from('groups')
            .select('invite_code')
            .eq('id', g.groupId)
            .single();

          expect(data?.invite_code).toBe(g.code);
        },
        TEST_TIMEOUT,
      );

      it(
        'laat een gewoon lid de code niet vernieuwen',
        async () => {
          const { data } = await g.lid.db.rpc('rotate_invite_code', { p_group_id: g.groupId });

          expect(uitkomst(data).ok).toBe(false);
          expect(uitkomst(data).reason).toBe('not_admin');

          // ⚠️ En de code is ook echt niet veranderd. Zonder deze tweede
          //    controle bewijst de test alleen dat er "nee" terugkomt, niet dat
          //    de functie ook niets gedaan heeft.
          const na = await adminDb()
            .from('groups')
            .select('invite_code')
            .eq('id', g.groupId)
            .single();
          expect(na.data?.invite_code).toBe(g.code);
        },
        TEST_TIMEOUT,
      );

      it(
        'laat een buitenstaander de link niet intrekken',
        async () => {
          const { data } = await g.buitenstaander.db.rpc('set_invite_revoked', {
            p_group_id: g.groupId,
            p_revoked: true,
          });

          expect(uitkomst(data).ok).toBe(false);
          expect(uitkomst(data).reason).toBe('not_admin');

          const na = await adminDb()
            .from('groups')
            .select('invite_revoked')
            .eq('id', g.groupId)
            .single();
          expect(na.data?.invite_revoked).toBe(false);
        },
        TEST_TIMEOUT,
      );

      // De toelating die bij bovenstaande weigeringen hoort: een beheerder kan
      // het wél, en de oude link werkt daarna niet meer.
      it(
        'laat een beheerder de code vernieuwen, waarna de oude link dood is',
        async () => {
          const eigen = await createGroup(g.eigenaar, 'Groep om te roteren');
          const antwoord = await g.eigenaar.db.rpc('rotate_invite_code', {
            p_group_id: eigen.id,
          });

          const nieuw = uitkomst(antwoord.data);
          expect(antwoord.error).toBeNull();
          expect(nieuw.ok).toBe(true);
          expect(nieuw.invite_code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
          expect(nieuw.invite_code).not.toBe(eigen.code);

          const metOude = await g.buitenstaander.db.rpc('join_group_with_code', {
            code: eigen.code,
          });
          expect(uitkomst(metOude.data).ok).toBe(false);
          expect(uitkomst(metOude.data).reason).toBe('invalid');
        },
        TEST_TIMEOUT,
      );

      // ⚠️ Sinds 0019 heeft `authenticated` geen UPDATE-recht meer op de
      //    gevoelige kolommen van `groups`. Dat is het echte slot; de trigger
      //    `groups_guard` is het tweede. Deze test bewijst dat Postgres het
      //    afdwingt en niet een rolnaam in een trigger.
      // ⚠️ Sinds 0019 heeft `authenticated` geen UPDATE-recht meer op de
      //    gevoelige kolommen van `groups`. Dat is het echte slot; de trigger
      //    `groups_guard` is het tweede. Deze test bewijst dat Postgres het
      //    afdwingt en niet een rolnaam in een trigger.
      it(
        'geeft authenticated geen UPDATE-recht op de slaapstand',
        async () => {
          const poging = await g.eigenaar.db
            .from('groups')
            .update({ status: 'sleeping' })
            .eq('id', g.groupId);

          expect(poging.error).not.toBeNull();

          const na = await adminDb().from('groups').select('status').eq('id', g.groupId).single();
          expect(na.data?.status).toBe('active');
        },
        TEST_TIMEOUT,
      );
    });

    // -----------------------------------------------------------------------
    // 5.2 — toetreden
    // -----------------------------------------------------------------------

    describe('toetreden', () => {
      // ⚠️ Het acceptatiecriterium dat met naam in de issue staat: bij Habit
      //    Huddle liep hier stil elke uitnodiging dood. Wie al lid is en de link
      //    nog eens opent, hoort gewoon in de groep te belanden.
      it(
        'is voor wie al lid is een succes en geen fout',
        async () => {
          const { data, error } = await g.lid.db.rpc('join_group_with_code', { code: g.code });

          expect(error).toBeNull();
          expect(uitkomst(data).ok).toBe(true);
          expect(uitkomst(data).group_id).toBe(g.groupId);
        },
        TEST_TIMEOUT,
      );

      // CLAUDE.md beveiligingsregel 5. Twintig pogingen per gebruiker per dag,
      // waarbij elke póging telt en niet alleen de geslaagde — brute-force
      // bestaat immers uit mislukte pogingen.
      //
      // ⚠️ Deze test vond een echt gat, gedicht in 0017: `raise exception` rolde
      //    de transactie terug en daarmee de zojuist geschreven `invite_events`-
      //    rij. Elke mislukte poging liet dus geen spoor na en de teller bleef op
      //    nul. De limiet gold in de praktijk alleen voor gelúkte toetredingen.
      //
      // ⚠️ Eigen weggooigroep, en niet die van de fixture. Zou de eenentwintigste
      //    poging tóch slagen, dan zit de bruteforcer daarna in de groep en
      //    telt het overzicht hieronder een lid te veel — een tweede test die
      //    rood wordt om een reden die er niets mee te maken heeft.
      it(
        'weigert na twintig pogingen per dag',
        async () => {
          const bruteforcer = await createTestUser('bruteforce');
          const doelwit = await createGroup(g.eigenaar, 'Groep om op te schieten');

          for (let poging = 0; poging < 20; poging += 1) {
            await bruteforcer.db.rpc('join_group_with_code', { code: onbekendeCode() });
          }

          // De eenentwintigste poging gebruikt een geldige code, en juist die
          // moet stuklopen: de limiet zit op pogingen en niet op mislukkingen.
          const { data } = await bruteforcer.db.rpc('join_group_with_code', {
            code: doelwit.code,
          });

          expect(uitkomst(data).ok).toBe(false);
          expect(uitkomst(data).reason).toBe('rate_limited');

          const leden = await adminDb()
            .from('group_members')
            .select('user_id')
            .eq('group_id', doelwit.id)
            .eq('user_id', bruteforcer.id);

          expect(leden.data ?? []).toHaveLength(0);
        },
        SETUP_TIMEOUT,
      );
    });

    // -----------------------------------------------------------------------
    // 5.7 — de huddledag
    // -----------------------------------------------------------------------

    describe('de huddledag', () => {
      it(
        'is door een beheerder te wijzigen',
        async () => {
          const { error } = await g.eigenaar.db
            .from('groups')
            .update({ huddle_day: 4, name: 'Buddygroep' })
            .eq('id', g.groupId);

          expect(error).toBeNull();

          const { data } = await adminDb()
            .from('groups')
            .select('huddle_day')
            .eq('id', g.groupId)
            .single();

          expect(data?.huddle_day).toBe(4);
        },
        TEST_TIMEOUT,
      );

      it(
        'is door een gewoon lid niet te wijzigen',
        async () => {
          await g.lid.db.from('groups').update({ huddle_day: 2 }).eq('id', g.groupId);

          const { data } = await adminDb()
            .from('groups')
            .select('huddle_day')
            .eq('id', g.groupId)
            .single();

          expect(data?.huddle_day).toBe(4);
        },
        TEST_TIMEOUT,
      );
    });

    // -----------------------------------------------------------------------
    // 5.4 — het groepsoverzicht
    // -----------------------------------------------------------------------

    describe('het groepsoverzicht', () => {
      /** De periode maakt voor deze tests niet uit; hij moet alleen een datum zijn. */
      const PERIODE = '2026-08-16';

      it(
        'geeft een lid alle leden in één aanroep',
        async () => {
          const { data, error } = await g.lid.db.rpc('group_overview', {
            p_group_id: g.groupId,
            p_period_start: PERIODE,
          });

          expect(error).toBeNull();
          expect(data ?? []).toHaveLength(2);
          expect((data ?? []).map((r) => r.user_id).sort()).toEqual(
            [g.eigenaar.id, g.lid.id].sort(),
          );
        },
        TEST_TIMEOUT,
      );

      // ⚠️ De functie is SECURITY INVOKER en voegt dus geen enkel recht toe. Dat
      //    is geen detail: een definer-versie zou hier stilzwijgend elke groep
      //    van het hele project openzetten.
      it(
        'geeft een buitenstaander niets',
        async () => {
          const { data } = await g.buitenstaander.db.rpc('group_overview', {
            p_group_id: g.groupId,
            p_period_start: PERIODE,
          });

          expect(data ?? []).toHaveLength(0);
        },
        TEST_TIMEOUT,
      );

      // ⚠️ Domeinregel 7 en 10, als eigenschap van de projectie. Uit een
      //    puntentotaal én uit `last_cycle_start` is af te leiden dat iemand een
      //    week gemist heeft.
      //
      // ⚠️ `best_streak` is er in 0019 bij gekomen, en dat was een echt gat: als
      //    `best_streak > current_streak`, dan heeft die persoon een reeks
      //    verbroken en dus een week gemist. De oude versie van deze test
      //    controleerde alleen de andere twee en liet hem er precies langs.
      //
      // ⚠️ **Deze groep is beschermd, en dat staat hier expliciet.** Sinds
      //    besluit A41 (migratie 0078) hangt het antwoord van
      //    `groups.zichtbaarheid` af; de fixture van deze suite kiest niets, en
      //    de default is `beschermd`. Dat is precies de stand die deze test moet
      //    bewaken: **alles wat vóór A41 dicht zat, zit in een beschermde groep
      //    nog steeds dicht.** De open stand staat in `tests/rls/epic13.test.ts`.
      it(
        'houdt in een beschermde groep de laatste cyclus en de beste reeks leeg',
        async () => {
          const { data } = await g.lid.db.rpc('group_overview', {
            p_group_id: g.groupId,
            p_period_start: PERIODE,
          });

          const kolommen = Object.keys((data ?? [])[0] ?? {});
          expect(kolommen).not.toContain('total_points');
          expect(kolommen).toContain('current_streak');

          // ⚠️ **Alleen de rijen van een ánder, en dat is een gerepareerde test.**
          //    Hier stond `for (const rij of data ?? [])` — dus inclusief de rij
          //    van de aanroeper zelf. Migratie 0078 vult die kolommen juist wél
          //    voor de eigenaar (`g.owner_id = auth.uid() or …`), en
          //    `epic13.test.ts` legt dat vast als belofte: je ziet je eigen beste
          //    reeks in beide standen.
          //
          //    De test was groen omdat deze fixture geen `user_streaks`-rij voor
          //    `g.lid` heeft. Wie die fixture ooit uitbreidt, zou een correcte
          //    implementatie rood zien worden — een test die faalt op het goede
          //    gedrag is erger dan geen test. Gevonden door de code-critic-ronde
          //    van 24-08.
          const vanAnderen = (data ?? []).filter((rij) => rij.user_id !== g.lid.id);
          expect(vanAnderen.length).toBeGreaterThan(0);

          for (const rij of vanAnderen) {
            expect(rij.last_cycle_start).toBeNull();
            expect(rij.best_streak).toBeNull();
          }
        },
        TEST_TIMEOUT,
      );

      // Zelfde bewering, maar dan op de view eronder: die is definer, dus wie hem
      // rechtstreeks bevraagt omzeilt de RPC volledig.
      it(
        'lekt best_streak ook niet via group_visible_streaks',
        async () => {
          const { data } = await g.lid.db.from('group_visible_streaks').select('*').limit(1);

          const kolommen = Object.keys((data ?? [])[0] ?? {});
          if (kolommen.length > 0) {
            expect(kolommen).not.toContain('total_points');
            // Sinds 0078 bestaan deze twee als kolom en zijn ze leeg buiten een
            // open groep. Zie de uitleg bij de vorige test.
            expect((data ?? [])[0]?.best_streak).toBeNull();
            expect((data ?? [])[0]?.last_cycle_start).toBeNull();
          }
        },
        TEST_TIMEOUT,
      );

      /**
       * ⚠️ Dit is de zwaarste bevinding van de security-review, en hij ging niet
       *    over EPIC 5 zelf maar over de deur die EPIC 5 opent. `weekly_goals`
       *    heeft een kolom `status` die letterlijk `'missed'` kan zijn, en
       *    `weekly_goals_select` gaf elke groepsgenoot de héle rij van een
       *    gekoppeld doel. Eén GET leverde de volledige lijst gemiste weken van
       *    een ander op, mét datum.
       *
       *    Het beslisdocument §4.3 belooft: "ook niet door slim te bevragen".
       *    Er was geen slimheid voor nodig. Gedicht in 0019.
       */
      it(
        'laat een groepsgenoot geen gemiste week van een ander zien',
        async () => {
          const admin = adminDb();
          const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

          // Een gemiste week op het gekoppelde doel van de eigenaar. Via de
          // systeemclient, want dit is wat de rollover-job doet.
          const gemist = mustId(
            await admin
              .from('weekly_goals')
              .insert({
                goal_id: g.gekoppeldDoelId,
                title: 'Week die niet gelukt is',
                cycle_start_date: cycle.startDate,
                cycle_index: 9,
                status: 'missed',
              })
              .select('id')
              .single(),
            'gemist weekdoel',
          );

          const alsLid = await g.lid.db
            .from('weekly_goals')
            .select('id, status')
            .eq('goal_id', g.gekoppeldDoelId);

          expect(alsLid.data ?? []).not.toContainEqual(
            expect.objectContaining({ id: gemist }),
          );
          expect((alsLid.data ?? []).map((w) => w.status)).not.toContain('missed');

          // De toelating die erbij hoort: de eigenaar ziet hem gewoon, anders
          // bewijst deze test alleen dat de rij onvindbaar is voor iedereen.
          const alsEigenaar = await g.eigenaar.db
            .from('weekly_goals')
            .select('id')
            .eq('id', gemist);

          expect(alsEigenaar.data ?? []).toHaveLength(1);
        },
        TEST_TIMEOUT,
      );

      /**
       * ⚠️ Q-TODO A45, migratie 0047 — en dit is de test die de vórige test te
       *    smal maakte. Die controleert `missed` en niets anders, dus hij bleef
       *    groen terwijl `excused` er wél doorheen kwam.
       *
       *    `weekly_goals_select` schermde drie statussen af en `excused` niet.
       *    Een adempauze betekent "ik heb deze week niet gedaan", dus dat is een
       *    niet-voltooide week die de groep te zien kreeg. Vandaag schrijft nog
       *    niets die status — QS8-82 wordt de eerste — en juist daarom moest het
       *    dicht vóórdat er een schrijver is.
       *
       * ⚠️ Deze test loopt bewust langs **alle zeven** statussen uit
       *    `weekly_goals_status_valid` in plaats van alleen langs de verboden.
       *    Twee redenen. De verboden kant alleen zou groen blijven als de policy
       *    per ongeluk álles verbergt, en de toegestane kant is de positieve
       *    controle die dat uitsluit. En wie er een achtste status bij zet, komt
       *    hier langs zodra hij hem aan deze lijst toevoegt.
       */
      it(
        'toont een groepsgenoot precies de statussen die voltooiing betekenen',
        async () => {
          const admin = adminDb();
          const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

          // Wat de groep wél en níét mag zien. `todo` en `pending` mogen: een
          // week die loopt of op een oordeel wacht is geen tegenslag.
          const verwacht: readonly { status: string; zichtbaar: boolean }[] = [
            { status: 'todo', zichtbaar: true },
            { status: 'pending', zichtbaar: true },
            { status: 'approved', zichtbaar: true },
            { status: 'missed', zichtbaar: false },
            { status: 'carried', zichtbaar: false },
            { status: 'cancelled', zichtbaar: false },
            { status: 'excused', zichtbaar: false },
          ];

          // Eén rij per status, elk in een eigen cyclus zodat ze niet met elkaar
          // botsen. Via de systeemclient: de client mag `status` niet zetten
          // (migratie 0023 en 0043) en dat is nu juist het punt.
          const rijen = new Map<string, string>();
          for (const [i, { status }] of verwacht.entries()) {
            rijen.set(
              status,
              mustId(
                await admin
                  .from('weekly_goals')
                  .insert({
                    goal_id: g.gekoppeldDoelId,
                    title: `Week met status ${status}`,
                    cycle_start_date: addDays(basis.startDate, -7 * (i + 2)),
                    cycle_index: 20 + i,
                    status,
                  })
                  .select('id')
                  .single(),
                `weekdoel ${status}`,
              ),
            );
          }

          const alsLid = await g.lid.db
            .from('weekly_goals')
            .select('id, status')
            .eq('goal_id', g.gekoppeldDoelId);

          const zichtbareIds = new Set((alsLid.data ?? []).map((w) => w.id));

          for (const { status, zichtbaar } of verwacht) {
            expect(zichtbareIds.has(rijen.get(status) ?? ''), `${status} voor de groep`).toBe(
              zichtbaar,
            );
          }

          // ⚠️ De tegentest die de hele test pas iets laat bewijzen: de eigenaar
          //    ziet ze alle zeven. Een adempauze is privé, niet onvindbaar.
          const alsEigenaar = await g.eigenaar.db
            .from('weekly_goals')
            .select('id')
            .in('id', [...rijen.values()]);

          expect(alsEigenaar.data ?? []).toHaveLength(verwacht.length);

          // Opruimen, want deze rijen zouden de tellingen in andere tests
          // vervuilen — `goal_dashboard` telt over álle weken van het doel.
          await admin
            .from('weekly_goals')
            .delete()
            .in('id', [...rijen.values()]);
        },
        TEST_TIMEOUT,
      );

      /**
       * ⚠️ De tweede route naar dezelfde kamer, en de reden dat migratie 0047
       *    er maar één hoefde te repareren. `goal_dashboard` staat op
       *    `security_invoker = true`, dus zijn subquery's tellen onder de RLS van
       *    wie hem bevraagt. Zou die vlag ooit omgezet worden, dan telt de view
       *    ineens ook de verborgen weken mee en is het verschil
       *    `weekly_total - weekly_approved` weer een lek.
       */
      it(
        'telt in goal_dashboard geen weken mee die de groep niet mag zien',
        async () => {
          const admin = adminDb();
          const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

          // ⚠️ Eerst meten, dan pas invoegen. Een eerdere test in dit bestand
          //    laat een `missed`-week op ditzelfde doel staan, dus een absolute
          //    verwachting ("het verschil is twee") hangt aan de volgorde waarin
          //    de tests draaien. Het verschil vóór en ná is dat niet.
          const voorLid = await g.lid.db
            .from('goal_dashboard')
            .select('weekly_total')
            .eq('id', g.gekoppeldDoelId)
            .single();

          const voorEigenaar = await g.eigenaar.db
            .from('goal_dashboard')
            .select('weekly_total')
            .eq('id', g.gekoppeldDoelId)
            .single();

          const verborgen = await Promise.all(
            (['missed', 'excused'] as const).map(async (status, i) =>
              mustId(
                await admin
                  .from('weekly_goals')
                  .insert({
                    goal_id: g.gekoppeldDoelId,
                    title: `Onzichtbaar ${status}`,
                    cycle_start_date: addDays(basis.startDate, -7 * (i + 30)),
                    cycle_index: 40 + i,
                    status,
                  })
                  .select('id')
                  .single(),
                `dashboardweek ${status}`,
              ),
            ),
          );

          const naLid = await g.lid.db
            .from('goal_dashboard')
            .select('weekly_total')
            .eq('id', g.gekoppeldDoelId)
            .single();

          const naEigenaar = await g.eigenaar.db
            .from('goal_dashboard')
            .select('weekly_total')
            .eq('id', g.gekoppeldDoelId)
            .single();

          // De eigenaar telt er twee bij: zijn eigen `missed` en `excused`.
          expect(
            (naEigenaar.data?.weekly_total ?? 0) - (voorEigenaar.data?.weekly_total ?? 0),
          ).toBe(2);

          // Het lid telt er geen enkele bij. Dát is de bescherming: de twee
          // weken bestaan wel, maar niet in zijn telling.
          expect((naLid.data?.weekly_total ?? 0) - (voorLid.data?.weekly_total ?? 0)).toBe(0);

          await admin.from('weekly_goals').delete().in('id', verborgen);
        },
        TEST_TIMEOUT,
      );

      /**
       * De N+1-valkuil die het beslisdocument met naam noemt (§3), met een
       * queryteller ernaast.
       *
       * ⚠️ Twaalf leden, want dat is de bovengrens van een groep. Met twee leden
       *    zou een implementatie die per lid opnieuw bevraagt er net zo goed
       *    uitzien.
       */
      it(
        'levert twaalf leden in precies één verzoek',
        async () => {
          const admin = adminDb();
          const vol = await createGroup(g.eigenaar, 'Volle groep');

          // ⚠️ Profielen zónder aanmelding, en lidmaatschap er rechtstreeks in.
          //    Deze elf zijn opvulling: wat deze test bewíjst is dat het
          //    groepsoverzicht twaalf leden in één verzoek levert, niet hóé ze
          //    lid geworden zijn — toetreden met een code wordt elders getest,
          //    mét echte tokens. Elf aanmeldingen minder, en de suite zat op 43
          //    tegen een limiet van ongeveer dertig per uur (A47).
          const nieuwe = await Promise.all(
            Array.from({ length: 11 }, (_, i) => createTestProfile(`vol-${i}`)),
          );

          const gezet = await admin.from('group_members').insert(
            nieuwe.map((lid) => ({
              group_id: vol.id,
              user_id: lid.id,
              role: 'member',
              status: 'active',
            })),
          );
          if (gezet.error) throw new Error(`leden toevoegen mislukte: ${gezet.error.message}`);

          const leden = await admin
            .from('group_members')
            .select('user_id')
            .eq('group_id', vol.id);
          expect(leden.data ?? []).toHaveLength(12);

          // ⚠️ De teller. `fetch` wordt hier tijdelijk vervangen, zodat er niet
          //    geredeneerd hoeft te worden over hoeveel rondes het kost — het
          //    wordt geteld.
          const echteFetch = globalThis.fetch;
          let verzoeken = 0;
          globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
            verzoeken += 1;
            return echteFetch(...args);
          }) as typeof fetch;

          try {
            const { data, error } = await g.eigenaar.db.rpc('group_overview', {
              p_group_id: vol.id,
              p_period_start: PERIODE,
            });

            expect(error).toBeNull();
            expect(data ?? []).toHaveLength(12);
            expect(verzoeken).toBe(1);
          } finally {
            globalThis.fetch = echteFetch;
          }
        },
        SETUP_TIMEOUT,
      );

      // 5.3: koppelen is de toestemming. Zonder koppeling staat een doel in geen
      // enkele ledenlijst, ook niet van een groep waar de eigenaar wél in zit.
      it(
        'toont alleen het doel dat aan déze groep gekoppeld is',
        async () => {
          const { data } = await g.lid.db.rpc('group_overview', {
            p_group_id: g.groupId,
            p_period_start: PERIODE,
          });

          const eigenaarsRij = (data ?? []).find((r) => r.user_id === g.eigenaar.id);

          expect(eigenaarsRij?.goal_id).toBe(g.gekoppeldDoelId);
          expect(eigenaarsRij?.goal_title).toBe('Gekoppeld doel');
          expect((data ?? []).map((r) => r.goal_id)).not.toContain(g.losDoelId);
        },
        TEST_TIMEOUT,
      );
    });

    // -----------------------------------------------------------------------
    // 5.8 — de gastvrije uitnodigingslink
    // -----------------------------------------------------------------------

    describe('de uitnodigingspagina zonder account', () => {
      interface Preview {
        group_name: string;
        member_count: number;
        detailed: boolean;
        members: readonly {
          display_name: string;
          avatar_url: string | null;
          goal_title: string | null;
        }[];
      }

      it(
        'toont de groep aan iemand die niet ingelogd is',
        async () => {
          const { data, error } = await anonDb().rpc('invite_preview', { code: g.code });

          expect(error).toBeNull();
          expect(data).not.toBeNull();

          const preview = data as unknown as Preview;

          expect(preview.group_name).toBe('Buddygroep');
          expect(preview.member_count).toBe(2);
          expect(preview.detailed).toBe(false);
          expect(preview.members).toHaveLength(2);
        },
        TEST_TIMEOUT,
      );

      /**
       * ⚠️ Bevinding van de security-review, gedicht in 0019. De redenering in
       *    0016 klopte binnen zijn eigen kader ("koppelen is de toestemming; deze
       *    functie rekt die niet op") en was toch verkeerd: koppelen is
       *    toestemming voor de gróép, en deze functie maakte er toestemming van
       *    voor iedereen aan wie de link ooit doorgestuurd wordt.
       */
      it(
        'geeft zonder account geen doeltitels, achternamen of avatars',
        async () => {
          const { data } = await anonDb().rpc('invite_preview', { code: g.code });
          const preview = data as unknown as Preview;

          for (const lid of preview.members) {
            expect(lid.goal_title).toBeNull();
            expect(lid.avatar_url).toBeNull();
            // Een voornaam en niet de volledige naam: "Test groep-eigenaar"
            // wordt "Test".
            expect(lid.display_name).not.toContain(' ');
          }
        },
        TEST_TIMEOUT,
      );

      // De toelating die daarbij hoort: wie ingelogd is, ziet wél het volledige
      // beeld. Zonder deze test zou het dichtzetten van de anonieme kant
      // ongemerkt ook de feature zelf kunnen slopen.
      it(
        'toont een ingelogde bezoeker wél de doeltitels',
        async () => {
          const { data } = await g.buitenstaander.db.rpc('invite_preview', { code: g.code });
          const preview = data as unknown as Preview;

          expect(preview.detailed).toBe(true);
          expect(preview.members.map((m) => m.goal_title)).toContain('Gekoppeld doel');
        },
        TEST_TIMEOUT,
      );

      // ⚠️ Dit is het enige eindpunt van de app dat zonder account bereikbaar is.
      //    Alles wat "hoe gáát het met je" beantwoordt, hoort binnen de groep te
      //    blijven — domeinregel 7 en 10.
      // ⚠️ Op de sleutelverzameling en niet op de tekst van de JSON. Een test die
      //    `toContain('status')` doet op het hele antwoord, wordt rood zodra een
      //    testgebruiker "Status Tracker" heet — en dan is het een test die je
      //    leert testen te wantrouwen.
      it(
        'lekt geen reeksen, punten of weekstatus',
        async () => {
          const { data } = await anonDb().rpc('invite_preview', { code: g.code });

          const sleutels = new Set<string>();
          const loop = (waarde: unknown): void => {
            if (Array.isArray(waarde)) {
              waarde.forEach(loop);
              return;
            }
            if (waarde !== null && typeof waarde === 'object') {
              for (const [sleutel, inhoud] of Object.entries(waarde)) {
                sleutels.add(sleutel);
                loop(inhoud);
              }
            }
          };
          loop(data);

          for (const verboden of [
            'current_streak',
            'best_streak',
            'total_points',
            'last_cycle_start',
            'invite_code',
            'weekly_goals',
          ]) {
            expect([...sleutels], `preview bevat ${verboden}`).not.toContain(verboden);
          }

          // En het positieve tegenwicht: wat er wél hoort te staan, staat er.
          expect([...sleutels]).toContain('group_name');
          expect([...sleutels]).toContain('member_count');
        },
        TEST_TIMEOUT,
      );

      it(
        'geeft niets terug bij een ingetrokken of onbekende code',
        async () => {
          const onbekend = await anonDb().rpc('invite_preview', { code: onbekendeCode() });
          const ingetrokken = await anonDb().rpc('invite_preview', { code: f.revokedCode });

          expect(onbekend.data).toBeNull();
          expect(ingetrokken.data).toBeNull();
          expect(onbekend.error).toBeNull();
          expect(ingetrokken.error).toBeNull();
        },
        TEST_TIMEOUT,
      );

      // Zien is niet meedoen. De preview geeft de groeps-id terug zodat de app
      // na aanmelden weet waar hij heen moet — maar lidmaatschap loopt nog
      // steeds uitsluitend via join_group_with_code, en die eist een sessie.
      it(
        'geeft geen toegang tot de groep zelf',
        async () => {
          const anon = anonDb();

          const leden = await anon.from('group_members').select('*').eq('group_id', g.groupId);
          const groep = await anon.from('groups').select('*').eq('id', g.groupId);

          expect(leden.data ?? []).toHaveLength(0);
          expect(groep.data ?? []).toHaveLength(0);
        },
        TEST_TIMEOUT,
      );
    });

    // -----------------------------------------------------------------------
    // 5.9 — slapende groepen
    // -----------------------------------------------------------------------

    describe('slapende groepen', () => {
      it(
        'gaat slapen na dertig stille dagen en wordt wakker van één afsluiting',
        async () => {
          const admin = adminDb();
          const stille = await createGroup(g.eigenaar, 'Stille groep');

          // Terug in de tijd. Dit is de enige manier om dertig dagen stilte na te
          // bootsen zonder dertig dagen te wachten; de systeemclient mag het,
          // want `last_activity_at` ligt voor de client vast (groups_guard).
          mustOk(
            await admin
              .from('groups')
              .update({ last_activity_at: '2026-01-01T00:00:00Z' })
              .eq('id', stille.id),
            'activiteit terugzetten',
          );

          mustOk(await admin.rpc('slaap_stille_groepen', { p_dagen: 30 }), 'groepen laten slapen');

          const geslapen = await admin
            .from('groups')
            .select('status')
            .eq('id', stille.id)
            .single();
          expect(geslapen.data?.status).toBe('sleeping');

          // Precies één afscheidsbericht, en het noemt niemand bij naam.
          const berichten = await admin
            .from('chat_messages')
            .select('body, type, system_event, sender_id')
            .eq('group_id', stille.id);

          expect(berichten.data ?? []).toHaveLength(1);
          expect(berichten.data?.[0]?.system_event).toBe('group_sleeping');
          expect(berichten.data?.[0]?.sender_id).toBeNull();

          // ⚠️ En het bericht wekt de groep niet. Zou de wek-trigger ook op
          //    systeemberichten afgaan, dan zou hier `active` staan en sliep er
          //    nooit iets — een bug die zich voordoet als "werkt niet".
          expect(geslapen.data?.status).toBe('sleeping');

          // Eén kettingschakel van welk lid dan ook wekt hem.
          mustOk(
            await admin.from('chain_links').insert({
              group_id: stille.id,
              user_id: g.eigenaar.id,
              group_period_start: '2026-08-16',
            }),
            'kettingschakel leggen',
          );

          const wakker = await admin.from('groups').select('status').eq('id', stille.id).single();
          expect(wakker.data?.status).toBe('active');
        },
        SETUP_TIMEOUT,
      );
    });
  });

  // -------------------------------------------------------------------------
  // EPIC 6 — peer-goedkeuring (migratie 0021)
  // -------------------------------------------------------------------------
  //
  // ⚠️ QS8-68 vraagt vier gevallen met naam: zelfgoedkeuring, goedkeuren door
  //    een niet-lid, goedkeuren ná vertrek uit de groep, en goedkeuren van een
  //    ontkoppeld doel. De eerste twee stonden al in dit bestand; de laatste
  //    twee zijn nieuw, en het zijn precies de twee die je vergeet omdat ze een
  //    tussenstap nodig hebben.

  describe('peer-goedkeuring', () => {
    interface Beoordeling {
      eigenaar: TestUser;
      buddy: TestUser;
      vreemde: TestUser;
      /** Lid dat in één test de groep verlaat; daarna niet meer bruikbaar. */
      vertrekker: TestUser;
      /** Lid dat in één test op inactief wordt gezet; daarna niet meer bruikbaar. */
      inactieveling: TestUser;
      /** Derde lid, om te zien dat een verzoek verdwijnt als een ander goedkeurt. */
      derde: TestUser;
      groupId: string;
      goalId: string;
      weeklyGoalId: string;
      completionId: string;
    }

    let vast: Omit<Beoordeling, 'goalId' | 'weeklyGoalId' | 'completionId'>;

    /**
     * ⚠️ Gebruikers en groep één keer, doelen per test.
     *
     *    De eerste versie maakte per test drie accounts aan. Dat is dertig
     *    aanmeldingen in een halve minuut, en Supabase antwoordt dan met
     *    "Request rate limit reached" — vijf tests vielen om op een limiet die
     *    niets met de policies te maken had. Bovendien loopt de eigenaar dan
     *    tegen zijn tien-groepen-per-dag aan.
     *
     *    Doelen, weekdoelen en voltooiingen zijn wél per test: goedkeuren is
     *    onomkeerbaar, dus twee tests die dezelfde voltooiing delen, meten
     *    elkaar in plaats van de database.
     */
    beforeAll(async () => {
      if (!rlsTestsConfigured) return;

      const [eigenaar, buddy, vreemde, vertrekker, inactieveling, derde] = await Promise.all([
        createTestUser('po-eigenaar'),
        createTestUser('po-buddy'),
        createTestUser('po-vreemde'),
        createTestUser('po-vertrekker'),
        createTestUser('po-inactief'),
        createTestUser('po-derde'),
      ]);

      const groep = await createGroup(eigenaar, 'Goedkeuringsgroep');
      for (const [lid, naam] of [
        [buddy, 'buddy'],
        [vertrekker, 'vertrekker'],
        [inactieveling, 'inactieveling'],
        [derde, 'derde'],
      ] as const) {
        mustJoin(await lid.db.rpc('join_group_with_code', { code: groep.code }), `${naam} erbij`);
      }

      // ⚠️ Vertrekken en op inactief gezet worden zijn twee verschillende routes,
      //    en ze krijgen daarom elk hun eigen lid. Zouden ze er één delen, dan
      //    slaagt de tweede test omdat de eerste al iets kapotmaakte — en dan
      //    bewijst hij niets over het pad dat hij zegt te toetsen.
      vast = { eigenaar, buddy, vreemde, vertrekker, inactieveling, derde, groupId: groep.id };
    }, SETUP_TIMEOUT);

    /**
     * Een vers doel met een weekdoel en een ingediende voltooiing, in de gedeelde
     * groep. `cycle_index` is willekeurig uniek zodat twee tests elkaar niet in
     * de weg zitten.
     */
    async function bouwBeoordeling(naam: string): Promise<Beoordeling> {
      const admin = adminDb();
      const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

      const goalId = mustId(
        await vast.eigenaar.db
          .from('goals')
          .insert({
            owner_id: vast.eigenaar.id,
            title: `Doel ${naam}`,
            target_date: cycle.endDate,
          })
          .select('id')
          .single(),
        'doel',
      );

      mustOk(
        await vast.eigenaar.db
          .from('goal_group_links')
          .insert({ goal_id: goalId, group_id: vast.groupId }),
        'doel koppelen',
      );

      const weeklyGoalId = mustId(
        await vast.eigenaar.db
          .from('weekly_goals')
          .insert({
            goal_id: goalId,
            title: 'Week van de test',
            cycle_start_date: cycle.startDate,
            cycle_index: 1,
          })
          .select('id')
          .single(),
        'weekdoel',
      );

      const completionId = mustId(
        await vast.eigenaar.db
          .from('completions')
          .insert({
            weekly_goal_id: weeklyGoalId,
            user_id: vast.eigenaar.id,
            achieved_level: 'ceiling',
            note: 'Gedaan wat ik zei',
            cycle_start_date: cycle.startDate,
          })
          .select('id')
          .single(),
        'voltooiing',
      );

      mustOk(
        await admin.from('weekly_goals').update({ status: 'pending' }).eq('id', weeklyGoalId),
        'weekdoel op pending',
      );

      return { ...vast, goalId, weeklyGoalId, completionId };
    }

    // -----------------------------------------------------------------------
    // 6.7 — de autorisatiegrens
    // -----------------------------------------------------------------------

    it(
      'laat een buddy goedkeuren, en boekt punten voor allebei',
      async () => {
        const b = await bouwBeoordeling('goed');
        const admin = adminDb();

        const { error } = await b.buddy.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.buddy.id,
          subject_id: b.buddy.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).toBeNull();

        // De trigger doet alles in dezelfde transactie: status, punten voor de
        // eigenaar, reviewpunt voor de beoordelaar.
        const week = await admin
          .from('weekly_goals')
          .select('status')
          .eq('id', b.weeklyGoalId)
          .single();
        expect(week.data?.status).toBe('approved');

        const punten = await admin
          .from('points_ledger')
          .select('user_id, delta, reason, goal_id')
          .eq('ref_id', b.weeklyGoalId);
        expect(punten.data ?? []).toHaveLength(1);
        expect(punten.data?.[0]?.user_id).toBe(b.eigenaar.id);
        expect(punten.data?.[0]?.delta).toBe(2);

        // ⚠️ Het reviewpunt hangt aan géén doel. Zou het `goal_id` dragen, dan
        //    telde het mee in de reeks en het totaal van een doel waar het niets
        //    mee te maken heeft (6.6).
        const review = await admin
          .from('points_ledger')
          .select('user_id, delta, goal_id')
          .eq('reason', 'review_given')
          .eq('ref_id', b.completionId);
        expect(review.data ?? []).toHaveLength(1);
        expect(review.data?.[0]?.user_id).toBe(b.buddy.id);
        expect(review.data?.[0]?.delta).toBe(1);
        expect(review.data?.[0]?.goal_id).toBeNull();
      },
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ De zwaarste bevinding van de security-review op EPIC 6, en de kern van
     *    domeinregel 3. Goedkeuren zelf was drievoudig op slot, maar het
     *    *effect* ervan — `weekly_goals.status = 'approved'` — was met één
     *    PATCH-verzoek door de eigenaar te zetten. Geen buddy nodig, en de reeks
     *    die de groep van je ziet daarmee zelf te verzinnen.
     *
     *    Gedicht in 0023 met een kolomgrant. Deze test is de reden dat hij niet
     *    ongemerkt terugkomt.
     */
    it(
      'laat de eigenaar zijn eigen weekdoel niet goedkeuren met een update',
      async () => {
        const b = await bouwBeoordeling('achterdeur');
        const admin = adminDb();

        for (const status of ['approved', 'excused'] as const) {
          await b.eigenaar.db
            .from('weekly_goals')
            .update({ status })
            .eq('id', b.weeklyGoalId);
        }

        const week = await admin
          .from('weekly_goals')
          .select('status')
          .eq('id', b.weeklyGoalId)
          .single();
        expect(week.data?.status).toBe('pending');

        // De toelating die erbij hoort: de titel mag hij wél bijwerken, anders
        // is dit geen kolomslot maar een tafelslot.
        const titel = await b.eigenaar.db
          .from('weekly_goals')
          .update({ title: 'Nieuwe titel' })
          .eq('id', b.weeklyGoalId);
        expect(titel.error).toBeNull();
      },
      SETUP_TIMEOUT,
    );

    // ⚠️ Ook uit de security-review: goedkeuren mocht op een voltooiing die de
    //    eigenaar zélf had ingetrokken. Dat gaf punten voor een bewering die niet
    //    meer bestond. De wachtrij filterde hem wel, de policy niet — precies het
    //    patroon dat 0006, 0007 en 0019 al drie keer dichtten.
    it(
      'laat een buddy geen ingetrokken voltooiing goedkeuren',
      async () => {
        const b = await bouwBeoordeling('ingetrokken');

        const opnieuw = await b.eigenaar.db.rpc('dien_opnieuw_in', {
          p_weekly_goal_id: b.weeklyGoalId,
          p_achieved_level: 'floor',
          p_note: 'Toch alleen de vloer',
        });
        expect(uitkomst(opnieuw.data).ok).toBe(true);

        const { error } = await b.buddy.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.buddy.id,
          subject_id: b.buddy.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      SETUP_TIMEOUT,
    );

    // ⚠️ De bestaande vertrek-test gebruikt `.delete()`, en dat is zelf-vertrek.
    //    De route die een beheerder neemt om iemand eruit te zetten, is
    //    `status = 'inactive'` — en die was niet gedekt. Een groene test die het
    //    verkeerde pad neemt, is geen bewijs.
    it(
      'laat een op inactief gezet lid niet goedkeuren',
      async () => {
        const b = await bouwBeoordeling('inactief');
        const admin = adminDb();

        mustOk(
          await admin
            .from('group_members')
            .update({ status: 'inactive' })
            .eq('group_id', b.groupId)
            .eq('user_id', b.inactieveling.id),
          'lid op inactief zetten',
        );

        const { error } = await b.inactieveling.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.inactieveling.id,
          subject_id: b.inactieveling.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      SETUP_TIMEOUT,
    );

    it(
      'laat de eigenaar zichzelf niet goedkeuren',
      async () => {
        const b = await bouwBeoordeling('zelf');

        const { error } = await b.eigenaar.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.eigenaar.id,
          subject_id: b.eigenaar.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();

        const week = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', b.weeklyGoalId)
          .single();
        expect(week.data?.status).toBe('pending');
      },
      SETUP_TIMEOUT,
    );

    it(
      'laat een niet-lid niet goedkeuren',
      async () => {
        const b = await bouwBeoordeling('vreemd');

        const { error } = await b.vreemde.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.vreemde.id,
          subject_id: b.vreemde.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      SETUP_TIMEOUT,
    );

    // ⚠️ Nieuw geval uit QS8-68, en het is het lastigste van de vier: iemand die
    //    de groep verlaat, houdt zijn kennis van de id's. Zou lidmaatschap
    //    alleen bij het openen van het scherm getoetst worden, dan kan hij
    //    daarna nog goedkeuren met een oude id in de hand.
    it(
      'laat iemand niet goedkeuren nadat hij de groep verlaten heeft',
      async () => {
        const b = await bouwBeoordeling('vertrek');

        // ⚠️ Een eigen lid dat alléén hier gebruikt wordt. Zou de gewone buddy
        //    vertrekken, dan is hij daarna geen lid meer en meten alle tests
        //    hierna iets anders dan ze denken.
        mustOk(
          await b.vertrekker.db
            .from('group_members')
            .delete()
            .eq('group_id', b.groupId)
            .eq('user_id', b.vertrekker.id),
          'vertrekker verlaat de groep',
        );

        const { error } = await b.vertrekker.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.vertrekker.id,
          subject_id: b.vertrekker.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      SETUP_TIMEOUT,
    );

    // ⚠️ Vierde geval uit QS8-68. Ontkoppelen is het intrekken van toestemming
    //    (5.3); daarna hoort niemand er nog iets mee te kunnen. Dit is precies
    //    het pad dat opengaat doordat EPIC 5 een ontkoppelknop heeft gekregen.
    it(
      'laat een buddy niet goedkeuren nadat het doel ontkoppeld is',
      async () => {
        const b = await bouwBeoordeling('ontkoppeld');

        mustOk(
          await b.eigenaar.db
            .from('goal_group_links')
            .delete()
            .eq('goal_id', b.goalId)
            .eq('group_id', b.groupId),
          'doel ontkoppelen',
        );

        const { error } = await b.buddy.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.buddy.id,
          subject_id: b.buddy.id,
          group_id: b.groupId,
          status: 'approved',
        });

        expect(error).not.toBeNull();
      },
      SETUP_TIMEOUT,
    );

    it(
      'staat geen tweede stem van dezelfde beoordelaar toe',
      async () => {
        const b = await bouwBeoordeling('dubbel');

        const eerste = await b.buddy.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.buddy.id,
          subject_id: b.buddy.id,
          group_id: b.groupId,
          status: 'more_info',
          comment: 'Hoe ver ben je gekomen?',
        });
        expect(eerste.error).toBeNull();

        const tweede = await b.buddy.db.from('completion_approvals').insert({
          completion_id: b.completionId,
          approver_id: b.buddy.id,
          subject_id: b.buddy.id,
          group_id: b.groupId,
          status: 'approved',
        });
        expect(tweede.error).not.toBeNull();

        // ⚠️ "Vertel me meer" is geen goedkeuring: de week blijft op pending en
        //    er zijn geen punten voor de eigenaar geboekt.
        const admin = adminDb();
        const week = await admin
          .from('weekly_goals')
          .select('status')
          .eq('id', b.weeklyGoalId)
          .single();
        expect(week.data?.status).toBe('pending');

        const punten = await admin
          .from('points_ledger')
          .select('id')
          .eq('ref_id', b.weeklyGoalId);
        expect(punten.data ?? []).toHaveLength(0);

        // Maar de beoordelaar krijgt zijn punt wél: doorvragen is betrokkenheid
        // en hoort niet duurder te zijn dan wegkijken (6.6).
        const review = await admin
          .from('points_ledger')
          .select('id')
          .eq('reason', 'review_given')
          .eq('ref_id', b.completionId);
        expect(review.data ?? []).toHaveLength(1);
      },
      SETUP_TIMEOUT,
    );

    // -----------------------------------------------------------------------
    // 6.1 — de wachtrij
    // -----------------------------------------------------------------------

    it(
      'zet een afgeronde week in de wachtrij van de buddy en niet in die van de indiener',
      async () => {
        const b = await bouwBeoordeling('wachtrij');

        const vanBuddy = await b.buddy.db.rpc('openstaande_beoordelingen', {});
        const vanEigenaar = await b.eigenaar.db.rpc('openstaande_beoordelingen', {});
        const vanVreemde = await b.vreemde.db.rpc('openstaande_beoordelingen', {});

        expect((vanBuddy.data ?? []).map((r) => r.completion_id)).toContain(b.completionId);
        expect((vanEigenaar.data ?? []).map((r) => r.completion_id)).not.toContain(b.completionId);
        expect((vanVreemde.data ?? []).map((r) => r.completion_id)).not.toContain(b.completionId);

        // Het bewijs zit er meteen bij, zodat beoordelen geen tweede verzoek kost.
        const rij = (vanBuddy.data ?? []).find((r) => r.completion_id === b.completionId);
        expect(rij?.note).toBe('Gedaan wat ik zei');
        expect(rij?.weekly_title).toBe('Week van de test');
      },
      SETUP_TIMEOUT,
    );

    it(
      'haalt het verzoek uit de wachtrij zodra iemand anders goedkeurt',
      async () => {
        const b = await bouwBeoordeling('verdwijnt');
        const derde = b.derde;

        const voor = await derde.db.rpc('openstaande_beoordelingen', {});
        expect((voor.data ?? []).map((r) => r.completion_id)).toContain(b.completionId);

        mustOk(
          await b.buddy.db.from('completion_approvals').insert({
            completion_id: b.completionId,
            approver_id: b.buddy.id,
            subject_id: b.buddy.id,
            group_id: b.groupId,
            status: 'approved',
          }),
          'buddy keurt goed',
        );

        const na = await derde.db.rpc('openstaande_beoordelingen', {});
        expect((na.data ?? []).map((r) => r.completion_id)).not.toContain(b.completionId);
      },
      SETUP_TIMEOUT,
    );

    // -----------------------------------------------------------------------
    // 6.5 — de bewijseis
    // -----------------------------------------------------------------------

    // ⚠️ Dit was clientlogica: `rondAf()` kreeg de bewijseis als parameter mee.
    //    Een client die de regel meelevert waaraan hij getoetst wordt, is geen
    //    regel maar een verzoek — dezelfde fout die 0006 en 0007 vier keer
    //    hebben gedicht.
    it(
      'weigert een afronding zonder notitie als de groep die eist',
      async () => {
        const b = await bouwBeoordeling('bewijs');
        const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

        const tweede = mustId(
          await b.eigenaar.db
            .from('weekly_goals')
            .insert({
              goal_id: b.goalId,
              title: 'Week zonder notitie',
              cycle_start_date: cycle.startDate,
              cycle_index: 2,
            })
            .select('id')
            .single(),
          'tweede weekdoel',
        );

        const zonder = await b.eigenaar.db.from('completions').insert({
          weekly_goal_id: tweede,
          user_id: b.eigenaar.id,
          achieved_level: 'floor',
          note: null,
          cycle_start_date: cycle.startDate,
        });
        expect(zonder.error).not.toBeNull();

        // De toelating die erbij hoort: mét notitie mag het gewoon.
        const met = await b.eigenaar.db.from('completions').insert({
          weekly_goal_id: tweede,
          user_id: b.eigenaar.id,
          achieved_level: 'floor',
          note: 'De vloer gehaald',
          cycle_start_date: cycle.startDate,
        });
        expect(met.error).toBeNull();
      },
      SETUP_TIMEOUT,
    );

    // -----------------------------------------------------------------------
    // 6.2 — opnieuw indienen
    // -----------------------------------------------------------------------

    it(
      'vervangt een voltooiing zonder de oude te wissen',
      async () => {
        const b = await bouwBeoordeling('opnieuw');
        const admin = adminDb();

        const antwoord = await b.eigenaar.db.rpc('dien_opnieuw_in', {
          p_weekly_goal_id: b.weeklyGoalId,
          p_achieved_level: 'floor',
          p_note: 'Toch alleen de vloer, sorry',
        });

        expect(antwoord.error?.message ?? null).toBeNull();

        const uit = uitkomst(antwoord.data);
        expect(uit.ok).toBe(true);

        const alles = await admin
          .from('completions')
          .select('id, superseded_by, achieved_level')
          .eq('weekly_goal_id', b.weeklyGoalId);

        // Domeinregel 6: de oude rij staat er nog en wijst naar de nieuwe.
        expect(alles.data ?? []).toHaveLength(2);
        const oud = (alles.data ?? []).find((c) => c.id === b.completionId);
        expect(oud?.superseded_by).not.toBeNull();

        const actief = (alles.data ?? []).filter((c) => c.superseded_by === null);
        expect(actief).toHaveLength(1);
        expect(actief[0]?.achieved_level).toBe('floor');
      },
      SETUP_TIMEOUT,
    );

    // ⚠️ Deze test vond een echte fout in mijn eigen functie: een
    //    exception-blok in PL/pgSQL rolt alleen zijn eigen werk terug. De eerste
    //    versie zette de oude voltooiing opzij, ving de bewijseis-fout op en
    //    liet zo een weekdoel achter met nul actieve voltooiingen.
    it(
      'laat bij een geweigerde notitie geen weekdoel zonder actieve voltooiing achter',
      async () => {
        const b = await bouwBeoordeling('herstel');

        const antwoord = await b.eigenaar.db.rpc('dien_opnieuw_in', {
          p_weekly_goal_id: b.weeklyGoalId,
          p_achieved_level: 'floor',
        });

        expect(uitkomst(antwoord.data).ok).toBe(false);
        expect(uitkomst(antwoord.data).reason).toBe('note_required');

        const actief = await adminDb()
          .from('completions')
          .select('id')
          .eq('weekly_goal_id', b.weeklyGoalId)
          .is('superseded_by', null);

        expect(actief.data ?? []).toHaveLength(1);
        expect(actief.data?.[0]?.id).toBe(b.completionId);
      },
      SETUP_TIMEOUT,
    );

    it(
      'laat een ander niet opnieuw indienen namens jou',
      async () => {
        const b = await bouwBeoordeling('namens');

        const antwoord = await b.buddy.db.rpc('dien_opnieuw_in', {
          p_weekly_goal_id: b.weeklyGoalId,
          p_achieved_level: 'floor',
          p_note: 'Ik doe het wel even',
        });

        expect(uitkomst(antwoord.data).ok).toBe(false);
        expect(uitkomst(antwoord.data).reason).toBe('not_owner');
      },
      SETUP_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-130 — TRUNCATE en TRIGGER
  // -------------------------------------------------------------------------

  describe('DDL-rechten', () => {
    /**
     * ⚠️ **TRUNCATE is niet onderworpen aan RLS.** Een rol die het heeft, leegt de
     *    tabel ongeacht welke policy erop staat — ook `points_ledger`,
     *    `completions` en `chat_messages`. `authenticated` had het tot 24-08 op
     *    alle 29 tabellen, als erfenis van de standaardrechten van het platform.
     *
     *    Migratie 0073 trekt het in, én past de standaardrechten aan zodat de
     *    volgende tabel het niet opnieuw krijgt. Die tweede helft is de reden dat
     *    dit een test verdient: zonder haar is de reparatie tijdelijk.
     */
    it(
      'geeft anon en authenticated geen TRUNCATE of TRIGGER',
      async () => {
        const { data, error } = await adminDb().rpc('ddl_rechten_in_de_api');

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De toelating naast de weigering. Zonder deze test wordt het blok
     *    hierboven groen zodra de functie helemaal niet meer bestaat.
     */
    it(
      'laat service_role de rechten wél houden',
      async () => {
        const { data, error } = await adminDb().rpc('ddl_rechten_van_service_role');

        expect(error).toBeNull();
        expect(data).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'staat niet open voor een ingelogde gebruiker',
      async () => {
        const { error } = await f.alice.db.rpc('ddl_rechten_in_de_api');

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-122 — het migratieregister
  // -------------------------------------------------------------------------

  describe('het migratieregister', () => {
    /**
     * ⚠️ `migratieregister()` is SECURITY DEFINER en leest een systeemtabel.
     *    Zonder de revoke in migratie 0072 staat hij als RPC in de API en kan
     *    élke ingelogde gebruiker de volledige migratiegeschiedenis van dit
     *    project uitlezen — inclusief de namen van elke grendel die er ooit op
     *    gezet is.
     *
     *    Dat is de klasse fout die 0011, 0052 en 0069 kwamen dichten, en de reden
     *    dat CLAUDE.md regel 19 zegt: **een nieuwe SECURITY DEFINER-functie erft
     *    niets.**
     */
    it(
      'staat niet open voor een ingelogde gebruiker',
      async () => {
        const { error } = await f.alice.db.rpc('migratieregister');

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'staat niet open zonder sessie',
      async () => {
        const { error } = await anonDb().rpc('migratieregister');

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De toelating bij de twee weigeringen hierboven. Zonder deze test wordt
     *    dit blok groen zodra de functie helemaal niet meer bestaat — en dan
     *    bewaakt hij niets meer, terwijl `register:controle` stilletjes omvalt.
     */
    it(
      'is wél leesbaar met de service-role-key en levert genummerde versies',
      async () => {
        const { data, error } = await adminDb().rpc('migratieregister');

        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThan(70);

        // Eén nummering: vier cijfers, eventueel met een letter (`0052a`).
        for (const rij of data ?? []) {
          expect(rij.versie, `versie ${rij.versie} (${rij.naam})`).toMatch(/^\d{4}[a-z]?$/);
        }
      },
      TEST_TIMEOUT,
    );
  });
  /**
   * De doelstatussen — bevinding van 21-08-2026, gesloten door migratie 0082.
   *
   * ⚠️ `goals_select` is `owner_id = auth.uid() or shares_group_with_goal(id)`,
   *    dus een groepsgenoot leest de héle rij van een gekoppeld doel — de
   *    statuskolom incluis. RLS kan geen kolommen beperken. Een tegenslagwaarde
   *    in die kolom is dus domeinregel 7 die de database uit loopt, en `missed`
   *    stond er tot 0082 in terwijl niets hem zette.
   *
   * ⚠️ **Een gelijkheidstoets en geen insluiting**, om dezelfde reden als bij de
   *    systeembericht-allowlist: twee insluitingen laten allebei één richting
   *    open, en de vorige keer dat twee zulke lijsten uit elkaar liepen
   *    (0032/0034) vergeleek de test de app-lijst met **zichzelf** en bleef
   *    groen.
   */
  describe('de doelstatussen', () => {
    it(
      'staat in de database exact toe wat de app kent',
      async () => {
        const { data, error } = await adminDb().rpc('check_waarden', {
          p_tabel: 'goals',
          p_constraint: 'goals_status_valid',
        });

        expect(error).toBeNull();

        const inDeDatabase = [...(data ?? [])].sort();
        const inDeApp = [...STATUSSEN].sort();

        // ⚠️ Eerst de inhoud vastpinnen. Een lege uitkomst betekent óók "geen
        //    constraint met die naam", en dan zou een kale vergelijking van twee
        //    lege lijsten groen zijn terwijl het slot weg is.
        expect(inDeDatabase).toEqual(['active', 'archived', 'completed']);
        expect(inDeDatabase).toEqual(inDeApp);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert missed, ook via de systeemclient',
      async () => {
        // ⚠️ Via `adminDb()` en niet via een gebruiker: `authenticated` mag deze
        //    kolom sinds 0035 sowieso niet schrijven, dus een geweigerde poging
        //    daar bewijst alleen de kolomgrant. De CHECK is de laag die ook een
        //    definer-functie tegenhoudt, en dát is wat hier getoetst wordt.
        const { error } = await adminDb()
          .from('goals')
          .update({ status: 'missed' })
          .eq('id', f.privateGoalId);

        expect(error).not.toBeNull();
        expect(error?.message ?? '').toContain('goals_status_valid');
      },
      TEST_TIMEOUT,
    );
  });
  /**
   * De dagelijkse bovengrens op weekdoelen — migratie 0083.
   *
   * ⚠️ Bevinding van 19-08-2026: `weekly_goals_insert` toetste alleen
   *    eigenaarschap, en `cycle_start_date` is vrij te kiezen. Eén ingelogd
   *    account kon in een lus tienduizenden rijen invoegen op een tier van
   *    500 MB zonder automatische backups. Beveiligingsregel 5 eist een limiet
   *    per gebruiker per dag; die stond er voor uitnodigingen (0008) en hier niet.
   *
   * ⚠️ **De voorraad wordt via de systeemclient gezet en niet via alice.** Zou de
   *    test tweehonderd keer als `authenticated` invoegen, dan toetst hij vooral
   *    zijn eigen doorlooptijd — en hij zou de grens raken tijdens het vullen, en
   *    dan is niet meer te zien of de laatste weigering de grens is of iets
   *    anders.
   */
  describe('de bovengrens op weekdoelen', () => {
    it(
      'laat een gewone dag ongemoeid en weigert de lus',
      async () => {
        const admin = adminDb();
        const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

        const doel = await admin
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'GRENS weekdoelen',
            target_date: addDays(basis.startDate, 30),
          })
          .select('id')
          .single();
        if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

        try {
          // Eerst de positieve kant: onder de grens gaat het gewoon door. Zonder
          // deze helft zou de test ook groen zijn als de policy álles weigert.
          const mag = await f.alice.db.from('weekly_goals').insert({
            goal_id: doel.data.id,
            title: 'GRENS ruim onder de grens',
            cycle_start_date: basis.startDate,
            cycle_index: 1,
          });
          expect(mag.error).toBeNull();

          // De voorraad tot aan de grens, via de systeemclient: die valt buiten
          // `weekly_goals_insert`, want die policy geldt alleen voor
          // `authenticated`. Dat is precies waarom de rollover er langs kan.
          const voorraad = Array.from({ length: 200 }, (_, i) => ({
            goal_id: doel.data.id,
            title: `GRENS voorraad ${i}`,
            cycle_start_date: basis.startDate,
            cycle_index: 1,
          }));
          const gevuld = await admin.from('weekly_goals').insert(voorraad);
          expect(gevuld.error).toBeNull();

          const teveel = await f.alice.db.from('weekly_goals').insert({
            goal_id: doel.data.id,
            title: 'GRENS over de grens',
            cycle_start_date: basis.startDate,
            cycle_index: 1,
          });
          expect(teveel.error).not.toBeNull();

          // ⚠️ En een andere week helpt niet. Dat is de hele reden dat de grens
          //    per dag telt en niet per cyclus: `cycle_start_date` is vrij te
          //    kiezen, dus een grens per week telt de datum op en gaat door.
          const andereWeek = await f.alice.db.from('weekly_goals').insert({
            goal_id: doel.data.id,
            title: 'GRENS andere week',
            cycle_start_date: addDays(basis.startDate, 7),
            cycle_index: 2,
          });
          expect(andereWeek.error).not.toBeNull();
        } finally {
          // ⚠️ Opruimen is hier geen netheid maar noodzaak: de grens telt per
          //    gebruiker, dus blijft de voorraad staan, dan kan alice in élke
          //    latere test geen weekdoel meer aanmaken.
          await admin.from('weekly_goals').delete().eq('goal_id', doel.data.id);
          await admin.from('goals').delete().eq('id', doel.data.id);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de systeemclient er wél langs, want de rollover moet door',
      async () => {
        const admin = adminDb();
        const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

        const doel = await admin
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'GRENS rollover',
            target_date: addDays(basis.startDate, 30),
          })
          .select('id')
          .single();
        if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

        try {
          const voorraad = Array.from({ length: 250 }, (_, i) => ({
            goal_id: doel.data.id,
            title: `GRENS rollover ${i}`,
            cycle_start_date: basis.startDate,
            cycle_index: 1,
          }));

          expect((await admin.from('weekly_goals').insert(voorraad)).error).toBeNull();
        } finally {
          await admin.from('weekly_goals').delete().eq('goal_id', doel.data.id);
          await admin.from('goals').delete().eq('id', doel.data.id);
        }
      },
      TEST_TIMEOUT,
    );
  });
  /**
   * De val die drie keer toesloeg — migratie 0086.
   *
   * ⚠️ Een BEFORE UPDATE-trigger die een kolom hard terugzet (`new.x := old.x`)
   *    sloopt `on delete set null` op diezelfde kolom: Postgres voert die actie
   *    uit als een gewone UPDATE, de trigger zet de oude waarde terug, en de
   *    foreign key weigert hem omdat het profiel net weg is. De hele DELETE valt
   *    om — en dat is precies wat `verwijder_mijn_account()` doet.
   *
   * ⚠️ **Dit is de vierde poging om dit te stoppen, en de eerste die geen
   *    aantekening is.** 0031, 0033 en 0059 liepen er alle drie in;
   *    WERKVOORRAAD §8 beschrijft de val sinds 0033, en 0059 citeert hem in zijn
   *    eigen kop, past hem correct toe op `actor_id` en vergeet hem één regel
   *    lager voor `subject_id`. Wat je leest en overschrijft, kun je alsnog
   *    missen; wat rood wordt niet.
   */
  describe('onveranderlijkheid tegenover on delete set null', () => {
    it(
      'heeft op elke set-null-kolom de grendel en niet de kale toewijzing',
      async () => {
        const { data, error } = await adminDb().rpc('onveranderlijkheid_bewaking');

        expect(error).toBeNull();

        const rijen = data ?? [];

        // ⚠️ Eerst bewijzen dát hij iets vindt. Een lege uitkomst betekent hier
        //    óók "de functie kijkt nergens meer", en dan is groen betekenisloos —
        //    dezelfde val als een controlescript dat nul meldt omdat het niets
        //    inleest.
        expect(rijen.length).toBeGreaterThan(0);

        const kaal = rijen
          .filter((r) => !r.heeft_grendel)
          .map((r) => `${r.tabel}.${r.kolom} (${r.functie})`);

        expect(kaal).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een account met een eigen groep gewoon verdwijnen',
      async () => {
        // ⚠️ De uitkomst en niet de vorm. De test hierboven leest de
        //    functiebron; deze doet wat een gebruiker doet.
        //
        // ⚠️ **En deze helft wordt níét rood als de grendel eruit gaat — met de
        //    hand nagemeten op 25-08.** `guard_group_update()` stapt er bij
        //    `current_user not in ('authenticated','anon')` al uit, en de cascade
        //    van `on delete set null` draait niet als `authenticated`. Vandaag is
        //    de kale toewijzing dus onschadelijk.
        //
        //    Dat is precies waarom de structurele toets hierboven bestaat en
        //    waarom hij de eerste van de twee is: het gedrag kan deze fout niet
        //    zien. Verdwijnt die vroege uitstap ooit — hij staat als "faalt open"
        //    op de review-agenda — dan is dít de test die omvalt.
        const admin = adminDb();
        const weg = await createTestUser('setnull');

        const groep = await weg.db.rpc('create_group', {
          group_name: 'SETNULL proefgroep',
          huddle_day: 1,
          tz: 'Europe/Amsterdam',
          zichtbaarheid: 'beschermd',
        });
        expect(groep.error).toBeNull();

        const verwijderd = await verwijderAuthGebruiker(weg.id);
        expect(verwijderd).toBeNull();

        // De groep staat er nog, zonder oprichter — dat is wat set null belooft.
        const na = await admin
          .from('groups')
          .select('id, created_by')
          .eq('name', 'SETNULL proefgroep');

        expect(na.error).toBeNull();
        expect(na.data ?? []).toHaveLength(1);
        expect((na.data ?? [])[0]?.created_by).toBeNull();

        await admin.from('groups').delete().eq('name', 'SETNULL proefgroep');
      },
      SETUP_TIMEOUT,
    );
  });
  /**
   * De audittrail van een doel — migratie 0087.
   *
   * ⚠️ De bevinding van 16-08 noemde zichzelf "productbeslissing, geen
   *    technische": `001-datamodel.md` §4.2 staat groepsgenoten toe
   *    `scope_reduced` en `milestone_dropped` te lezen, domeinregel 7 verbiedt
   *    het, en één van de twee moest wijken. Het project had die vraag elders al
   *    tegengesteld beantwoord — `milestone_dropped` staat met naam op
   *    `VERBODEN_GEBEURTENISSEN` — dus het was een tegenspraak en geen open
   *    vraag.
   *
   * ⚠️ `deadline_moved` blijft groepszichtbaar, en dat is de benoemde verruiming
   *    A7: je vraagt hem zelf aan en een buddy keurt hem goed.
   */
  describe('de audittrail van een doel', () => {
    it(
      'staat in de database exact de gebeurtenissen toe die de app kent',
      async () => {
        const { data, error } = await adminDb().rpc('check_waarden', {
          p_tabel: 'goal_events',
          p_constraint: 'goal_events_type_valid',
        });

        expect(error).toBeNull();

        const inDeDatabase = [...(data ?? [])].sort();

        // Eerst de inhoud vastpinnen: een lege uitkomst betekent óók "geen
        // constraint met die naam", en dan is een vergelijking van twee lege
        // lijsten groen terwijl het slot weg is.
        expect(inDeDatabase).toEqual(['archived', 'completed', 'created', 'deadline_moved']);
        expect(inDeDatabase).toEqual([...DOELGEBEURTENISSEN].sort());
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een eigenaar geen deadline_moved verzinnen',
      async () => {
        // ⚠️ De enige gebeurtenis die een uitspraak over een ánder mens draagt
        //    ("een buddy ging akkoord"), en de enige die de groep leest. Zonder
        //    deze grens kan de eigenaar zelf neerzetten dat zijn verschuiving
        //    goedgekeurd was.
        const poging = await f.alice.db.from('goal_events').insert({
          goal_id: f.sharedGoalId,
          actor_id: f.alice.id,
          event_type: 'deadline_moved',
          old_value: { target_date: '2026-01-01' },
          new_value: { target_date: '2027-01-01' },
        });

        expect(poging.error).not.toBeNull();
        expect(poging.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een eigenaar wél zijn eigen created, archived en completed schrijven',
      async () => {
        // ⚠️ De positieve kant. Zonder deze helft blijft de test hierboven groen
        //    als de policy per ongeluk álles weigert — en dan is `logGoalEvent()`
        //    stil kapot, wat niemand merkt want die functie gooit bewust niet.
        const admin = adminDb();

        for (const type of ['created', 'archived', 'completed'] as const) {
          const poging = await f.alice.db
            .from('goal_events')
            .insert({
              goal_id: f.sharedGoalId,
              actor_id: f.alice.id,
              event_type: type,
              old_value: null,
              new_value: null,
            })
            .select('id')
            .single();

          expect(poging.error, type).toBeNull();

          if (poging.data !== null) {
            await admin.from('goal_events').delete().eq('id', poging.data.id);
          }
        }
      },
      TEST_TIMEOUT,
    );
  });
});
