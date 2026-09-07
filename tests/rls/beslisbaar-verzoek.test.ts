/**
 * Een verzoek dat niemand kan beslissen, is geen verzoek — QS8-309,
 * migratie 0175.
 *
 * ⚠️ **De meting die dit issue opleverde.** Een doel mag aan meerdere groepen
 *    hangen (QS8-56), en welke groep over de streefdatum gaat kiest de eigenaar
 *    zelf — dat is een besluit en geen omissie, zie `beslissendeGroep()` in
 *    `src/modules/buddies/deling.ts`. Hij kan dus een groep aanwijzen waar hij
 *    het enige lid van is. Gemeten, als gewone gebruikers:
 *
 *      A1 verzoek in soloclub | ok: true
 *      A2 alice beslist zelf  | ok: false, reason: not_yourself
 *      A3 bob beslist         | ok: false, reason: not_found
 *      A4 bob ziet verzoeken  | 0
 *
 *    Regel A2 is de kern, en hij is scherper dan "de begunstigde ziet het
 *    niet": `beslis_deadline_verzoek()` weigert de aanvrager met zoveel
 *    woorden, dus in een groep van één kan **niemand** dit verzoek beslissen.
 *    Het kan alleen verlopen, en de app zegt intussen dat je op je groep wacht.
 *
 * ⚠️ **Sinds 0174 is dat oppervlak dragend.** Een open verzoek houdt een straf
 *    tegen (QS8-307). Een verzoek dat niemand kan beslissen is daarmee een
 *    schild dat niemand kan wegnemen, onzichtbaar voor de begunstigde, die niet
 *    eens lid van die groep is.
 *
 * ⚠️ **Twee grendels, en de tweede is de naad.** Regel 18 vraag 1: de toets bij
 *    het indienen en de toets bij de rollover zijn allebei correct, en de
 *    toestand ertússen verandert. Een groep kan één lid worden nádat het
 *    verzoek is ingediend, en dan is het alsnog onbeslisbaar. De rolloverkant
 *    dekt dat, én de rijen die vóór 0175 zijn aangemaakt.
 *
 *    Met de hand rood gemaakt, grendel voor grendel, door de functie in de
 *    draaiende database te vervangen door een variant zonder die ene tak:
 *
 *      1. de `geen_beslisser`-tak uit `vraag_deadline_verschuiving()`
 *         → 'een verzoek in een groep van één wordt geweigerd' rood
 *      2. de `exists`-voorwaarde uit `maak_straffen_verschuldigd()`
 *         → 'een onbeslisbaar verzoek houdt geen straf tegen' rood
 *         én 'een verzoek verliest zijn schild als het laatste lid vertrekt' rood
 *
 *    Mutatie 1 raakt grendel 2 niet en andersom: de rolloverkant krijgt zijn
 *    rij langs `adminDb()` binnen, precies zoals een rij van vóór 0175.
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
  /** Groep met alice én bob: hier kán iemand beslissen. */
  buddyGroep: string;
  /** Groep waar alice het enige lid van is. */
  soloGroep: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string; request_id?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string; request_id?: string };
}

describe.skipIf(!rlsTestsConfigured)('een verzoek dat niemand kan beslissen', () => {
  beforeAll(async () => {
    const alice = await createTestUser('beslisbaar-alice');
    const bob = await createTestUser('beslisbaar-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    async function groep(naam: string): Promise<{ id: string; invite_code: string }> {
      const gemaakt = await alice.db.rpc('create_group', { group_name: naam });
      const d = gemaakt.data as unknown as {
        ok?: boolean;
        group?: { id: string; invite_code: string };
      };
      if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(gemaakt.data)}`);
      return d.group;
    }

    const buddy = await groep('Beslisbaar buddygroep');
    const solo = await groep('Beslisbaar soloclub');

    const mee = await bob.db.rpc('join_group_with_code', { code: buddy.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    // ⚠️ Dezelfde reden als in `straf-plafond.test.ts`: `mijn_datum()` rekent in
    //    `profiles.tz` en `vandaag` hierboven is UTC. Tussen 22:00 en 24:00 UTC
    //    lopen die een dag uiteen, en dan verandert deze suite per klok van
    //    uitslag.
    const zone = await adminDb().from('profiles').update({ tz: 'UTC' }).in('id', [alice.id, bob.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = { alice, bob, buddyGroep: buddy.id, soloGroep: solo.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een doel van alice, gekoppeld aan beide groepen. */
  async function doelIn(titel: string, groepen: readonly string[]): Promise<string> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    const doelId = doel.data.id as string;

    const koppel = await adminDb()
      .from('goal_group_links')
      .insert(groepen.map((group_id) => ({ goal_id: doelId, group_id })));
    if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);

    return doelId;
  }

  // -------------------------------------------------------------------------
  describe('wordt niet aangenomen', () => {
    it(
      'een verzoek in een groep van één wordt geweigerd',
      async () => {
        const doelId = await doelIn('BESLIS solo', [w.soloGroep]);

        const antwoord = await w.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doelId,
          p_group_id: w.soloGroep,
          p_new_date: addDays(w.vandaag, 60),
          p_reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
        });

        expect(uit(antwoord.data).reason).toBe('geen_beslisser');
      },
      TEST_TIMEOUT,
    );

    it(
      'en in een groep met een buddy erin gewoon niet',
      async () => {
        // ⚠️ De must-allow. Zonder haar is de tak "geen enkel verzoek mag", en
        //    dat is groen op precies dezelfde manier.
        const doelId = await doelIn('BESLIS buddy', [w.buddyGroep]);

        const antwoord = await w.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doelId,
          p_group_id: w.buddyGroep,
          p_new_date: addDays(w.vandaag, 60),
          p_reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
        });

        expect(uit(antwoord.data).ok, `verzoek: ${JSON.stringify(antwoord.data)}`).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een lid dat op inactief staat telt niet als beslisser',
      async () => {
        // ⚠️ `status <> 'inactive'` en niet `= 'active'`, want dat is precies
        //    wat `beslis_deadline_verzoek()` toetst. Twee opvattingen over wie
        //    er mag beslissen, is een naad die stilvalt zodra iemand er één
        //    bijwerkt.
        const doelId = await doelIn('BESLIS inactief', [w.buddyGroep]);

        const weg = await adminDb()
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', w.buddyGroep)
          .eq('user_id', w.bob.id);
        expect(weg.error, `bob op inactief: ${weg.error?.message}`).toBeNull();

        const antwoord = await w.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doelId,
          p_group_id: w.buddyGroep,
          p_new_date: addDays(w.vandaag, 60),
          p_reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
        });

        const terug = await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.buddyGroep)
          .eq('user_id', w.bob.id);
        expect(terug.error, `bob terug: ${terug.error?.message}`).toBeNull();

        expect(uit(antwoord.data).reason).toBe('geen_beslisser');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('en houdt geen straf tegen', () => {
    /**
     * Een doel met een verlopen streefdatum, een straf erop, en een open
     * verzoek in de gevraagde groep.
     *
     * ⚠️ Het verzoek gaat er met `adminDb()` in en niet langs de RPC, en dat is
     *    hier juist het punt: sinds de grendel hierboven kán die RPC zo'n rij
     *    niet meer maken. Wat overblijft is precies de toestand die deze tak
     *    moet dekken — een rij van vóór 0175, of een groep die halverwege leeg
     *    liep.
     */
    async function wereld(
      titel: string,
      groepId: string,
    ): Promise<{ doelId: string; strafId: string }> {
      const doelId = await doelIn(titel, [w.buddyGroep, w.soloGroep]);

      const straf = await w.alice.db
        .from('commitments')
        .insert({
          goal_id: doelId,
          type: 'penalty',
          body: `${titel} straf`,
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);

      // ⚠️ Ouder dan een dag, anders vangt de grendel van 0171 hem al af en
      //    meet deze test niets van wat hij belooft.
      const ouder = await adminDb()
        .from('commitments')
        .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
        .eq('id', straf.data.id as string);
      if (ouder.error) throw new Error(`ouder maken: ${ouder.error.message}`);

      const verzoek = await adminDb().from('deadline_requests').insert({
        goal_id: doelId,
        group_id: groepId,
        requester_id: w.alice.id,
        old_date: addDays(w.vandaag, -1),
        new_date: addDays(w.vandaag, 60),
        reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
      });
      if (verzoek.error) throw new Error(`verzoek ${titel}: ${verzoek.error.message}`);

      const verzet = await adminDb()
        .from('goals')
        .update({ target_date: addDays(w.vandaag, -1) })
        .eq('id', doelId);
      if (verzet.error) throw new Error(`verzetten: ${verzet.error.message}`);

      return { doelId, strafId: straf.data.id as string };
    }

    async function rollover(): Promise<void> {
      const uitkomst = await adminDb().rpc('maak_straffen_verschuldigd', {
        p_owner_id: w.alice.id,
        p_vandaag: w.vandaag,
      });
      if (uitkomst.error) throw new Error(`rollover: ${uitkomst.error.message}`);
    }

    async function standVan(strafId: string): Promise<string> {
      const rij = await adminDb().from('commitments').select('status').eq('id', strafId).single();
      if (rij.error) throw new Error(`status: ${rij.error.message}`);
      return rij.data.status as string;
    }

    it(
      'een onbeslisbaar verzoek houdt geen straf tegen',
      async () => {
        const { strafId } = await wereld('BESLIS rollover solo', w.soloGroep);

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'en een verzoek in een groep met een buddy erin wél',
      async () => {
        // ⚠️ De must-allow, en zonder haar is deze tak "een verzoek houdt nooit
        //    een straf tegen" — dat is de hele reparatie van QS8-307 terug bij
        //    af, en het is groen op precies dezelfde manier.
        const { strafId } = await wereld('BESLIS rollover buddy', w.buddyGroep);

        await rollover();

        expect(await standVan(strafId)).toBe('set');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De naad.** Bij het indienen was er een beslisser, daarna niet meer.
     *    Zou alleen `vraag_deadline_verschuiving()` de toets doen, dan blijft
     *    het schild staan terwijl er niemand meer is die het kan wegnemen —
     *    twee correcte onderdelen, en een geheel dat vastloopt.
     */
    it(
      'een verzoek verliest zijn schild als het laatste andere lid vertrekt',
      async () => {
        const { strafId } = await wereld('BESLIS rollover vertrek', w.buddyGroep);

        const weg = await adminDb()
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', w.buddyGroep)
          .eq('user_id', w.bob.id);
        expect(weg.error, `bob op inactief: ${weg.error?.message}`).toBeNull();

        await rollover();

        const terug = await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.buddyGroep)
          .eq('user_id', w.bob.id);
        expect(terug.error, `bob terug: ${terug.error?.message}`).toBeNull();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );
  });
});
