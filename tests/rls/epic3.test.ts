/**
 * EPIC 3 — de poort voor AI-jobs, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ De vraag hier is niet "werkt de wachtrij" maar "kan iemand geld uitgeven
 *    dat niet van hem is". Elke AI-call kost echt geld (CLAUDE.md
 *    beveiligingsregel 6), en er is geen tussenpersoon: de sleutel staat op de
 *    server en de knop staat bij de gebruiker.
 *
 * ⚠️ Alle accounts worden één keer in `beforeAll` gemaakt. Supabase weigert na
 *    ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached"; zie je dat in de opbouw, wacht dan een minuut.
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
const TEST_TIMEOUT = 30_000;

interface Fixture {
  alice: TestUser;
  bob: TestUser;
  aliceGoal: string;
  bobGoal: string;
}

function uitkomst(data: unknown): {
  ok?: boolean;
  reason?: string;
  job_id?: string;
  hergebruikt?: boolean;
  limiet?: number;
  gebruikt?: number;
} {
  return (data ?? {}) as Record<string, never>;
}

describe.skipIf(!rlsTestsConfigured)('EPIC 3 — de poort voor AI-jobs', () => {
  let f: Fixture;

  beforeAll(async () => {
    const alice = await createTestUser('ai-alice');
    const bob = await createTestUser('ai-bob');
    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    const maakDoel = async (u: TestUser, titel: string): Promise<string> => {
      const { data, error } = await u.db
        .from('goals')
        .insert({ owner_id: u.id, title: titel, target_date: cycle.endDate })
        .select('id')
        .single();
      if (error || data === null) throw new Error(`doel ${titel}: ${error?.message}`);
      return data.id;
    };

    f = {
      alice,
      bob,
      aliceGoal: await maakDoel(alice, 'AI-DOEL-ALICE'),
      bobGoal: await maakDoel(bob, 'AI-DOEL-BOB'),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('een job aanvragen', () => {
    it(
      'zet een job in de rij voor je eigen doel',
      async () => {
        const { data, error } = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { doel: 'AI-DOEL-ALICE', vraag: 'eerste' },
        });

        expect(error).toBeNull();
        expect(uitkomst(data).ok).toBe(true);
        expect(uitkomst(data).reason).toBe('queued');
        expect(uitkomst(data).hergebruikt).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft bij dezelfde vraag dezelfde job terug in plaats van een tweede',
      async () => {
        // ⚠️ Twee keer op de knop drukken hoort geen twee facturen op te leveren.
        const { data } = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { doel: 'AI-DOEL-ALICE', vraag: 'eerste' },
        });

        expect(uitkomst(data).hergebruikt).toBe(true);
        expect(uitkomst(data).reason).toBe('bezig');
      },
      TEST_TIMEOUT,
    );

    it(
      'dedupliceert ongeacht de volgorde van de sleutels',
      async () => {
        // `jsonb` normaliseert sleutelvolgorde, dus dezelfde inhoud geeft
        // dezelfde hash. Met `json` zonder b was dit een loterij geweest.
        const { data } = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { vraag: 'eerste', doel: 'AI-DOEL-ALICE' },
        });

        expect(uitkomst(data).hergebruikt).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'hergebruikt een afgerond antwoord in plaats van opnieuw te betalen',
      async () => {
        const admin = adminDb();
        await admin
          .from('ai_jobs')
          .update({ status: 'done', output: { mijlpalen: [] } })
          .eq('user_id', f.alice.id)
          .eq('status', 'queued');

        const { data } = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { doel: 'AI-DOEL-ALICE', vraag: 'eerste' },
        });

        expect(uitkomst(data).reason).toBe('cache');
        expect(uitkomst(data).hergebruikt).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });

  describe('wat er niet mag', () => {
    it(
      'weigert een doel dat niet van jou is',
      async () => {
        // De Doelcoach werkt voor de eigenaar. Een groepsgenoot heeft hier niets
        // te zoeken, ook niet als het doel aan zijn groep gekoppeld is.
        const { data } = await f.bob.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { poging: 'andermans doel' },
        });

        expect(uitkomst(data).ok).toBe(false);
        expect(uitkomst(data).reason).toBe('not_your_goal');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een onbekend soort job',
      async () => {
        const { data } = await f.bob.db.rpc('vraag_ai_job', {
          p_kind: 'plaatjes_maken',
          p_goal_id: f.bobGoal,
          p_input: {},
        });

        expect(uitkomst(data).reason).toBe('unknown_kind');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat niemand rechtstreeks een job in de tabel schrijven',
      async () => {
        // ⚠️ `ai_jobs` heeft alleen een SELECT-policy. Zonder dat slot is het
        //    quotum in de RPC een formaliteit: dan schrijf je de job zelf.
        const { error } = await f.bob.db.from('ai_jobs').insert({
          user_id: f.bob.id,
          kind: 'milestones',
          input: {},
          input_hash: 'zelfgeschreven',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat niemand andermans jobs lezen',
      async () => {
        const { data } = await f.bob.db.from('ai_jobs').select('id').eq('user_id', f.alice.id);
        expect(data).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('het quotum', () => {
    it(
      'weigert zodra de dagelijkse grens bereikt is, en telt ook mislukte jobs mee',
      async () => {
        // ⚠️ Mislukte jobs tellen mee, en dat is met opzet: een kapotte prompt
        //    die twintig keer faalt, kost twintig keer geld.
        const admin = adminDb();
        const rijen = Array.from({ length: 10 }, (_, i) => ({
          user_id: f.bob.id,
          goal_id: f.bobGoal,
          kind: 'milestones',
          input: { vulling: i },
          input_hash: `vulling-${i}`,
          status: i % 2 === 0 ? 'failed' : 'done',
        }));
        const gevuld = await admin.from('ai_jobs').insert(rijen);
        expect(gevuld.error).toBeNull();

        const { data } = await f.bob.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.bobGoal,
          p_input: { iets: 'nieuws' },
        });

        expect(uitkomst(data).ok).toBe(false);
        expect(uitkomst(data).reason).toBe('quota_reached');
        expect(uitkomst(data).limiet).toBe(10);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont je je eigen verbruik en niet dat van een ander',
      async () => {
        const vanBob = await f.bob.db.rpc('ai_verbruik');
        const vanAlice = await f.alice.db.rpc('ai_verbruik');

        expect(uitkomst(vanBob.data).gebruikt).toBeGreaterThanOrEqual(10);
        expect(uitkomst(vanAlice.data).gebruikt).toBeLessThan(10);
      },
      TEST_TIMEOUT,
    );
  });
});
