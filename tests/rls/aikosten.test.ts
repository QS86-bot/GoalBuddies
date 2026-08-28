import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Wat de Doelcoach kost — `ai_kosten_per_week()` uit 0056.
 *
 * ⚠️ **Deze functie stond er sinds 0056 en niemand riep hem ooit aan.** Gevonden
 *    toen `keten:controle` zijn commentaar-blinde vlek kwijt was: de functie
 *    stond op `BEWAAKT_BUITEN_DE_APP` met de reden "ops en audit", en er wás geen
 *    ops en geen audit. Dat is dezelfde vorm als de lijst zelf moet vangen — een
 *    naam parkeren zonder dat er iets kijkt.
 *
 * ⚠️ **Onwrikbare regel 6 zegt dat elke AI-call geld kost en dat de kosten per
 *    user-id gelogd worden.** Het loggen gebeurt (`ai_jobs` draagt de tokens en
 *    het model), maar een getal dat niemand ooit opvraagt, is geen bewaking. Deze
 *    test is de aanroeper die bewijst dat de weg werkt — en `/audit` heeft er
 *    daarmee iets om naar te kijken.
 *
 * ⚠️ **Geen assertie op bedragen.** De database is leeg en andere suites laten
 *    jobs achter; wat hier bewezen wordt is dat de functie draait, de goede
 *    kolommen teruggeeft, en dicht zit voor een gewone gebruiker. Een assertie op
 *    een bedrag zou afhangen van welke suite ervoor liep.
 */
describe.skipIf(!rlsTestsConfigured)('ai_kosten_per_week — de rekening is opvraagbaar', () => {
  let gebruiker: TestUser;

  beforeAll(async () => {
    gebruiker = await createTestUser('aikosten');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft service_role een rij per week met de zes kolommen',
    async () => {
      const db = adminDb() as unknown as {
        rpc: (
          naam: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { data, error } = await db.rpc('ai_kosten_per_week', { p_weken: 2 });

      expect(error, JSON.stringify(error)).toBeNull();
      const rijen = (data ?? []) as readonly Record<string, unknown>[];

      // De vorm en niet de bedragen: elke rij draagt de zes kolommen uit 0056.
      for (const rij of rijen) {
        expect(Object.keys(rij).sort()).toEqual(
          ['gebruikers', 'invoertokens', 'jobs', 'kosten_cent', 'uitvoertokens', 'week_start'],
        );
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **En hij hoort dicht te zitten.** 0056 schrijft het met zoveel woorden op:
   *    er zit geen `auth.uid()`-filter op, want het gaat over álle gebruikers
   *    samen — en juist daarom is hij niet voor `authenticated`. Het totaal
   *    verraadt hoeveel anderen de coach gebruiken.
   */
  it(
    'is niet aanroepbaar door een gewone gebruiker',
    async () => {
      const db = gebruiker.db as unknown as {
        rpc: (
          naam: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { code?: string } | null }>;
      };

      const { error } = await db.rpc('ai_kosten_per_week', { p_weken: 2 });

      expect(error?.code, JSON.stringify(error)).toBe('42501');
    },
    TEST_TIMEOUT,
  );
});
