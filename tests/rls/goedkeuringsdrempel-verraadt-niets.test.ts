/**
 * `vereiste_goedkeuringen()` verraadt geen lidmaatschap — QS8-181, migratie 0249.
 *
 * ⚠️ **De belofte is niet "de drempel klopt" maar "een buitenstaander kan er
 *    niemand mee opzoeken".** Dat verschil is het hele issue. De functie is
 *    `SECURITY DEFINER`, mag door `authenticated` aangeroepen worden, en zijn
 *    antwoord hing van een pérsoon af: `beoordelaars` telt de actieve leden
 *    minus `p_owner`. Wie het groeps-uuid en een gebruikers-uuid had, las
 *    daarmee uit `group_members` — de tabel waar domeinregel 7 aan hangt —
 *    terwijl `select … from group_members` hem nul rijen gaf.
 *
 * ⚠️ **Vier leden en `majority`, en dat is geen willekeur.** Bij drie leden
 *    haalt de klem `least(…, greatest(b.n, 1))` het verschil eruit en geven
 *    lid en niet-lid allebei 2 — dan is deze test groen zonder iets te bewijzen.
 *    Bij `approval_rule = 'any'` (de standaard) is er sowieso niets te zien.
 *    📏 Gemeten: met vier actieve leden gaf de oude functie een buitenstaander
 *    2 voor een lid en 3 voor een niet-lid.
 *
 * ⚠️ **De tweede test staat er om de derde tak van de poort te bewaken**, en die
 *    tak is geen beleefdheid: `bevries_goedkeuringsdrempel()` vuurt bij het
 *    insert op `completions` en schrijft de uitkomst in een `not null`-kolom.
 *    `completions_insert` eist eigenaarschap maar geen lidmaatschap, dus zonder
 *    `auth.uid() = p_owner` valt de indiening om van iemand die nog een
 *    gekoppeld doel heeft maar in die groep op `inactive` staat. Een grendel die
 *    een indiening laat omvallen is een storing en geen weigering.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

describe.skipIf(!rlsTestsConfigured)('vereiste_goedkeuringen verraadt geen lidmaatschap', () => {
  let groupId: string;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let buiten: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('drempel-alice');
    bob = await createTestUser('drempel-bob');
    carol = await createTestUser('drempel-carol');
    dave = await createTestUser('drempel-dave');
    buiten = await createTestUser('drempel-buiten');

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Drempelproef' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const uit = (gemaakt.data ?? {}) as { group?: { id: string; invite_code: string } };
    if (!uit.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);
    groupId = uit.group.id;

    for (const lid of [bob, carol, dave]) {
      const mee = await lid.db.rpc('join_group_with_code', { code: uit.group.invite_code });
      if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
    }

    // ⚠️ Met de hand gezet: er is geen client-pad naar `approval_rule`, en dat
    //    hoort ook zo — de regel is een groepsinstelling en geen kolom die een
    //    lid schrijft. Zie de kop voor waarom juist `majority` nodig is.
    const regel = await adminDb()
      .from('groups')
      .update({ approval_rule: 'majority' })
      .eq('id', groupId);
    if (regel.error) throw new Error(`regel: ${regel.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ Dit is de belofte in haar kortste vorm: het antwoord dat een
   *    buitenstaander krijgt, mag niet verschillen tussen een lid en een
   *    willekeurige ander. Zou hier `toBeNull()` alléén staan, dan zou de test
   *    ook groen kunnen blijven met een poort die per persoon een ánder soort
   *    leegte teruggeeft.
   */
  it(
    'geeft een buitenstaander hetzelfde antwoord over een lid als over een vreemde',
    async () => {
      const overEenLid = await buiten.db.rpc('vereiste_goedkeuringen', {
        p_group_id: groupId,
        p_owner: bob.id,
      });
      // ⚠️ **Een uuid van niemand, en met opzet niet dat van de aanroeper zelf.**
      //    Vraagt een buitenstaander naar zíjn eigen drempel, dan antwoordt de
      //    poort met zoveel woorden (tak twee — zie de kop van 0249), en dan
      //    vergelijkt deze test een gesloten met een open tak in plaats van twee
      //    personen. Wat hier naast elkaar ligt is precies het verschil dat het
      //    orakel was: iemand die lid is tegenover iemand die dat niet is.
      const overEenVreemde = await buiten.db.rpc('vereiste_goedkeuringen', {
        p_group_id: groupId,
        p_owner: '00000000-0000-4000-8000-00000000dead',
      });

      expect(overEenLid.error).toBeNull();
      expect(overEenVreemde.error).toBeNull();
      expect(overEenLid.data).toEqual(overEenVreemde.data);
      expect(overEenLid.data).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een lid van de groep wél de echte drempel',
    async () => {
      const gezien = await bob.db.rpc('vereiste_goedkeuringen', {
        p_group_id: groupId,
        p_owner: alice.id,
      });

      expect(gezien.error).toBeNull();
      // Vier actieve leden, `majority`, en de eigenaar telt niet mee: (3 / 2) + 1.
      expect(gezien.data).toBe(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * De derde tak van de poort. Zie de kop: zonder `auth.uid() = p_owner` schrijft
   * `bevries_goedkeuringsdrempel()` hier `null` in een `not null`-kolom en valt
   * de hele indiening om.
   */
  it(
    'laat een eigenaar die in de groep op inactive staat zijn week nog indienen',
    async () => {
      const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());

      const doel = await dave.db
        .from('goals')
        .insert({ owner_id: dave.id, title: 'Nog gekoppeld', target_date: cyclus.endDate })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

      const koppel = await dave.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: groupId });
      if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);

      const week = await dave.db
        .from('weekly_goals')
        .insert({ goal_id: doel.data.id, title: 'Week', cycle_start_date: cyclus.startDate })
        .select('id')
        .single();
      if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

      // ⚠️ Met de hand op `inactive`, want dat is precies de toestand die geen
      //    enkel client-pad achterlaat: de koppeling blijft staan terwijl het
      //    lidmaatschap weg is.
      const uit = await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', groupId)
        .eq('user_id', dave.id);
      if (uit.error) throw new Error(`uitzetten: ${uit.error.message}`);

      const ingediend = await dave.db.from('completions').insert({
        weekly_goal_id: week.data.id,
        user_id: dave.id,
        achieved_level: 'ceiling',
        // ⚠️ De groep staat op `note_required`; zonder notitie weigert de CHECK
        //    en meet deze test een ándere weigering dan de bedoelde.
        note: 'Gedaan.',
        cycle_start_date: cyclus.startDate,
      });

      expect(ingediend.error).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
