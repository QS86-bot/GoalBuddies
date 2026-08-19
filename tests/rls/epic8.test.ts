/**
 * EPIC 8 — De Ketting, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ De vraag die deze suite stelt is niet "werkt de gelukkige route" maar
 *    "kun je een schakel krijgen die je niet verdiend hebt". `chain_links` is de
 *    gedeelde teller van de groep; een verzonnen schakel maakt daar meer kapot
 *    dan een ontbrekende.
 *
 * ⚠️ Twee schrijvers, één tabel (migratie 0036, besluit van 19-08-2026). De
 *    weekafsluiting schrijft via een trigger, een goedgekeurd weekdoel via
 *    `ketting_schakel()`. De unieke constraint moet van beide routes samen één
 *    schakel maken — dat is hier een test en geen aanname.
 *
 * ⚠️ Alle accounts worden één keer in `beforeAll` gemaakt. Supabase weigert na
 *    ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached"; zie je dat in de opbouw, wacht dan een minuut in plaats van in de
 *    policies te zoeken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `periods.ts`, niet via `modules/buddies/index.ts`: die
//    laatste trekt de Supabase-client en AsyncStorage mee, en daarmee React
//    Native, in een test die in Node draait.
import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Oprichter, heeft een goedgekeurd weekdoel gekoppeld aan de groep. */
  alice: TestUser;
  /** Lid, heeft geen goedgekeurd weekdoel. */
  bob: TestUser;
  /** Lid van geen enkele groep van alice en bob. */
  carol: TestUser;
  groupId: string;
  /** De lopende groepsperiode. */
  periodStart: IsoDate;
  /** De persoonlijke cyclus waarin het goedgekeurde weekdoel staat. */
  cycleStart: IsoDate;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string; created?: boolean } {
  return (data ?? {}) as { ok?: boolean; reason?: string; created?: boolean };
}

function stand(data: unknown): { schakels?: number; in_aanmerking?: number; voltallig?: boolean } {
  return (data ?? {}) as { schakels?: number; in_aanmerking?: number; voltallig?: boolean };
}

describe.skipIf(!rlsTestsConfigured)('EPIC 8 — De Ketting', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('ketting-alice');
    const bob = await createTestUser('ketting-bob');
    const carol = await createTestUser('ketting-carol');

    const groep = await alice.db.rpc('create_group', { group_name: 'Ketting-test' });
    if (groep.error) throw new Error(`groep aanmaken (HTTP): ${groep.error.message}`);
    const groepData = uitkomst(groep.data) as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    const rij = await admin.from('groups').select('huddle_day, tz').eq('id', groupId).single();
    if (rij.error || rij.data === null) throw new Error(`groep uitlezen: ${rij.error?.message}`);

    const periode = groepsperiodeVan(rij.data, now());
    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    // Doel van alice, gekoppeld aan de groep, met één goedgekeurd weekdoel.
    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'KETTINGDOEL', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppeling = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId })
      .select('goal_id')
      .single();
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

    const weekdoel = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'KETTINGWEEKDOEL',
        cycle_start_date: cycle.startDate,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (weekdoel.error || weekdoel.data === null) throw new Error(`weekdoel: ${weekdoel.error?.message}`);

    // ⚠️ Via de admin-client. `weekly_goals.status` staat sinds 0023 op slot voor
    //    de eigenaar zelf — precies de bedoeling, en hier alleen een omweg in de
    //    opbouw en niet in wat getest wordt.
    const goedkeuren = await admin
      .from('weekly_goals')
      .update({ status: 'approved' })
      .eq('id', weekdoel.data.id);
    if (goedkeuren.error) throw new Error(`goedkeuren: ${goedkeuren.error.message}`);

    f = {
      alice,
      bob,
      carol,
      groupId,
      periodStart: periode.startDate,
      cycleStart: cycle.startDate,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('een schakel verdienen', () => {
    it(
      'schrijft een schakel bij een weekafsluiting, zonder dat de client iets doet',
      async () => {
        const review = await f.bob.db
          .from('week_reviews')
          .insert({
            group_id: f.groupId,
            user_id: f.bob.id,
            group_period_start: f.periodStart,
            did_text: 'iets gedaan',
          })
          .select('id')
          .single();
        expect(review.error).toBeNull();

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id)
          .eq('group_period_start', f.periodStart);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een schakel voor een goedgekeurd weekdoel',
      async () => {
        const { data, error } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
          p_cycle_start: f.cycleStart,
        });

        expect(error).toBeNull();
        expect(uitkomst(data).ok).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'levert bij twee routes samen één schakel op',
      async () => {
        // Alice verdient hem nog een keer: eerst via de RPC (hierboven al), nu
        // ook via de weekafsluiting. De constraint hoort dat op te vangen.
        await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: f.periodStart,
          did_text: 'ook nog afgesloten',
        });

        const opnieuw = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
          p_cycle_start: f.cycleStart,
        });
        expect(uitkomst(opnieuw.data).created).toBe(false);

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.alice.id)
          .eq('group_period_start', f.periodStart);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );
  });

  describe('een schakel die je niet verdiend hebt', () => {
    it(
      'weigert zonder goedgekeurd weekdoel',
      async () => {
        // Bob heeft geen enkel weekdoel. Zijn weekafsluiting gaf hem al een
        // schakel; deze route hoort hem er geen tweede te geven, en vooral: hij
        // hoort te weigeren op de reden en niet per ongeluk te slagen.
        const { data } = await f.bob.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
          p_cycle_start: f.cycleStart,
        });

        expect(uitkomst(data).ok).toBe(false);
        expect(uitkomst(data).reason).toBe('no_approved_goal');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een buitenstaander',
      async () => {
        const { data } = await f.carol.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
          p_cycle_start: f.cycleStart,
        });

        expect(uitkomst(data).ok).toBe(false);
        expect(uitkomst(data).reason).toBe('not_a_member');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een periode in de toekomst',
      async () => {
        const straks = addDays(f.periodStart, 30);
        const { data } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: straks,
          p_cycle_start: f.cycleStart,
        });

        expect(uitkomst(data).reason).toBe('period_out_of_range');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een periode ver in het verleden',
      async () => {
        const lang = addDays(f.periodStart, -200);
        const { data } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: lang,
          p_cycle_start: f.cycleStart,
        });

        expect(uitkomst(data).reason).toBe('period_out_of_range');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat niemand rechtstreeks een schakel in de tabel schrijven',
      async () => {
        // ⚠️ `chain_links` heeft alleen een SELECT-policy (0003). Zonder
        //    INSERT-policy weigert RLS, en dat is precies waarom beide
        //    schrijvers SECURITY DEFINER zijn. Slaagt deze insert, dan is de
        //    hele controle in ketting_schakel() een formaliteit geworden.
        const { error } = await f.alice.db.from('chain_links').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: addDays(f.periodStart, -7),
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });


  /**
   * De gaten die de reviewketen op 19-08-2026 vond en die 0037 dicht.
   *
   * ⚠️ Deze tests bestaan omdat de eerste suite ernaast mikte. Die toetste de
   *    buitenkant van het venster (30 dagen vooruit, 200 dagen terug) en niet de
   *    binnenkant — en de binnenkant was waar alles zat.
   */
  describe('de gaten uit de reviewronde', () => {
    it(
      'geeft geen tweede schakel voor dezelfde cyclus in een andere periode',
      async () => {
        // Vóór 0037 leverde één goedgekeurd weekdoel tot 36 schakels op: de
        // dedup zat op de periode, en `p_period_start` hoeft niet op een
        // periodegrens te liggen.
        // ⚠️ Eén dag terug en niet zeven. Zeven dagen terug ligt verder dan een
        //    week van `cycleStart`, en dan weigert de functie al op
        //    `cycle_period_mismatch` — de grens die er vóór staat. Dat is de
        //    juiste volgorde, maar het maakt die testdatum ongeschikt om
        //    hergebruik van een cyclus mee aan te tonen.
        const anderePeriode = addDays(f.periodStart, -1);
        const { data } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: anderePeriode,
          p_cycle_start: f.cycleStart,
        });

        expect(uitkomst(data).ok).toBe(false);
        expect(uitkomst(data).reason).toBe('cycle_already_used');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een periode die niet bij de opgegeven cyclus hoort',
      async () => {
        const { data } = await f.alice.db.rpc('ketting_schakel', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
          p_cycle_start: addDays(f.cycleStart, -21),
        });

        expect(uitkomst(data).reason).toBe('cycle_period_mismatch');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat geen weekafsluiting in een willekeurige week toe',
      async () => {
        // ⚠️ Dit was de ernstigste vondst: `week_reviews_write` is `for all`, dus
        //    invoegen met een zelfgekozen datum, de schakel incasseren, je eigen
        //    rij verwijderen en herhalen gaf een sluitende ketting van twee jaar.
        //    Sinds 0037 weigert een trigger de rij zelf.
        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: addDays(f.periodStart, -364),
          did_text: 'verzonnen week',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een groepsgenoot geen oude schakels lezen',
      async () => {
        // ⚠️ Hét lek. `chain_links_select` gaf elk lid élke rij, met naam en
        //    periode. Voor een afgesloten periode is een ontbrekende rij geen
        //    "nog niet" maar het bewijs van een gemiste week — precies wat
        //    domeinregel 7 verbiedt. Sinds 0037 zie je van een ander alleen de
        //    lopende periode; je eigen geschiedenis blijft van jou.
        const oud = addDays(f.periodStart, -60);
        await adminDb().from('chain_links').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: oud,
        });

        const doorBob = await f.bob.db
          .from('chain_links')
          .select('user_id, group_period_start')
          .eq('group_id', f.groupId)
          .eq('group_period_start', oud);
        expect(doorBob.data).toHaveLength(0);

        const doorAliceZelf = await f.alice.db
          .from('chain_links')
          .select('user_id')
          .eq('group_id', f.groupId)
          .eq('group_period_start', oud);
        expect(doorAliceZelf.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft via group_overview geen aanwezigheid van een afgesloten periode',
      async () => {
        // Hetzelfde raster, nettere verpakking: `p_period_start` was vrij te
        // kiezen, dus een lus over vijftig weken gaf het volledige overzicht.
        const { data, error } = await f.bob.db.rpc('group_overview', {
          p_group_id: f.groupId,
          p_period_start: addDays(f.periodStart, -60),
        });

        expect(error).toBeNull();
        for (const rij of (data ?? []) as { closed_this_period: boolean }[]) {
          expect(rij.closed_this_period).toBe(false);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'haalt een lid met adempauze uit de noemer — maar alleen op een doel van deze groep',
      async () => {
        // Criterium 4 was voor de helft ongetest, en dat was precies de helft
        // die stuk was: de toets keek naar élk doel van een lid, ook doelen
        // buiten deze groep.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const doelId = doel.data?.id;
        if (doelId === undefined) throw new Error('geen doel voor de adempauze-test');

        const voor = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        const pauze = await admin
          .from('breathers')
          .insert({
            user_id: f.alice.id,
            goal_id: doelId,
            starts_cycle: addDays(f.cycleStart, -1),
            ends_cycle: addDays(f.cycleStart, 6),
          })
          .select('id')
          .single();

        const na = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(stand(na.data).in_aanmerking).toBe((stand(voor.data).in_aanmerking ?? 1) - 1);

        const pauzeId = pauze.data?.id;
        if (pauzeId !== undefined) await admin.from('breathers').delete().eq('id', pauzeId);
      },
      TEST_TIMEOUT,
    );
  });

  describe('de stand van de ketting', () => {
    it(
      'geeft een buitenstaander niets',
      async () => {
        const { data } = await f.carol.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(data ?? null).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'telt de schakels van de lopende periode',
      async () => {
        const { data, error } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(error).toBeNull();
        expect(stand(data).schakels).toBe(2);
        expect(stand(data).in_aanmerking).toBe(2);
        expect(stand(data).voltallig).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'noemt nooit wie er ontbreekt',
      async () => {
        // ⚠️ Domeinregel 7. De stand mag drie sleutels hebben en geen enkele
        //    daarvan mag naar een persoon te herleiden zijn — anders is "wie is
        //    er nog niet" met één API-verzoek te beantwoorden.
        const { data } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(Object.keys(stand(data)).sort()).toEqual(['in_aanmerking', 'schakels', 'voltallig']);
        expect(JSON.stringify(data)).not.toContain(f.bob.id);
        expect(JSON.stringify(data)).not.toContain(f.alice.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een uitgezet lid "voltallig" niet blokkeren',
      async () => {
        const admin = adminDb();
        await admin
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        const { data } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        // ⚠️ Deze assertie is op 19-08-2026 omgedraaid. Ze stond eerst op
        //    `schakels: 2, in_aanmerking: 1, voltallig: true` — "2 van de 1" —
        //    en legde daarmee vast dat teller en noemer verschillende mensen
        //    mochten tellen. Alle drie de reviewers noemden dat blokkerend, en
        //    terecht: een test die een tegenstrijdigheid vastlegt, beschermt hem.
        //
        //    Sinds 0037 tellen beide dezelfde verzameling. Bobs schakel blijft in
        //    de tabel staan (criterium 5) maar telt niet mee zolang hij uitgezet
        //    is, dus de stand kan nooit meer meer schakels dan leden tonen.
        expect(stand(data).in_aanmerking).toBe(1);
        expect(stand(data).schakels).toBe(1);
        expect(stand(data).voltallig).toBe(true);
        expect(stand(data).schakels).toBeLessThanOrEqual(stand(data).in_aanmerking ?? 0);

        await admin
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de schakels van een vertrokken lid',
      async () => {
        // Criterium 5. Schakels hangen aan `profiles` en niet aan het
        // lidmaatschap, dus vertrek mag de ketting niet uitwissen.
        const admin = adminDb();
        await admin
          .from('group_members')
          .delete()
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        const schakels = await admin
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );
  });
});
