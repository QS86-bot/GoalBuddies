import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * **Je week-startdag verzetten kost je geen weekdoel** — QS8-138, migratie 0139.
 *
 * ⚠️ **De belofte is niet "de RPC verplaatst een rij".** Die is triviaal. De
 *    belofte is: *het wijzigen van een instelling kost geen punt en breekt geen
 *    reeks*. Vóór 0139 deed het dat wel, en langs een weg die niemand zag:
 *    `fetchWeekdoelen()` matcht exact op `cycle_start_date`, dus een weekdoel
 *    met de oude datum viel uit élke lijst — ook uit "nog open van eerdere
 *    weken", want die haalt bewust alleen `missed` op (0045). Een week later
 *    stempelde de rollover het als gemist.
 *
 *    Dat is domeinregel 8 op zijn kop: de reeks dient de gebruiker, nooit
 *    andersom.
 *
 * ## Wat hier bewaakt wordt, en waarom elk stuk erbij hoort
 *
 * 1. **De verhuizing zelf** — de `todo` gaat mee.
 * 2. **De drie statussen die niét meegaan.** Dat is geen detail: `approved`
 *    verhuizen zou geschiedenis herschrijven waar `points_ledger` naar wijst
 *    (domeinregel 6), en `cancelled` verhuizen zou een minpunt uitstellen dat de
 *    gebruiker zélf gekozen heeft (A40).
 * 3. **De grendel tegen een weggepoetste week.** De RPC neemt een
 *    cliënt-berekende datum aan, en dat is per definitie een route: verplaats
 *    een `todo` die op het punt staat gemist te worden naar de huidige cyclus,
 *    en het minpunt komt nooit. Dezelfde klasse als de vier routes van
 *    0043 t/m 0046.
 * 4. **Dat de kolom écht dicht zit.** Zonder dit is de hele reparatie een keten
 *    die stukgaat bij de volgende schrijver — regel 18, vraag 5.
 *
 * ⚠️ **Punt 4 is hier geen formaliteit maar een gerepareerde fout.** De eerste
 *    vorm van de intrekking, `revoke update (week_start_day) on profiles`, liep
 *    zonder fout en veranderde níéts: de grant stond tabelbreed
 *    (`authenticated=awx`), en een kolom-revoke haalt daar niets van af.
 *    `information_schema.column_privileges` bleef alle veertien kolommen noemen.
 *    Dezelfde klasse als `revoke ... from public, anon` — een intrekking die
 *    eruitziet alsof hij werkt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** De dag waarop de gebruiker begint, en de dag waar hij naartoe gaat. */
const OUDE_DAG = 1; // maandag
const NIEUWE_DAG = 4; // donderdag
const ZONE = 'Europe/Amsterdam';

interface Fixture {
  alice: TestUser;
  doelId: string;
  oudeStart: IsoDate;
  nieuweStart: IsoDate;
  /** Per status het id van het weekdoel in de lopende cyclus. */
  ids: Record<'todo' | 'approved' | 'pending' | 'cancelled', string>;
  /** Een `todo` uit een cyclus die allang voorbij is — het misbruikgeval. */
  oudId: string;
  oudeCyclus: IsoDate;
}

describe.skipIf(!rlsTestsConfigured)('de week-startdag verzetten', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('weekstart-alice');

    const nu = now();
    const oudeStart = userCycle({ weekStartDay: OUDE_DAG, tz: ZONE }, nu).startDate;
    const nieuweStart = userCycle({ weekStartDay: NIEUWE_DAG, tz: ZONE }, nu).startDate;

    // ⚠️ De twee cycli moeten écht verschillen, anders toetst dit bestand niets.
    //    Met een maandag- en een donderdagklok is dat altijd zo, maar dat is een
    //    aanname over `shared/time` en die hoort hier hard te staan.
    expect(oudeStart, 'de twee week-startdagen leveren dezelfde cyclus op').not.toBe(nieuweStart);

    const gezet = await admin
      .from('profiles')
      .update({ week_start_day: OUDE_DAG, tz: ZONE })
      .eq('id', alice.id);
    if (gezet.error) throw new Error(`profiel zetten: ${gezet.error.message}`);

    const doel = await admin
      .from('goals')
      .insert({
        owner_id: alice.id,
        title: 'WEEKSTART doel',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const ids = {} as Fixture['ids'];
    let index = 400;

    for (const status of ['todo', 'approved', 'pending', 'cancelled'] as const) {
      const rij = await admin
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `WEEKSTART ${status}`,
          cycle_start_date: oudeStart,
          cycle_index: (index += 1),
          status,
        })
        .select('id')
        .single();
      if (rij.error || rij.data === null) throw new Error(`weekdoel ${status}: ${rij.error?.message}`);
      ids[status] = rij.data.id;
    }

    // ⚠️ **Het misbruikgeval.** Een `todo` uit een cyclus die veertien dagen
    //    terug ligt; die staat op het punt door de rollover als gemist te worden
    //    gestempeld. Precies de rij die je zou willen redden als de RPC dat
    //    toeliet.
    const oudeCyclus = addDays(oudeStart, -14);
    const oud = await admin
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'WEEKSTART oud todo',
        cycle_start_date: oudeCyclus,
        cycle_index: 399,
        status: 'todo',
      })
      .select('id')
      .single();
    if (oud.error || oud.data === null) throw new Error(`oud weekdoel: ${oud.error?.message}`);

    f = {
      alice,
      doelId: doel.data.id,
      oudeStart,
      nieuweStart,
      ids,
      oudId: oud.data.id,
      oudeCyclus,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (f !== undefined) {
      const admin = adminDb();
      await admin.from('weekly_goals').delete().eq('goal_id', f.doelId);
      await admin.from('goals').delete().eq('id', f.doelId);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ Elke test begint bij dezelfde toestand. Zonder dit leunt de tweede test
   *    op wat de eerste deed, en dan blijft hij groen onder een mutatie die zijn
   *    eigen naam noemt — de val die in `nevenschade.test.ts` echt is opgetreden.
   */
  beforeEach(async () => {
    const admin = adminDb();

    for (const [status, id] of Object.entries(f.ids)) {
      const { error } = await admin
        .from('weekly_goals')
        .update({ cycle_start_date: f.oudeStart, status })
        .eq('id', id);
      if (error) throw new Error(`terugzetten ${status}: ${error.message}`);
    }

    const oud = await admin
      .from('weekly_goals')
      .update({ cycle_start_date: f.oudeCyclus, status: 'todo' })
      .eq('id', f.oudId);
    if (oud.error) throw new Error(`oud terugzetten: ${oud.error.message}`);

    const profiel = await admin
      .from('profiles')
      .update({ week_start_day: OUDE_DAG })
      .eq('id', f.alice.id);
    if (profiel.error) throw new Error(`dag terugzetten: ${profiel.error.message}`);
  });

  async function verzet(
    dag: number,
    oude: IsoDate,
    nieuw: IsoDate,
  ): Promise<{ ok?: boolean; reason?: string; verzet?: number }> {
    const uit = await f.alice.db.rpc('zet_week_startdag', {
      p_dag: dag,
      p_oude_start: oude,
      p_nieuwe_start: nieuw,
    });
    if (uit.error) throw new Error(`zet_week_startdag: ${uit.error.message}`);
    return uit.data as unknown as { ok?: boolean; reason?: string; verzet?: number };
  }

  async function cyclusVan(id: string): Promise<string | null> {
    const { data } = await adminDb()
      .from('weekly_goals')
      .select('cycle_start_date')
      .eq('id', id)
      .single();
    return data?.cycle_start_date ?? null;
  }

  /** ⚠️ **De assertie waar dit bestand om bestaat.** */
  it(
    'neemt een todo van de lopende week mee naar de nieuwe cyclus',
    async () => {
      const uit = await verzet(NIEUWE_DAG, f.oudeStart, f.nieuweStart);

      expect(uit.ok, `geweigerd met ${uit.reason}`).toBe(true);
      expect(uit.verzet, 'er hoort precies één todo mee te gaan').toBe(1);
      expect(await cyclusVan(f.ids.todo)).toBe(f.nieuweStart);

      const { data } = await adminDb()
        .from('profiles')
        .select('week_start_day')
        .eq('id', f.alice.id)
        .single();
      expect(data?.week_start_day, 'de dag zelf is niet gezet').toBe(NIEUWE_DAG);
    },
    TEST_TIMEOUT,
  );

  /**
   * De drie die blijven staan, elk om een eigen reden. Zie de kop van 0139.
   *
   * ⚠️ `cancelled` is de minst vanzelfsprekende en juist daarom belangrijk: hij
   *    wórdt als gemist gestempeld, maar dat minpunt is bedoeld (A40).
   */
  it.each([
    ['approved', 'domeinregel 6: points_ledger wijst hiernaar'],
    ['pending', 'de completions-rij draagt een eigen cyclus'],
    ['cancelled', 'het minpunt is hier bedoeld (A40)'],
  ] as const)('laat een %s weekdoel staan — %s', async (status, _reden) => {
    await verzet(NIEUWE_DAG, f.oudeStart, f.nieuweStart);

    expect(await cyclusVan(f.ids[status]), `${status} is meeverhuisd`).toBe(f.oudeStart);
  });

  /**
   * ⚠️ **De grendel, en het duurste geval van dit bestand.** De RPC neemt een
   *    datum aan die de client heeft uitgerekend. Zonder de eis dat beide cycli
   *    vandaag bevatten, is dit een route naar een weggepoetste week: schuif een
   *    `todo` die op het punt staat gemist te worden naar de lopende cyclus, en
   *    het minpunt komt nooit.
   */
  it(
    'weigert een todo uit een voorbije cyclus te redden',
    async () => {
      const uit = await verzet(NIEUWE_DAG, f.oudeCyclus, f.nieuweStart);

      expect(uit.ok, 'een voorbije cyclus is geaccepteerd').toBe(false);
      expect(uit.reason).toBe('cyclus_bevat_vandaag_niet');
      expect(await cyclusVan(f.oudId), 'de oude todo is alsnog verplaatst').toBe(f.oudeCyclus);
    },
    TEST_TIMEOUT,
  );

  /** De andere helft van dezelfde grendel: ook de bestemming moet vandaag bevatten. */
  it(
    'weigert een bestemming die vandaag niet bevat',
    async () => {
      const uit = await verzet(NIEUWE_DAG, f.oudeStart, addDays(f.nieuweStart, 21));

      expect(uit.ok).toBe(false);
      expect(uit.reason).toBe('cyclus_bevat_vandaag_niet');
      expect(await cyclusVan(f.ids.todo)).toBe(f.oudeStart);
    },
    TEST_TIMEOUT,
  );

  it.each([[-1], [7], [99]])('weigert dag %i', async (dag) => {
    const uit = await verzet(dag, f.oudeStart, f.nieuweStart);
    expect(uit.ok).toBe(false);
    expect(uit.reason).toBe('ongeldige_dag');
  });

  /**
   * ⚠️ **Zonder deze test is de hele reparatie vrijblijvend.** De RPC zet de dag
   *    én verhuist de weekdoelen; bleef de kolom rechtstreeks schrijfbaar, dan
   *    kan iedere andere plek in de app de dag zetten zonder de weekdoelen, en
   *    dan is de bug terug waar niemand hem zoekt.
   *
   *    Dit is ook de test die de **stille no-op** vangt: de eerste vorm van de
   *    intrekking veranderde niets omdat de grant tabelbreed stond.
   */
  it(
    'laat de client week_start_day niet rechtstreeks schrijven',
    async () => {
      await magNietLanden(
        () => f.alice.db.from('profiles').update({ week_start_day: 3 }).eq('id', f.alice.id),
        () => adminDb().from('profiles').select('week_start_day').eq('id', f.alice.id),
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * De tegenhelft: de kolommen die de app wél schrijft, moeten open blijven.
   * Een intrekking die te ver gaat, breekt elke profielinstelling — en dat is
   * precies wat er in 0089 gebeurde toen `select('*')` op de kolomgrant viel.
   */
  it(
    'laat de client zijn eigen naam en tijdzone nog wel schrijven',
    async () => {
      const uit = await f.alice.db
        .from('profiles')
        .update({ display_name: 'WEEKSTART hernoemd', tz: 'Europe/Berlin' })
        .eq('id', f.alice.id)
        .select('id')
        .single();

      expect(uit.error, 'een toegestane kolom werd geweigerd').toBeNull();
    },
    TEST_TIMEOUT,
  );

  /** Een verzet zonder verschil hoort te lukken: dat is de onboarding. */
  it(
    'staat een verzet naar dezelfde cyclus toe zonder iets te verplaatsen',
    async () => {
      const uit = await verzet(OUDE_DAG, f.oudeStart, f.oudeStart);

      expect(uit.ok).toBe(true);
      expect(uit.verzet).toBe(0);
      expect(await cyclusVan(f.ids.todo)).toBe(f.oudeStart);
    },
    TEST_TIMEOUT,
  );
});
