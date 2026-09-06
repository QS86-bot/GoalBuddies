/**
 * Een straf met één persoon als begunstigde — QS8-228, migratie 0168.
 *
 * ⚠️ **De vraag is niet "kan het" maar "kan iemand het misbruiken".** Een
 *    begunstigde kiezen is iemand tot getuige van je straf maken. Doe je dat met
 *    een wildvreemde, dan is dit een manier om ongevraagd iets over jezelf in
 *    andermans scherm te zetten — en erger, om andermans naam aan jouw
 *    consequentie te hangen.
 *
 * ⚠️ **Twee takken in `commitments_select`, en die worden apart getoetst.** Dat
 *    is de les van de vier routes naar een weggepoetste week: zoek álle routes
 *    naar een effect, niet de route die je net gevonden hebt. De groepstak
 *    bestond al; de persoonstak is nieuw, en ze kunnen los uit de pas gaan lopen.
 *
 * ⚠️ **En de scherpste vraag zit niet in de policy maar in de foreign key.**
 *    `beneficiary_user_id` heeft `on delete set null`, en de begunstigde-eis was
 *    een CHECK. Die twee samen zouden betekenen dat een openstaande straf de
 *    accountverwijdering van de getuige blokkeert — een route die niets met
 *    straffen te maken heeft. Daarom is de eis een trigger geworden. De test
 *    daarvoor staat onderaan, en hij is de reden dat deze migratie er zo uitziet.
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
  /** Eigenaar van het doel en instellers van de straf. */
  alice: TestUser;
  /** Groepsgenoot van alice: de enige die zij als getuige mag kiezen. */
  bob: TestUser;
  /** Deelt geen enkele groep met alice. */
  carol: TestUser;
  goalId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('een straf met één persoon als begunstigde', () => {
  beforeAll(async () => {
    const alice = await createTestUser('straf-alice');
    const bob = await createTestUser('straf-bob');
    const carol = await createTestUser('straf-carol');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Strafgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'STRAFDOEL', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    w = { alice, bob, carol, goalId: doel.data.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('wie je mag kiezen', () => {
    it(
      'een groepsgenoot mag',
      async () => {
        const gezet = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: w.goalId,
            type: 'penalty',
            body: 'Ik trakteer op taart als het niet lukt',
            beneficiary_user_id: w.bob.id,
            confirmed_at: 'now',
          })
          .select('id')
          .single();

        expect(gezet.error, `een groepsgenoot hoort te mogen: ${gezet.error?.message}`).toBeNull();
        await adminDb().from('commitments').delete().eq('id', gezet.data?.id ?? '');
      },
      TEST_TIMEOUT,
    );

    it(
      'iemand met wie je geen groep deelt mag niet, ook niet rechtstreeks via de API',
      async () => {
        // ⚠️ **Dit is de kern van criterium 3.** De keuzelijst in het scherm toont
        //    carol niet, maar dat is gebruiksgemak. Deze test gaat om de client
        //    heen en toetst `commitments_insert`.
        const poging = await w.alice.db.from('commitments').insert({
          goal_id: w.goalId,
          type: 'penalty',
          body: 'Een vreemde tot getuige maken',
          beneficiary_user_id: w.carol.id,
          confirmed_at: 'now',
        });

        expect(poging.error, 'een vreemde als getuige is erdoor gekomen').not.toBeNull();

        const rijen = await adminDb()
          .from('commitments')
          .select('id')
          .eq('beneficiary_user_id', w.carol.id);
        expect(rijen.data ?? [], 'er staat een straf op naam van een vreemde').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een uitgezet lid telt niet meer als groepsgenoot',
      async () => {
        // ⚠️ De must-see bij `shares_group_with_user()`: die functie eist sinds
        //    0102 dat béíde kanten actief zijn. Zonder deze test zou een
        //    versoepeling naar "ooit lid geweest" hier niets rood maken.
        const admin = adminDb();
        const groep = await admin
          .from('group_members')
          .select('group_id')
          .eq('user_id', w.bob.id)
          .limit(1)
          .single();
        if (groep.error) throw new Error(`groep: ${groep.error.message}`);

        await admin
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', groep.data.group_id)
          .eq('user_id', w.bob.id);

        try {
          const poging = await w.alice.db.from('commitments').insert({
            goal_id: w.goalId,
            type: 'penalty',
            body: 'Een uitgezet lid tot getuige maken',
            beneficiary_user_id: w.bob.id,
            confirmed_at: 'now',
          });

          expect(poging.error, 'een uitgezet lid is nog steeds te kiezen').not.toBeNull();
        } finally {
          await admin
            .from('group_members')
            .update({ status: 'active' })
            .eq('group_id', groep.data.group_id)
            .eq('user_id', w.bob.id);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'een groep én een persoon tegelijk kan niet, ook niet als service_role',
      async () => {
        // ⚠️ Via `adminDb()` en niet via de client: dit is een CHECK en geen
        //    policy, dus hij hoort óók te gelden voor de rol die alle policies
        //    overslaat. Met twee begunstigden is niet te zeggen wie de getuige is.
        const groep = await adminDb()
          .from('group_members')
          .select('group_id')
          .eq('user_id', w.bob.id)
          .limit(1)
          .single();

        const poging = await adminDb().from('commitments').insert({
          goal_id: w.goalId,
          type: 'penalty',
          body: 'Twee getuigen tegelijk',
          beneficiary_group_id: groep.data?.group_id ?? '',
          beneficiary_user_id: w.bob.id,
          confirmed_at: 'now',
        });

        expect(poging.error, 'een straf heeft nu twee begunstigden').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een straf zonder begunstigde kan niet, ook niet als service_role',
      async () => {
        // ⚠️ Domeinregel 11: zonder getuige ziet niemand de straf ooit, en dan is
        //    het een voornemen en geen commitment device. Dit was tot 0168 een
        //    CHECK; het is nu een trigger, en een trigger vuurt óók voor
        //    `service_role`. Deze test is het bewijs daarvan.
        const poging = await adminDb().from('commitments').insert({
          goal_id: w.goalId,
          type: 'penalty',
          body: 'Een straf zonder getuige',
          confirmed_at: 'now',
        });

        expect(poging.error, 'een straf zonder getuige is erdoor gekomen').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een beloning zonder begunstigde kan wél',
      async () => {
        // De must-allow ernaast: een beloning is voor jezelf en heeft geen
        // getuige nodig. Zou de trigger op `type` vergeten, dan is dit rood.
        const gezet = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: w.goalId,
            type: 'reward',
            body: 'Ik koop een goede koffie',
            confirmed_at: 'now',
          })
          .select('id')
          .single();

        expect(gezet.error, `een beloning hoort te mogen: ${gezet.error?.message}`).toBeNull();
        await adminDb().from('commitments').delete().eq('id', gezet.data?.id ?? '');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('wat de begunstigde ziet, en wanneer', () => {
    let strafId = '';

    beforeAll(async () => {
      const gezet = await adminDb()
        .from('commitments')
        .insert({
          goal_id: w.goalId,
          type: 'penalty',
          body: 'Ik trakteer op taart',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (gezet.error) throw new Error(`straf: ${gezet.error.message}`);
      strafId = gezet.data.id as string;
    }, SETUP_TIMEOUT);

    it(
      'ziet hem niet zolang hij nog niet verschuldigd is',
      async () => {
        // ⚠️ Domeinregel 11, en dit is de helft die het makkelijkst wegvalt: een
        //    policy die alleen op `beneficiary_user_id` toetst en niet op status,
        //    laat de getuige meelezen vanaf het moment dat je hem instelt.
        for (const status of ['set', 'unlocked', 'cancelled']) {
          await adminDb().from('commitments').update({ status }).eq('id', strafId);

          const gezien = await w.bob.db.from('commitments').select('id').eq('id', strafId);
          expect(gezien.data ?? [], `zichtbaar bij status ${status}`).toHaveLength(0);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'ziet hem zodra hij verschuldigd is, en daarna ook nog',
      async () => {
        for (const status of ['due', 'resolved']) {
          await adminDb().from('commitments').update({ status }).eq('id', strafId);

          const gezien = await w.bob.db.from('commitments').select('id, body').eq('id', strafId);
          expect(gezien.data ?? [], `onzichtbaar bij status ${status}`).toHaveLength(1);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'is voor iemand anders onzichtbaar, ook als hij verschuldigd is',
      async () => {
        // ⚠️ De tegenproef bij de test hierboven. Zou de persoonstak per ongeluk
        //    op "iedereen" staan, dan blijft die test groen en is dit de enige
        //    die het merkt — en dan is een straf publiek in plaats van gezien
        //    door één getuige.
        await adminDb().from('commitments').update({ status: 'due' }).eq('id', strafId);

        const gezien = await w.carol.db.from('commitments').select('id').eq('id', strafId);
        expect(gezien.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'blijft voor de eigenaar in elke stand zichtbaar',
      async () => {
        // De must-allow: de eigenaarstak van dezelfde policy mag niet
        // meeverschuiven met de nieuwe persoonstak.
        await adminDb().from('commitments').update({ status: 'set' }).eq('id', strafId);

        const gezien = await w.alice.db.from('commitments').select('id').eq('id', strafId);
        expect(gezien.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de getuige die verdwijnt', () => {
    /**
     * ⚠️⚠️ **De naad van dit issue, en hij ligt buiten de feature.**
     *    `beneficiary_user_id` heeft `on delete set null`, en een `set null` is
     *    een UPDATE. Zou de begunstigde-eis een CHECK zijn gebleven, dan
     *    hertoetst die UPDATE hem en **blokkeert een openstaande straf de
     *    accountverwijdering van de getuige** — een handeling die niets met
     *    straffen te maken heeft en die moet blijven werken.
     *
     *    De bestaande CHECK had die vorm al voor groepen, en dat was dood hout:
     *    0092 archiveert groepen en verwijdert ze niet meer. Profielen worden
     *    wél verwijderd, dus voor een persoon is het geen dood hout.
     */
    it(
      'laat de getuige zijn account verwijderen, en de straf blijft staan',
      async () => {
        const admin = adminDb();
        const getuige = await createTestUser('straf-getuige');

        const groep = await admin
          .from('group_members')
          .select('group_id')
          .eq('user_id', w.bob.id)
          .limit(1)
          .single();
        if (groep.error) throw new Error(`groep: ${groep.error.message}`);

        const lid = await admin
          .from('group_members')
          .insert({ group_id: groep.data.group_id, user_id: getuige.id, role: 'member', status: 'active' });
        if (lid.error) throw new Error(`lid: ${lid.error.message}`);

        const straf = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: w.goalId,
            type: 'penalty',
            body: 'Ik trakteer deze getuige op taart',
            beneficiary_user_id: getuige.id,
            confirmed_at: 'now',
          })
          .select('id')
          .single();
        if (straf.error) throw new Error(`straf: ${straf.error.message}`);

        const weg = await getuige.db.rpc('verwijder_mijn_account');
        expect(
          uit(weg.data).ok,
          `de getuige kan zijn account niet verwijderen: ` +
            `${JSON.stringify(weg.data)} / fout: ${JSON.stringify(weg.error)}`,
        ).toBe(true);

        const na = await admin
          .from('commitments')
          .select('id, beneficiary_user_id')
          .eq('id', straf.data.id)
          .maybeSingle();

        expect(na.data, 'de straf van de eigenaar is meeverdwenen').not.toBeNull();
        expect(na.data?.beneficiary_user_id, 'de getuige staat er nog').toBeNull();

        await admin.from('commitments').delete().eq('id', straf.data.id);
      },
      SETUP_TIMEOUT,
    );

    it(
      'laat de eigenaar de getuige niet wegpoetsen zolang die bestaat',
      async () => {
        // ⚠️ De keerzijde, en zonder haar is de regel hierboven een gat.
        //    Domeinregel 5: een commitment device gaat nooit stilzwijgend uit.
        //    Kon de eigenaar `beneficiary_user_id` op null zetten, dan is de
        //    straf onzichtbaar geworden zonder dat er iets besloten is.
        const admin = adminDb();
        const straf = await admin
          .from('commitments')
          .insert({
            goal_id: w.goalId,
            type: 'penalty',
            body: 'Deze getuige blijft staan',
            beneficiary_user_id: w.bob.id,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (straf.error) throw new Error(`straf: ${straf.error.message}`);

        try {
          const poging = await admin
            .from('commitments')
            .update({ beneficiary_user_id: null })
            .eq('id', straf.data.id);

          expect(poging.error, 'de getuige is weggepoetst terwijl hij bestaat').not.toBeNull();

          const na = await admin
            .from('commitments')
            .select('beneficiary_user_id')
            .eq('id', straf.data.id)
            .single();
          expect(na.data?.beneficiary_user_id).toBe(w.bob.id);
        } finally {
          await admin.from('commitments').delete().eq('id', straf.data.id);
        }
      },
      TEST_TIMEOUT,
    );
  });
});
