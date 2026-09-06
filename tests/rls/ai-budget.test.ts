/**
 * Het AI-dagbudget — de poort weegt dollarcent en telt geen rijen (QS8-296, 0175).
 *
 * ⚠️ **De belofte is niet "er is een limiet" maar "een grote job eet meer op dan
 *    een kleine".** Dat verschil is de hele reden dat dit bestand bestaat: de
 *    oude poort deed `count(*)`, had een uitgebreide groene test, en die test
 *    bleef groen ongeacht wat een job kostte. Onwrikbare regel 18, vraag 3.
 *
 * ⚠️ **Vier jobs tegen vier jobs.** De kern staat in één geval: twee gebruikers
 *    met evenveel jobs achter zich, alleen andere bedragen, en een andere
 *    uitkomst bij de vijfde. Elke test die één gebruiker volgt, kan dat niet
 *    aantonen — die meet een grens en niet het gewicht.
 *
 * ⚠️ **De bedragen worden hier als `service_role` weggeschreven, en dat is geen
 *    omweg om de app heen maar precies de echte schrijver.** `authenticated`
 *    heeft sinds 0118 geen INSERT of UPDATE op `ai_jobs`; de Edge Function boekt
 *    `cost_cents` en niemand anders. Zou een gebruiker die kolom zelf kunnen
 *    zetten, dan was dit budget geen budget — dat is een eigen geval hieronder.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

/** Wat één job in het slechtste geval kost: MAX_TOKENS uitvoer plus de invoer. */
const DURE_JOB_CENT = 8.8;

interface Fixture {
  alice: TestUser;
  bob: TestUser;
  aliceGoal: string;
  bobGoal: string;
}

interface Antwoord {
  ok?: boolean;
  reason?: string;
  job_id?: string;
}

interface Verbruik {
  gebruikt_cent?: number | string;
  budget_cent?: number | string;
  jobs?: number;
}

function antwoord(data: unknown): Antwoord {
  return (data ?? {}) as Antwoord;
}

/**
 * ⚠️ `numeric` komt als string over de lijn — PostgREST bewaart de precisie en
 *    JavaScript zou hem weggooien. `Number()` eromheen, nooit `===` op de kale
 *    waarde.
 */
function verbruik(data: unknown): { gebruikt: number; budget: number; jobs: number } {
  const v = (data ?? {}) as Verbruik;
  return {
    gebruikt: Number(v.gebruikt_cent ?? 0),
    budget: Number(v.budget_cent ?? 0),
    jobs: Number(v.jobs ?? 0),
  };
}

describe.skipIf(!rlsTestsConfigured)('het AI-dagbudget telt cent', () => {
  let f: Fixture;

  beforeAll(async () => {
    const alice = await createTestUser('budget-alice');
    const bob = await createTestUser('budget-bob');
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
      aliceGoal: await maakDoel(alice, 'BUDGET-DOEL-ALICE'),
      bobGoal: await maakDoel(bob, 'BUDGET-DOEL-BOB'),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  beforeEach(async () => {
    const admin = adminDb();
    await admin.from('ai_jobs').delete().in('user_id', [f.alice.id, f.bob.id]);
  }, TEST_TIMEOUT);

  /**
   * Zet `aantal` afgeronde jobs van `kosten` cent op naam van `gebruiker`.
   *
   * `kosten === null` is een job waarvan de kosten niet bekend zijn: `queued`,
   * `running`, of een `failed` die nooit een bedrag gekregen heeft.
   */
  async function boek(
    gebruiker: TestUser,
    doel: string,
    aantal: number,
    kosten: number | null,
    status = 'done',
  ): Promise<void> {
    const stempel = `${gebruiker.id}-${kosten ?? 'leeg'}`;
    const rijen = Array.from({ length: aantal }, (_, i) => ({
      user_id: gebruiker.id,
      goal_id: doel,
      kind: 'milestones',
      input: { vulling: i },
      input_hash: `${stempel}-${i}`,
      status,
      cost_cents: kosten,
    }));
    const { error } = await adminDb().from('ai_jobs').insert(rijen);
    expect(error).toBeNull();
  }

  const vraag = async (u: TestUser, doel: string, merk: string): Promise<Antwoord> => {
    const { data } = await u.db.rpc('vraag_ai_job', {
      p_kind: 'milestones',
      p_goal_id: doel,
      p_input: { iets: merk },
    });
    return antwoord(data);
  };

  describe('wat een job weegt', () => {
    /**
     * ⚠️ **Dit is de belofte, en hij past in één geval.** Vier jobs tegen vier
     *    jobs — hetzelfde aantal, andere bedragen, andere uitkomst. Een poort die
     *    rijen telt, laat ze allebei door; dat is precies wat er stond.
     */
    it(
      'vier dure jobs sluiten de poort, vier goedkope niet',
      async () => {
        await boek(f.alice, f.aliceGoal, 4, DURE_JOB_CENT);
        await boek(f.bob, f.bobGoal, 4, 1);

        expect((await vraag(f.alice, f.aliceGoal, 'na-duur')).reason).toBe('quota_reached');
        expect((await vraag(f.bob, f.bobGoal, 'na-goedkoop')).reason).toBe('queued');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De ijking uit het issue zelf**: zet de kostenkolom op nul en kijk of de
     *    limiet dan alsnog bijt. Dat gat is echt — `doelcoach/index.ts` doet
     *    `data.usage?.input_tokens ?? 0`, dus een antwoord zonder usage-blok boekt
     *    een gratis job. Nul is geen bedrag maar een ontbrekend bedrag, en het
     *    voorschot is de bodem eronder.
     */
    it(
      'een job die nul cent boekt telt alsnog voor het voorschot',
      async () => {
        await boek(f.alice, f.aliceGoal, 10, 0);

        expect((await vraag(f.alice, f.aliceGoal, 'na-nul')).reason).toBe('quota_reached');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De invoerkant.** Een budget dat pas telt als de kosten binnen zijn,
     *    stopt de job die het opmaakt niet — die is dan al gedraaid en al betaald.
     *    Een job zonder bedrag kost daarom vanaf zijn eerste seconde het voorschot.
     */
    it(
      'tien jobs die nog draaien sluiten de poort al voordat er één kost',
      async () => {
        await boek(f.alice, f.aliceGoal, 10, null, 'queued');

        expect((await vraag(f.alice, f.aliceGoal, 'na-queued')).reason).toBe('quota_reached');
      },
      TEST_TIMEOUT,
    );

    it(
      'tien gewone jobs passen nog steeds in een dag',
      async () => {
        await boek(f.alice, f.aliceGoal, 9, 2);

        expect((await vraag(f.alice, f.aliceGoal, 'de-tiende')).reason).toBe('queued');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de naad tussen de poort en de meter', () => {
    /**
     * ⚠️ **Twee correcte onderdelen die uit elkaar kunnen lopen.** `ai_verbruik()`
     *    vertelt wat er op is en `vraag_ai_job()` beslist. Zeggen ze niet
     *    hetzelfde, dan toont de app ruimte die er niet is — en dát is het geval
     *    dat 0056 ooit voor het getal 10 heeft moeten opruimen, toen het in twee
     *    functies stond.
     *
     *    De test toetst dus geen bedrag maar de gelijkheid van de twee oordelen,
     *    over vier standen heen. Die blijft kloppen als iemand het voorschot
     *    verzet; een test op "30" zou dan rood worden zonder dat er iets stuk is.
     */
    it(
      'de meter en de poort zijn het in elke stand eens',
      async () => {
        // ⚠️ **`[4, DURE_JOB_CENT]` is de stand waar deze test op staat of valt.**
        //    Bij vier dure jobs zegt de meter "op" (35,2 ≥ 30) en zou een poort
        //    die rijen telt "nog ruimte" zeggen (4 < 10). Zonder die stand is de
        //    lijst een rij gevallen waarin de twee het toevallig eens zijn, en
        //    dan blijft deze test groen terwijl de naad breekt — gemeten, en het
        //    was de eerste versie hiervan.
        const standen: [number, number | null][] = [
          [0, null],
          [3, 1],
          [4, DURE_JOB_CENT],
          [10, 0],
        ];

        for (const [aantal, kosten] of standen) {
          await adminDb().from('ai_jobs').delete().eq('user_id', f.alice.id);
          if (aantal > 0) await boek(f.alice, f.aliceGoal, aantal, kosten);

          const meter = verbruik((await f.alice.db.rpc('ai_verbruik')).data);
          const poort = await vraag(f.alice, f.aliceGoal, `naad-${aantal}-${kosten}`);

          expect(meter.gebruikt >= meter.budget).toBe(poort.reason === 'quota_reached');
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'de meter telt alleen je eigen jobs',
      async () => {
        await boek(f.alice, f.aliceGoal, 4, DURE_JOB_CENT);

        const vanAlice = verbruik((await f.alice.db.rpc('ai_verbruik')).data);
        const vanBob = verbruik((await f.bob.db.rpc('ai_verbruik')).data);

        expect(vanAlice.gebruikt).toBeGreaterThan(0);
        expect(vanBob.gebruikt).toBe(0);
        expect(vanBob.budget).toBe(vanAlice.budget);
      },
      TEST_TIMEOUT,
    );
  });

  describe('wat het budget draagt', () => {
    /**
     * ⚠️ **Zonder dit slot is het budget een suggestie.** De poort weegt wat er
     *    geboekt is, en de enige die boekt is de Edge Function. Mag een gebruiker
     *    `cost_cents` zelf zetten, dan zet hij hem op nul en is er geen grens meer.
     *    Dit is dezelfde vraag als bij elk oppervlak: kan iemand hier met één
     *    API-verzoek omheen, buiten de UI om?
     *
     * ⚠️ **Bij het ijken bleek er een tweede slot te zitten, en het is er een bij
     *    toeval.** Met de hand een `grant update (cost_cents)` én een
     *    UPDATE-policy erop gezet, en de update kwam er nog steeds niet door:
     *    `permission denied for function ai_invoer_max`. De CHECK
     *    `ai_jobs_input_len` roept die functie aan, en die is voor
     *    `authenticated` ingetrokken — dus élke schrijfpoging op deze tabel valt
     *    om op de CHECK, ongeacht de rechten op de kolom.
     *
     *    Dat is meegenomen, maar het is niet het slot waar deze test over gaat:
     *    het verdwijnt zodra iemand `ai_invoer_max()` uitdeelt, en dan staat het
     *    budget alleen nog op de ontbrekende grant. Vandaar dat de ijking hier
     *    beide grendels tegelijk moest wegnemen om iets te bewijzen — een ijking
     *    die op de eerste blijft hangen, toont niet wat hij belooft.
     */
    it(
      'een gebruiker kan zijn eigen kosten niet wegschrijven',
      async () => {
        await boek(f.alice, f.aliceGoal, 4, DURE_JOB_CENT);
        const voor = verbruik((await f.alice.db.rpc('ai_verbruik')).data);

        const bij = await f.alice.db
          .from('ai_jobs')
          .update({ cost_cents: 0 })
          .eq('user_id', f.alice.id)
          .select('id');

        // ⚠️ De meter ernaast en niet de poort: dit geval gaat over het
        //    schrijfrecht, niet over de eenheid waarin gewogen wordt. Zou hier
        //    `quota_reached` staan, dan werd deze test ook rood van een
        //    wijziging in de poort — en dan wijst hij niet meer aan wat er stuk is.
        expect(bij.data ?? []).toHaveLength(0);
        expect(verbruik((await f.alice.db.rpc('ai_verbruik')).data).gebruikt).toBe(voor.gebruikt);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De overschrijding is begrensd op één job, en dát is waarom
     *    `ai_invoer_max()` ertoe doet: zonder die grens is de laatste toegelaten
     *    job onbegrensd en dan zegt het budget niets meer.
     */
    it(
      'een job die het budget zou opmaken komt er nog steeds niet ongelimiteerd in',
      async () => {
        const teGroot = { vulling: 'x'.repeat(9000) };
        const { data } = await f.alice.db.rpc('vraag_ai_job', {
          p_kind: 'milestones',
          p_goal_id: f.aliceGoal,
          p_input: teGroot,
        });

        expect(antwoord(data).reason).toBe('invoer_te_groot');
      },
      TEST_TIMEOUT,
    );
  });
});
