/**
 * Het plafond op straffen en de ondergrens op de streefdatum — QS8-293,
 * migratie 0169.
 *
 * ⚠️ **De aanval die dit issue opleverde, en hij was end-to-end gemeten.** Een
 *    doel met `current_date - 30`, vijf straffen erop met dezelfde persoon als
 *    getuige, de rollover zet ze op `due`, en die persoon leest vijf keer 500
 *    tekens vrije tekst die hij niet kan weigeren en niet kan verwijderen.
 *
 * ⚠️ **Waarom het pas iets werd bij QS8-228.** Daarvóór was de begunstigde een
 *    groep waar je zélf lid van was. Nu is het een aangewezen individu. Dezelfde
 *    klasse als spam-uitnodigingen, waar onwrikbare regel 5 wél een limiet eist.
 *
 * ⚠️ **Twee grenzen en twee soorten test.** Het plafond is een unieke index en
 *    geldt dus ook voor `service_role`; de datumgrens zit in een policy en in
 *    twee functies, en die worden apart getoetst — een grens die alleen bij het
 *    aanmaken geldt, verplaats je met de eerste de beste verzetknop.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  groupId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('het plafond op straffen', () => {
  beforeAll(async () => {
    const alice = await createTestUser('plafond-alice');
    const bob = await createTestUser('plafond-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Plafondgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    w = { alice, bob, groupId: gd.group.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een vers doel met een geldige streefdatum. */
  async function versDoel(titel: string): Promise<string> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 90) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    return doel.data.id as string;
  }

  // -------------------------------------------------------------------------
  describe('één openstaande straf per doel', () => {
    it(
      'een tweede straf op hetzelfde doel kan niet, ook niet als service_role',
      async () => {
        // ⚠️ Via `adminDb()` en niet via de client: dit is een unieke index en
        //    geen policy, dus hij hoort óók te gelden voor de rol die alle
        //    policies overslaat. Dáár zat de spamvector.
        const doelId = await versDoel('PLAFOND tweede straf');
        const admin = adminDb();

        const eerste = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De eerste straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(eerste.error, `de eerste hoort te mogen: ${eerste.error?.message}`).toBeNull();

        const tweede = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De tweede straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(tweede.error, 'een tweede openstaande straf is erdoor gekomen').not.toBeNull();

        const rijen = await admin.from('commitments').select('id').eq('goal_id', doelId);
        expect(rijen.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een beloning naast een straf kan wél',
      async () => {
        // ⚠️ De must-allow. Het plafond is per **soort**; zou de index alleen op
        //    `goal_id` staan, dan blokkeert een straf je beloning en is dit rood.
        const doelId = await versDoel('PLAFOND straf en beloning');
        const admin = adminDb();

        const straf = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'Een straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(straf.error).toBeNull();

        const beloning = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'reward',
          body: 'Een beloning',
          confirmed_at: new Date().toISOString(),
        });
        expect(beloning.error, `een beloning hoort ernaast te mogen: ${beloning.error?.message}`)
          .toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'na intrekken mag er wél een nieuwe',
      async () => {
        // ⚠️ **De reden dat dit een partiële index is en geen gewone.** Een
        //    ingetrokken straf hoort je niet voor altijd te blokkeren; intrekken
        //    en opnieuw vastleggen is precies wat het scherm aanbiedt.
        const doelId = await versDoel('PLAFOND opnieuw na intrekken');
        const admin = adminDb();

        const eerste = await admin
          .from('commitments')
          .insert({
            goal_id: doelId,
            type: 'penalty',
            body: 'De eerste straf',
            beneficiary_user_id: w.bob.id,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (eerste.error) throw new Error(`eerste: ${eerste.error.message}`);

        await admin.from('commitments').update({ status: 'cancelled' }).eq('id', eerste.data.id);

        const tweede = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De tweede straf, na intrekken',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(tweede.error, `na intrekken hoort een nieuwe te mogen: ${tweede.error?.message}`)
          .toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een streefdatum begint niet in het verleden', () => {
    it(
      'een doel met een streefdatum in het verleden kan niet',
      async () => {
        // ⚠️ Dit is de andere helft van de aanval: zonder deze grens is
        //    `current_date - 30` de kortste weg naar een straf die meteen
        //    verschuldigd is.
        const poging = await w.alice.db.from('goals').insert({
          owner_id: w.alice.id,
          title: 'PLAFOND doel in het verleden',
          target_date: addDays(w.vandaag, -30),
        });

        expect(poging.error, 'een doel met een deadline in het verleden is erdoor gekomen')
          .not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'vandaag mag nog wél',
      async () => {
        // ⚠️ De must-allow op de grens zelf. `>=` en niet `>`: een doel dat
        //    vandaag afloopt is een geldig doel, en een test die dat niet zegt
        //    laat een strengere grens ongemerkt passeren.
        const poging = await w.alice.db
          .from('goals')
          .insert({
            owner_id: w.alice.id,
            title: 'PLAFOND doel van vandaag',
            target_date: w.vandaag,
          })
          .select('id')
          .single();

        expect(poging.error, `vandaag hoort te mogen: ${poging.error?.message}`).toBeNull();
        await adminDb().from('goals').delete().eq('id', poging.data?.id ?? '');
      },
      TEST_TIMEOUT,
    );

    it(
      'de streefdatum is ook niet naar het verleden te verzetten',
      async () => {
        // ⚠️ **Een grens die alleen bij het aanmaken geldt, verplaats je met de
        //    eerste de beste verzetknop.** `zet_streefdatum()` is de route voor
        //    een ongekoppeld doel.
        const doelId = await versDoel('PLAFOND verzetten');

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, -5),
        });

        expect(uit(poging.data).ok).toBe(false);
        expect(uit(poging.data).reason).toBe('datum_in_verleden');

        const na = await adminDb().from('goals').select('target_date').eq('id', doelId).single();
        expect(na.data?.target_date, 'de streefdatum is toch verzet').toBe(addDays(w.vandaag, 90));
      },
      TEST_TIMEOUT,
    );

    it(
      'en een verschuiving naar het verleden is niet eens aan te vragen',
      async () => {
        // ⚠️ De derde schrijver. Voor een gekoppeld doel loopt verzetten via een
        //    verzoek (A7), en zonder deze grens is dát de omweg.
        const doelId = await versDoel('PLAFOND verzoek');
        expect(
          (await adminDb().from('goal_group_links').insert({ goal_id: doelId, group_id: w.groupId }))
            .error,
        ).toBeNull();

        const poging = await w.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doelId,
          p_group_id: w.groupId,
          p_new_date: addDays(w.vandaag, -5),
          p_reason: 'Ik wil deze datum graag naar het verleden verschuiven, om redenen.',
        });

        expect(uit(poging.data).ok).toBe(false);
        expect(uit(poging.data).reason).toBe('datum_in_verleden');

        const verzoeken = await adminDb()
          .from('deadline_requests')
          .select('id')
          .eq('goal_id', doelId);
        expect(verzoeken.data ?? [], 'er staat een verzoek voor een datum in het verleden')
          .toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
});
