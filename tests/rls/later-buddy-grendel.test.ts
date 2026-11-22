/**
 * QS8-787 — Een buddy die later bij de groep komt, zet de grendel op het
 * minpunt om.
 *
 * ⚠️ **Waarom deze suite bestaat.** `weekly_goals.beoordeelbaar` (0066) ging
 *    alleen om bij het aanmaken van het weekdoel en bij een nieuwe koppeling.
 *    Kwam de buddy pas daarna bij de groep, dan bleef de grendel `false`: een
 *    gemiste week kostte niets, terwijl diezelfde buddy de week wél kon
 *    goedkeuren (+2). Dat is de asymmetrie die domeinregel 10 verbiedt. Gevonden
 *    bij QS8-774 (`docs/research/meetverslag-minpunt-zonder-grootboekrij.md`).
 *
 * ⚠️ **Elke stap die een gebruiker zelf zet, loopt via zijn eigen JWT**: groep
 *    aanmaken, doel koppelen, weekdoel plannen, meedoen via de code, vertrekken,
 *    uitzetten, een verzoek doen en toelaten. Twee dingen gaan via `adminDb()`,
 *    en geen van beide is wat hier getoetst wordt:
 *
 *    - `sluit_verstreken_weken_af()` is alleen voor `service_role`; de rollover
 *      draait zo, en `authenticated` kan niets in `points_ledger` schrijven.
 *    - weken die al afgewikkeld zijn (`missed`, `approved`, `excused`). De
 *      eigenaar kan de status niet zelf zetten (0023), dus de opbouw gaat
 *      langs de typen heen.
 *
 * ⚠️ **Regel 18, vraag 3.** Elke toets hieronder leest de **uitkomst** (de
 *    grendel, en de rij `cycle_missed` in het grootboek), niet de trigger. Met
 *    de trigger gedropt worden de drie routes rood. Wat er per breuk omvalt,
 *    staat in de reactie op QS8-787.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  readonly id: string;
  readonly code: string;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('QS8-787 — een buddy die later komt, zet de grendel om', () => {
  // De standaard van een nieuw profiel: maandag, Europe/Amsterdam.
  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
  /** Na het einde van deze cyclus: `sluit_verstreken_weken_af()` sluit alles wat ervóór begon. */
  const grens = addDays(cycle.endDate, 1);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function maakGroep(eigenaar: TestUser, naam: string): Promise<Groep> {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    registreerGroep(g.group.id);
    return { id: g.group.id, code: g.group.invite_code };
  }

  async function doeMee(wie: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
    if (uitkomst(data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(data)}`);
  }

  async function verlaat(wie: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await wie.db.rpc('verlaat_groep', {
      p_group_id: groep.id,
      p_bevestigd: true,
    });
    if (error) throw new Error(`vertrekken (HTTP): ${error.message}`);
    if (uitkomst(data).ok !== true) throw new Error(`vertrekken: ${JSON.stringify(data)}`);
  }

  async function maakDoel(eigenaar: TestUser, titel: string): Promise<string> {
    const { data, error } = await eigenaar.db
      .from('goals')
      .insert({ owner_id: eigenaar.id, title: titel, target_date: addDays(cycle.endDate, 60) })
      .select('id')
      .single();
    if (error) throw new Error(`doel ${titel}: ${error.message}`);
    return data.id;
  }

  async function koppel(eigenaar: TestUser, goalId: string, groep: Groep): Promise<void> {
    const { error } = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: groep.id });
    if (error) throw new Error(`koppelen: ${error.message}`);
  }

  /** Een open weekdoel in de lopende cyclus, door de eigenaar zelf gepland. */
  async function planWeek(eigenaar: TestUser, goalId: string, titel: string): Promise<string> {
    const { data, error } = await eigenaar.db
      .from('weekly_goals')
      .insert({ goal_id: goalId, title: titel, cycle_start_date: cycle.startDate })
      .select('id')
      .single();
    if (error) throw new Error(`week ${titel}: ${error.message}`);
    return data.id;
  }

  /** Een al afgewikkelde week. Opbouw via `adminDb()`; zie de kop. */
  async function afgewikkeldeWeek(
    goalId: string,
    status: 'missed' | 'approved' | 'excused',
    start: string,
  ): Promise<string> {
    const { data, error } = await adminDb()
      .from('weekly_goals')
      .insert({ goal_id: goalId, title: `al ${status}`, cycle_start_date: start, status })
      .select('id')
      .single();
    if (error) throw new Error(`afgewikkelde week ${status}: ${error.message}`);
    return data.id;
  }

  async function grendel(weekId: string): Promise<boolean> {
    const { data, error } = await adminDb()
      .from('weekly_goals')
      .select('beoordeelbaar')
      .eq('id', weekId)
      .single();
    if (error) throw new Error(`grendel lezen: ${error.message}`);
    return data.beoordeelbaar;
  }

  /** De rollover, zoals hij draait: als `service_role`. */
  async function sluitAf(eigenaar: TestUser): Promise<void> {
    const { error } = await adminDb().rpc('sluit_verstreken_weken_af', {
      p_owner_id: eigenaar.id,
      p_grens: grens,
    });
    if (error) throw new Error(`rollover: ${error.message}`);
  }

  /** Wat het grootboek over deze week zegt: aantal rijen `cycle_missed` en hun som. */
  async function minpunt(weekId: string): Promise<{ rijen: number; som: number }> {
    const { data, error } = await adminDb()
      .from('points_ledger')
      .select('delta')
      .eq('ref_id', weekId)
      .eq('reason', 'cycle_missed');
    if (error) throw new Error(`grootboek lezen: ${error.message}`);
    const rijen = data ?? [];
    return { rijen: rijen.length, som: rijen.reduce((s, r) => s + r.delta, 0) };
  }

  async function status(weekId: string): Promise<string> {
    const { data, error } = await adminDb().from('weekly_goals').select('status').eq('id', weekId).single();
    if (error) throw new Error(`status lezen: ${error.message}`);
    return data.status;
  }

  it(
    'route a: de buddy komt pas na het plannen van de week, en een gemiste week kost dan toch −1',
    async () => {
      const eigenaar = await createTestUser('later-a-eigenaar');
      const buddy = await createTestUser('later-a-buddy');

      const groep = await maakGroep(eigenaar, 'Later a');
      const doel = await maakDoel(eigenaar, 'Doel a');
      await koppel(eigenaar, doel, groep);
      const week = await planWeek(eigenaar, doel, 'week a');

      expect(await grendel(week), 'vóór de buddy: niemand kon beoordelen').toBe(false);

      await doeMee(buddy, groep);
      expect(await grendel(week), 'na de buddy hoort de grendel om te staan').toBe(true);

      await sluitAf(eigenaar);
      expect(await status(week)).toBe('missed');
      expect(await minpunt(week), 'een gemiste week met een buddy kost een punt').toEqual({ rijen: 1, som: -1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'route b: de buddy vertrekt, de week wordt gepland, de buddy komt terug via de code',
    async () => {
      const eigenaar = await createTestUser('later-b-eigenaar');
      const buddy = await createTestUser('later-b-buddy');

      const groep = await maakGroep(eigenaar, 'Later b');
      await doeMee(buddy, groep);
      const doel = await maakDoel(eigenaar, 'Doel b');
      await koppel(eigenaar, doel, groep);

      // `verlaat_groep()` verwijdert de rij; terugkomen is dus een nieuwe INSERT.
      await verlaat(buddy, groep);
      const week = await planWeek(eigenaar, doel, 'week b');
      expect(await grendel(week), 'gepland zonder buddy').toBe(false);

      await doeMee(buddy, groep);
      expect(await grendel(week), 'de teruggekeerde buddy zet de grendel om').toBe(true);

      await sluitAf(eigenaar);
      expect(await minpunt(week)).toEqual({ rijen: 1, som: -1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'route c: een uitgezet lid dat weer wordt toegelaten (inactive → active), zet de grendel om',
    async () => {
      const eigenaar = await createTestUser('later-c-eigenaar');
      const buddy = await createTestUser('later-c-buddy');

      const groep = await maakGroep(eigenaar, 'Later c');
      await doeMee(buddy, groep);
      const doel = await maakDoel(eigenaar, 'Doel c');
      await koppel(eigenaar, doel, groep);

      const weg = await eigenaar.db.rpc('verwijder_lid', {
        p_group_id: groep.id,
        p_user_id: buddy.id,
        p_bevestigd: true,
      });
      if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);
      if (uitkomst(weg.data).ok !== true) throw new Error(`uitzetten: ${JSON.stringify(weg.data)}`);

      const week = await planWeek(eigenaar, doel, 'week c');
      expect(await grendel(week), 'gepland terwijl de buddy uitgezet was').toBe(false);

      // ⚠️ `vraag_lidmaatschap_aan()` eist `groups.ontdekbaar` met een categorie,
      //    en die kolommen zijn niet client-schrijfbaar. Opbouw, zie
      //    `tests/rls/beheerdersgrens.test.ts`.
      const zichtbaar = await adminDb()
        .from('groups')
        .update({ ontdekbaar: true, categorie: 'fitness' })
        .eq('id', groep.id);
      if (zichtbaar.error) throw new Error(`ontdekbaar: ${zichtbaar.error.message}`);

      const verzoek = await buddy.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: groep.id,
        p_bericht: 'graag terug',
      });
      if (verzoek.error) throw new Error(`aanvragen: ${verzoek.error.message}`);
      if (uitkomst(verzoek.data).ok !== true) throw new Error(`aanvragen: ${JSON.stringify(verzoek.data)}`);

      const rij = await adminDb()
        .from('group_join_requests')
        .select('id')
        .eq('group_id', groep.id)
        .eq('user_id', buddy.id)
        .eq('status', 'pending')
        .single();
      if (rij.error) throw new Error(`verzoek lezen: ${rij.error.message}`);

      const besluit = await eigenaar.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: rij.data.id,
        p_naar: 'accepted',
      });
      if (besluit.error) throw new Error(`toelaten: ${besluit.error.message}`);
      if (uitkomst(besluit.data).ok !== true) throw new Error(`toelaten: ${JSON.stringify(besluit.data)}`);

      expect(await grendel(week), 'het weer toegelaten lid zet de grendel om').toBe(true);

      await sluitAf(eigenaar);
      expect(await minpunt(week)).toEqual({ rijen: 1, som: -1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'laat afgewikkelde weken ongemoeid, en zet alleen de open week om (domeinregel 6)',
    async () => {
      const eigenaar = await createTestUser('later-d-eigenaar');
      const buddy = await createTestUser('later-d-buddy');

      const groep = await maakGroep(eigenaar, 'Later d');
      const doel = await maakDoel(eigenaar, 'Doel d');
      await koppel(eigenaar, doel, groep);

      const open = await planWeek(eigenaar, doel, 'open week');
      const gemist = await afgewikkeldeWeek(doel, 'missed', addDays(cycle.startDate, -21));
      const gehaald = await afgewikkeldeWeek(doel, 'approved', addDays(cycle.startDate, -14));
      const vrij = await afgewikkeldeWeek(doel, 'excused', addDays(cycle.startDate, -7));

      for (const w of [open, gemist, gehaald, vrij]) {
        expect(await grendel(w), 'vóór de buddy staat alles op false').toBe(false);
      }

      await doeMee(buddy, groep);

      expect(await grendel(open), 'de open week gaat om').toBe(true);
      expect(await grendel(gemist), 'missed blijft staan').toBe(false);
      expect(await grendel(gehaald), 'approved blijft staan').toBe(false);
      expect(await grendel(vrij), 'excused blijft staan').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet niets om voor de eigenaar zelf: zijn eigen lidmaatschap maakt hem geen beoordelaar',
    async () => {
      const eigenaar = await createTestUser('later-e-eigenaar');

      // `create_group()` voegt de eigenaar zelf toe; er is nog niets gekoppeld.
      const groep = await maakGroep(eigenaar, 'Later e');
      const doel = await maakDoel(eigenaar, 'Doel e');
      await koppel(eigenaar, doel, groep);
      const week = await planWeek(eigenaar, doel, 'week e');
      expect(await grendel(week), 'solo: niemand kan beoordelen').toBe(false);

      // ⚠️ De eigenaar komt zélf (opnieuw) in een groep waaraan zijn doel al
      //    hangt. Via de app kan dat niet: wie vertrekt verliest zijn
      //    koppelingen (`verlaat_groep()`, 0102). Dus hier rechtstreeks: eerst het
      //    lidmaatschap uit en weer aan (de UPDATE-tak), daarna weg en opnieuw
      //    erin (de INSERT-tak). Zo raakt de eigenaar zelf de trigger terwijl zijn
      //    doel al aan de groep hangt, en dat is het geval dat criterium 4 noemt.
      const uit = await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', groep.id)
        .eq('user_id', eigenaar.id);
      if (uit.error) throw new Error(`eigenaar uit: ${uit.error.message}`);
      const aan = await adminDb()
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', groep.id)
        .eq('user_id', eigenaar.id);
      if (aan.error) throw new Error(`eigenaar aan: ${aan.error.message}`);
      expect(await grendel(week), 'de eigenaar die weer actief wordt').toBe(false);

      const weg = await adminDb()
        .from('group_members')
        .delete()
        .eq('group_id', groep.id)
        .eq('user_id', eigenaar.id);
      if (weg.error) throw new Error(`eigenaar weg: ${weg.error.message}`);
      const erin = await adminDb()
        .from('group_members')
        .insert({ group_id: groep.id, user_id: eigenaar.id, role: 'member', status: 'active' });
      if (erin.error) throw new Error(`eigenaar erin: ${erin.error.message}`);
      expect(await grendel(week), 'de eigenaar die zichzelf toevoegt').toBe(false);

      await sluitAf(eigenaar);
      expect(await minpunt(week), 'zonder buddy geen minpunt (QS8-110)').toEqual({ rijen: 0, som: 0 });
    },
    TEST_TIMEOUT,
  );

  it(
    'telt een lid dat als inactief binnenkomt niet mee, net als kan_beoordeeld_worden()',
    async () => {
      const eigenaar = await createTestUser('later-f-eigenaar');
      const ander = await createTestUser('later-f-ander');

      const groep = await maakGroep(eigenaar, 'Later f');
      const doel = await maakDoel(eigenaar, 'Doel f');
      await koppel(eigenaar, doel, groep);
      const week = await planWeek(eigenaar, doel, 'week f');

      // ⚠️ Geen schrijver in de app doet dit; het is de rand van het predicaat,
      //    en daarom rechtstreeks. Een inactief lid kan niet goedkeuren
      //    (`completion_approvals_insert`), dus het hoort niets om te zetten.
      const erin = await adminDb()
        .from('group_members')
        .insert({ group_id: groep.id, user_id: ander.id, role: 'member', status: 'inactive' });
      if (erin.error) throw new Error(`inactief lid: ${erin.error.message}`);

      expect(await grendel(week)).toBe(false);
    },
    TEST_TIMEOUT,
  );
});
