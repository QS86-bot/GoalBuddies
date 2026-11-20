/**
 * De punten van deze week zijn van de eigenaar en van niemand anders — QS8-747.
 *
 * ⚠️ **De belofte is de database en niet het scherm.** `fetchPuntenDezeWeek()` leest
 *    `points_ledger` met precies deze selectie; dat een ander hetzelfde verzoek
 *    stelt en niets terugkrijgt is wat domeinregel 10 en 7 dragen. Een filter op
 *    `user_id` in de client is gewoonte, geen grendel: daarom vraagt de test ook
 *    zónder dat filter, en met dat van de ander.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;

describe.skipIf(!rlsTestsConfigured)('QS8-747 — punten van deze week zijn eigenaar-only', () => {
  let anna: TestUser;
  let bram: TestUser;
  const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  const deWeek = (wie: TestUser, van: string) =>
    wie.db
      .from('points_ledger')
      .select('delta')
      .eq('user_id', van)
      .gte('created_at', cyclus.startsAt.toISOString())
      .lt('created_at', cyclus.endsAt.toISOString())
      .neq('reason', 'cycle_missed')
      .limit(500);

  beforeAll(async () => {
    anna = await createTestUser('qs747-anna');
    bram = await createTestUser('qs747-bram');
    const { error } = await adminDb().from('points_ledger').insert({
      user_id: anna.id,
      delta: 2,
      reason: 'correction',
      created_at: now().toISOString(),
    });
    if (error) throw new Error(`fixture: ${error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('points_ledger').delete().in('user_id', [anna.id, bram.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('de eigenaar ziet zijn eigen punten van deze week', async () => {
    const { data, error } = await deWeek(anna, anna.id);
    expect(error).toBeNull();
    expect(data?.map((r) => r.delta)).toEqual([2]);
  });

  it('een ander krijgt met hetzelfde verzoek nul rijen en geen fout', async () => {
    const { data, error } = await deWeek(bram, anna.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('zonder user_id-filter komt er van een ander niets mee', async () => {
    const { data } = await bram.db.from('points_ledger').select('user_id,delta').limit(500);
    expect((data ?? []).some((r) => r.user_id === anna.id)).toBe(false);
  });
});
