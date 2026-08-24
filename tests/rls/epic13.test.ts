/**
 * EPIC 13 — Open of beschermde groepen, uitgevoerd in plaats van gelezen.
 *
 * Besluit **A41** (24-08-2026, QS8-128 variant 2, uitgewerkt in QS8-132):
 * een groep kiest bij het aanmaken tussen **beschermd** (zoals nu, en de
 * standaard) en **open** (de groep ziet ook tegenslag).
 *
 * ⚠️ **Waarom deze suite twee fixtures heeft en niet één.** Een policy die per
 *    groep varieert, kan op twee manieren stuk: hij opent te weinig, en dan is
 *    de feature er niet — of hij opent te véél, en dan lekt domeinregel 7 in
 *    élke groep. Alleen de tweede fout is gevaarlijk, en die vind je uitsluitend
 *    door de beschermde stand net zo hard te toetsen als de open stand. Elke
 *    toets hieronder komt daarom in twee smaken.
 *
 * ⚠️ **De derde fixture is de belangrijkste.** `deelt_open_groep_met_doel()`
 *    moet de zichtbaarheid toetsen van de groep die de kíjker met dit doel
 *    deelt, en niet van "een" groep waar het doel aan hangt. Een doel dat aan
 *    één open en één beschermde groep hangt, is het geval waarin een simpele
 *    implementatie ("hangt dit doel aan een open groep?") de gemiste weken van
 *    de eigenaar aan de beschermde groep uitdeelt. Dat is `groepGemengd`.
 *
 * ⚠️ Alle accounts worden één keer in `beforeAll` gemaakt. Supabase weigert na
 *    ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached"; zie je dat in de opbouw, wacht dan een minuut in plaats van in de
 *    policies te zoeken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import {
  adminDb,
  anonDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Oprichter en beheerder van alle groepen; eigenaar van alle doelen. */
  alice: TestUser;
  /** Lid van de beschermde, de open en de gemengde groep. */
  bob: TestUser;
  /** Lid van uitsluitend de beschermde kant van de gemengde koppeling. */
  carol: TestUser;

  groepBeschermd: Groep;
  groepOpen: Groep;
  /** Blijft beschermd tot de omzet-tests hem oppakken. */
  groepSchakel: Groep;

  /** Gekoppeld aan `groepBeschermd`. */
  doelBeschermd: string;
  /** Gekoppeld aan `groepOpen`. */
  doelOpen: string;
  /** Gekoppeld aan `groepGemengdOpen` én `groepGemengdDicht`. */
  doelGemengd: string;
  groepGemengdOpen: Groep;
  groepGemengdDicht: Groep;
  /** Gekoppeld aan `groepSchakel`. */
  doelSchakel: string;

  cycleStart: IsoDate;
  /** Een groepsperiode ver buiten het venster van acht dagen (migratie 0037). */
  oudePeriode: IsoDate;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string; van?: string; naar?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string; van?: string; naar?: string };
}

describe.skipIf(!rlsTestsConfigured)('EPIC 13 — open of beschermde groepen', () => {
  let f: Fixture;

  async function maakGroep(
    eigenaar: TestUser,
    naam: string,
    zichtbaarheid?: 'beschermd' | 'open',
  ): Promise<Groep> {
    const argumenten =
      zichtbaarheid === undefined
        ? { group_name: naam }
        : { group_name: naam, zichtbaarheid };

    const { data, error } = await eigenaar.db.rpc('create_group', argumenten);
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

    const gelezen = (data ?? {}) as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (gelezen.ok !== true || !gelezen.group) {
      throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
    }

    return { id: gelezen.group.id, code: gelezen.group.invite_code };
  }

  async function laatMeedoen(gebruiker: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await gebruiker.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
    if (uitkomst(data).ok !== true) {
      throw new Error(`meedoen mislukte: ${uitkomst(data).reason ?? 'geen reden'}`);
    }
  }

  /**
   * Een doel met twee weekdoelen: één `todo` en één `missed`.
   *
   * ⚠️ `missed` is de status waar het hele oppervlak om draait. `status` staat
   *    sinds 0023 op slot voor de eigenaar zelf, dus dat zetten gaat via de
   *    admin-client — een omweg in de ópbouw, niet in wat getest wordt.
   */
  async function maakDoelMetGemisteWeek(
    titel: string,
    groepen: readonly Groep[],
    cycleStart: IsoDate,
  ): Promise<string> {
    const admin = adminDb();

    const doel = await f.alice.db
      .from('goals')
      .insert({ owner_id: f.alice.id, title: titel, target_date: cycleStart })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);

    for (const groep of groepen) {
      const koppeling = await f.alice.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: groep.id });
      if (koppeling.error) throw new Error(`koppeling ${titel}: ${koppeling.error.message}`);
    }

    const gepland = await f.alice.db.from('weekly_goals').insert({
      goal_id: doel.data.id,
      title: `${titel}-GEPLAND`,
      cycle_start_date: cycleStart,
      cycle_index: 1,
    });
    if (gepland.error) throw new Error(`gepland weekdoel ${titel}: ${gepland.error.message}`);

    const gemist = await f.alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: `${titel}-GEMIST`,
        cycle_start_date: cycleStart,
        cycle_index: 2,
      })
      .select('id')
      .single();
    if (gemist.error || gemist.data === null) {
      throw new Error(`gemist weekdoel ${titel}: ${gemist.error?.message}`);
    }

    const zetten = await admin
      .from('weekly_goals')
      .update({ status: 'missed' })
      .eq('id', gemist.data.id);
    if (zetten.error) throw new Error(`missed zetten ${titel}: ${zetten.error.message}`);

    return doel.data.id;
  }

  /** De titels van de weekdoelen die deze gebruiker van dit doel te zien krijgt. */
  async function zichtbareWeekdoelen(
    gebruiker: TestUser,
    doelId: string,
  ): Promise<readonly string[]> {
    const { data, error } = await gebruiker.db
      .from('weekly_goals')
      .select('title')
      .eq('goal_id', doelId)
      .order('cycle_index', { ascending: true });

    if (error) throw new Error(`weekdoelen lezen: ${error.message}`);
    return (data ?? []).map((r) => r.title);
  }

  /**
   * Wat één kijker via `group_overview()` van één lid ziet.
   *
   * ⚠️ Via de RPC en niet via de view, en dat is het punt van deze toets. De
   *    bescherming zit in `group_visible_streaks`, maar het scherm leest
   *    `group_overview()` — en dat is een SECURITY INVOKER-functie die de view
   *    joint. Alleen de rij die het schérm krijgt, bewijst dat de keten klopt.
   */
  async function overzichtsrij(
    kijker: TestUser,
    groep: Groep,
    over: TestUser,
  ): Promise<{ current_streak: number | null; best_streak: number | null } | null> {
    const { data, error } = await kijker.db.rpc('group_overview', {
      p_group_id: groep.id,
      p_period_start: f.cycleStart,
    });

    if (error) throw new Error(`groepsoverzicht lezen: ${error.message}`);

    const rij = (data ?? []).find((r) => r.user_id === over.id);
    return rij === undefined
      ? null
      : { current_streak: rij.current_streak, best_streak: rij.best_streak };
  }

  async function zichtbaarheidVan(groep: Groep): Promise<string | null> {
    const { data, error } = await adminDb()
      .from('groups')
      .select('zichtbaarheid')
      .eq('id', groep.id)
      .single();

    if (error) throw new Error(`zichtbaarheid lezen: ${error.message}`);
    return data?.zichtbaarheid ?? null;
  }

  beforeAll(async () => {
    const alice = await createTestUser('zicht-alice');
    const bob = await createTestUser('zicht-bob');
    const carol = await createTestUser('zicht-carol');

    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    f = {
      alice,
      bob,
      carol,
      groepBeschermd: { id: '', code: '' },
      groepOpen: { id: '', code: '' },
      groepSchakel: { id: '', code: '' },
      groepGemengdOpen: { id: '', code: '' },
      groepGemengdDicht: { id: '', code: '' },
      doelBeschermd: '',
      doelOpen: '',
      doelGemengd: '',
      doelSchakel: '',
      cycleStart: cycle.startDate,
      // ⚠️ Ver buiten het venster van acht dagen uit migratie 0037. Dát is het
      //    geval waar dit oppervlak om draait: binnen het venster betekent een
      //    ontbrekende schakel "nog niet", daarbuiten "die week niets gedaan".
      oudePeriode: addDays(cycle.startDate, -30),
    };

    f.groepBeschermd = await maakGroep(alice, 'Zicht-beschermd');
    f.groepOpen = await maakGroep(alice, 'Zicht-open', 'open');
    f.groepSchakel = await maakGroep(alice, 'Zicht-schakel');
    f.groepGemengdOpen = await maakGroep(alice, 'Zicht-gemengd-open', 'open');
    f.groepGemengdDicht = await maakGroep(alice, 'Zicht-gemengd-dicht');

    await laatMeedoen(bob, f.groepBeschermd);
    await laatMeedoen(bob, f.groepOpen);
    await laatMeedoen(bob, f.groepSchakel);
    await laatMeedoen(bob, f.groepGemengdOpen);
    // ⚠️ Bob zit in béíde helften van de gemengde koppeling, en dat is met opzet:
    //    alleen zo is de asymmetrie tussen de twee helpers zichtbaar op één
    //    scherm. Zie de test "twee helpers, twee antwoorden".
    await laatMeedoen(bob, f.groepGemengdDicht);
    // ⚠️ Carol zit uitsluitend in de bescherméde helft van de gemengde
    //    koppeling. Zij is het bewijs dat de derde tak per groep beslist.
    await laatMeedoen(carol, f.groepGemengdDicht);

    f.doelBeschermd = await maakDoelMetGemisteWeek(
      'BESCHERMD',
      [f.groepBeschermd],
      cycle.startDate,
    );
    f.doelOpen = await maakDoelMetGemisteWeek('OPEN', [f.groepOpen], cycle.startDate);
    f.doelGemengd = await maakDoelMetGemisteWeek(
      'GEMENGD',
      [f.groepGemengdOpen, f.groepGemengdDicht],
      cycle.startDate,
    );
    f.doelSchakel = await maakDoelMetGemisteWeek('SCHAKEL', [f.groepSchakel], cycle.startDate);

    // ⚠️ `best_streak` hoger dan `current_streak`: dát is de combinatie die een
    //    verbroken reeks verraadt, en de enige die iets bewijst. Zou `best`
    //    gelijk zijn aan `current`, dan zou een lek er onschuldig uitzien.
    //
    //    Via de admin-client: `user_streaks` is een cache die de database zelf
    //    bijhoudt, en de policy erop is eigenaar-only.
    const reeksen = await adminDb()
      .from('user_streaks')
      .upsert(
        // ⚠️ `doelGemengd` staat er sinds 24-08 bij. De suite-kop noemt die
        //    fixture "de belangrijkste", en hij werd maar op één van de vier
        //    oppervlakken uitgeoefend — de reeks had geen rij, dus de gemengde
        //    koppeling zei daar niets. Gevonden door de code-critic-ronde.
        [f.doelBeschermd, f.doelOpen, f.doelGemengd].map((goalId) => ({
          user_id: alice.id,
          goal_id: goalId,
          current_streak: 2,
          best_streak: 7,
          last_cycle_start: cycle.startDate,
        })),
      );
    if (reeksen.error) throw new Error(`reeksen: ${reeksen.error.message}`);

    // ⚠️ Via de admin-client, want `chain_links` heeft geen INSERT-policy: alle
    //    schrijvers zijn SECURITY DEFINER (migratie 0036). Een schakel in een
    //    afgesloten periode is niet met de gewone route te maken zonder de klok
    //    te verzetten, en dat is precies wat deze opzet vermijdt.
    const schakels = await adminDb()
      .from('chain_links')
      .insert([
        { group_id: f.groepBeschermd.id, user_id: alice.id, group_period_start: f.oudePeriode },
        { group_id: f.groepOpen.id, user_id: alice.id, group_period_start: f.oudePeriode },
        { group_id: f.groepGemengdDicht.id, user_id: alice.id, group_period_start: f.oudePeriode },
      ]);
    if (schakels.error) throw new Error(`schakels: ${schakels.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('de kolom zelf', () => {
    it(
      'geeft een nieuwe groep zonder keuze de beschermde stand',
      async () => {
        // Grens 1 van het besluit, als schema-eigenschap: bestaande groepen en
        // groepen die niets kiezen, zijn beschermd.
        expect(await zichtbaarheidVan(f.groepBeschermd)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );

    it(
      'neemt een expliciete keuze over',
      async () => {
        expect(await zichtbaarheidVan(f.groepOpen)).toBe('open');
      },
      TEST_TIMEOUT,
    );

    it(
      'valt bij een onbekende waarde terug op beschermd en weigert niet',
      async () => {
        // ⚠️ Terugvallen op de veilige kant en niet gooien. Een groep die per
        //    ongeluk beschermd is, kan alsnog open; een groep die per ongeluk
        //    open is, heeft de gemiste weken van zijn leden al laten zien.
        const groep = await maakGroep(f.alice, 'Zicht-rommel', 'ROMMEL' as 'open');
        expect(await zichtbaarheidVan(groep)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een beheerder de kolom niet rechtstreeks schrijven',
      async () => {
        // ⚠️ Twee sloten, en deze test slaagt bij allebei: de kolomgrant weigert
        //    met 42501, en de trigger zet de waarde terug. Wat de test bewaakt is
        //    de uitkomst — de kolom staat er na afloop nog hetzelfde.
        await f.alice.db
          .from('groups')
          .update({ zichtbaarheid: 'open' })
          .eq('id', f.groepBeschermd.id);

        expect(await zichtbaarheidVan(f.groepBeschermd)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('weekdoelen — oppervlak 3, in beide standen', () => {
    it(
      'verbergt een gemiste week in een beschermde groep',
      async () => {
        // ⚠️ Dit is de bestaande belofte van 0019/0020/0045/0047 en hij moet
        //    ongewijzigd overeind blijven. Wordt deze rood, dan heeft besluit
        //    A41 domeinregel 7 niet verruimd maar afgeschaft.
        expect(await zichtbareWeekdoelen(f.bob, f.doelBeschermd)).toEqual(['BESCHERMD-GEPLAND']);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont een gemiste week in een open groep',
      async () => {
        expect(await zichtbareWeekdoelen(f.bob, f.doelOpen)).toEqual([
          'OPEN-GEPLAND',
          'OPEN-GEMIST',
        ]);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar in beide standen alles zien',
      async () => {
        expect(await zichtbareWeekdoelen(f.alice, f.doelBeschermd)).toEqual([
          'BESCHERMD-GEPLAND',
          'BESCHERMD-GEMIST',
        ]);
        expect(await zichtbareWeekdoelen(f.alice, f.doelOpen)).toEqual([
          'OPEN-GEPLAND',
          'OPEN-GEMIST',
        ]);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander niets, ook niet bij een open groep',
      async () => {
        // "Open" is open bínnen de groep. Wie er niet in zit, ziet niets — anders
        // was het geen zichtbaarheidskeuze maar een publicatie.
        expect(await zichtbareWeekdoelen(f.carol, f.doelOpen)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'beslist per groep en niet per doel',
      async () => {
        // ⚠️ **De test die een plausibele implementatie afkeurt.** Het doel hangt
        //    aan één open en één beschermde groep. Bob zit in de open helft en
        //    ziet alles; carol zit in de beschermde helft en ziet de gemiste week
        //    níét. Zou de policy "hangt dit doel aan een open groep?" vragen, dan
        //    kregen ze allebei alles — en dan lekt de beschermde groep.
        expect(await zichtbareWeekdoelen(f.bob, f.doelGemengd)).toEqual([
          'GEMENGD-GEPLAND',
          'GEMENGD-GEMIST',
        ]);
        expect(await zichtbareWeekdoelen(f.carol, f.doelGemengd)).toEqual(['GEMENGD-GEPLAND']);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de punten dicht, ook in een open groep',
      async () => {
        // ⚠️ Besluit A42, apart genomen op dezelfde dag: punten blijven privé,
        //    óók in een open groep. Wie het totaal deelt, deelt het missen via een
        //    omweg. Deze test staat hier zodat "open" niet gaandeweg "alles open"
        //    wordt.
        const { data, error } = await f.bob.db
          .from('points_ledger')
          .select('id')
          .eq('user_id', f.alice.id);

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('omzetten — grens 3 van het besluit', () => {
    async function zet(
      gebruiker: TestUser,
      groep: Groep,
      naar: string,
      bevestigd?: boolean,
    ): Promise<{ ok?: boolean; reason?: string; van?: string; naar?: string }> {
      const argumenten =
        bevestigd === undefined
          ? { p_group_id: groep.id, p_naar: naar }
          : { p_group_id: groep.id, p_naar: naar, p_bevestigd: bevestigd };

      const { data, error } = await gebruiker.db.rpc(
        'zet_groepszichtbaarheid',
        argumenten as { p_group_id: string; p_naar: string; p_bevestigd?: boolean },
      );
      if (error) throw new Error(`omzetten (HTTP): ${error.message}`);
      return uitkomst(data);
    }

    it(
      'weigert zonder bevestiging, en verandert dan niets',
      async () => {
        // ⚠️ De default is `false`, dus een aanroep die het argument vergeet doet
        //    niets. Dat is wat "nooit stilzwijgend" hier betekent.
        expect((await zet(f.alice, f.groepSchakel, 'open')).reason).toBe('not_confirmed');
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een gewoon lid',
      async () => {
        expect((await zet(f.bob, f.groepSchakel, 'open', true)).reason).toBe('not_admin');
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een waarde die niet bestaat',
      async () => {
        expect((await zet(f.alice, f.groepSchakel, 'halfopen', true)).reason).toBe(
          'unknown_visibility',
        );
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );

    it(
      'zet om, legt het vast en kondigt het aan',
      async () => {
        const antwoord = await zet(f.alice, f.groepSchakel, 'open', true);

        expect(antwoord.ok).toBe(true);
        expect(antwoord.van).toBe('beschermd');
        expect(antwoord.naar).toBe('open');
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('open');

        const spoor = await adminDb()
          .from('group_events')
          .select('actor_id, event_type, old_value, new_value')
          .eq('group_id', f.groepSchakel.id);

        expect(spoor.error).toBeNull();
        expect(spoor.data ?? []).toHaveLength(1);
        expect((spoor.data ?? [])[0]).toMatchObject({
          actor_id: f.alice.id,
          event_type: 'visibility_changed',
          old_value: { zichtbaarheid: 'beschermd' },
          new_value: { zichtbaarheid: 'open' },
        });

        const bericht = await adminDb()
          .from('chat_messages')
          .select('system_event, subject_id, type, sender_id, body')
          .eq('group_id', f.groepSchakel.id)
          .eq('system_event', 'group_opened');

        expect(bericht.error).toBeNull();
        expect(bericht.data ?? []).toHaveLength(1);
        expect((bericht.data ?? [])[0]).toMatchObject({
          system_event: 'group_opened',
          subject_id: f.alice.id,
          type: 'system',
          sender_id: null,
        });

        // ⚠️ Beslisdocument 002 §3: een systeembericht noemt de persoon en de
        //    gebeurtenis, nooit een titel. De doeltitels van deze fixture mogen
        //    er dus niet in staan.
        expect((bericht.data ?? [])[0]?.body ?? '').not.toMatch(/SCHAKEL|GEMENGD|BESCHERMD/);
      },
      TEST_TIMEOUT,
    );

    it(
      'werkt onmiddellijk door in de policy',
      async () => {
        // De hele reden dat de kolom bestaat. Bob zag de gemiste week van dit
        // doel niet, en ziet hem nu wel — zonder dat er één rij herschreven is.
        expect(await zichtbareWeekdoelen(f.bob, f.doelSchakel)).toEqual([
          'SCHAKEL-GEPLAND',
          'SCHAKEL-GEMIST',
        ]);
      },
      TEST_TIMEOUT,
    );

    it(
      'plaatst geen tweede bericht als er niets verandert',
      async () => {
        expect((await zet(f.alice, f.groepSchakel, 'open', true)).reason).toBe('unchanged');

        const bericht = await adminDb()
          .from('chat_messages')
          .select('id')
          .eq('group_id', f.groepSchakel.id)
          .eq('system_event', 'group_opened');

        expect(bericht.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de veilige richting nooit wachten',
      async () => {
        // ⚠️ Terug naar beschermd kan meteen. Een wachttijd op déze richting zou
        //    de gemiste weken van de leden een dag lang zichtbaar houden als
        //    straf voor de vergissing van hun beheerder.
        const antwoord = await zet(f.alice, f.groepSchakel, 'beschermd', true);

        expect(antwoord.ok).toBe(true);
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('beschermd');
        expect(await zichtbareWeekdoelen(f.bob, f.doelSchakel)).toEqual(['SCHAKEL-GEPLAND']);
      },
      TEST_TIMEOUT,
    );

    it(
      'remt heen-en-weer schakelen naar open af',
      async () => {
        expect((await zet(f.alice, f.groepSchakel, 'open', true)).reason).toBe('too_soon');
        expect(await zichtbaarheidVan(f.groepSchakel)).toBe('beschermd');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('het auditspoor', () => {
    it(
      'is leesbaar voor een lid van de groep',
      async () => {
        // Wie zichtbaar gemaakt wordt, hoort te kunnen nazien wanneer dat gebeurd
        // is en door wie.
        const { data, error } = await f.bob.db
          .from('group_events')
          .select('event_type')
          .eq('group_id', f.groepSchakel.id);

        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'is onzichtbaar voor een buitenstaander',
      async () => {
        const { data, error } = await f.carol.db
          .from('group_events')
          .select('event_type')
          .eq('group_id', f.groepSchakel.id);

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'is door geen enkele client te schrijven',
      async () => {
        // Er is geen INSERT-policy, dus RLS weigert categorisch — zelfde vorm als
        // `commitment_events`. Een auditspoor dat de aanroeper zelf kan vullen,
        // bewijst niets.
        const poging = await f.alice.db.from('group_events').insert({
          group_id: f.groepSchakel.id,
          actor_id: f.alice.id,
          event_type: 'visibility_changed',
          old_value: { zichtbaarheid: 'open' },
          new_value: { zichtbaarheid: 'beschermd' },
        });

        expect(poging.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de reeks — oppervlak 1 en 2, in beide standen', () => {
    it(
      'geeft in een beschermde groep wel de lopende reeks en niet de beste',
      async () => {
        // ⚠️ De belofte van migratie 0019, en hij moet ongewijzigd overeind
        //    blijven: `best > current` is sluitend bewijs van een verbroken
        //    reeks. `null` en niet `0` — nul zou een bewering zijn die de
        //    database niet doet.
        const rij = await overzichtsrij(f.bob, f.groepBeschermd, f.alice);

        expect(rij?.current_streak).toBe(2);
        expect(rij?.best_streak).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft in een open groep ook de beste reeks',
      async () => {
        const rij = await overzichtsrij(f.bob, f.groepOpen, f.alice);

        expect(rij?.current_streak).toBe(2);
        expect(rij?.best_streak).toBe(7);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar zijn eigen beste reeks in beide standen zien',
      async () => {
        // ⚠️ Zonder de eigenaarstak in de `case` zou iemand die zijn doel aan een
        //    beschermde groep koppelt, zijn éígen beste reeks kwijtraken zodra
        //    een scherm hem via deze view leest. Dezelfde klasse fout als in
        //    0050, waar een kolomgrant de eigenaar zijn eigen risicostand zou
        //    hebben afgenomen.
        expect((await overzichtsrij(f.alice, f.groepBeschermd, f.alice))?.best_streak).toBe(7);
        expect((await overzichtsrij(f.alice, f.groepOpen, f.alice))?.best_streak).toBe(7);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander geen rij, ook niet bij een open groep',
      async () => {
        expect(await overzichtsrij(f.carol, f.groepOpen, f.alice)).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de view zelf net zo dicht als het overzicht',
      async () => {
        // ⚠️ **De naad.** De tests hierboven lezen `group_overview()`, en die is
        //    SECURITY INVOKER — de bescherming zit een laag dieper, in
        //    `group_visible_streaks`. Wie de view rechtstreeks bevraagt, slaat de
        //    functie over; dat is één GET en precies de route die EPIC 5
        //    ontglipte. Deze test loopt hem.
        const beschermd = await f.bob.db
          .from('group_visible_streaks')
          .select('best_streak, last_cycle_start')
          .eq('user_id', f.alice.id)
          .eq('goal_id', f.doelBeschermd);

        expect(beschermd.error).toBeNull();
        expect(beschermd.data ?? []).toHaveLength(1);
        expect((beschermd.data ?? [])[0]?.best_streak).toBeNull();
        expect((beschermd.data ?? [])[0]?.last_cycle_start).toBeNull();

        const open = await f.bob.db
          .from('group_visible_streaks')
          .select('best_streak, last_cycle_start')
          .eq('user_id', f.alice.id)
          .eq('goal_id', f.doelOpen);

        expect(open.error).toBeNull();
        expect((open.data ?? [])[0]?.best_streak).toBe(7);
        expect((open.data ?? [])[0]?.last_cycle_start).toBe(f.cycleStart);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft het puntentotaal in geen enkele stand door',
      async () => {
        // ⚠️ Besluit A42. `total_points` staat op `user_streaks` en heeft nooit
        //    in deze view gestaan. Deze test is er zodat dat zo blijft als iemand
        //    de view ooit uitbreidt: hij vraagt de kolom op en verwacht een fout.
        const poging = await f.bob.db
          .from('group_visible_streaks')
          // ⚠️ Bewust een kolomnaam als kale string en geen typefout: het
          //    gegenereerde type controleert een `select`-string hier niet, dus
          //    dit moet op gedrag getoetst worden en niet op types. PostgREST
          //    antwoordt met 42703 zolang de kolom niet in de view zit.
          .select('total_points')
          .eq('user_id', f.alice.id);

        expect(poging.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('De Ketting — oppervlak 13, in beide standen', () => {
    async function historischeSchakels(kijker: TestUser, groep: Groep): Promise<number> {
      const { data, error } = await kijker.db
        .from('chain_links')
        .select('user_id')
        .eq('group_id', groep.id)
        .eq('group_period_start', f.oudePeriode);

      if (error) throw new Error(`schakels lezen: ${error.message}`);
      return (data ?? []).length;
    }

    async function afgeslotenInOudePeriode(kijker: TestUser, groep: Groep): Promise<boolean> {
      const { data, error } = await kijker.db.rpc('group_overview', {
        p_group_id: groep.id,
        p_period_start: f.oudePeriode,
      });

      if (error) throw new Error(`overzicht lezen: ${error.message}`);
      return (data ?? []).find((r) => r.user_id === f.alice.id)?.closed_this_period ?? false;
    }

    it(
      'houdt de historische aanwezigheid van een ander dicht in een beschermde groep',
      async () => {
        // ⚠️ De belofte van migratie 0037, en de reden dat hij dezelfde dag als
        //    0036 kwam: zonder venster is één GET de volledige
        //    aanwezigheidsmatrix per persoon per week.
        expect(await historischeSchakels(f.bob, f.groepBeschermd)).toBe(0);
        expect(await afgeslotenInOudePeriode(f.bob, f.groepBeschermd)).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat hem zien in een open groep',
      async () => {
        expect(await historischeSchakels(f.bob, f.groepOpen)).toBe(1);
        expect(await afgeslotenInOudePeriode(f.bob, f.groepOpen)).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de tabel en het overzicht bij elkaar',
      async () => {
        // ⚠️ **De naad van dit oppervlak.** `chain_links_select` en de
        //    `closed_this_period`-berekening in `group_overview()` dragen
        //    hetzelfde venster op twee plekken. Zou er één van de twee zijn
        //    omgezet, dan zag een lid van een open groep de schakels wél in de
        //    tabel maar niet in het overzicht dat het scherm leest — twee
        //    correcte onderdelen die samen iets anders beloven.
        //
        //    Deze test toetst niet elk van beide maar hun gelijkheid, in beide
        //    standen. Dat is de belofte; de twee tests hierboven zijn de waarden.
        for (const groep of [f.groepBeschermd, f.groepOpen]) {
          const uitDeTabel = (await historischeSchakels(f.bob, groep)) > 0;
          const uitHetOverzicht = await afgeslotenInOudePeriode(f.bob, groep);

          expect(uitHetOverzicht, groep.id).toBe(uitDeTabel);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar zijn eigen geschiedenis in beide standen zien',
      async () => {
        // `user_id = auth.uid()` is de eerste tak van de policy en die verandert
        // hier niet: je eigen ketting is van jou, ongeacht de zichtbaarheid.
        expect(await historischeSchakels(f.alice, f.groepBeschermd)).toBe(1);
        expect(await historischeSchakels(f.alice, f.groepOpen)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander niets, ook niet bij een open groep',
      async () => {
        expect(await historischeSchakels(f.carol, f.groepOpen)).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de teller in beide standen een getal zonder namen',
      async () => {
        // ⚠️ `ketting_stand()` is bewust niet aangeraakt: aantallen zonder namen,
        //    voor elk lid hetzelfde getal (0036/0037). Er valt niets te openen wat
        //    niet al open is. Deze test staat er zodat dat zo blijft.
        const { data, error } = await f.bob.db.rpc('ketting_stand', {
          p_group_id: f.groepOpen.id,
          p_period_start: f.oudePeriode,
        });

        expect(error).toBeNull();
        expect(JSON.stringify(data ?? {})).not.toContain(f.alice.id);
      },
      TEST_TIMEOUT,
    );
  });

  it(
    'twee helpers, twee antwoorden — en dat staat op één scherm',
    async () => {
      // ⚠️ **De asymmetrie die de code-review van 24-08 vond, hier vastgelegd in
      //    plaats van opnieuw ontdekt.** De vier oppervlakken beantwoorden
      //    "staat deze groep open?" met twee verschillende vragen:
      //
      //      * oppervlak 2 en 3 vragen `deelt_open_groep_met_doel()` — per **doel**;
      //      * oppervlak 13 vraagt `lid_van_open_groep()` — per **groep**.
      //
      //    Bob zit in béíde helften van de gemengde koppeling. Vraagt hij het
      //    overzicht van de bescherméde helft op, dan krijgt hij de beste reeks
      //    van alice wél (hij deelt via de open helft een open groep mét dat
      //    doel) maar de historische schakel níét (déze groep is beschermd).
      //
      //    Dat is geen lek — bob mag die reeks al via de open groep, en de
      //    schakel hoort bij de beschermde. Het is wel twee antwoorden op één
      //    scherm, en dat hoort iemand te wéten in plaats van tegen te komen.
      //    De onderbouwing van twee losse helpers staat in 0079 §1.
      expect((await overzichtsrij(f.bob, f.groepGemengdDicht, f.alice))?.best_streak).toBe(7);

      const schakels = await f.bob.db
        .from('chain_links')
        .select('user_id')
        .eq('group_id', f.groepGemengdDicht.id)
        .eq('group_period_start', f.oudePeriode);

      expect(schakels.error).toBeNull();
      expect(schakels.data ?? []).toEqual([]);

      // En carol, die alleen de beschermde helft deelt, ziet geen van beide.
      expect((await overzichtsrij(f.carol, f.groepGemengdDicht, f.alice))?.best_streak).toBeNull();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  describe('meedoen is de tweede route, en die had geen bericht', () => {
    /**
     * ⚠️ **De naad die 0076 niet dekte.** Grens 3 van het besluit gaat over het
     *    ómzetten van een groep: bevestigen, vastleggen, aankondigen. Wie een
     *    uitnodigingslink volgt naar een groep die al op `open` staat, maakt
     *    exact dezelfde overgang mee — zijn gemiste weken worden zichtbaar voor
     *    anderen — maar er is geen bericht, want er verándert niets aan de groep.
     *
     *    Het systeembericht kan dat niet opvangen: dat gaat over het verleden, en
     *    wie nieuw is heeft het niet gelezen. De enige plek waar dit kan staan is
     *    het scherm waarop iemand besluit mee te doen, en dus in `invite_preview()`.
     */
    it(
      'noemt de zichtbaarheid van de groep, in beide standen',
      async () => {
        const beschermd = await f.carol.db.rpc('invite_preview', {
          code: f.groepBeschermd.code,
        });
        const open = await f.carol.db.rpc('invite_preview', { code: f.groepOpen.code });

        expect(beschermd.error).toBeNull();
        expect(open.error).toBeNull();
        expect((beschermd.data as { zichtbaarheid?: string } | null)?.zichtbaarheid).toBe(
          'beschermd',
        );
        expect((open.data as { zichtbaarheid?: string } | null)?.zichtbaarheid).toBe('open');
      },
      TEST_TIMEOUT,
    );

    it(
      'noemt hem ook zonder account',
      async () => {
        // ⚠️ Buiten de `detailed`-beperking van 0019, en dat is een besluit: het
        //    is geen persoonsgegeven, en het is precies het feit dat iemand nodig
        //    heeft om te besluiten of hij een account áánmaakt. Achterhouden tot
        //    na het inloggen zou de belangrijkste eigenschap van de groep pas
        //    noemen als je al binnen bent.
        const { data, error } = await anonDb().rpc('invite_preview', {
          code: f.groepOpen.code,
        });

        expect(error).toBeNull();

        const gelezen = data as { zichtbaarheid?: string; detailed?: boolean } | null;
        expect(gelezen?.detailed).toBe(false);
        expect(gelezen?.zichtbaarheid).toBe('open');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('wat "open" niet is', () => {
    it(
      'houdt de weekpassen van een ander dicht, ook in een open groep',
      async () => {
        // ⚠️ Oppervlak 19 staat bewust dicht in béíde standen (beslisdocument 002
        //    §6b): een verbruikte pas is een gemiste week plus de handeling om
        //    hem te redden, en dat is een privévoorraad. `weekpas_stand()` draagt
        //    zijn eigenaarstoets zélf en leunt niet op RLS — een groepsgenoot mág
        //    de rijen van een gekoppeld doel lezen, dus een INVOKER-functie zou de
        //    voorraad van een ander teruggeven. Die toets was in 0039 stuk en is
        //    in 0040 gedicht; deze test staat er zodat A41 hem niet alsnog opent.
        const rijen = await f.bob.db
          .from('week_pass_events')
          .select('id')
          .eq('user_id', f.alice.id);

        expect(rijen.error).toBeNull();
        expect(rijen.data ?? []).toEqual([]);

        const stand = await f.bob.db.rpc('weekpas_stand', { p_goal_id: f.doelOpen });

        expect(stand.error).toBeNull();
        expect(JSON.stringify(stand.data ?? {})).not.toContain(f.alice.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'zet geen enkele uitgezonden tabel op REPLICA IDENTITY FULL',
      async () => {
        // ⚠️ **Dit verbod geldt onverkort voor een open groep, en de reden is een
        //    ándere dan bij een beschermde.** Supabase past RLS toe op INSERT en
        //    UPDATE maar niet op DELETE: met `full` gaat bij een verwijdering de
        //    volledige oude rij over de lijn naar iedereen die zich abonneert,
        //    lid of niet. "Open" is een keuze over wat de gróép ziet; dit lek gaat
        //    naar buiten de groep, en dat heeft niemand gekozen.
        const { data, error } = await adminDb().rpc('realtime_bewaking');

        expect(error).toBeNull();
        for (const rij of data ?? []) {
          expect(rij.replica_identity, rij.tabel).not.toBe('full');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
