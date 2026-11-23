/**
 * De strafkaart noemt voor de eigenaar de begunstigde — QS8-800, geen migratie.
 *
 * ⚠️ **De belofte is niet "de eigenaar ziet een naam" maar "niemand anders leest
 *    iets nieuws".** De kaart leest de naam via `BEGUNSTIGDE_BRON`, dezelfde
 *    constante die de app gebruikt; verhuist de naam ooit naar een bredere bron
 *    (een view, een definer-RPC), dan loopt deze test die route mee af en wordt
 *    hij rood zodra een ander account er iets mee leest.
 *
 * ⚠️ **"Vóór deze wijziging" is hier letterlijk vastgelegd**, want QS8-800 raakt
 *    de database niet. Per ander account staat er wat het leest:
 *    - bob, lid van de begunstigde groep én getuige van de tweede straf: nul
 *      straffen zolang ze `set` zijn (domeinregel 11), dus hij komt niet eens bij
 *      een begunstigde-id;
 *    - carol, die met niemand een groep deelt: nul straffen, de groepsnaam niet,
 *      en geen enkele `display_name` via deze bron.
 *
 * ⚠️ **En de eigenaar zelf leest niet méér dan RLS hem geeft.** Wie de groep
 *    verlaat, krijgt nul rijen voor de groepsnaam; dan noemt de kaart alleen de
 *    soort. Een definer-omweg zou hier groen geven — daarom staat dat geval erin.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 23-11-2026, lokale
 *    stack, telkens één mutatie via psql en daarna de originele policy terug):
 *    1. `groups_select` → `using (true)`: alleen "carol leest de groepsnaam niet"
 *       en "na het verlaten leest alice de groepsnaam niet meer" rood.
 *    2. `profiles_select` → `using (true)`: alleen "carol leest via de bron geen
 *       naam van alice of bob" en "vertrekt de getuige … leest alice zijn naam
 *       niet meer" rood.
 *    2b. In `shares_group_with_user()` de actief-toets op de ánder weg: alleen
 *       "vertrekt de getuige …" rood.
 *    3. `commitments_select` → `using (true)`: alleen "bob leest de straffen van
 *       alice niet zolang ze set zijn" en "carol leest de straffen van alice niet"
 *       rood.
 *
 * Teamgroep als begunstigde: dezelfde route (`groups_select`), en de database
 * verandert niet; wat de teamgroep ziet, verandert dus niet. Een aparte opstelling
 * met organisatie en aandeel staat hier bewust niet — zie het AFGELEVERD-bericht.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BEGUNSTIGDE_BRON } from '../../src/modules/commitments/begunstigde-bron';
import { COMMITMENT_KOLOMMEN } from '../../src/modules/commitments/kolommen';
import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestDb,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;
const GROEPSNAAM = 'Begunstigdegroep 800';

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  carol: TestUser;
  groepId: string;
  groepsdoelId: string;
  persoonsdoelId: string;
}

let w: Wereld;

async function leesNaam(db: TestDb, soort: 'groep' | 'persoon', id: string): Promise<readonly unknown[]> {
  const bron = BEGUNSTIGDE_BRON[soort];
  const { data, error } = await db
    .from(bron.tabel)
    .select<string, Record<string, string | null>>(bron.kolom)
    .eq('id', id)
    .limit(1);
  expect(error, `lezen via de bron: ${error?.message}`).toBeNull();
  return (data ?? []).map((rij) => rij[bron.kolom]);
}

describe.skipIf(!rlsTestsConfigured)('QS8-800: de naam van de begunstigde op de strafkaart', () => {
  beforeAll(async () => {
    const [alice, bob, carol] = await Promise.all([
      createTestUser('qs800-alice'),
      createTestUser('qs800-bob'),
      createTestUser('qs800-carol'),
    ]);
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: GROEPSNAAM });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    registreerGroep(gd.group.id);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    // Twee doelen: één straf per doel (een doel draagt hoogstens één open straf).
    const doelen = await alice.db
      .from('goals')
      .insert([
        { owner_id: alice.id, title: 'QS800 groep', target_date: addDays(vandaag, 60) },
        { owner_id: alice.id, title: 'QS800 persoon', target_date: addDays(vandaag, 60) },
      ])
      .select('id, title');
    if (doelen.error || !doelen.data) throw new Error(`doel: ${doelen.error?.message}`);
    const groepsdoel = doelen.data.find((d) => d.title === 'QS800 groep')?.id ?? '';
    const persoonsdoel = doelen.data.find((d) => d.title === 'QS800 persoon')?.id ?? '';

    for (const [goal_id, begunstigde] of [
      [groepsdoel, { beneficiary_group_id: gd.group.id }],
      [persoonsdoel, { beneficiary_user_id: bob.id }],
    ] as const) {
      const s = await alice.db
        .from('commitments')
        .insert({ goal_id, type: 'penalty', body: 'Ik trakteer', confirmed_at: 'now', ...begunstigde });
      if (s.error) throw new Error(`straf: ${s.error.message}`);
    }

    w = { alice, bob, carol, groepId: gd.group.id, groepsdoelId: groepsdoel, persoonsdoelId: persoonsdoel };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function alleStraffen(db: TestDb) {
    const { data, error } = await db
      .from('commitments')
      .select<string, { beneficiary_group_id: string | null; beneficiary_user_id: string | null }>(COMMITMENT_KOLOMMEN)
      .in('goal_id', [w.groepsdoelId, w.persoonsdoelId]);
    expect(error, `straffen lezen: ${error?.message}`).toBeNull();
    return data ?? [];
  }

  it(
    'de eigenaar leest de naam van de groep en van de getuige',
    async () => {
      const straffen = await alleStraffen(w.alice.db);
      expect(straffen).toHaveLength(2);

      const groep = straffen.find((s) => s.beneficiary_group_id !== null);
      const persoon = straffen.find((s) => s.beneficiary_user_id !== null);
      expect(await leesNaam(w.alice.db, 'groep', groep?.beneficiary_group_id ?? '')).toEqual([GROEPSNAAM]);

      const verwacht = await adminDb().from('profiles').select('display_name').eq('id', w.bob.id).single();
      expect(await leesNaam(w.alice.db, 'persoon', persoon?.beneficiary_user_id ?? '')).toEqual([
        verwacht.data?.display_name,
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    'bob leest de straffen van alice niet zolang ze set zijn',
    async () => {
      // Lid van de begunstigde groep én zelf de getuige: geen van beide geeft
      // hem vóór `due` iets (domeinregel 11). Zonder rij geen begunstigde-id.
      expect(await alleStraffen(w.bob.db)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'carol leest de straffen van alice niet',
    async () => {
      expect(await alleStraffen(w.carol.db)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'carol leest de groepsnaam niet',
    async () => {
      expect(await leesNaam(w.carol.db, 'groep', w.groepId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'carol leest via de bron geen naam van alice of bob',
    async () => {
      expect(await leesNaam(w.carol.db, 'persoon', w.alice.id)).toEqual([]);
      expect(await leesNaam(w.carol.db, 'persoon', w.bob.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'na het verlaten leest alice de groepsnaam niet meer, ook niet via haar eigen straf',
    async () => {
      const admin = adminDb();
      await admin
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', w.groepId)
        .eq('user_id', w.alice.id);
      try {
        // De straf zelf blijft van haar; alleen de naam valt weg.
        const straffen = await alleStraffen(w.alice.db);
        expect(straffen.some((s) => s.beneficiary_group_id === w.groepId)).toBe(true);
        expect(await leesNaam(w.alice.db, 'groep', w.groepId)).toEqual([]);
      } finally {
        await admin
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.groepId)
          .eq('user_id', w.alice.id);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'vertrekt de getuige uit de enige gedeelde groep, dan leest alice zijn naam niet meer',
    async () => {
      // Security-ronde QS8-800: het spiegelgeval van de groep. Een verruiming van
      // `shares_group_with_user()` naar "ooit lid geweest" maakt dit rood.
      const admin = adminDb();
      await admin
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', w.groepId)
        .eq('user_id', w.bob.id);
      try {
        const straffen = await alleStraffen(w.alice.db);
        expect(straffen.some((s) => s.beneficiary_user_id === w.bob.id)).toBe(true);
        expect(await leesNaam(w.alice.db, 'persoon', w.bob.id)).toEqual([]);
      } finally {
        await admin
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.groepId)
          .eq('user_id', w.bob.id);
      }
    },
    TEST_TIMEOUT,
  );
});
