/**
 * De rem van migratie 0090, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ **Dit is een test op de belofte en niet op een onderdeel** (onwrikbare
 *    regel 18). De belofte is niet "`berichten_over()` rekent goed" — dat is een
 *    eigenschap van de functie, en die blijft kloppen als iemand de aanroep uit
 *    de policy haalt. De belofte is: *een ingelogd account kan deze tabel niet
 *    vol schrijven*. Daarom telt hier alleen wat er na een insert-poging
 *    daadwerkelijk in de tabel staat.
 *
 * ⚠️ **De rijen worden met `adminDb()` klaargezet en niet met vijfhonderd echte
 *    inserts.** Die zouden de policy vijfhonderd keer laten slagen en daarna één
 *    keer laten falen — hetzelfde bewijs, maar minutenlang. `service_role` valt
 *    buiten een policy die `to authenticated` staat, dus dit is precies de
 *    situatie die de rem moet vinden: een teller die al vol is.
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
const TEST_TIMEOUT = 60_000;

/** Zoals in 0090. Staat hier als spiegel, niet als bron — zie de laatste test. */
const CHATLIMIET = 500;

interface Groep {
  id: string;
  code: string;
}

describe.skipIf(!rlsTestsConfigured)('de rem van 0090', () => {
  let alice: TestUser;
  let bob: TestUser;
  let groep: Groep;

  async function maakGroep(eigenaar: TestUser, naam: string): Promise<Groep> {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

    const gelezen = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gelezen.ok !== true || !gelezen.group) {
      throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
    }
    return { id: gelezen.group.id, code: gelezen.group.invite_code };
  }

  async function aantalVan(gebruiker: TestUser): Promise<number> {
    const { count, error } = await adminDb()
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', gebruiker.id);
    if (error) throw new Error(`tellen mislukte: ${error.message}`);
    return count ?? 0;
  }

  /** Vult de teller van `gebruiker` aan tot `tot`, buiten de policy om. */
  async function vulAanTot(gebruiker: TestUser, tot: number): Promise<void> {
    const nu = await aantalVan(gebruiker);
    if (nu >= tot) return;

    const rijen = Array.from({ length: tot - nu }, (_, i) => ({
      group_id: groep.id,
      sender_id: gebruiker.id,
      body: `opvulling ${i}`,
      type: 'text',
    }));

    for (let i = 0; i < rijen.length; i += 100) {
      const { error } = await adminDb().from('chat_messages').insert(rijen.slice(i, i + 100));
      if (error) throw new Error(`opvullen mislukte: ${error.message}`);
    }
  }

  beforeAll(async () => {
    alice = await createTestUser('rem-alice');
    bob = await createTestUser('rem-bob');

    groep = await maakGroep(alice, 'Rem');

    const { data, error } = await bob.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
    if ((data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`meedoen mislukte: ${JSON.stringify(data)}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een lid met ruimte kan gewoon schrijven',
    async () => {
      const { error } = await alice.db.from('chat_messages').insert({
        group_id: groep.id,
        sender_id: alice.id,
        body: 'eerste bericht',
        type: 'text',
      });

      expect(error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de teller loopt mee met wat er staat',
    async () => {
      const gestuurd = await aantalVan(alice);
      const { data, error } = await alice.db.rpc('berichten_over');

      expect(error).toBeNull();
      expect(data).toBe(CHATLIMIET - gestuurd);
    },
    TEST_TIMEOUT,
  );

  it(
    'een vol budget houdt de volgende insert tegen, en de rij komt er niet',
    async () => {
      await vulAanTot(alice, CHATLIMIET);

      const voor = await aantalVan(alice);
      expect(voor).toBe(CHATLIMIET);

      const { error } = await alice.db.from('chat_messages').insert({
        group_id: groep.id,
        sender_id: alice.id,
        body: 'dit mag niet landen',
        type: 'text',
      });

      // ⚠️ De foutcode én de telling. Alleen de code is te weinig: een typo in
      //    een kolomnaam geeft ook een fout en laat de tabel ook ongemoeid.
      //    Alleen de telling is óók te weinig: dan bewijst een filter dat niets
      //    raakt evenveel als een policy die weigert.
      expect(error?.code).toBe('42501');
      expect(await aantalVan(alice)).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  it(
    'de rem geldt per persoon en niet per groep',
    async () => {
      // ⚠️ Dit is de test die een `count(*) where group_id = …` zou betrappen.
      //    Alice zit op de limiet in déze groep; Bob mag er ongehinderd langs.
      //    Zonder deze test zou een rem per groep er precies zo groen uitzien —
      //    en dan zet één spammer de hele groep stil, wat een aanval is en geen
      //    bescherming.
      expect(await aantalVan(alice)).toBe(CHATLIMIET);

      const { error } = await bob.db.from('chat_messages').insert({
        group_id: groep.id,
        sender_id: bob.id,
        body: 'bob heeft nog ruimte',
        type: 'text',
      });

      expect(error).toBeNull();
      expect(await bob.db.rpc('berichten_over').then((r) => r.data)).toBe(CHATLIMIET - 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'de grens in de database is dezelfde als die deze test aanneemt',
    async () => {
      // ⚠️ **De naad.** `CHATLIMIET` hierboven is een kopie, en een kopie loopt
      //    uit de pas — dat is precies de vorm die 0032/0034 duur maakte: de
      //    test vergeleek de app-lijst met zichzélf terwijl de CHECK al iets
      //    anders zei. Hier vraagt de test het getal daarom één keer aan de
      //    database zelf, met een verse gebruiker die nog niets gestuurd heeft.
      const vers = await createTestUser('rem-vers');
      const { data, error } = await vers.db.rpc('berichten_over');

      expect(error).toBeNull();
      expect(data).toBe(CHATLIMIET);
    },
    TEST_TIMEOUT,
  );

  it(
    'zonder sessie is het antwoord nul en niet de hele limiet',
    async () => {
      // ⚠️ De `auth.uid()`-NULL-val. Elke definer-functie hier is een kopie van
      //    de vorige, en die val kostte in augustus veertig regels omdat precies
      //    één functie hem had. Een teller die zonder sessie "500" zegt, opent
      //    de policy in plaats van hem te sluiten.
      const definitie = await adminDb().rpc('berichten_over');

      // `adminDb()` draait als service_role en heeft dus geen auth.uid().
      expect(definitie.error).toBeNull();
      expect(definitie.data).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
