import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * De goedkeuringsregel per groep — QS8-65 (PRD 6.4), migratie 0111.
 *
 * ⚠️ **Twee beloftes, en de tweede is de moeilijke.**
 *
 *   1. Een groep kan verlangen dat méér dan één buddy een week bevestigt.
 *   2. **Wijzigen raakt lopende goedkeuringen niet met terugwerkende kracht.**
 *      Dat is het tweede acceptatiecriterium, en het is de reden dat de drempel
 *      als getál bevroren wordt bij het indienen. Zonder dat kan een beheerder
 *      de lat optillen onder een week die al twee bevestigingen had — en de
 *      gebruiker heeft dan niets fout gedaan.
 *
 * ⚠️ **En één naad.** De drempel wordt op twee plekken gelezen: bij het
 *    goedkeuren (`award_points_on_approval`) en bij het intrekken
 *    (`trek_goedkeuring_in`, die vóór 0111 `nog_geldig > 0` deed). Zouden die
 *    twee elk hun eigen som maken, dan blijft een week bevestigd die de
 *    meerderheid niet meer heeft. De test "een intrekking zet de week terug"
 *    is de enige die dat kan zien.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  id: string;
  code: string;
}

describe.skipIf(!rlsTestsConfigured)('QS8-65 — de goedkeuringsdrempel', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let groepEen: Groep;
  let groepVeel: Groep;
  /**
   * ⚠️ **Een eigen groep voor de groei-test, en dat is geen netheid maar een
   *    reparatie.** De eerste versie liet `eddy` meedoen in `groepVeel`, en
   *    daarmee ging de meerderheid daar blijvend van twee naar drie — voor élke
   *    test die erna draaide. Drie tests werden rood op een fixture die onder ze
   *    uit was veranderd, precies het faalbeeld dat deze suite op 27-08 een dag
   *    gekost heeft. Een test die de groep wijzigt, hoort zijn eigen groep te
   *    hebben.
   */
  let groepGroei: Groep;
  let doelEen: string;
  let doelVeel: string;
  let doelGroei: string;

  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  async function maakGroep(naam: string): Promise<Groep> {
    const { data, error } = await alice.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    return { id: g.group.id, code: g.group.invite_code };
  }

  async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
    const u = (data ?? {}) as { ok?: boolean; reason?: string };
    if (u.ok !== true) throw new Error(`meedoen: ${u.reason ?? 'geen reden'}`);
  }

  async function maakDoel(titel: string, groep: Groep): Promise<string> {
    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: titel, target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const link = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groep.id });
    if (link.error) throw new Error(`koppeling: ${link.error.message}`);

    return doel.data.id;
  }

  /** Een weekdoel met een ingediende voltooiing — dus `pending`. */
  async function ingediend(goalId: string, index: number): Promise<{ week: string; vol: string }> {
    const start = addDays(cycle.startDate, -7 * index);

    const weekly = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: `week ${index}`,
        cycle_start_date: start,
        cycle_index: index,
      })
      .select('id')
      .single();
    if (weekly.error || weekly.data === null) throw new Error(`weekdoel: ${weekly.error?.message}`);

    const vol = await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: weekly.data.id,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: start,
      })
      .select('id')
      .single();
    if (vol.error || vol.data === null) throw new Error(`voltooiing: ${vol.error?.message}`);

    return { week: weekly.data.id, vol: vol.data.id };
  }

  async function bevestig(wie: TestUser, completionId: string, groep: Groep): Promise<void> {
    const { error } = await wie.db.from('completion_approvals').insert({
      completion_id: completionId,
      group_id: groep.id,
      approver_id: wie.id,
      subject_id: alice.id,
      status: 'approved',
    });
    if (error) throw new Error(`bevestigen: ${error.message}`);
  }

  async function weekstatus(weekId: string): Promise<string | null> {
    const { data, error } = await adminDb()
      .from('weekly_goals')
      .select('status')
      .eq('id', weekId)
      .single();
    if (error) throw new Error(`status lezen: ${error.message}`);
    return data.status;
  }

  async function drempel(completionId: string, groep: Groep): Promise<number | null> {
    const { data, error } = await adminDb()
      .from('completion_approval_rules')
      .select('approvals_required')
      .eq('completion_id', completionId)
      .eq('group_id', groep.id)
      .maybeSingle();
    if (error) throw new Error(`drempel lezen: ${error.message}`);
    return data?.approvals_required ?? null;
  }

  beforeAll(async () => {
    alice = await createTestUser('drempel-alice');
    bob = await createTestUser('drempel-bob');
    carol = await createTestUser('drempel-carol');
    dave = await createTestUser('drempel-dave');

    groepEen = await maakGroep('Drempel-een');
    groepVeel = await maakGroep('Drempel-veel');
    groepGroei = await maakGroep('Drempel-groei');

    await laatMeedoen(bob, groepEen);

    for (const groep of [groepVeel, groepGroei]) {
      await laatMeedoen(bob, groep);
      await laatMeedoen(carol, groep);
      await laatMeedoen(dave, groep);
    }

    // ⚠️ Drie beoordelaars naast de eigenaar, dus een meerderheid is er twee.
    //    `vereiste_goedkeuringen()` telt de eigenaar níét mee: hij mag zijn eigen
    //    week niet bevestigen, dus meetellen zou een lat opleveren die niemand
    //    kan halen.
    const om = await adminDb()
      .from('groups')
      .update({ approval_rule: 'majority' })
      .in('id', [groepVeel.id, groepGroei.id]);
    if (om.error) throw new Error(`regel zetten: ${om.error.message}`);

    doelEen = await maakDoel('Eén bevestiging', groepEen);
    doelVeel = await maakDoel('Een meerderheid', groepVeel);
    doelGroei = await maakDoel('Een groeiende groep', groepGroei);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goals').delete().in('id', [doelEen, doelVeel, doelGroei]);
    await admin.from('groups').delete().in('id', [groepEen.id, groepVeel.id, groepGroei.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ De regressietest, en de belangrijkste van dit bestand. `any` is de
   *    standaard en de enige stand die vandaag in productie bestaat. Verandert
   *    hier iets, dan heeft 0111 de bestaande goedkeuring gebroken voor iedereen.
   */
  it(
    'bevestigt bij één-buddy-goedkeuring nog steeds met één bevestiging',
    async () => {
      const { week, vol } = await ingediend(doelEen, 1);
      expect(await drempel(vol, groepEen)).toBe(1);

      await bevestig(bob, vol, groepEen);
      expect(await weekstatus(week)).toBe('approved');
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de week open tot de meerderheid er is',
    async () => {
      const { week, vol } = await ingediend(doelVeel, 2);

      // Drie beoordelaars, dus twee bevestigingen.
      expect(await drempel(vol, groepVeel)).toBe(2);

      await bevestig(bob, vol, groepVeel);
      expect(await weekstatus(week), 'één bevestiging bevestigde de week al').toBe('pending');

      await bevestig(carol, vol, groepVeel);
      expect(await weekstatus(week), 'twee bevestigingen bevestigden de week niet').toBe('approved');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Het tweede acceptatiecriterium, en de reden dat de drempel een getal is.**
   *    De beheerder tilt de lat op terwijl er al één bevestiging ligt. De
   *    bevroren rij zegt nog twee, dus de tweede bevestiging maakt de week af —
   *    en de nieuwe regel geldt pas voor wat er daarna ingediend wordt.
   */
  it(
    'laat een regelwijziging een lopende week ongemoeid',
    async () => {
      const admin = adminDb();
      const { week, vol } = await ingediend(doelVeel, 3);
      expect(await drempel(vol, groepVeel)).toBe(2);

      await bevestig(bob, vol, groepVeel);
      expect(await weekstatus(week)).toBe('pending');

      const om = await admin
        .from('groups')
        .update({ approval_rule: 'quorum', approval_quorum: 3 })
        .eq('id', groepVeel.id);
      if (om.error) throw new Error(`regel omzetten: ${om.error.message}`);

      try {
        // De bevroren drempel is nog steeds twee, dus deze maakt hem af.
        await bevestig(carol, vol, groepVeel);
        expect(
          await weekstatus(week),
          'de nieuwe regel werkte terug op een week die al liep',
        ).toBe('approved');

        // En de tegenproef: wat ná de wijziging binnenkomt, krijgt wél drie.
        const verse = await ingediend(doelVeel, 4);
        expect(await drempel(verse.vol, groepVeel)).toBe(3);
      } finally {
        const terug = await admin
          .from('groups')
          .update({ approval_rule: 'majority', approval_quorum: null })
          .eq('id', groepVeel.id);
        if (terug.error) throw new Error(`regel terugzetten: ${terug.error.message}`);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Dezelfde verrassing met een andere oorzaak, en daarom een eigen test. Bij
   *    `majority` schuift het getal zonder dat iemand iets instelt: een lid erbij
   *    kan de lat optillen. Het bevriezen dekt allebei, maar alleen als het het
   *    gétal bevriest en niet de regel.
   */
  it(
    'laat een nieuw lid een lopende week ongemoeid',
    async () => {
      const admin = adminDb();
      const eddy = await createTestUser('drempel-eddy');

      const { week, vol } = await ingediend(doelGroei, 5);
      expect(await drempel(vol, groepGroei)).toBe(2);

      await laatMeedoen(eddy, groepGroei);

      // Vier beoordelaars zou drie vragen — maar niet voor deze week.
      const nu = await admin.rpc('vereiste_goedkeuringen', {
        p_group_id: groepGroei.id,
        p_owner: alice.id,
      });
      if (nu.error) throw new Error(`vereiste lezen: ${nu.error.message}`);
      expect(nu.data, 'de groep vraagt na het vierde lid niet meer').toBe(3);

      await bevestig(bob, vol, groepGroei);
      await bevestig(carol, vol, groepGroei);
      expect(await weekstatus(week), 'het nieuwe lid tilde de lat van een lopende week op').toBe(
        'approved',
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De naad.** `trek_goedkeuring_in()` deed tot 0111 `nog_geldig > 0` — een
   *    tweede som op een tweede plek. Met een drempel van twee leest die som "er
   *    is nog iemand akkoord" als "de regel is nog gehaald", en dan blijft een
   *    week bevestigd die de meerderheid niet meer heeft.
   *
   *    Met de hand gebroken op 27-08: `nog_geldig > 0` terugzetten maakt precies
   *    deze test rood en de rest van het bestand groen.
   */
  it(
    'zet de week terug zodra een intrekking onder de drempel duikt',
    async () => {
      const admin = adminDb();
      const { week, vol } = await ingediend(doelVeel, 6);

      await bevestig(bob, vol, groepVeel);
      await bevestig(carol, vol, groepVeel);
      expect(await weekstatus(week)).toBe('approved');

      const { data: rij } = await admin
        .from('completion_approvals')
        .select('id')
        .eq('completion_id', vol)
        .eq('approver_id', carol.id)
        .single();

      const uit = await carol.db.rpc('trek_goedkeuring_in', { p_approval_id: rij?.id ?? '' });
      if (uit.error) throw new Error(`intrekken (HTTP): ${uit.error.message}`);

      expect(uit.data as unknown as Record<string, unknown>).toMatchObject({
        ok: true,
        reverted: true,
      });
      expect(await weekstatus(week), 'de week bleef bevestigd onder de drempel').toBe('pending');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Een quorum dat hoger ligt dan het aantal mensen dat kán bevestigen, is een
   *    week die nooit doorgaat. `vereiste_goedkeuringen()` kapt daarom af op het
   *    aantal beoordelaars. Zonder die afkapping laat een groep die krimpt weken
   *    achter die per definitie niet meer afkomen.
   */
  it(
    'vraagt nooit meer bevestigingen dan er beoordelaars zijn',
    async () => {
      const admin = adminDb();
      const om = await admin
        .from('groups')
        .update({ approval_rule: 'quorum', approval_quorum: 12 })
        .eq('id', groepEen.id);
      if (om.error) throw new Error(`quorum zetten: ${om.error.message}`);

      try {
        // In `groepEen` zit naast alice alleen bob, dus één beoordelaar.
        const { week, vol } = await ingediend(doelEen, 7);
        expect(await drempel(vol, groepEen)).toBe(1);

        await bevestig(bob, vol, groepEen);
        expect(await weekstatus(week), 'een onhaalbaar quorum liet de week hangen').toBe('approved');
      } finally {
        const terug = await admin
          .from('groups')
          .update({ approval_rule: 'any', approval_quorum: null })
          .eq('id', groepEen.id);
        if (terug.error) throw new Error(`terugzetten: ${terug.error.message}`);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De drempel is een grendel, dus hij mag niet van de client komen. Een lid
   *    dat zijn eigen `approvals_required` op 1 kan zetten, heeft de hele regel
   *    weggeschreven — en dat is precies het soort omweg dat de UI niet kan
   *    tegenhouden.
   */
  it(
    'laat niemand zijn eigen drempel schrijven',
    async () => {
      const admin = adminDb();
      const { vol } = await ingediend(doelVeel, 8);

      const lees = () =>
        admin
          .from('completion_approval_rules')
          .select('approvals_required')
          .eq('completion_id', vol);

      await magNietLanden(
        () =>
          alice.db
            .from('completion_approval_rules')
            .update({ approvals_required: 1 })
            .eq('completion_id', vol),
        lees,
      );

      await magNietLanden(
        () => alice.db.from('completion_approval_rules').delete().eq('completion_id', vol),
        lees,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest bij de vorige: lézen mag wél, en dat moet ook. Een
   *    beoordelaar die niet kan zien dat hij de tweede van drie is, denkt dat
   *    bevestigen kapot is. Zonder deze test bewijst de vorige alleen dat de
   *    tabel onbereikbaar is.
   */
  it(
    'laat een groepsgenoot de drempel wél lezen',
    async () => {
      const { vol } = await ingediend(doelVeel, 9);

      const { data, error } = await bob.db
        .from('completion_approval_rules')
        .select('approvals_required')
        .eq('completion_id', vol);

      if (error) throw new Error(`lezen: ${error.message}`);
      expect(data?.[0]?.approvals_required).toBe(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ "X bevestigde de week van Y" hoort pas in de chat te staan als de week het
   *    ook gehaald heeft. Zonder deze regel verschijnt hij op de eerste van twee,
   *    en dan staat er iets in de groepsfeed dat niet waar is.
   */
  it(
    'meldt de bevestiging in de chat pas als de week het gehaald heeft',
    async () => {
      const admin = adminDb();
      const { vol } = await ingediend(doelVeel, 10);

      const tel = async () => {
        const { count } = await admin
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groepVeel.id)
          .eq('system_event', 'completion_approved');
        return count ?? 0;
      };

      const voor = await tel();

      await bevestig(bob, vol, groepVeel);
      expect(await tel(), 'de chat meldde een bevestiging die er nog niet was').toBe(voor);

      await bevestig(carol, vol, groepVeel);
      expect(await tel(), 'de chat meldde de gehaalde week niet').toBe(voor + 1);
    },
    TEST_TIMEOUT,
  );
});
