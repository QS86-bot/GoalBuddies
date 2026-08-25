/**
 * `schuif_weekdoel_door()` uit migratie 0091 — de bevinding van 20-08 over
 * `schuifDoor()`, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ **De belofte is niet "de RPC doet twee dingen" maar "er is geen moment
 *    waarop het ene wel gebeurd is en het andere niet".** Dat verschil is de
 *    hele reden dat deze migratie bestaat, en het is precies het soort ding dat
 *    een test op de onderdelen mist: zowel `update ... carried` als de insert
 *    werkte prima in de oude opzet, en tóch kon een gebruiker zijn weekdoel
 *    kwijtraken.
 *
 *    Daarom staat hier een test die de ínsert laat mislukken en daarna kijkt of
 *    de oude rij nog `missed` is. Onder de oude opzet — twee losse RPC-aanroepen
 *    — was die rij dan al `carried` en gecommit, en was de test rood.
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

/** Zoals in 0091. Staat hier als spiegel, niet als bron — zie de laatste test. */
const WEEKDOELLIMIET = 200;

function uitkomst(data: unknown): { ok?: boolean; reason?: string; weekdoel?: Record<string, unknown> } {
  return (data ?? {}) as { ok?: boolean; reason?: string; weekdoel?: Record<string, unknown> };
}

describe.skipIf(!rlsTestsConfigured)('0091 — doorschuiven in één keer', () => {
  let alice: TestUser;
  let doelId: string;

  /** Een gemist weekdoel, klaar om doorgeschoven te worden. */
  async function gemisteWeek(titel: string, start: string, index: number): Promise<string> {
    const { data, error } = await adminDb()
      .from('weekly_goals')
      .insert({
        goal_id: doelId,
        title: titel,
        floor_text: 'de vloer van ' + titel,
        ceiling_text: 'het plafond van ' + titel,
        cycle_start_date: start,
        cycle_index: index,
        status: 'missed',
      })
      .select('id')
      .single();
    if (error || data === null) throw new Error(`opbouw ${titel}: ${error?.message}`);
    return data.id;
  }

  async function statusVan(id: string): Promise<string | null> {
    const { data } = await adminDb().from('weekly_goals').select('status').eq('id', id).single();
    return data?.status ?? null;
  }

  beforeAll(async () => {
    alice = await createTestUser('schuif-alice');

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Doorschuifdoel', target_date: '2026-12-31' })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('weekly_goals').delete().eq('goal_id', doelId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'zet de oude week op carried en levert de opvolger in één antwoord',
    async () => {
      const oud = await gemisteWeek('Eerste', '2026-06-01', 1);

      const { data, error } = await alice.db.rpc('schuif_weekdoel_door', {
        p_weekly_goal_id: oud,
        p_cycle_start_date: '2026-06-08',
        p_cycle_index: 2,
      });

      expect(error).toBeNull();
      const u = uitkomst(data);
      expect(u.ok).toBe(true);
      expect(await statusVan(oud)).toBe('carried');

      // ⚠️ De opvolger komt mee terug. In de oude opzet moest de client daar een
      //    tweede aanroep voor doen, en juist tússen die twee zat het gat.
      expect(u.weekdoel?.status).toBe('todo');
      expect(u.weekdoel?.cycle_start_date).toBe('2026-06-08');
      expect(u.weekdoel?.cycle_index).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'kopieert de inhoud uit de oude rij, want de client stuurt hem niet meer mee',
    async () => {
      // ⚠️ Tot 0091 stuurde `schuifDoor()` de titel en de vloer- en plafondtekst
      //    terug die het scherm toevallig in handen had, en niets toetste dat die
      //    hoorden bij de rij die werd doorgeschoven. De RPC heeft die parameters
      //    niet meer — dus dit kán niet meer afwijken, en deze test bewaakt dat
      //    de inhoud er wél is en niet leeg meekomt.
      const oud = await gemisteWeek('Tweede', '2026-06-15', 3);

      const { data } = await alice.db.rpc('schuif_weekdoel_door', {
        p_weekly_goal_id: oud,
        p_cycle_start_date: '2026-06-22',
        p_cycle_index: 4,
      });

      const nieuw = uitkomst(data).weekdoel;
      expect(nieuw?.title).toBe('Tweede');
      expect(nieuw?.floor_text).toBe('de vloer van Tweede');
      expect(nieuw?.ceiling_text).toBe('het plafond van Tweede');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de oude week op missed staan als de opvolger niet gemaakt kan worden',
    async () => {
      // ⚠️ **Dit is de test waar deze migratie om draait.** `cycle_start_date` is
      //    `not null`, dus met `null` mislukt de insert — nádat de update de rij
      //    al op `carried` heeft gezet. Draait alles in één transactie, dan wordt
      //    die update meegerold en staat de rij nog op `missed`.
      //
      //    Onder de oude opzet waren dit twee losse RPC-aanroepen en dus twee
      //    transacties: de eerste was dan al gecommit en deze test was rood. Zo
      //    ziet een test op de náád eruit in plaats van op de onderdelen.
      const oud = await gemisteWeek('Derde', '2026-07-01', 5);

      const { error } = await alice.db.rpc('schuif_weekdoel_door', {
        p_weekly_goal_id: oud,
        p_cycle_start_date: null as unknown as string,
        p_cycle_index: 6,
      });

      expect(error).not.toBeNull();
      expect(await statusVan(oud)).toBe('missed');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een week die niet gemist is, en raakt hem niet aan',
    async () => {
      const { data: open, error: opbouw } = await adminDb()
        .from('weekly_goals')
        .insert({
          goal_id: doelId,
          title: 'Nog open',
          cycle_start_date: '2026-07-08',
          cycle_index: 7,
          status: 'todo',
        })
        .select('id')
        .single();
      if (opbouw || open === null) throw new Error(`opbouw: ${opbouw?.message}`);

      const { data } = await alice.db.rpc('schuif_weekdoel_door', {
        p_weekly_goal_id: open.id,
        p_cycle_start_date: '2026-07-15',
        p_cycle_index: 8,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('not_missed');
      expect(await statusVan(open.id)).toBe('todo');
    },
    TEST_TIMEOUT,
  );

  it(
    'de dagelijkse bovengrens geldt ook via deze RPC, en niet alleen via de policy',
    async () => {
      // ⚠️ **De naad die deze migratie zélf introduceerde.** `schuif_weekdoel_door()`
      //    is SECURITY DEFINER en loopt dus om `weekly_goals_insert` heen — en
      //    daarmee om de bovengrens van 0083. Zonder de toets in de functie is
      //    doorschuiven het gat in die limiet, en niets zou daar rood van worden:
      //    de policy klopt, de RPC klopt, en samen lekken ze.
      const admin = adminDb();
      const { count } = await admin
        .from('weekly_goals')
        .select('id', { count: 'exact', head: true })
        .eq('goal_id', doelId);

      const tekort = WEEKDOELLIMIET - (count ?? 0);
      const opvulling = Array.from({ length: tekort }, (_, i) => ({
        goal_id: doelId,
        title: `opvulling ${i}`,
        cycle_start_date: '2026-08-03',
        cycle_index: 1000 + i,
        status: 'todo',
      }));
      for (let i = 0; i < opvulling.length; i += 100) {
        const { error } = await admin.from('weekly_goals').insert(opvulling.slice(i, i + 100));
        if (error) throw new Error(`opvullen: ${error.message}`);
      }

      expect(await alice.db.rpc('weekdoelen_over').then((r) => r.data)).toBe(0);

      const oud = await gemisteWeek('Over de grens', '2026-08-10', 9);
      const { data } = await alice.db.rpc('schuif_weekdoel_door', {
        p_weekly_goal_id: oud,
        p_cycle_start_date: '2026-08-17',
        p_cycle_index: 10,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('te_veel_deze_dag');
      // En de oude week blijft staan, dus er is niets kwijt.
      expect(await statusVan(oud)).toBe('missed');
    },
    TEST_TIMEOUT,
  );

  it(
    'de grens in de database is dezelfde die deze test aanneemt',
    async () => {
      // ⚠️ Zelfde naad als in `rem.test.ts`: de constante hierboven is een kopie,
      //    en een kopie loopt uit de pas. Een verse gebruiker vraagt het getal
      //    daarom één keer aan de database zelf.
      const vers = await createTestUser('schuif-vers');
      const { data, error } = await vers.db.rpc('weekdoelen_over');

      expect(error).toBeNull();
      expect(data).toBe(WEEKDOELLIMIET);
    },
    TEST_TIMEOUT,
  );
});
