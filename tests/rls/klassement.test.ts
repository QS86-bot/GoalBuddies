import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Het klassement per lid — QS8-254, besluit A54, migratie 0141.
 *
 * ⚠️ **Dit bestand bewaakt een besluit dat een ánder besluit terugdraait**, en
 *    dat is de reden dat de tegentoetsen hier zwaarder wegen dan de bevestigende.
 *    Besluit A42 zei dat punten privé zijn omdat een dalend totaal een gemiste
 *    week verraadt. A54 opent ze — maar alléén in een groep die onder A41 heeft
 *    afgesproken elkaars tegenslag te zien.
 *
 *    De vraag die dit bestand moet kunnen beantwoorden is dus niet "werkt het
 *    klassement" maar: **kan iemand in een beschermde groep er alsnog bij, en kan
 *    een gemiste week er alsnog uit worden afgeleid?**
 *
 * ⚠️ **De belangrijkste toets hier is de saaiste.** Dat een gemiste week het
 *    klassement niet beweegt, komt doordat de rollover `cycle_missed` zónder
 *    `group_id` boekt. Dat was tot 0141 een toevalligheid van één Edge Function
 *    en is nu een CHECK — en zonder de toets hieronder zou het terugdraaien van
 *    die CHECK geen enkele test rood maken.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Ver in het verleden, zodat niets van deze test elders meetelt. */
const CYCLUS = '2024-03-04';

/**
 * Een tweede week, die wél wordt ingediend maar níét goedgekeurd.
 *
 * ⚠️ **Deze week bestaat om een ijking mogelijk te maken en niet om iets extra's
 *    te toetsen.** Zonder hem stond er in de fixture precies één weekdoel en dat
 *    was `approved` — en dan telt een teller die per ongeluk óók `pending` telt
 *    exact hetzelfde getal. De naadtoets hieronder bleef daardoor groen op een
 *    kapotte teller: geen test die groen bleef terwijl de belofte brak, maar een
 *    test die de belofte niet kón raken (CLAUDE.md, regel 18 vraag 3).
 */
const CYCLUS_OPEN_EIND = '2024-03-11';

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Eigenaar van het doel, lid van allebei de groepen. */
  anna: TestUser;
  /** Buddy, lid van allebei. Keurt goed en verdient daar een reviewpunt mee. */
  bram: TestUser;
  /** Geen lid van iets. */
  cor: TestUser;
  /** Doet mee aan de open groep en wordt daarna uitgezet. */
  dirk: TestUser;
  open: Groep;
  dicht: Groep;
  doelId: string;
  weekdoelId: string;
}

let f: Fixture;

async function maakGroep(eigenaar: TestUser, naam: string, zicht: string): Promise<Groep> {
  const { data, error } = await eigenaar.db.rpc('create_group', {
    group_name: naam,
    zichtbaarheid: zicht,
  });
  if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

  const gelezen = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (gelezen.ok !== true || !gelezen.group) {
    throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
  }
  return { id: gelezen.group.id, code: gelezen.group.invite_code };
}

async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
  const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
  if (error) throw new Error(`meedoen (HTTP): ${error.message}`);

  const gelezen = data as unknown as { ok?: boolean; reason?: string };
  if (gelezen.ok !== true) throw new Error(`meedoen mislukte: ${gelezen.reason ?? 'geen reden'}`);
}

interface Klassementsrij {
  user_id: string;
  display_name: string;
  punten: number;
  positie: number;
  total_members: number;
}

/** Het klassement zoals déze kijker het krijgt. */
async function klassement(kijker: TestUser, groupId: string): Promise<readonly Klassementsrij[]> {
  const { data, error } = await kijker.db.rpc('groep_klassement', { p_group_id: groupId });
  if (error) throw new Error(`klassement: ${error.message}`);
  return (data ?? []) as unknown as readonly Klassementsrij[];
}

/** De teller zoals déze kijker hem krijgt, of `null` als hij geen lid is. */
async function teller(
  kijker: TestUser,
  groupId: string,
): Promise<{ weken: number; mijlpalen: number } | null> {
  const { data, error } = await kijker.db.rpc('groep_teller', { p_group_id: groupId });
  if (error) throw new Error(`teller: ${error.message}`);
  if (data === null || data === undefined) return null;
  return data as unknown as { weken: number; mijlpalen: number };
}

function puntenVan(rijen: readonly Klassementsrij[], userId: string): number | undefined {
  return rijen.find((rij) => rij.user_id === userId)?.punten;
}

describe.skipIf(!rlsTestsConfigured)('het klassement van een groep', () => {
  beforeAll(async () => {
    const anna = await createTestUser('klassement-anna');
    const bram = await createTestUser('klassement-bram');
    const cor = await createTestUser('klassement-cor');
    const dirk = await createTestUser('klassement-dirk');

    const open = await maakGroep(anna, 'Klassement-open', 'open');
    const dicht = await maakGroep(anna, 'Klassement-dicht', 'beschermd');

    await laatMeedoen(bram, open);
    await laatMeedoen(bram, dicht);
    await laatMeedoen(dirk, open);

    const doel = await anna.db
      .from('goals')
      .insert({ owner_id: anna.id, title: 'KLASSEMENT doel', target_date: '2027-06-30' })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    for (const groep of [open, dicht]) {
      const koppel = await anna.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: groep.id });
      if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);
    }

    // ⚠️ **De punten worden verdíénd en niet geschreven.** Een fixture die zelf
    //    een rij in `points_ledger` zet, toetst een toestand die de app
    //    misschien nooit maakt — en juist de vraag "welke `group_id` komt er in
    //    die rij" is hier het onderwerp. Dus: een echt weekdoel, een echte
    //    voltooiing, een echte goedkeuring door een buddy.
    const week = await anna.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'KLASSEMENT week',
        floor_text: 'Eén keer',
        ceiling_text: 'Drie keer',
        cycle_start_date: CYCLUS,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

    const voltooiing = await anna.db
      .from('completions')
      .insert({
        weekly_goal_id: week.data.id,
        user_id: anna.id,
        achieved_level: 'ceiling',
        note: 'KLASSEMENT proefnotitie',
        cycle_start_date: CYCLUS,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing: ${voltooiing.error?.message}`);
    }

    // De goedkeuring gebeurt in de ópen groep. Dat is precies wat de punten aan
    // één groep bindt, en waarom de beschermde groep straks op nul staat.
    const oordeel = await bram.db.from('completion_approvals').insert({
      completion_id: voltooiing.data.id,
      approver_id: bram.id,
      // ⚠️ Net als in `beoordeel()`: de trigger zet de échte eigenaar, deze
      //    waarde haalt alleen de NOT NULL. Een fixture die hier iets anders
      //    doet dan de app, toetst een rij die de app nooit maakt.
      subject_id: bram.id,
      group_id: open.id,
      status: 'approved',
      comment: 'KLASSEMENT netjes gedaan',
    });
    if (oordeel.error) throw new Error(`goedkeuren: ${oordeel.error.message}`);

    // De tweede week: ingediend, niet beoordeeld. Zie de opmerking bij
    // `CYCLUS_OPEN_EIND` — hij levert geen punten op en raakt het klassement dus
    // niet, maar hij maakt het verschil tussen "approved" en "approved of
    // pending" meetbaar.
    const tweede = await anna.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'KLASSEMENT week zonder oordeel',
        floor_text: 'Eén keer',
        ceiling_text: 'Drie keer',
        cycle_start_date: CYCLUS_OPEN_EIND,
        cycle_index: 2,
      })
      .select('id')
      .single();
    if (tweede.error || tweede.data === null) throw new Error(`week 2: ${tweede.error?.message}`);

    const tweedeVoltooiing = await anna.db.from('completions').insert({
      weekly_goal_id: tweede.data.id,
      user_id: anna.id,
      achieved_level: 'floor',
      note: 'KLASSEMENT tweede proefnotitie',
      cycle_start_date: CYCLUS_OPEN_EIND,
    });
    if (tweedeVoltooiing.error) throw new Error(`voltooiing 2: ${tweedeVoltooiing.error.message}`);

    const staatOpen = await adminDb()
      .from('weekly_goals')
      .select('status')
      .eq('id', tweede.data.id)
      .single();
    if (staatOpen.data?.status !== 'pending') {
      throw new Error(`week 2 staat op ${staatOpen.data?.status ?? 'niets'} in plaats van pending`);
    }

    // Dirk gaat eruit. Hij blijft een rij in `group_members` houden — vertrekken
    // is sinds 0102 een statuswijziging en geen DELETE — en hoort dus juist
    // daarom niet meer in het klassement te staan.
    const uitgezet = await adminDb()
      .from('group_members')
      .update({ status: 'inactive' })
      .eq('group_id', open.id)
      .eq('user_id', dirk.id);
    if (uitgezet.error) throw new Error(`uitzetten: ${uitgezet.error.message}`);

    f = { anna, bram, cor, dirk, open, dicht, doelId: doel.data.id, weekdoelId: week.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goals').delete().eq('id', f.doelId);
    await admin.from('groups').delete().in('id', [f.open.id, f.dicht.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De open groep
  // -------------------------------------------------------------------------

  it(
    'toont in een open groep elk lid met zijn punten en zijn plek',
    async () => {
      const rijen = await klassement(f.bram, f.open.id);

      // Anna kreeg het plafondpunt van haar goedgekeurde week, Bram het
      // reviewpunt voor het beoordelen ervan.
      expect(puntenVan(rijen, f.anna.id), 'Anna heeft geen punten in de open groep').toBeGreaterThan(0);
      expect(puntenVan(rijen, f.bram.id), 'Bram kreeg geen reviewpunt').toBeGreaterThan(0);

      const anna = rijen.find((rij) => rij.user_id === f.anna.id);
      const bram = rijen.find((rij) => rij.user_id === f.bram.id);
      expect(anna?.punten ?? 0, 'het plafondpunt is niet hoger dan het reviewpunt').toBeGreaterThan(
        bram?.punten ?? 0,
      );
      expect(anna?.positie, 'de hoogste stand staat niet op plek 1').toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Hier bestaat dit bestand voor.** Rood gemaakt door in 0141
   *    `lid_van_open_groep(p_group_id)` te vervangen door
   *    `is_group_member(p_group_id)`: Bram kreeg toen het volledige klassement
   *    van de beschermde groep terug, en alle andere toetsen bleven groen.
   *
   * ⚠️ En dit gaat rechtstreeks langs de RPC, niet langs een scherm. Een
   *    klassement dat alleen in de UI verborgen wordt, is met één verzoek aan
   *    PostgREST alsnog uit te lezen — dat is de eis uit het issue.
   */
  it(
    'geeft in een beschermde groep niets terug, ook niet aan een lid',
    async () => {
      expect(await klassement(f.bram, f.dicht.id)).toEqual([]);
      expect(await klassement(f.anna, f.dicht.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een niet-lid niets, ook niet van een open groep',
    async () => {
      expect(await klassement(f.cor, f.open.id)).toEqual([]);
      expect(await klassement(f.cor, f.dicht.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Een eigenschap van de handtekening en niet van het scherm.** Het issue
   *    verbiedt een minpunt in beeld en een verloop per lid over de tijd. Dat is
   *    hier afgedwongen doordat die kolommen niet bestaan — en deze toets is wat
   *    die afspraak vasthoudt. Zou iemand er ooit `delta` of `created_at` bij
   *    zetten "voor het dashboard", dan wordt dit rood en niet een reviewronde
   *    over een half jaar.
   */
  it(
    'levert per lid precies een totaal en een plek — geen delta en geen datum',
    async () => {
      const rijen = await klassement(f.bram, f.open.id);
      expect(rijen.length, 'de open groep geeft geen rijen terug').toBeGreaterThan(0);

      for (const rij of rijen) {
        expect(Object.keys(rij).sort()).toEqual(
          ['display_name', 'positie', 'punten', 'total_members', 'user_id'].sort(),
        );
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een uitgezet lid niet in het klassement staan',
    async () => {
      // Eerst bewijzen dat hij er nog ís: zonder deze helft is "Dirk staat er
      // niet in" gratis groen bij een tikfout in zijn id.
      const rij = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', f.open.id)
        .eq('user_id', f.dirk.id)
        .single();
      expect(rij.data?.status, 'Dirk is helemaal geen lid meer van deze groep').toBe('inactive');

      const rijen = await klassement(f.bram, f.open.id);
      expect(rijen.some((r) => r.user_id === f.dirk.id)).toBe(false);
      expect(rijen.some((r) => r.user_id === f.anna.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Wat er níét in mag lekken
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De toets waar besluit A42 om vroeg.** Rood gemaakt door de CHECK
   *    `points_ledger_gemist_is_niet_van_een_groep` te droppen en de gemiste week
   *    mét `group_id` te boeken: Anna's stand zakte van 2 naar 1 en het
   *    klassement was daarmee een tegenslagmeter geworden. Geen enkele andere
   *    toets in dit bestand werd daar rood van.
   */
  it(
    'beweegt niet van een gemiste week, en de database weigert er een met een groep',
    async () => {
      const voor = puntenVan(await klassement(f.bram, f.open.id), f.anna.id);
      expect(voor, 'Anna staat niet in het klassement').toBeGreaterThan(0);

      // 1. Een gemiste week mét groep hoort niet te bestaan.
      const metGroep = await adminDb().from('points_ledger').insert({
        user_id: f.anna.id,
        goal_id: f.doelId,
        group_id: f.open.id,
        delta: -1,
        reason: 'cycle_missed',
        ref_type: 'weekly_goal',
        ref_id: f.weekdoelId,
      });
      expect(metGroep.error?.code, 'een gemiste week mét groep werd gewoon geboekt').toBe('23514');

      // 2. Zoals de rollover hem wél boekt: zonder groep. Die mag landen, en mag
      //    het klassement niet raken.
      const zonderGroep = await adminDb().from('points_ledger').insert({
        user_id: f.anna.id,
        goal_id: f.doelId,
        group_id: null,
        delta: -1,
        reason: 'cycle_missed',
        ref_type: 'weekly_goal',
        ref_id: f.weekdoelId,
      });
      expect(zonderGroep.error, `gemiste week boeken: ${zonderGroep.error?.message}`).toBeNull();

      expect(
        puntenVan(await klassement(f.bram, f.open.id), f.anna.id),
        'het klassement daalde van een gemiste week — domeinregel 7',
      ).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Zonder deze toets zou het klassement het persóónlijke totaal kunnen tonen
   *    in plaats van het groepstotaal — en dan lekt een groep de punten van een
   *    ándere groep, inclusief wat daar aan tegenslag in verrekend is.
   */
  it(
    'telt alleen de punten die in déze groep verdiend zijn',
    async () => {
      const elders = await adminDb().from('points_ledger').insert({
        user_id: f.anna.id,
        goal_id: f.doelId,
        group_id: f.dicht.id,
        delta: 5,
        reason: 'correction',
        ref_type: 'weekly_goal',
        ref_id: f.weekdoelId,
      });
      expect(elders.error, `punten elders boeken: ${elders.error?.message}`).toBeNull();

      const rijen = await klassement(f.bram, f.open.id);
      const anna = rijen.find((rij) => rij.user_id === f.anna.id);
      expect(anna?.punten, 'de punten uit de beschermde groep lekten het klassement in').toBeLessThan(5);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De teller — in béide standen
  // -------------------------------------------------------------------------

  it(
    'geeft de optelteller in béide zichtbaarheidstanden',
    async () => {
      const inOpen = await teller(f.bram, f.open.id);
      const inDicht = await teller(f.bram, f.dicht.id);

      // Het doel hangt aan allebei de groepen, dus de afgeronde week telt in
      // allebei — precies zoals `seizoensrecap_cijfers()` hem telt.
      expect(inOpen?.weken, 'de open groep telt de afgeronde week niet').toBe(1);
      expect(inDicht?.weken, 'de beschermde groep krijgt geen teller').toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De naad, en niet een eigenschap van één van de twee kanten.**
   *    `groep_teller()` en `seizoensrecap_cijfers()` beantwoorden allebei de vraag
   *    "hoeveel weken heeft deze groep afgerond". Ze staan in twee migraties, ze
   *    zijn allebei los correct, en ze kunnen tóch uit elkaar lopen — en dan ziet
   *    dezelfde groep twee getallen en is het geen feit meer maar een mening van
   *    een scherm.
   *
   *    Er is geen manier om die twee in één definitie te vangen: de recap telt per
   *    seizoen en de teller vanaf het begin. Wat wél kan, is ze over hetzelfde
   *    venster naast elkaar leggen, en dat is deze toets. Rood gemaakt door in
   *    0141 `w.status = 'approved'` te vervangen door
   *    `w.status in ('approved', 'pending')`: de teller sprong vooruit, de recap
   *    niet, en geen enkele andere toets in dit bestand merkte het.
   */
  it(
    'telt afgeronde weken precies zoals de seizoensrecap ze telt',
    async () => {
      const recap = await adminDb().rpc('seizoensrecap_cijfers', {
        p_group_id: f.open.id,
        p_van: '2000-01-01',
        p_tot: '2100-01-01',
      });
      if (recap.error) throw new Error(`recapcijfers: ${recap.error.message}`);

      const cijfers = (recap.data ?? [])[0];
      expect(cijfers, 'de recap gaf geen rij terug').toBeDefined();

      const uitTeller = await teller(f.bram, f.open.id);
      expect(uitTeller?.weken, 'teller en seizoensrecap tellen niet hetzelfde').toBe(
        cijfers?.weken,
      );
      expect(uitTeller?.mijlpalen, 'de mijlpalen lopen uiteen').toBe(cijfers?.mijlpalen);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een niet-lid geen teller',
    async () => {
      expect(await teller(f.cor, f.open.id)).toBeNull();
      expect(await teller(f.cor, f.dicht.id)).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
