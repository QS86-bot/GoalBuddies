/**
 * Een view is een leesvorm, geen achterdeur — migratie 0095.
 *
 * ⚠️ **`mijn_profiel` ging om RLS heen, en dat was bewezen en niet beredeneerd.**
 *    De view is auto-updatable, draait met `security_invoker=false` — dus met de
 *    rechten van zijn eigenaar `postgres` — en `authenticated` had er INSERT,
 *    UPDATE én DELETE op. Rechtstreeks `delete from profiles` weigerde de policy;
 *    `delete from mijn_profiel` haalde de rij weg. Dertien tabellen hangen met
 *    `on delete cascade` aan `profiles`, dus dat was in één verzoek de hele
 *    geschiedenis van een gebruiker — `points_ledger` en `completions` incluis,
 *    die volgens domeinregel 6 append-only zijn.
 *
 * ⚠️ **Geen enkele migratie gaf die rechten.** Ze komen uit de standaardrechten
 *    van Supabase (`alter default privileges ... grant all on tables`), en die
 *    gelden ook voor views. Élke nieuwe view krijgt ze dus opnieuw — vandaar dat
 *    hieronder niet één view getoetst wordt maar álle, via
 *    `viewrechten_bewaking()`. Zelfde vorm en zelfde reden als
 *    `realtime_bewaking()` uit 0027: een afspraak die geen zin is maar een test.
 *
 * ⚠️ De positieve controle staat er met opzet naast. Een test die alleen toetst
 *    dat iets weigert, is net zo groen als een view die helemaal niet meer
 *    bestaat — en dan is het lezen stuk zonder dat iemand het merkt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

describe.skipIf(!rlsTestsConfigured)('Views dragen geen schrijfrechten', () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('viewrechten-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geen enkele view in public geeft anon of authenticated meer dan lezen',
    async () => {
      const { data, error } = await adminDb().rpc('viewrechten_bewaking');

      expect(error).toBeNull();
      // Bij een treffer staat er in de melding wélke view en welk recht, zodat
      // de volgende lezer niet hoeft te zoeken.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een verwijdering via `mijn_profiel`',
    async () => {
      // ⚠️ Dit is de aanval zoals hij werkte. Slaagt hij ooit weer, dan is één
      //    verzoek genoeg om dertien tabellen aan geschiedenis mee te nemen.
      const { error } = await alice.db.from('mijn_profiel').delete().eq('id', alice.id);

      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een wijziging via `mijn_profiel`',
    async () => {
      const { error } = await alice.db
        .from('mijn_profiel')
        .update({ display_name: 'langs de policy om' })
        .eq('id', alice.id);

      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat het lezen ongemoeid — de positieve controle',
    async () => {
      // Zonder deze test is een view die helemaal weg is, net zo groen als een
      // view die netjes dichtstaat.
      const { data, error } = await alice.db
        .from('mijn_profiel')
        .select('id, tz, week_start_day')
        .eq('id', alice.id)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.id).toBe(alice.id);
    },
    TEST_TIMEOUT,
  );
});
