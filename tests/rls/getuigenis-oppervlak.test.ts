import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * `getuigenissen()` — het oppervlak van de persoon-getuige, QS8-292.
 *
 * ⚠️ **Waarom deze functie bestaat, en waarom het geen `.from('commitments')` is.**
 *    0168 gaf de aangewezen persoon leesrecht op een straf zodra die verschuldigd
 *    wordt. Dat recht werkt, maar het is niet genoeg om er een scherm van te
 *    maken. 📏 Gemeten met een echte opstelling, gelezen als de getuige:
 *
 *    ```
 *    commitments     -> 1 rij, inclusief body
 *    goals           -> 0 rijen
 *    ```
 *
 *    `commitments` draagt geen `owner_id`, en `goals` is voor hem dicht. **Hij
 *    kon dus niet vaststellen van wie de straf was.** Een blok "je bent getuige
 *    van: *ik trakteer op taart*" zonder naam is geen oppervlak maar een raadsel.
 *
 * ⚠️ **De grens die dit bestand bewaakt loopt op twee kanten tegelijk**, en dat
 *    is waarom de laatste twee tests er staan. De functie moet genóeg geven om
 *    een scherm te maken (de naam) en niet méér dan 0168 besloot (het doel blijft
 *    dicht). Een test op alleen de eerste helft zou groen blijven bij een functie
 *    die de hele goals-rij meestuurt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van het doel en instelster van de straf. */
  alice: TestUser;
  /** Groepsgenoot van alice, en de aangewezen getuige. */
  bob: TestUser;
  /** Deelt geen enkele groep met alice. */
  carol: TestUser;
  goalId: string;
  strafId: string;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean } {
  return (data ?? {}) as { ok?: boolean };
}

describe.skipIf(!rlsTestsConfigured)('getuigenissen() — het oppervlak van de getuige', () => {
  beforeAll(async () => {
    const alice = await createTestUser('getuige-alice');
    const bob = await createTestUser('getuige-bob');
    const carol = await createTestUser('getuige-carol');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Getuigegroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'GETUIGEDOEL', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    // ⚠️ Via `adminDb()` en niet via de client: `status` is voor de client niet te
    //    kiezen (0006), en dat hóórt zo — een straf gaat alleen in werking door
    //    een verstreken deadline. Deze test gaat over het lézen, niet over de weg
    //    ernaartoe; die staat in `straf-met-een-persoon.test.ts`.
    const straf = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doel.data.id,
        type: 'penalty',
        body: 'Ik trakteer de hele groep op taart',
        beneficiary_user_id: bob.id,
        status: 'set',
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (straf.error || straf.data === null) throw new Error(`straf: ${straf.error?.message}`);

    w = { alice, bob, carol, goalId: doel.data.id, strafId: straf.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft de getuige niets zolang de straf niet verschuldigd is',
    async () => {
      // ⚠️ De eerste helft van domeinregel 11: een straf treedt alleen in werking
      //    bij een verstreken deadline. Vóór dat moment hoort de getuige niet te
      //    weten dát er een straf is — anders is de inzet zelf al een mededeling.
      const { data, error } = await w.bob.db.rpc('getuigenissen');

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de getuige de straf mét de naam van de eigenaar zodra hij verschuldigd is',
    async () => {
      await adminDb().from('commitments').update({ status: 'due' }).eq('id', w.strafId);

      const { data, error } = await w.bob.db.rpc('getuigenissen');

      expect(error).toBeNull();
      expect((data ?? []).length, 'de getuige ziet zijn eigen getuigenis niet').toBe(1);

      const rij = (data ?? [])[0];
      expect(rij?.body).toBe('Ik trakteer de hele groep op taart');
      expect(rij?.status).toBe('due');

      // ⚠️ **Dit is het veld waarvoor 0169 bestaat.** Zonder de naam is het blok
      //    een raadsel: `commitments` draagt geen `owner_id` en `goals` is voor de
      //    getuige dicht.
      expect(rij?.eigenaar_naam, 'zonder naam is het blok een raadsel').toBeTruthy();
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een vreemde niets, ook niet als de straf verschuldigd is',
    async () => {
      const { data, error } = await w.carol.db.rpc('getuigenissen');

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de eigenaar zelf niets — dit is het oppervlak van de getuige',
    async () => {
      // ⚠️ Alice ziet haar eigen straf op haar dóélscherm, via `fetchCommitments()`.
      //    Zou zij hier ook rijen krijgen, dan stond haar eigen inzet straks onder
      //    de kop "Jij bent getuige" op *Vandaag* — en dan zegt die kop niets meer.
      const { data, error } = await w.alice.db.rpc('getuigenissen');

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt het doel dicht voor de getuige — geen titel, en `goals` blijft leeg',
    async () => {
      // ⚠️ De andere kant van de grens. 0168 besloot dat de getuige de inzet ziet
      //    en het doel niet; deze test wordt rood zodra iemand de doeltitel aan de
      //    functie toevoegt "omdat het handig staat".
      const { data } = await w.bob.db.rpc('getuigenissen');
      const rij = (data ?? [])[0] as Record<string, unknown> | undefined;

      expect(rij, 'de vorige test hoort een rij te hebben opgeleverd').toBeDefined();
      expect(Object.keys(rij ?? {}).sort()).toEqual(
        ['body', 'confirmed_at', 'created_at', 'eigenaar_naam', 'id', 'status', 'type'].sort(),
      );

      const doel = await w.bob.db.from('goals').select('id').eq('id', w.goalId);
      expect(doel.data ?? [], 'de getuige mag het doel niet kunnen lezen').toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
