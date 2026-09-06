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
  budget_cent?: number;
  besteed_cent?: number;
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

  // -------------------------------------------------------------------------
  describe('het dagquotum ziet het verschil tussen een grote en een kleine job', () => {
    /**
     * ⚠️ **De belofte is niet "er is een budget" maar "een dure job eet meer van
     *    het quotum dan een goedkope".** Tot QS8-296 telde `vraag_ai_job` alleen
     *    rijen: tien maximale prompts en tien piepkleine kostten evenveel van je
     *    quotum, terwijl de rekening bij Anthropic op de tokens loopt.
     *
     * ⚠️ **De kosten worden hier met de hand geboekt, en dat is geen omweg.**
     *    `cost_cents` wordt in productie door de Edge Function geschreven als
     *    een job klaar is; die draait hier niet. Wat deze tests toetsen is de
     *    póórt, en die leest alleen de kolom — precies zoals bij een echte job.
     */
    async function boekKosten(userId: string, cent: number): Promise<void> {
      const uit = await adminDb()
        .from('ai_jobs')
        .update({ cost_cents: cent, status: 'done' })
        .eq('user_id', userId);
      if (uit.error) throw new Error(`kosten boeken: ${uit.error.message}`);
    }

    async function ruimJobsOp(userId: string): Promise<void> {
      const uit = await adminDb().from('ai_jobs').delete().eq('user_id', userId);
      if (uit.error) throw new Error(`opruimen: ${uit.error.message}`);
    }

    it(
      'een dure job zet de poort dicht terwijl de telling nog ruimte heeft',
      async () => {
        // ⚠️ Dit is het geval dat vóór QS8-296 niet bestond: één job, dus negen
        //    van de tien nog vrij, en tóch geen toegang meer.
        await ruimJobsOp(f.alice.id);

        const eerste = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { zin: 'QUOTUM een dure job' },
        });
        expect(uitkomst(eerste.data).ok, JSON.stringify(eerste.data)).toBe(true);

        await boekKosten(f.alice.id, 120);

        const tweede = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { zin: 'QUOTUM de volgende' },
        });

        expect(uitkomst(tweede.data).ok).toBe(false);
        expect(uitkomst(tweede.data).reason).toBe('budget_bereikt');

        // En de telling had nog ruimte zat — dáár zat het gat.
        const verbruik = await f.alice.db.rpc('ai_verbruik');
        expect(uitkomst(verbruik.data).gebruikt).toBeLessThan(10);
      },
      TEST_TIMEOUT,
    );

    it(
      'goedkope jobs komen er gewoon doorheen',
      async () => {
        // ⚠️ De must-allow. Zonder haar is "het budget is bereikt" groen op
        //    precies dezelfde manier als een budget van nul, en dan is de
        //    Doelcoach stuk in plaats van begrensd.
        await ruimJobsOp(f.alice.id);

        const eerste = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { zin: 'QUOTUM goedkoop een' },
        });
        expect(uitkomst(eerste.data).ok).toBe(true);

        await boekKosten(f.alice.id, 1);

        const tweede = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { zin: 'QUOTUM goedkoop twee' },
        });
        expect(uitkomst(tweede.data).ok, JSON.stringify(tweede.data)).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een job die nog draait telt niet als nul maar houdt de telling bezet',
      async () => {
        // ⚠️⚠️ **De naad van dit issue.** `cost_cents` bestaat pas als een job
        //    klaar is, en toelating gebeurt als hij begint. Een budget dat
        //    alleen `sum(cost_cents)` optelt is dus te racen — vuur er tien af
        //    en ze worden allemaal toegelaten, want op dat moment heeft nog
        //    niets iets gekost.
        //
        //    Wat dat gat dekt is de telling van tien, en dáárom blijft die
        //    staan. Deze test legt vast dat de twee grenzen elkaar dekken: met
        //    tien lopende jobs zonder kosten is `besteed_cent` nul én is de
        //    poort dicht.
        await ruimJobsOp(f.alice.id);

        for (let i = 0; i < 10; i += 1) {
          const uit = await f.alice.db.rpc('vraag_ai_job', {
            p_kind: 'milestones',
            p_goal_id: f.aliceGoal,
            p_input: { zin: `QUOTUM lopend ${i}` },
          });
          expect(uitkomst(uit.data).ok, `job ${i}: ${JSON.stringify(uit.data)}`).toBe(true);
        }

        const verbruik = await f.alice.db.rpc('ai_verbruik');
        expect(uitkomst(verbruik.data).besteed_cent).toBe(0);
        expect(uitkomst(verbruik.data).gebruikt).toBe(10);

        const elfde = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: { zin: 'QUOTUM lopend elf' },
        });
        expect(uitkomst(elfde.data).ok).toBe(false);
        expect(uitkomst(elfde.data).reason).toBe('quota_reached');
      },
      TEST_TIMEOUT,
    );

    it(
      'het verbruik noemt het budget en wat er van over is',
      async () => {
        await ruimJobsOp(f.alice.id);
        const verbruik = await f.alice.db.rpc('ai_verbruik');

        expect(uitkomst(verbruik.data).budget_cent).toBe(100);
        expect(uitkomst(verbruik.data).besteed_cent).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });
});
