/**
 * De besluiten uit `docs/Q-TODO.docx`, uitgevoerd in plaats van gelezen.
 *
 * A18 — een inactief lid verliest toegang, zijn geschiedenis blijft staan.
 * A19 — een goedkeuring is binnen een kwartier in te trekken, append-only.
 * A3  — een account verwijderen werkt, met cascade en anonimisering.
 * A7  — de streefdatum verschuift alleen met akkoord van de groep.
 *
 * ⚠️ Alle testgebruikers worden één keer in `beforeAll` gemaakt. Supabase weigert
 *    na ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached", en dan is een rode suite geen bevinding maar een wachttijd. Deze
 *    suite maakt er vier bovenop wat `policies.test.ts` en `epic7.test.ts` al
 *    doen; zie je een opbouwfout met "rate limit" erin, wacht dan een minuut in
 *    plaats van in de policies te gaan zoeken.
 *
 * ⚠️ De volgorde van de blokken is niet vrij. A3 verwijdert `dave` en dat is
 *    onomkeerbaar, dus dat blok staat achteraan; A18 zet `carol` op inactief en
 *    zet haar daarna weer terug, zodat de latere blokken een normale groep
 *    hebben.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Oprichter en beheerder van de groep. */
  alice: TestUser;
  /** Gewoon lid; beoordeelt en beslist. */
  bob: TestUser;
  /** Gewoon lid; wordt in het A18-blok tijdelijk op inactief gezet. */
  carol: TestUser;
  /** Wordt in het A3-blok verwijderd. Lid van een eigen groep met bob. */
  dave: TestUser;
  groupId: string;
  /** Groep van dave met bob erin; om "laatste beheerder" te toetsen. */
  daveGroupId: string;
  /** Doel van alice, gekoppeld aan `groupId`. */
  goalId: string;
  /** Weekdoel van alice dat op `pending` staat, met voltooiing. */
  weeklyId: string;
  completionId: string;
  /** Doel van alice dat aan géén groep hangt. */
  soloGoalId: string;
  /** Chatbericht van dave in `groupId`. */
  daveChatId: string;
  /** Goedkeuring die dave aan alice gaf. */
  daveApprovalId: string;
  /** Weekafsluiting van dave, met een reactie van bob eronder. */
  daveReviewId: string;
  cycleStart: string;
  targetDate: string;
}

let f: Fixture;

function mustOk(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
}

function mustId(
  result: { data: { id: string } | null; error: { message: string } | null },
  what: string,
): string {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
  if (!result.data) throw new Error(`Opbouw mislukte bij ${what}: geen rij teruggekregen`);
  return result.data.id;
}

interface RpcUitkomst {
  ok?: boolean;
  reason?: string;
  reverted?: boolean;
  moved?: boolean;
  changed?: boolean;
  request_id?: string;
  group?: { id: string; invite_code: string };
}

function uit(data: unknown): RpcUitkomst {
  return (data ?? {}) as RpcUitkomst;
}

async function createGroup(owner: TestUser, name: string): Promise<{ id: string; code: string }> {
  const antwoord = await owner.db.rpc('create_group', { group_name: name });
  if (antwoord.error) throw new Error(`Groep ${name}: ${antwoord.error.message}`);

  const u = uit(antwoord.data);
  if (u.ok !== true || u.group === undefined) {
    throw new Error(`Groep ${name} niet aangemaakt: ${u.reason ?? 'geen groep'}`);
  }
  return { id: u.group.id, code: u.group.invite_code };
}

async function laatMeedoen(user: TestUser, code: string, wie: string): Promise<void> {
  const antwoord = await user.db.rpc('join_group_with_code', { code });
  if (antwoord.error) throw new Error(`${wie} werd geen lid (HTTP): ${antwoord.error.message}`);
  if (uit(antwoord.data).ok !== true) {
    throw new Error(`${wie} werd geen lid: ${uit(antwoord.data).reason ?? 'geen reden'}`);
  }
}

/** Zet het lidmaatschap van iemand op een status, via de systeemclient. */
async function zetLidStatus(groupId: string, userId: string, status: string): Promise<void> {
  mustOk(
    await adminDb().from('group_members').update({ status }).eq('group_id', groupId).eq('user_id', userId),
    `lidstatus ${status}`,
  );
}

async function buildFixture(): Promise<Fixture> {
  const [alice, bob, carol, dave] = await Promise.all([
    createTestUser('bs-alice'),
    createTestUser('bs-bob'),
    createTestUser('bs-carol'),
    createTestUser('bs-dave'),
  ]);

  const groep = await createGroup(alice, 'Besluitengroep');
  await laatMeedoen(bob, groep.code, 'bob');
  await laatMeedoen(carol, groep.code, 'carol');
  await laatMeedoen(dave, groep.code, 'dave');

  const daveGroep = await createGroup(dave, 'Groep van dave');
  await laatMeedoen(bob, daveGroep.code, 'bob in groep van dave');

  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  // ⚠️ De streefdatum ligt een eind in de toekomst, want A7 toetst "ligt in de
  //    toekomst" met de klok van de gebruiker.
  const targetDate = '2027-12-31';

  const goalId = mustId(
    await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Gedeeld doel', target_date: targetDate })
      .select('id')
      .single(),
    'doel van alice',
  );

  mustOk(
    await alice.db
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: groep.id })
      .select('goal_id')
      .single(),
    'koppeling doel',
  );

  const soloGoalId = mustId(
    await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Solodoel', target_date: targetDate })
      .select('id')
      .single(),
    'solodoel',
  );

  const weeklyId = mustId(
    await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: 'Week van alice',
        ceiling_text: 'Het plafond',
        cycle_start_date: cycle.startDate,
        cycle_index: 1,
      })
      .select('id')
      .single(),
    'weekdoel',
  );

  // ⚠️ De trigger `mark_weekly_goal_pending` zet de week op `pending`; dat kan de
  //    client sinds 0023 niet meer zelf.
  const completionId = mustId(
    await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: weeklyId,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'Gedaan.',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'voltooiing',
  );

  const daveChatId = mustId(
    await dave.db
      .from('chat_messages')
      .insert({ group_id: groep.id, sender_id: dave.id, type: 'text', body: 'Hallo allemaal.' })
      .select('id')
      .single(),
    'chatbericht van dave',
  );

  // ⚠️ Dave keurt een éigen week goed, niet die van het A19-blok. Stond zijn
  //    goedkeuring op dezelfde voltooiing, dan blijft er na het intrekken door
  //    bob een geldige goedkeuring over en draait de RPC terecht niets terug —
  //    dan toetst het A19-blok iets anders dan het denkt te toetsen.
  const tweedeWeekly = mustId(
    await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: 'Tweede week van alice',
        ceiling_text: 'Ook een plafond',
        cycle_start_date: cycle.startDate,
        cycle_index: 2,
      })
      .select('id')
      .single(),
    'tweede weekdoel',
  );

  const tweedeCompletion = mustId(
    await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: tweedeWeekly,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'Ook gedaan.',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single(),
    'tweede voltooiing',
  );

  const daveApprovalId = mustId(
    await dave.db
      .from('completion_approvals')
      .insert({
        completion_id: tweedeCompletion,
        approver_id: dave.id,
        subject_id: dave.id,
        group_id: groep.id,
        status: 'approved',
      })
      .select('id')
      .single(),
    'goedkeuring van dave',
  );

  // ⚠️ De weekafsluiting van dave, met een reactie van bob eronder. Dat tweetal
  //    is de kern van de zwaarste bevinding: als dave zijn account opzegt, mag
  //    de reactie van bob niet mee verdwijnen.
  const periode = groepsperiodeVan(
    { huddle_day: 0, tz: 'Europe/Amsterdam' },
    now(),
  );

  const daveReviewId = mustId(
    await dave.db
      .from('week_reviews')
      .insert({
        group_id: groep.id,
        user_id: dave.id,
        group_period_start: periode.startDate,
        did_text: 'Ik heb deze week mijn hoofdstuk af.',
      })
      .select('id')
      .single(),
    'weekafsluiting van dave',
  );

  mustOk(
    await bob.db.from('week_review_replies').insert({
      week_review_id: daveReviewId,
      author_id: bob.id,
      body: 'Goed bezig!',
    }),
    'reactie van bob',
  );

  return {
    alice,
    bob,
    carol,
    dave,
    daveReviewId,
    groupId: groep.id,
    daveGroupId: daveGroep.id,
    goalId,
    weeklyId,
    completionId,
    soloGoalId,
    daveChatId,
    daveApprovalId,
    cycleStart: cycle.startDate,
    targetDate,
  };
}

describe.runIf(rlsTestsConfigured)('Q-TODO besluiten', () => {
  beforeAll(async () => {
    f = await buildFixture();
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // A18 — een uitgezet lid verliest toegang, zijn geschiedenis blijft
  // -------------------------------------------------------------------------
  describe('A18 — inactief lid', () => {
    beforeAll(async () => {
      await zetLidStatus(f.groupId, f.carol.id, 'inactive');
    }, SETUP_TIMEOUT);

    afterAll(async () => {
      await zetLidStatus(f.groupId, f.carol.id, 'active');
    }, SETUP_TIMEOUT);

    it(
      'leest de groep niet meer',
      async () => {
        const { data, error } = await f.carol.db.from('groups').select('id').eq('id', f.groupId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'leest de chat niet meer',
      async () => {
        const { data, error } = await f.carol.db
          .from('chat_messages')
          .select('id')
          .eq('group_id', f.groupId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'ziet de ledenlijst niet meer',
      async () => {
        const { data, error } = await f.carol.db
          .from('group_members')
          .select('user_id')
          .eq('group_id', f.groupId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'kan zichzelf niet heractiveren — de trigger zet status terug',
      async () => {
        await f.carol.db
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', f.groupId)
          .eq('user_id', f.carol.id);

        const { data } = await adminDb()
          .from('group_members')
          .select('status')
          .eq('group_id', f.groupId)
          .eq('user_id', f.carol.id)
          .single();

        expect(data?.status).toBe('inactive');
      },
      TEST_TIMEOUT,
    );

    it(
      'kan zijn eigen lidmaatschap niet weggooien om opnieuw toe te treden',
      async () => {
        await f.carol.db
          .from('group_members')
          .delete()
          .eq('group_id', f.groupId)
          .eq('user_id', f.carol.id);

        const { data } = await adminDb()
          .from('group_members')
          .select('user_id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.carol.id);

        expect(data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'kan de groep niet verwijderen, ook niet als beheerder',
      async () => {
        await zetLidStatus(f.groupId, f.carol.id, 'inactive');
        mustOk(
          await adminDb()
            .from('group_members')
            .update({ role: 'admin' })
            .eq('group_id', f.groupId)
            .eq('user_id', f.carol.id),
          'carol tijdelijk beheerder',
        );

        await f.carol.db.from('groups').delete().eq('id', f.groupId);

        const { data } = await adminDb().from('groups').select('id').eq('id', f.groupId);
        expect(data ?? []).toHaveLength(1);

        mustOk(
          await adminDb()
            .from('group_members')
            .update({ role: 'member' })
            .eq('group_id', f.groupId)
            .eq('user_id', f.carol.id),
          'carol terug naar lid',
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt zijn geschiedenis: de groep ziet zijn oude bericht gewoon',
      async () => {
        mustOk(
          await adminDb().from('chat_messages').insert({
            group_id: f.groupId,
            sender_id: f.carol.id,
            type: 'text',
            body: 'Bericht van voor het uitzetten.',
          }),
          'oud bericht van carol',
        );

        const { data, error } = await f.bob.db
          .from('chat_messages')
          .select('body')
          .eq('group_id', f.groupId)
          .eq('sender_id', f.carol.id);

        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een lid op `paused` houdt wél toegang — dat is een pauze, geen moderatie',
      async () => {
        await zetLidStatus(f.groupId, f.carol.id, 'paused');

        const { data, error } = await f.carol.db.from('groups').select('id').eq('id', f.groupId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);

        await zetLidStatus(f.groupId, f.carol.id, 'inactive');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // A19 — een goedkeuring intrekken
  // -------------------------------------------------------------------------
  describe('A19 — goedkeuring intrekken', () => {
    let approvalId: string;

    beforeAll(async () => {
      mustOk(
        await adminDb().from('weekly_goals').update({ status: 'pending' }).eq('id', f.weeklyId),
        'week op pending voor A19',
      );

      approvalId = mustId(
        await f.bob.db
          .from('completion_approvals')
          .insert({
            completion_id: f.completionId,
            approver_id: f.bob.id,
            subject_id: f.bob.id,
            group_id: f.groupId,
            status: 'approved',
          })
          .select('id')
          .single(),
        'goedkeuring van bob',
      );
    }, SETUP_TIMEOUT);

    it(
      'de goedkeuring zette de week op approved',
      async () => {
        const { data } = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', f.weeklyId)
          .single();

        expect(data?.status).toBe('approved');
      },
      TEST_TIMEOUT,
    );

    it(
      'een ander lid kan mijn goedkeuring niet intrekken',
      async () => {
        const { data, error } = await f.carol.db.rpc('trek_goedkeuring_in', {
          p_approval_id: approvalId,
        });

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('not_yours');
      },
      TEST_TIMEOUT,
    );

    it(
      'de beoordelaar trekt hem in: de week gaat terug naar pending',
      async () => {
        const { data, error } = await f.bob.db.rpc('trek_goedkeuring_in', {
          p_approval_id: approvalId,
        });

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(true);
        expect(uit(data).reverted).toBe(true);

        const week = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', f.weeklyId)
          .single();

        expect(week.data?.status).toBe('pending');
      },
      TEST_TIMEOUT,
    );

    it(
      'de goedkeuring zelf blijft staan — append-only (domeinregel 6)',
      async () => {
        const { data } = await adminDb()
          .from('completion_approvals')
          .select('id, status')
          .eq('id', approvalId)
          .single();

        expect(data?.status).toBe('approved');
      },
      TEST_TIMEOUT,
    );

    it(
      'er staat een correctie in het grootboek, geen verwijderde regel',
      async () => {
        const { data } = await adminDb()
          .from('points_ledger')
          .select('delta, reason')
          .eq('reason', 'correction')
          .eq('ref_id', f.weeklyId);

        expect((data ?? []).length).toBeGreaterThan(0);
        expect((data ?? [])[0]?.delta).toBeLessThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'het reviewpunt van de intrekker is tegengeboekt',
      async () => {
        const { data } = await adminDb()
          .from('points_ledger')
          .select('delta, reason')
          .eq('user_id', f.bob.id)
          .eq('reason', 'correction')
          .eq('ref_id', f.completionId);

        expect((data ?? []).length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'de aankondiging van deze goedkeuring is uit de chat gehaald',
      async () => {
        const { data } = await adminDb()
          .from('chat_messages')
          .select('id, body')
          .eq('group_id', f.groupId)
          .eq('system_event', 'completion_approved');

        // ⚠️ Op naam en niet op aantal. De goedkeuring van dave staat er nog en
        //    hóórt er te staan; alleen die van bob moet verdwenen zijn. Tellen
        //    zou hier ook groen worden als de verkeerde was weggehaald.
        const vanBob = (data ?? []).filter((m) => (m.body ?? '').includes('bs-bob'));
        expect(vanBob).toHaveLength(0);

        const vanDave = (data ?? []).filter((m) => (m.body ?? '').includes('bs-dave'));
        expect(vanDave.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'de week staat weer in de wachtrij van de intrekker',
      async () => {
        const { data, error } = await f.bob.db.rpc('openstaande_beoordelingen', {
          p_limit: 50,
          p_offset: 0,
        });

        expect(error).toBeNull();
        const ids = (data ?? []).map((r) => r.weekly_goal_id);
        expect(ids).toContain(f.weeklyId);
      },
      TEST_TIMEOUT,
    );

    it(
      'twee keer intrekken kan niet',
      async () => {
        const { data } = await f.bob.db.rpc('trek_goedkeuring_in', { p_approval_id: approvalId });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('already_withdrawn');
      },
      TEST_TIMEOUT,
    );

    it(
      'na een kwartier kan het niet meer',
      async () => {
        const laat = mustId(
          await f.carol.db
            .from('completion_approvals')
            .insert({
              completion_id: f.completionId,
              approver_id: f.carol.id,
              subject_id: f.carol.id,
              group_id: f.groupId,
              status: 'approved',
            })
            .select('id')
            .single(),
          'goedkeuring van carol',
        );

        mustOk(
          await adminDb()
            .from('completion_approvals')
            .update({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() })
            .eq('id', laat),
          'goedkeuring ouder maken',
        );

        const { data } = await f.carol.db.rpc('trek_goedkeuring_in', { p_approval_id: laat });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('window_closed');
      },
      TEST_TIMEOUT,
    );

    it(
      'keurden twee buddy’s dezelfde week goed, dan blijft hij goedgekeurd',
      async () => {
        // ⚠️ De tak die de code-critic terecht als ongetest aanwees, en het is de
        //    foutgevoeligste van de functie: hier mag alléén het reviewpunt van
        //    de intrekker terug, en juist niets aan de week of aan de punten van
        //    de eigenaar. Een fout hier is een boekhoudfout in het enige "geld"
        //    dat deze app heeft.
        const derde = mustId(
          await f.alice.db
            .from('weekly_goals')
            .insert({
              goal_id: f.goalId,
              title: 'Week met twee goedkeurders',
              ceiling_text: 'Plafond',
              cycle_start_date: f.cycleStart,
              cycle_index: 3,
            })
            .select('id')
            .single(),
          'derde weekdoel',
        );

        const voltooiing = mustId(
          await f.alice.db
            .from('completions')
            .insert({
              weekly_goal_id: derde,
              user_id: f.alice.id,
              achieved_level: 'ceiling',
              note: 'Klaar.',
              cycle_start_date: f.cycleStart,
            })
            .select('id')
            .single(),
          'derde voltooiing',
        );

        const vanBob = mustId(
          await f.bob.db
            .from('completion_approvals')
            .insert({
              completion_id: voltooiing,
              approver_id: f.bob.id,
              subject_id: f.bob.id,
              group_id: f.groupId,
              status: 'approved',
            })
            .select('id')
            .single(),
          'goedkeuring bob',
        );

        mustOk(
          await f.carol.db.from('completion_approvals').insert({
            completion_id: voltooiing,
            approver_id: f.carol.id,
            subject_id: f.carol.id,
            group_id: f.groupId,
            status: 'approved',
          }),
          'goedkeuring carol',
        );

        const puntenVoor = await adminDb()
          .from('points_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('ref_id', derde)
          .eq('reason', 'correction');

        const { data } = await f.bob.db.rpc('trek_goedkeuring_in', { p_approval_id: vanBob });

        expect(uit(data).ok).toBe(true);
        // Niets teruggedraaid: carol keurde ook goed.
        expect(uit(data).reverted).toBe(false);

        const week = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', derde)
          .single();

        expect(week.data?.status).toBe('approved');

        // En geen tegenboeking op de punten van de eigenaar.
        const puntenNa = await adminDb()
          .from('points_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('ref_id', derde)
          .eq('reason', 'correction');

        expect(puntenNa.count ?? 0).toBe(puntenVoor.count ?? 0);

        // Het reviewpunt van bob gaat wél terug, anders is intrekken gratis.
        const reviewTerug = await adminDb()
          .from('points_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', f.bob.id)
          .eq('reason', 'correction')
          .eq('ref_id', voltooiing);

        expect(reviewTerug.count ?? 0).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een uitgezet lid kan zijn goedkeuring niet meer intrekken',
      async () => {
        // ⚠️ Bevinding van de security-review: `trek_goedkeuring_in` toetste
        //    alleen op de beoordelaar, niet op lidmaatschap. Een net uitgezet lid
        //    kon de week van een ánder terugklappen naar pending en diens punten
        //    laten terugboeken.
        const week = mustId(
          await f.alice.db
            .from('weekly_goals')
            .insert({
              goal_id: f.goalId,
              title: 'Week voor de uitgezette beoordelaar',
              ceiling_text: 'Plafond',
              cycle_start_date: f.cycleStart,
              cycle_index: 4,
            })
            .select('id')
            .single(),
          'vierde weekdoel',
        );

        const voltooiing = mustId(
          await f.alice.db
            .from('completions')
            .insert({
              weekly_goal_id: week,
              user_id: f.alice.id,
              achieved_level: 'ceiling',
              note: 'Klaar.',
              cycle_start_date: f.cycleStart,
            })
            .select('id')
            .single(),
          'vierde voltooiing',
        );

        const vanCarol = mustId(
          await f.carol.db
            .from('completion_approvals')
            .insert({
              completion_id: voltooiing,
              approver_id: f.carol.id,
              subject_id: f.carol.id,
              group_id: f.groupId,
              status: 'approved',
            })
            .select('id')
            .single(),
          'goedkeuring carol',
        );

        await zetLidStatus(f.groupId, f.carol.id, 'inactive');

        const { data } = await f.carol.db.rpc('trek_goedkeuring_in', {
          p_approval_id: vanCarol,
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('not_member');

        const status = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', week)
          .single();

        expect(status.data?.status).toBe('approved');

        await zetLidStatus(f.groupId, f.carol.id, 'active');
      },
      TEST_TIMEOUT,
    );

    it(
      'niemand kan een correctie-record zelf schrijven',
      async () => {
        const { error } = await f.bob.db
          .from('approval_withdrawals')
          .insert({ approval_id: approvalId, completion_id: f.completionId, approver_id: f.bob.id });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // A7 — de streefdatum verschuift alleen met akkoord
  // -------------------------------------------------------------------------
  describe('A7 — deadline verschuiven', () => {
    let verzoekId: string;

    it(
      'de eigenaar kan target_date niet meer rechtstreeks schrijven',
      async () => {
        const { error } = await f.alice.db
          .from('goals')
          .update({ target_date: '2028-01-01' })
          .eq('id', f.goalId);

        expect(error).not.toBeNull();

        const { data } = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', f.goalId)
          .single();

        expect(data?.target_date).toBe(f.targetDate);
      },
      TEST_TIMEOUT,
    );

    it(
      'een doel zonder groep zet je gewoon zelf',
      async () => {
        const { data, error } = await f.alice.db.rpc('zet_streefdatum', {
          p_goal_id: f.soloGoalId,
          p_date: '2028-02-02',
        });

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(true);

        const doel = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', f.soloGoalId)
          .single();

        expect(doel.data?.target_date).toBe('2028-02-02');
      },
      TEST_TIMEOUT,
    );

    it(
      'een gedeeld doel weigert die route en wijst naar de groep',
      async () => {
        const { data } = await f.alice.db.rpc('zet_streefdatum', {
          p_goal_id: f.goalId,
          p_date: '2028-03-03',
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('needs_group_approval');
      },
      TEST_TIMEOUT,
    );

    it(
      'een verzoek zonder behoorlijk argument wordt geweigerd',
      async () => {
        const { data } = await f.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: f.goalId,
          p_group_id: f.groupId,
          p_new_date: '2028-03-03',
          p_reason: 'geen tijd',
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('reason_too_short');
      },
      TEST_TIMEOUT,
    );

    it(
      'met argument komt het verzoek er, en de groep ziet het',
      async () => {
        const { data, error } = await f.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: f.goalId,
          p_group_id: f.groupId,
          p_new_date: '2028-03-03',
          p_reason: 'Het project op mijn werk is met zes weken uitgelopen.',
        });

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(true);
        verzoekId = uit(data).request_id ?? '';
        expect(verzoekId).not.toBe('');

        const gezien = await f.bob.db
          .from('deadline_requests')
          .select('id, reason')
          .eq('id', verzoekId);

        expect(gezien.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de aankondiging in de chat noemt geen doeltitel en geen argument',
      async () => {
        const { data } = await adminDb()
          .from('chat_messages')
          .select('body')
          .eq('group_id', f.groupId)
          .eq('system_event', 'deadline_requested');

        expect((data ?? []).length).toBeGreaterThan(0);
        for (const bericht of data ?? []) {
          expect(bericht.body ?? '').not.toContain('Gedeeld doel');
          expect(bericht.body ?? '').not.toContain('uitgelopen');
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'een tweede open verzoek voor hetzelfde doel kan niet',
      async () => {
        const { data } = await f.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: f.goalId,
          p_group_id: f.groupId,
          p_new_date: '2028-04-04',
          p_reason: 'Nog een reden die lang genoeg is om erdoor te komen.',
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('already_open');
      },
      TEST_TIMEOUT,
    );

    it(
      'de aanvrager kan zijn eigen verzoek niet goedkeuren',
      async () => {
        const { data } = await f.alice.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('not_yourself');
      },
      TEST_TIMEOUT,
    );

    it(
      'een niet-lid kan er niet over beslissen',
      async () => {
        await zetLidStatus(f.groupId, f.carol.id, 'inactive');

        const { data } = await f.carol.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('not_member');

        await zetLidStatus(f.groupId, f.carol.id, 'active');
      },
      TEST_TIMEOUT,
    );

    it(
      'een ander lid keurt goed en dán pas verschuift de datum',
      async () => {
        const { data, error } = await f.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(true);
        expect(uit(data).moved).toBe(true);

        const doel = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', f.goalId)
          .single();

        expect(doel.data?.target_date).toBe('2028-03-03');
      },
      TEST_TIMEOUT,
    );

    it(
      'de verschuiving staat in goal_events',
      async () => {
        const { data } = await adminDb()
          .from('goal_events')
          .select('event_type')
          .eq('goal_id', f.goalId)
          .eq('event_type', 'deadline_moved');

        expect((data ?? []).length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'twee keer beslissen kan niet',
      async () => {
        const { data } = await f.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: false,
        });

        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('already_decided');
      },
      TEST_TIMEOUT,
    );

    it(
      'de client kan max_points niet schrijven',
      async () => {
        const plafond = await f.alice.db
          .from('goals')
          .update({ max_points: 9999 })
          .eq('id', f.goalId);
        expect(plafond.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ Was: "de client kan risk_status niet meer schrijven", met een update op
     *    `goals`. Die kolom bestaat sinds migratie 0050 niet meer daar — de
     *    Risico-radar woont in `goal_risk`, want `goals_select` gaf elke
     *    groepsgenoot de héle rij en `'behind'` is tegenslag over iemand anders.
     *
     *    Dit is de opvolger, en hij toetst allebei de kanten: de eigenaar mag
     *    hem lezen maar niet schrijven, en een groepsgenoot mag hem niet eens
     *    zien.
     */
    it(
      'goal_risk is voor de eigenaar leesbaar, voor niemand schrijfbaar, en voor de groep onzichtbaar',
      async () => {
        const admin = adminDb();

        await admin
          .from('goal_risk')
          .upsert({ goal_id: f.goalId, status: 'behind', reason: { gemist: 2 } });

        // De eigenaar ziet zijn eigen stand — de positieve controle, anders
        // bewijst de rest alleen dat de rij onvindbaar is voor iedereen.
        const alsEigenaar = await f.alice.db
          .from('goal_risk')
          .select('status')
          .eq('goal_id', f.goalId);
        expect(alsEigenaar.data ?? []).toHaveLength(1);
        expect(alsEigenaar.data?.[0]?.status).toBe('behind');

        // Maar hij mag hem niet zetten: een zelfgekozen risicostand is een
        // verzonnen stand.
        const schrijven = await f.alice.db
          .from('goal_risk')
          .update({ status: 'on_track' })
          .eq('goal_id', f.goalId);
        expect(schrijven.error).not.toBeNull();

        // En de groepsgenoot ziet niets. Dit is waar migratie 0050 om draait.
        const alsGroepsgenoot = await f.bob.db
          .from('goal_risk')
          .select('status')
          .eq('goal_id', f.goalId);
        expect(alsGroepsgenoot.data ?? []).toHaveLength(0);

        // ⚠️ En hij ziet het doel zélf nog wél — anders is dit geen afscherming
        //    van een kolom maar een gebroken groepsoverzicht.
        const doelVoorGroepsgenoot = await f.bob.db
          .from('goals')
          .select('id, title')
          .eq('id', f.goalId);
        expect(doelVoorGroepsgenoot.data ?? []).toHaveLength(1);

        await admin.from('goal_risk').delete().eq('goal_id', f.goalId);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // A3 — account verwijderen. Staat achteraan: dave overleeft dit blok niet.
  // -------------------------------------------------------------------------
  describe('A3 — account verwijderen', () => {
    it(
      'de laatste beheerder van een bewoonde groep wordt geweigerd',
      async () => {
        const { data, error } = await f.dave.db.rpc('verwijder_mijn_account');

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(false);
        expect(uit(data).reason).toBe('last_admin');
      },
      TEST_TIMEOUT,
    );

    it(
      'met een tweede beheerder lukt het wel',
      async () => {
        mustOk(
          await adminDb()
            .from('group_members')
            .update({ role: 'admin' })
            .eq('group_id', f.daveGroupId)
            .eq('user_id', f.bob.id),
          'bob beheerder maken',
        );

        const { data, error } = await f.dave.db.rpc('verwijder_mijn_account');

        expect(error).toBeNull();
        expect(uit(data).ok).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'het profiel is weg',
      async () => {
        const { data } = await adminDb().from('profiles').select('id').eq('id', f.dave.id);
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'de goedkeuring die hij aan een ander gaf, blijft staan zonder zijn naam',
      async () => {
        const { data } = await adminDb()
          .from('completion_approvals')
          .select('id, approver_id, status')
          .eq('id', f.daveApprovalId)
          .maybeSingle();

        expect(data).not.toBeNull();
        expect(data?.approver_id).toBeNull();
        expect(data?.status).toBe('approved');
      },
      TEST_TIMEOUT,
    );

    it(
      'zijn chatbericht blijft staan zonder afzender',
      async () => {
        const { data } = await adminDb()
          .from('chat_messages')
          .select('id, sender_id, body, type')
          .eq('id', f.daveChatId)
          .maybeSingle();

        expect(data).not.toBeNull();
        expect(data?.sender_id).toBeNull();
        expect(data?.type).toBe('text');
        expect(data?.body).toBe('Hallo allemaal.');
      },
      TEST_TIMEOUT,
    );

    it(
      'de groep die hij oprichtte blijft bestaan voor de anderen',
      async () => {
        const { data } = await adminDb()
          .from('groups')
          .select('id, created_by')
          .eq('id', f.daveGroupId)
          .maybeSingle();

        expect(data).not.toBeNull();
        expect(data?.created_by).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'zijn weekafsluiting blijft staan — anders verdwijnen de reacties van zijn buddy’s',
      async () => {
        // ⚠️ De zwaarste bevinding van de security-review, en het was echt
        //    dataverlies zonder misbruik: `week_reviews.user_id` cascadeerde, en
        //    `week_review_replies.week_review_id` cascadeert daar weer op. Wie
        //    zijn account opzegde, wiste daarmee de reacties die twee buddy's
        //    onder zijn weekafsluiting hadden geschreven.
        const { data } = await adminDb()
          .from('week_reviews')
          .select('id, user_id, did_text')
          .eq('id', f.daveReviewId)
          .maybeSingle();

        expect(data).not.toBeNull();
        expect(data?.user_id).toBeNull();

        const reacties = await adminDb()
          .from('week_review_replies')
          .select('id, author_id, body')
          .eq('week_review_id', f.daveReviewId);

        expect((reacties.data ?? []).length).toBe(1);
        // De reactie is van bob en die heeft niets verwijderd.
        expect((reacties.data ?? [])[0]?.author_id).toBe(f.bob.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'zijn lidmaatschappen zijn weg',
      async () => {
        const { data } = await adminDb()
          .from('group_members')
          .select('user_id')
          .eq('user_id', f.dave.id);

        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
  // -------------------------------------------------------------------------
  // Domeinregel 7 — een vraag is van de vrager en de gevraagde, niet van de groep
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De vierde route die niemand gekozen had.** `completion_approvals_select`
   *    stond tot migratie 0100 op `is_group_member(group_id)`, dus élk groepslid
   *    las élke `more_info`-opmerking over élk ander lid — met de tekst erbij.
   *    "Anna is doorgevraagd" is een licht negatief signaal over iemand anders
   *    dat niet via Anna zelf loopt, en domeinregel 7 kent precies drie routes
   *    waarlangs tegenslag de groep bereikt; dit was er geen van.
   *
   * ⚠️ **De schermen toonden het nergens, en dat is juist het punt.** Dit is
   *    dezelfde vorm als de les van EPIC 5: de UI hield de regel netjes aan
   *    terwijl de database hem lekte. De vraag die CLAUDE.md daarvoor stelt is
   *    "kan iemand dat met één API-verzoek uitlezen buiten de UI om" — en het
   *    antwoord was ja.
   *
   * ⚠️ **Deze test bestaat omdat de hele suite groen bleef bij het inperken.**
   *    Op 27-08-2026 gemeten: 27 bestanden, 438 tests, groen vóór en ná 0100.
   *    Een policy die je zonder één rode test kunt verruimen, is niet bewaakt —
   *    regel 18, vraag 3.
   */
  describe('een doorvraag is niet van de groep', () => {
    let vraagId: string;
    let voltooiingId: string;

    beforeAll(async () => {
      const weekdoel = mustId(
        await f.alice.db
          .from('weekly_goals')
          .insert({
            goal_id: f.goalId,
            title: 'Weekdoel met een vraag eronder',
            cycle_start_date: f.cycleStart,
            cycle_index: 9,
          })
          .select('id')
          .single(),
        'weekdoel voor de doorvraag',
      );

      voltooiingId = mustId(
        await f.alice.db
          .from('completions')
          .insert({
            weekly_goal_id: weekdoel,
            user_id: f.alice.id,
            achieved_level: 'floor',
            note: 'Half gehaald.',
            cycle_start_date: f.cycleStart,
          })
          .select('id')
          .single(),
        'voltooiing voor de doorvraag',
      );

      // ⚠️ Carol vraagt door, niet bob: bob heeft in dit bestand al
      //    goedkeuringen staan, en dan is hij geen schone derde meer.
      vraagId = mustId(
        await f.carol.db
          .from('completion_approvals')
          .insert({
            completion_id: voltooiingId,
            approver_id: f.carol.id,
            subject_id: f.carol.id,
            group_id: f.groupId,
            status: 'more_info',
            comment: 'Hoe ver ben je precies gekomen?',
          })
          .select('id')
          .single(),
        'doorvraag van carol',
      );
    }, SETUP_TIMEOUT);

    it(
      'de vrager ziet zijn eigen vraag',
      async () => {
        // ⚠️ De toelatingen staan vóór de weigering. Zonder dit bewijs kan de
        //    test hieronder groen zijn omdat er helemaal niets leesbaar is.
        const { data } = await f.carol.db
          .from('completion_approvals')
          .select('id')
          .eq('id', vraagId);

        expect(data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de gevraagde ziet de vraag over haar eigen week',
      async () => {
        const { data } = await f.alice.db
          .from('completion_approvals')
          .select('id, comment')
          .eq('id', vraagId);

        expect(data ?? []).toHaveLength(1);
        expect((data ?? [])[0]?.comment).toBe('Hoe ver ben je precies gekomen?');
      },
      TEST_TIMEOUT,
    );

    it(
      'een derde in dezelfde groep ziet er niets van',
      async () => {
        // Bob is lid van dezelfde groep en ziet alice haar weekdoelen. Hij is
        // hier niet de vrager en niet de gevraagde, en dan gaat deze rij hem
        // niets aan — ook niet het bestáán ervan.
        const { data, error } = await f.bob.db
          .from('completion_approvals')
          .select('id, comment')
          .eq('id', vraagId);

        // ⚠️ Geen fout maar nul rijen: RLS filtert, hij weigert niet. Een test
        //    die op een foutcode wacht zou hier voor altijd groen blijven.
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'en ook niet als hij op de voltooiing zoekt in plaats van op de vraag',
      async () => {
        // Dezelfde rij langs een andere ingang. `fetchVragen()` doet het zo, en
        // een policy die de ene weg dichtzet en de andere niet is geen policy.
        const { data } = await f.bob.db
          .from('completion_approvals')
          .select('id')
          .eq('completion_id', voltooiingId)
          .eq('status', 'more_info');

        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'de rij bestaat wel degelijk — anders bewijst het bovenstaande niets',
      async () => {
        const { data } = await adminDb()
          .from('completion_approvals')
          .select('id, status, subject_id')
          .eq('id', vraagId)
          .single();

        expect(data?.status).toBe('more_info');
        // De trigger heeft de gelogen subject_id teruggezet op de eigenaar.
        expect(data?.subject_id).toBe(f.alice.id);
      },
      TEST_TIMEOUT,
    );
  });
});
