import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een pushtoken heeft een bovengrens — QS8-297.
 *
 * ⚠️ **Wat het probleem wél en niet was.** `push_tokens` is niet rechtstreeks
 *    door een client te vullen: `authenticated` heeft er alleen DELETE,
 *    REFERENCES en SELECT op. Maar de wáárde komt van de client, als argument
 *    van `registreer_push_token()`, en daar stond alleen een óndergrens van acht
 *    tekens op. Op een gratis tier met beperkte opslag en zonder backups is dat
 *    opslagmisbruik.
 *
 * ⚠️ **Het zijn drie kolommen en niet één.** `p256dh` en `auth` komen uit
 *    dezelfde RPC, hetzelfde INSERT-statement en dezelfde client. Alleen `token`
 *    begrenzen verplaatst het lek: wie een megabyte kwijt wil, zet hem in
 *    `p256dh`.
 *
 * ## Twee lagen, twee tests, en ze doen niet hetzelfde
 *
 * De CHECK op de kolom is de grendel — die blijft staan als er ooit een tweede
 * schrijver komt, en `service_role` loopt er niet langsheen. De tak in de RPC is
 * de nette weigering; zonder die tak krijgt de gebruiker een ruwe 23514 waar de
 * client niets mee kan, precies de klacht die 0067 voor `geen_websleutels`
 * oploste.
 *
 * ⚠️ Ze staan met hetzélfde getal en zijn dus een kopie die uit elkaar kan
 *    lopen. Daarom toetst dit bestand ze los: de RPC-tak via de gewone weg, de
 *    CHECK via een schrijver die de RPC overslaat. Gaat er één weg, dan is er
 *    precies één test rood.
 *
 * ⚠️ **En de must-allow is niet optioneel.** "Niemand mag dit meer" is ook te
 *    halen met een grens die élke echte token weigert, en dat is een kapotte app
 *    in plaats van een gesloten gat. Een grens die een geldige token weigert is
 *    erger dan geen grens.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `push_tokens_token_len` droppen
 *      → 1 rood: de kolomtest, en alléén die
 *   B  alléén de tak `token_te_lang` uit de RPC halen
 *      → 1 rood: de RPC-test, en alléén die
 *   C  `push_tokens_sleutels_len` droppen
 *      → 1 rood op de sleutelkant van de kolomtest
 *   D  de tak `sleutel_te_lang` uit de RPC halen
 *      → 1 rood op de sleutelkant van de RPC-test
 *   E  de grens op 10 zetten in plaats van 1000
 *      → 3 rood, alle drie must-allows; de grens ligt dan onder elke echte token
 *
 * ⚠️ **A ging eerst niet rood maar "no tests", en dat is de leerzame helft.** De
 *    beschikbaarheidsvraag bovenaan noemde `push_tokens_token_len` — precies de
 *    constraint die mutatie A dropt — dus de suite sloeg zichzelf netjes over.
 *    Een probe die het ding toetst dat je gaat breken, zet je eigen ijking uit.
 *    Hij vraagt nu naar de tabel.
 *
 * ⚠️ **En B was eerst te grof:** de hele web-tak eruit maakte drie tests rood.
 *    Mutatie per grendel betekent ook: muteer één tak, niet het blok eromheen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Een echte Expo-pushtoken heeft deze vorm en is 41 tekens. */
const ECHTE_NATIVE_TOKEN = 'ExponentPushToken[aBcDeFgHiJkLmNoPqRsTuV]';

/** Een web-endpoint zoals FCM hem uitdeelt, met een hostnaam uit de allowlist. */
const ECHTE_WEB_ENDPOINT = `https://fcm.googleapis.com/fcm/send/${'c'.repeat(152)}`;

/** 65 octetten base64url, zoals RFC 8291 voorschrijft. */
const ECHTE_P256DH = 'B'.repeat(87);
/** 16 octetten base64url. */
const ECHTE_AUTH = 'A'.repeat(22);

let alice: TestUser;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

/** Draait dit statement en zegt of het gelukt is. */
function lukt(sql: string): boolean {
  try {
    psql(sql);
    return true;
  } catch {
    return false;
  }
}

/**
 * ⚠️ **De beschikbaarheidsvraag noemt met opzet níét `push_tokens_token_len`.**
 *    Dat was de eerste versie, en toen sloeg de hele suite zich netjes over bij
 *    de ijking die juist die constraint dropte — "no tests" in plaats van rood.
 *    Een probe die het ding toetst dat je gaat breken, zet je eigen ijking uit.
 *    Hij vraagt daarom naar de tábel, die er los van deze migratie is.
 */
const kolomgrensMeetbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'push_tokens' and relkind = 'r'",
  import.meta.url,
);

describe.skipIf(!rlsTestsConfigured)('registreer_push_token() en zijn grenzen', () => {
  beforeAll(async () => {
    alice = await createTestUser('pushgrens-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'weigert een token boven de grens met een reden, niet met een ruwe fout',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: 'x'.repeat(5000),
        p_platform: 'android',
      });

      expect(error, 'de gebruiker hoort een antwoord te krijgen, geen 23514').toBeNull();
      expect(uit(data).ok).toBe(false);
      expect(uit(data).reason).toBe('token_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een websleutel boven de grens met een reden',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_WEB_ENDPOINT,
        p_platform: 'web',
        p_p256dh: 'B'.repeat(5000),
        p_auth: ECHTE_AUTH,
      });

      expect(error).toBeNull();
      expect(uit(data).ok).toBe(false);
      expect(uit(data).reason).toBe('sleutel_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een echte Expo-token gewoon door',
    async () => {
      // ⚠️ De must-allow. Zonder deze helft is "niemand mag dit meer" ook te
      //    halen met een grens die élke token weigert.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_NATIVE_TOKEN,
        p_platform: 'android',
      });

      expect(error).toBeNull();
      expect(uit(data), 'een echte token van 41 tekens hoort er gewoon door').toEqual({ ok: true });

      const rij = await adminDb().from('push_tokens').select('token').eq('token', ECHTE_NATIVE_TOKEN);
      expect(rij.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een echt web-abonnement gewoon door, met sleutels op ware grootte',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_WEB_ENDPOINT,
        p_platform: 'web',
        p_p256dh: ECHTE_P256DH,
        p_auth: ECHTE_AUTH,
      });

      expect(error).toBeNull();
      expect(uit(data), `endpoint van ${ECHTE_WEB_ENDPOINT.length} tekens`).toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'houdt een te lange token ook tegen bij een schrijver die de RPC overslaat',
    () => {
      // ⚠️ **Dit is de grendel die het verschil maakt.**
      //    `registreer_push_token()` is vandaag de enige schrijver, en dat is een
      //    toestand en geen grendel — dezelfde les als bij domeinregel 3 en bij
      //    0172. Deze insert gaat als `postgres` en loopt overal langsheen;
      //    alleen de CHECK op de kolom houdt hem tegen.
      const teLang = lukt(`
        insert into public.push_tokens (user_id, token, platform)
        values ('${alice.id}', repeat('x', 5000), 'android')
      `);
      expect(teLang, 'de CHECK op de kolom hoort dit te weigeren').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'houdt een te lange websleutel ook tegen bij zulke schrijvers',
    () => {
      const teLang = lukt(`
        insert into public.push_tokens (user_id, token, platform, p256dh, auth)
        values ('${alice.id}', '${ECHTE_WEB_ENDPOINT}x', 'web', repeat('B', 5000), '${ECHTE_AUTH}')
      `);
      expect(teLang, 'de CHECK op de sleutels hoort dit te weigeren').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'laat zo een schrijver een token van normale lengte wél door',
    () => {
      // ⚠️ De must-allow aan de kolomkant. Zonder deze zou een CHECK die álles
      //    weigert net zo groen staan als een die de grens goed legt.
      const past = lukt(`
        insert into public.push_tokens (user_id, token, platform)
        values ('${alice.id}', 'ExponentPushToken[kolomkant-must-allow]', 'ios')
      `);
      expect(past, 'een token van normale lengte hoort er gewoon in te mogen').toBe(true);
    },
    TEST_TIMEOUT,
  );
});
