import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een web-abonnement wordt alleen aangenomen als het een bruikbare sleutel is —
 * QS8-696, migratie `0329_een_websleutel_heeft_een_vorm.sql` (nummer voorlopig).
 *
 * ⚠️ **De naad:** een client die een kapot abonnement registreert, krijgt een
 *    weigering met een `reason`, en er komt geen rij bij. 📏 Tot deze migratie
 *    toetste `registreer_push_token()` alleen de lengte, en dan stond er een rij
 *    die de pushjob elk uur probeerde en nooit kon versleutelen (QS8-690: 9 van
 *    de 16 web-tokens op productie). Daarom toetst deze test het antwoord én de
 *    tabel, en niet alleen het antwoord.
 *
 * ⚠️ **Elk geval is op één grendel gericht.** De lengte zit ruim onder de 255 van
 *    `sleutel_te_lang`, zodat geen van deze gevallen door die eerdere tak wordt
 *    afgevangen — anders bewaakt de test iets anders dan hij belooft.
 *
 * IJKING — met de hand gebroken op 18-11-2026 op de lokale stack, per grendel:
 *
 *   1. De curvetoets in `is_p256_punt()` weggehaald (altijd `true` na het
 *      prefix) → alleen "niet op de curve" rood.
 *   2. De prefixtoets (`get_byte(p_punt, 0) <> 4`) weggehaald → alleen "het
 *      eerste octet" rood. Een punt met `0x05` en de rest van een echt punt ligt
 *      wél op de curve, dus alleen het prefix houdt hem tegen.
 *   3. De tak `auth_ongeldig` uit de RPC gehaald → de twee `auth`-gevallen rood.
 *   4. "Geen base64url" heeft twee lagen in `websleutel_octetten()`, en ze dekken
 *      elkaar: de regex, en het `exception`-blok dat NULL geeft.
 *      a. Alleen de regex weg → **groen**: `decode()` werpt op het `!` en het
 *         blok vangt het.
 *      b. Alleen het blok laten werpen → **groen**: na de regex en de
 *         lengtetoets kan `decode()` niet meer werpen. Het blok is een vangnet
 *         zonder bekend geval, en dat staat hier zodat niemand denkt dat het
 *         iets bewaakt wat de regex niet al doet.
 *      c. Allebei → de twee "geen base64url"-gevallen rood, met een ruwe fout
 *         in plaats van een `reason`.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Het abonnement uit RFC 8291 — dezelfde vector als in `webpush-crypto.test.ts`. */
const ECHTE_P256DH =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const ECHTE_AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';

const RUN = Math.random().toString(36).slice(2, 10);

/** Een FCM-endpoint per geval: `push_tokens.token` is uniek. */
function endpoint(geval: string): string {
  return `https://fcm.googleapis.com/fcm/send/websleutel-${geval}-${RUN}`;
}

/** Hetzelfde punt met een ander eerste octet; x en y blijven op de curve. */
function metPrefix(octet: number): string {
  const ruw = Buffer.from(ECHTE_P256DH, 'base64url');
  ruw[0] = octet;
  return ruw.toString('base64url');
}

/** Hetzelfde punt met de laagste bit van y omgedraaid: juiste vorm, buiten de curve. */
function nietOpDeCurve(): string {
  const ruw = Buffer.from(ECHTE_P256DH, 'base64url');
  ruw[64] = ruw[64]! ^ 0x01;
  return ruw.toString('base64url');
}

let alice: TestUser;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

async function registreer(geval: string, p256dh: string, auth: string) {
  const { data, error } = await alice.db.rpc('registreer_push_token', {
    p_token: endpoint(geval),
    p_platform: 'web',
    p_p256dh: p256dh,
    p_auth: auth,
  });
  return { antwoord: uit(data), error };
}

async function rijBestaat(geval: string): Promise<boolean> {
  const { count, error } = await adminDb()
    .from('push_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('token', endpoint(geval));
  if (error) throw new Error(`rij tellen: ${error.message}`);
  return (count ?? 0) > 0;
}

describe.skipIf(!rlsTestsConfigured)('registreer_push_token() toetst de vorm van een websleutel', () => {
  beforeAll(async () => {
    alice = await createTestUser('websleutelvorm');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'neemt een echt browserabonnement aan',
    async () => {
      const { antwoord, error } = await registreer('echt', ECHTE_P256DH, ECHTE_AUTH);

      expect(error).toBeNull();
      expect(antwoord).toEqual({ ok: true });
      expect(await rijBestaat('echt')).toBe(true);
    },
    TEST_TIMEOUT,
  );

  const geweigerd: readonly (readonly [string, string, string, string])[] = [
    ['niet op de curve', nietOpDeCurve(), ECHTE_AUTH, 'p256dh_ongeldig'],
    ['het eerste octet is geen 0x04', metPrefix(0x05), ECHTE_AUTH, 'p256dh_ongeldig'],
    ['een p256dh van de verkeerde lengte', ECHTE_P256DH.slice(0, 80), ECHTE_AUTH, 'p256dh_ongeldig'],
    ['een p256dh die geen base64url is', `${ECHTE_P256DH.slice(0, 86)}!`, ECHTE_AUTH, 'p256dh_ongeldig'],
    ['een auth van 15 octetten', ECHTE_P256DH, ECHTE_AUTH.slice(0, 20), 'auth_ongeldig'],
    ['een auth die geen base64url is', ECHTE_P256DH, `${ECHTE_AUTH.slice(0, 21)}*`, 'auth_ongeldig'],
  ];

  for (const [naam, p256dh, auth, reden] of geweigerd) {
    it(
      `weigert ${naam}, met een reason en zonder rij`,
      async () => {
        const geval = naam.replace(/[^a-z0-9]+/g, '-');
        const { antwoord, error } = await registreer(geval, p256dh, auth);

        // Een nette weigering en geen ruwe Postgres-fout (QS8-377).
        expect(error).toBeNull();
        expect(antwoord).toEqual({ ok: false, reason: reden });
        expect(await rijBestaat(geval), 'een geweigerd abonnement liet toch een rij achter').toBe(false);
      },
      TEST_TIMEOUT,
    );
  }
});
