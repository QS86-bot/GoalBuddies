/**
 * EPIC 11 — push_tokens en notifications_sent, migratie 0053 en 0054.
 *
 * ⚠️ De vraag hier is niet "werkt registreren" maar "kun je iemand anders zijn
 *    meldingen bezorgen of afpakken". Een pushtoken is geen geheim, maar het is
 *    wel een adres — en een tabel waar je vrij in mag schrijven is een tabel
 *    waar je andermans telefoon in kunt zetten.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Registreert een token via de RPC.
 *
 * ⚠️ De cast is nodig omdat `registreer_push_token` in `database.types.ts` staat
 *    maar de testharnas een losse client gebruikt; hij houdt de aanroep op één
 *    plek in plaats van in vijf tests.
 */
async function registreer(
  gebruiker: TestUser,
  token: string,
  platform: string,
  sleutels?: { p256dh: string; auth: string },
): Promise<{ ok?: boolean; reason?: string }> {
  const db = gebruiker.db as unknown as {
    rpc: (
      naam: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data } = await db.rpc('registreer_push_token', {
    p_token: token,
    p_platform: platform,
    p_p256dh: sleutels?.p256dh ?? null,
    p_auth: sleutels?.auth ?? null,
  });

  return (data ?? {}) as { ok?: boolean; reason?: string };
}

/**
 * Websleutels van de juiste vorm — QS8-119.
 *
 * ⚠️ **Web is het enige platform dat ze verplicht draagt**, sinds de CHECK van
 *    migratie 0062 en de functie van 0067. Deze helper bestaat omdat de test
 *    hieronder ze eerder niet meestuurde: hij verwachtte `ok` op een
 *    web-registratie zonder sleutels, en dat weigert de database terecht.
 *
 *    Dat stond rood en niemand zag het, want de RLS-suite slaat zichzelf over
 *    zonder credentials. Gevonden op 24-08 door hem tegen de lokale stack te
 *    draaien — precies waarvoor QS8-119 bestaat.
 */
const WEBSLEUTELS = {
  p256dh: 'BJ' + 'x'.repeat(85),
  auth: 'y'.repeat(22),
};

interface Fixture {
  alice: TestUser;
  bob: TestUser;
}

/**
 * ⚠️ `skipIf` op de describe, zoals de andere RLS-bestanden — QS8-116.
 *    Hiervóór stond de bewaking alleen in `beforeAll`: zonder credentials
 *    werd de opbouw overgeslagen en faalde elke `it` daarna alsnog, op een
 *    ontbrekende fixture. Dan is `npm test` rood om een reden die niets met
 *    de code te maken heeft — precies het faalbeeld dat QS8-116 opruimde.
 */
describe.skipIf(!rlsTestsConfigured)('EPIC 11 — meldingen', () => {
  let f: Fixture;

  beforeAll(async () => {
    if (!rlsTestsConfigured) return;

    const [alice, bob] = await Promise.all([
      createTestUser('push-alice'),
      createTestUser('push-bob'),
    ]);

    f = { alice, bob };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    await removeTestUsers();
  }, 60_000);

  describe('push_tokens', () => {
    it(
      'laat je je eigen token registreren via de RPC',
      async () => {
        // De positieve controle. Zonder deze bewijzen de weigeringen hieronder
        // alleen dat de tabel onbruikbaar is.
        const uitkomst = await registreer(f.alice, `tok-alice-${Date.now()}`, 'ios');
        expect(uitkomst.ok).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de client de tabel niet meer rechtstreeks beschrijven',
      async () => {
        // ⚠️ De RPC is de enige weg naar binnen (migratie 0055). Kon je er zelf
        //    in schrijven, dan zet ik jouw user_id op mijn apparaat en krijg ik
        //    jouw meldingen — inclusief "een buddy wacht op je" met een naam.
        const uitkomst = await f.alice.db
          .from('push_tokens')
          .insert({ user_id: f.bob.id, token: `tok-gestolen-${Date.now()}`, platform: 'ios' });

        expect(uitkomst.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een onbekend platform en een leeg token',
      async () => {
        expect((await registreer(f.alice, 'tok-geldig-genoeg', 'symbian')).reason).toBe(
          'onbekend_platform',
        );
        expect((await registreer(f.alice, 'kort', 'ios')).reason).toBe('geen_token');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat je het token van een ander niet zien',
      async () => {
        const admin = adminDb();
        const token = `tok-bob-${Date.now()}`;

        await admin
          .from('push_tokens')
          .insert({ user_id: f.bob.id, token, platform: 'android' });

        const alsAlice = await f.alice.db.from('push_tokens').select('id').eq('token', token);
        expect(alsAlice.data ?? []).toHaveLength(0);

        // En bob ziet hem wél — de tegentest.
        const alsBob = await f.bob.db.from('push_tokens').select('id').eq('token', token);
        expect(alsBob.data ?? []).toHaveLength(1);

        await admin.from('push_tokens').delete().eq('token', token);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt een token bij één account: wie zich het laatst registreert, wint',
      async () => {
        // ⚠️ Dit is het gedeelde-apparaatgeval. De unieke index op `token` is
        //    wat het afdwingt; zonder die index staat hetzelfde apparaat bij
        //    twee accounts en krijgt het beide stromen meldingen.
        const admin = adminDb();
        const token = `tok-gedeeld-${Date.now()}`;

        // ⚠️ Dit geval liep in de eerste opzet stuk op 42501, en dat is precies
        //    waarom deze test bestaat: de nieuwe gebruiker kón de rij van de
        //    vorige niet overnemen, dus bleven diens meldingen binnenkomen op
        //    een telefoon die nu bij iemand anders lag.
        expect((await registreer(f.alice, token, 'web', WEBSLEUTELS)).ok).toBe(true);

        const tweede = await registreer(f.bob, token, 'web', WEBSLEUTELS);
        expect(tweede.ok).toBe(true);

        const rijen = await admin.from('push_tokens').select('user_id').eq('token', token);
        expect(rijen.data ?? []).toHaveLength(1);
        expect(rijen.data?.[0]?.user_id).toBe(f.bob.id);

        await admin.from('push_tokens').delete().eq('token', token);
      },
      TEST_TIMEOUT,
    );
  });

  describe('notifications_sent', () => {
    it(
      'kan door de client niet geschreven worden',
      async () => {
        // ⚠️ Wie zijn eigen "verstuurd"-rij mag schrijven, kan zijn nudge
        //    onderdrukken door hem vooraf als verzonden te melden. Klein, maar
        //    het is precies de vorm waar dit project vaker op gestruikeld is:
        //    de gebruiker mag het gevólg van een regel niet zelf zetten.
        const uitkomst = await f.alice.db.from('notifications_sent').insert({
          user_id: f.alice.id,
          kind: 'nudge',
          local_date: '2026-08-21',
        });

        expect(uitkomst.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat je je eigen geschiedenis zien en die van een ander niet',
      async () => {
        const admin = adminDb();

        await admin.from('notifications_sent').insert({
          user_id: f.bob.id,
          kind: 'nudge',
          local_date: '2026-08-20',
        });

        const alsAlice = await f.alice.db
          .from('notifications_sent')
          .select('id')
          .eq('user_id', f.bob.id);
        expect(alsAlice.data ?? []).toHaveLength(0);

        const alsBob = await f.bob.db.from('notifications_sent').select('id');
        expect((alsBob.data ?? []).length).toBeGreaterThan(0);

        await admin.from('notifications_sent').delete().eq('user_id', f.bob.id);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De kern van "maximaal één per dag, ook bij meerdere doelen" (QS8-77) en
     *    "geen dubbele notificaties bij meerdere groepen of doelen" (QS8-91).
     *    Dit kún je niet in de verzendcode oplossen: een job die twee keer
     *    draait stuurt dan alsnog dubbel. De partiële unieke index is de grendel.
     */
    it(
      'weigert een tweede nudge op dezelfde dag',
      async () => {
        const admin = adminDb();
        const rij = { user_id: f.alice.id, kind: 'nudge', local_date: '2026-08-19' };

        const eerste = await admin.from('notifications_sent').insert(rij);
        expect(eerste.error).toBeNull();

        const tweede = await admin.from('notifications_sent').insert(rij);
        expect(tweede.error).not.toBeNull();
        expect(tweede.error?.code).toBe('23505');

        await admin.from('notifications_sent').delete().eq('user_id', f.alice.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'staat wél twee meldingen over verschillende onderwerpen toe',
      async () => {
        // De tegentest bij de vorige. Twee buddy's die op je wachten zijn twee
        // verzoeken; samenvoegen tot één zou de melding onbruikbaar maken.
        const admin = adminDb();
        const een = '11111111-1111-1111-1111-111111111111';
        const twee = '22222222-2222-2222-2222-222222222222';

        const a = await admin.from('notifications_sent').insert({
          user_id: f.alice.id,
          kind: 'approval_request',
          local_date: '2026-08-19',
          ref_type: 'completion',
          ref_id: een,
        });
        const b = await admin.from('notifications_sent').insert({
          user_id: f.alice.id,
          kind: 'approval_request',
          local_date: '2026-08-19',
          ref_type: 'completion',
          ref_id: twee,
        });

        expect(a.error).toBeNull();
        expect(b.error).toBeNull();

        await admin.from('notifications_sent').delete().eq('user_id', f.alice.id);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De allowlist. Een vijfde soort toevoegen hoort een migratie te vragen,
     *    zodat er een moment is waarop iemand zich afvraagt of hij domeinregel 7
     *    breekt. Precies zoals `chat_messages_system_event_bekend` dat doet voor
     *    systeemberichten.
     */
    it(
      'weigert een soort melding die niet op de lijst staat',
      async () => {
        const uitkomst = await adminDb().from('notifications_sent').insert({
          user_id: f.alice.id,
          kind: 'buddy_missed_week',
          local_date: '2026-08-19',
        });

        expect(uitkomst.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  describe('te_beoordelen_voor', () => {
    it(
      'is niet aanroepbaar door een gewone gebruiker',
      async () => {
        // ⚠️ Wie dit voor een willekeurige id mag aanroepen, leest wie er in
        //    andermans groep op een oordeel wacht — en daarmee dat die persoon
        //    zijn week nog niet rond heeft. Dat is domeinregel 7.
        const db = f.alice.db as unknown as {
          rpc: (naam: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
        };

        const uitkomst = await db.rpc('te_beoordelen_voor', { p_user_id: f.bob.id });
        expect(uitkomst.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
