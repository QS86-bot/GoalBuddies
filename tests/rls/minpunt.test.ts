/**
 * QS8-110 — Het minpunt en de grendel, uitgevoerd in plaats van beredeneerd.
 *
 * ⚠️ **Waarom deze suite bestaat.** Migratie 0064/0065 gaven een gebruiker
 *    zonder buddy geen minpunt meer: wie zijn week door niemand kan laten
 *    goedkeuren, hoort er ook niet voor gestraft te worden. Dat idee klopt. De
 *    uitvoering had een gat dat de security-review van 23-08-2026 vond, en dat
 *    gat is de reden dat de zwaarste test hieronder bestaat.
 *
 *    De vraag "kon iemand deze week beoordelen" werd namelijk gesteld op het
 *    moment dat het punt geboekt werd, en beantwoord door te kijken of het doel
 *    op dát moment aan een groep hing. Allebei de kanten van die koppeling zijn
 *    een knop in je eigen app. Dus: zie vrijdag dat je je week niet haalt,
 *    ontkoppel het doel, laat de rollover langsgaan, koppel maandag terug. Geen
 *    minpunt. Elke slechte week. Dan kan je score alleen nog omhoog, en dat is
 *    precies wat domeinregel 10 verbiedt: "anders is missen gratis en zegt de
 *    score niets".
 *
 *    Migratie 0066 maakt er een grendel van: het antwoord staat op het weekdoel
 *    en beweegt maar één kant op. `mag ontkoppelen zonder gevolg` hieronder is
 *    de regressietest. Gaat die ooit rood, dan is de score weer te sturen.
 *
 * ⚠️ De punten gaan via `adminDb()`. Dat is geen gemak maar de werkelijkheid:
 *    `points_ledger` heeft alleen een SELECT-policy, dus `authenticated` kan er
 *    sowieso niets in schrijven. De rollover schrijft als `service_role`, en dat
 *    is precies wat hier nagebootst wordt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Zit in een groep met bob. */
  alice: TestUser;
  bob: TestUser;
  /** Solo. Geen groep, geen koppeling. */
  carol: TestUser;
  groupId: string;
  /** Doel van alice, aan de groep gekoppeld. Voor de gelukkige route. */
  aliceGoalId: string;
  /** Tweede doel van alice, ook gekoppeld. Hierop wordt ontkoppeld. */
  aliceExploitGoalId: string;
  carolGoalId: string;
  basis: IsoDate;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

/**
 * `kan_beoordeeld_worden` aanroepen langs de typen heen.
 *
 * ⚠️ De cast is hier geen luiheid maar het gevolg van een besluit: de functie is
 *    ingetrokken voor `anon` en `authenticated` (migratie 0064, bevestigd in
 *    0066), en de typegenerator neemt alleen op wat de client mag aanroepen. Dat
 *    hij hier ontbreekt, is dus het bewijs dat de intrekking klopt. Zou hij wél
 *    in `database.types.ts` staan, dan was dat het signaal om te gaan kijken.
 */
function roepKanBeoordeeldWorden(
  db: TestUser['db'],
  args: { p_goal_id: string; p_owner_id: string },
): Promise<{ data: boolean | null; error: { message: string } | null }> {
  const los = db as unknown as {
    rpc(naam: string, args: Record<string, string>): Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  return los.rpc('kan_beoordeeld_worden', args);
}

describe.skipIf(!rlsTestsConfigured)('QS8-110 — Geen minpunt zonder beoordelaar', () => {
  let f: Fixture;
  let teller = 200;

  /** Maakt een weekdoel en geeft id plus de grendelstand terug. */
  async function maakWeekdoel(goalId: string): Promise<{ id: string; beoordeelbaar: boolean }> {
    const admin = adminDb();
    teller += 1;
    const { data, error } = await admin
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: `week ${teller}`,
        cycle_start_date: addDays(f.basis, -7),
        cycle_index: teller,
        status: 'todo',
      })
      .select('id, beoordeelbaar')
      .single();
    if (error) throw new Error(`weekdoel aanmaken: ${error.message}`);
    return { id: data.id, beoordeelbaar: data.beoordeelbaar };
  }

  /** Boekt een minpunt zoals de rollover dat doet, en zegt of de rij er staat. */
  async function boekMinpunt(userId: string, goalId: string, weekdoelId: string): Promise<boolean> {
    const admin = adminDb();
    const { error } = await admin.from('points_ledger').insert({
      user_id: userId,
      goal_id: goalId,
      delta: -1,
      reason: 'cycle_missed',
      ref_type: 'weekly_goal',
      ref_id: weekdoelId,
    });
    // ⚠️ De trigger geeft `null` terug en de insert slaagt zonder rij. Geen fout
    //    dus, en juist daarom kijken we naar de tabel en niet naar `error`.
    if (error) throw new Error(`minpunt boeken: ${error.message}`);

    const { data } = await admin
      .from('points_ledger')
      .select('id')
      .eq('ref_id', weekdoelId)
      .eq('reason', 'cycle_missed');

    return (data ?? []).length > 0;
  }

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('mp-alice');
    const bob = await createTestUser('mp-bob');
    const carol = await createTestUser('mp-carol');

    const maakDoel = async (userId: string, titel: string): Promise<string> => {
      const { data, error } = await admin
        .from('goals')
        .insert({ owner_id: userId, title: titel, category: 'other', target_date: '2026-12-31' })
        .select('id')
        .single();
      if (error) throw new Error(`doel aanmaken: ${error.message}`);
      return data.id;
    };

    const aliceGoalId = await maakDoel(alice.id, 'Minpuntdoel alice');
    const aliceExploitGoalId = await maakDoel(alice.id, 'Ontkoppeldoel alice');
    const carolGoalId = await maakDoel(carol.id, 'Solodoel carol');

    const groep = await alice.db.rpc('create_group', { group_name: 'Minpunt-test' });
    if (groep.error) throw new Error(`groep aanmaken: ${groep.error.message}`);
    const groepData = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid: ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    const koppel = await admin.from('goal_group_links').insert([
      { goal_id: aliceGoalId, group_id: groupId },
      { goal_id: aliceExploitGoalId, group_id: groupId },
    ]);
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now()).startDate;

    f = { alice, bob, carol, groupId, aliceGoalId, aliceExploitGoalId, carolGoalId, basis };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'boekt het minpunt als er een buddy is die had kunnen beoordelen',
    async () => {
      const week = await maakWeekdoel(f.aliceGoalId);
      expect(week.beoordeelbaar).toBe(true);
      expect(await boekMinpunt(f.alice.id, f.aliceGoalId, week.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'slaat het minpunt over als er niemand is die kon beoordelen',
    async () => {
      const week = await maakWeekdoel(f.carolGoalId);
      expect(week.beoordeelbaar).toBe(false);
      expect(await boekMinpunt(f.carol.id, f.carolGoalId, week.id)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  // ⚠️ Dit is de test waar het om gaat. Zie de kop van dit bestand.
  it(
    'laat ontkoppelen na afloop het minpunt niet verdampen',
    async () => {
      const week = await maakWeekdoel(f.aliceExploitGoalId);
      expect(week.beoordeelbaar).toBe(true);

      // Alice ontkoppelt haar eigen doel — met haar eigen client, want dat is
      // precies wat de knop in de app doet. De policy staat dit toe en dat is
      // geen fout: je doel uit een groep halen mag.
      const los = await f.alice.db
        .from('goal_group_links')
        .delete()
        .eq('goal_id', f.aliceExploitGoalId)
        .eq('group_id', f.groupId);
      expect(los.error).toBeNull();

      // De koppeling is echt weg...
      const { data: nu } = await adminDb()
        .from('goal_group_links')
        .select('goal_id')
        .eq('goal_id', f.aliceExploitGoalId);
      expect((nu ?? []).length).toBe(0);

      // ...en het minpunt komt er tóch. De grendel stond al om.
      expect(await boekMinpunt(f.alice.id, f.aliceExploitGoalId, week.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de grendel niet door de eigenaar terugzetten',
    async () => {
      const week = await maakWeekdoel(f.aliceGoalId);
      expect(week.beoordeelbaar).toBe(true);

      // Alice probeert het antwoord zelf op false te zetten. Dat is de tweede
      // route naar hetzelfde doel: niet de koppeling weghalen maar de conclusie.
      await f.alice.db.from('weekly_goals').update({ beoordeelbaar: false }).eq('id', week.id);

      const { data } = await adminDb()
        .from('weekly_goals')
        .select('beoordeelbaar')
        .eq('id', week.id)
        .single();

      expect(data?.beoordeelbaar).toBe(true);
      expect(await boekMinpunt(f.alice.id, f.aliceGoalId, week.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet de grendel om zodra een solodoel alsnog aan een groep hangt',
    async () => {
      const week = await maakWeekdoel(f.carolGoalId);
      expect(week.beoordeelbaar).toBe(false);

      const groep = await f.carol.db.rpc('create_group', { group_name: 'Carol erbij' });
      const groepData = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (groepData.ok !== true || !groepData.group) {
        throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
      }

      const meedoen = await f.bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
      expect(uitkomst(meedoen.data).ok).toBe(true);

      const koppel = await adminDb()
        .from('goal_group_links')
        .insert({ goal_id: f.carolGoalId, group_id: groepData.group.id });
      expect(koppel.error).toBeNull();

      const { data } = await adminDb()
        .from('weekly_goals')
        .select('beoordeelbaar')
        .eq('id', week.id)
        .single();

      expect(data?.beoordeelbaar).toBe(true);
    },
    TEST_TIMEOUT,
  );

  // ⚠️ M1 uit dezelfde review. `kan_beoordeeld_worden` telde alleen `active`,
  //    terwijl de policy die goedkeuring toestaat `<> 'inactive'` gebruikt. Een
  //    buddy op `paused` mág dus goedkeuren; dan hoort het minpunt ook te tellen.
  it(
    'telt een buddy op pauze mee als beoordelaar',
    async () => {
      const admin = adminDb();

      await admin
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', f.groupId)
        .eq('user_id', f.bob.id);

      const { data: kan } = await roepKanBeoordeeldWorden(admin, {
        p_goal_id: f.aliceGoalId,
        p_owner_id: f.alice.id,
      });
      expect(kan).toBe(true);

      await admin
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', f.groupId)
        .eq('user_id', f.bob.id);

      const { data: kanNiet } = await roepKanBeoordeeldWorden(admin, {
        p_goal_id: f.aliceGoalId,
        p_owner_id: f.alice.id,
      });
      expect(kanNiet).toBe(false);

      await admin
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', f.groupId)
        .eq('user_id', f.bob.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een ingelogde gebruiker de vraag niet zelf stellen',
    async () => {
      // Domeinregel 7: uit "kan deze week beoordeeld worden" is af te leiden of
      // iemand een buddy heeft. Die functie is daarom ingetrokken voor
      // `authenticated` en alleen voor `service_role` aanroepbaar.
      const { error } = await roepKanBeoordeeldWorden(f.bob.db, {
        p_goal_id: f.aliceGoalId,
        p_owner_id: f.alice.id,
      });
      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );
});
