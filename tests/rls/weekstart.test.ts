import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate, type Weekday } from '../../src/shared/time';
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
const OUDE_DAG: Weekday = 1; // maandag
const NIEUWE_DAG: Weekday = 4; // donderdag
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
  /**
   * Een wildvreemde met een `todo` in dezelfde cyclus — het geval van QS8-282.
   *
   * ⚠️ Bram deelt met Alice **niets**: geen groep, geen doel, geen uitnodiging.
   *    Het enige dat ze gemeen hebben is de startdatum van hun week, en dat is
   *    met maandag als standaard de gewone toestand voor bijna elke gebruiker.
   */
  bramId: string;
  bramDoelId: string;
  bramWeekId: string;
  /**
   * Een **buddy** met een `todo` in dezelfde cyclus — de sterke acteur.
   *
   * ⚠️ Carla zit met Alice in één groep en háár doel is aan die groep
   *    gekoppeld, dus `shares_group_with_goal()` geeft voor Alice `true` op het
   *    doel van Carla. Dat is de acteur die telt: het dossier van 03-09 noemt
   *    "de buddy en niet de vreemde" met zoveel woorden **de standaardfout**,
   *    en bij `milestones_write` en `completions_insert` is precies die
   *    verruiming een keer aangebracht met de suite groen.
   */
  carlaId: string;
  carlaDoelId: string;
  carlaWeekId: string;
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

    for (const status of ['todo', 'approved', 'pending', 'cancelled'] as const) {
      const rij = await admin
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `WEEKSTART ${status}`,
          cycle_start_date: oudeStart,
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
        status: 'todo',
      })
      .select('id')
      .single();
    if (oud.error || oud.data === null) throw new Error(`oud weekdoel: ${oud.error?.message}`);

    // ⚠️ **De wildvreemde.** Zijn weekdoel staat op dezelfde `cycle_start_date`
    //    als dat van Alice, en verder is er geen enkele relatie. `zet_week_startdag`
    //    is SECURITY DEFINER, dus er komt geen policy aan te pas: de enige regel
    //    die hem beschermt is de eigenaarsconjunct in de `update`.
    const bram = await createTestUser('weekstart-bram');
    const bramProfiel = await admin
      .from('profiles')
      .update({ week_start_day: OUDE_DAG, tz: ZONE })
      .eq('id', bram.id);
    if (bramProfiel.error) throw new Error(`profiel bram: ${bramProfiel.error.message}`);

    const bramDoel = await admin
      .from('goals')
      .insert({
        owner_id: bram.id,
        title: 'WEEKSTART doel van Bram',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (bramDoel.error || bramDoel.data === null) {
      throw new Error(`doel bram: ${bramDoel.error?.message}`);
    }

    const bramWeek = await admin
      .from('weekly_goals')
      .insert({
        goal_id: bramDoel.data.id,
        title: 'WEEKSTART todo van Bram',
        cycle_start_date: oudeStart,
        status: 'todo',
      })
      .select('id')
      .single();
    if (bramWeek.error || bramWeek.data === null) {
      throw new Error(`weekdoel bram: ${bramWeek.error?.message}`);
    }

    // ⚠️ **De buddy.** Eén groep met Alice, en háár doel eraan gekoppeld — dan
    //    is `shares_group_with_goal(carlaDoel)` voor Alice waar, en bijt een
    //    verruiming van de eigenaarsconjunct met die tak.
    const carla = await createTestUser('weekstart-carla');
    const carlaProfiel = await admin
      .from('profiles')
      .update({ week_start_day: OUDE_DAG, tz: ZONE })
      .eq('id', carla.id);
    if (carlaProfiel.error) throw new Error(`profiel carla: ${carlaProfiel.error.message}`);

    const groep = await alice.db.rpc('create_group', { group_name: 'WEEKSTART groep' });
    if (groep.error) throw new Error(`groep: ${groep.error.message}`);
    const gd = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await carla.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (mee.error) throw new Error(`carla erbij: ${mee.error.message}`);

    const carlaDoel = await admin
      .from('goals')
      .insert({
        owner_id: carla.id,
        title: 'WEEKSTART doel van Carla',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (carlaDoel.error || carlaDoel.data === null) {
      throw new Error(`doel carla: ${carlaDoel.error?.message}`);
    }

    const koppeling = await admin
      .from('goal_group_links')
      .insert({ goal_id: carlaDoel.data.id, group_id: gd.group.id });
    if (koppeling.error) throw new Error(`koppeling carla: ${koppeling.error.message}`);

    const carlaWeek = await admin
      .from('weekly_goals')
      .insert({
        goal_id: carlaDoel.data.id,
        title: 'WEEKSTART todo van Carla',
        cycle_start_date: oudeStart,
        status: 'todo',
      })
      .select('id')
      .single();
    if (carlaWeek.error || carlaWeek.data === null) {
      throw new Error(`weekdoel carla: ${carlaWeek.error?.message}`);
    }

    f = {
      alice,
      doelId: doel.data.id,
      oudeStart,
      nieuweStart,
      ids,
      oudId: oud.data.id,
      oudeCyclus,
      bramId: bram.id,
      bramDoelId: bramDoel.data.id,
      bramWeekId: bramWeek.data.id,
      carlaId: carla.id,
      carlaDoelId: carlaDoel.data.id,
      carlaWeekId: carlaWeek.data.id,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (f !== undefined) {
      const admin = adminDb();
      await admin.from('weekly_goals').delete().eq('goal_id', f.doelId);
      await admin.from('goals').delete().eq('id', f.doelId);
      await admin.from('weekly_goals').delete().eq('goal_id', f.bramDoelId);
      await admin.from('goals').delete().eq('id', f.bramDoelId);
      await admin.from('weekly_goals').delete().eq('goal_id', f.carlaDoelId);
      await admin.from('goals').delete().eq('id', f.carlaDoelId);
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

    // ⚠️ Bram en Carla horen er ook bij: onder een gemuteerde grendel verhuizen
    //    húń rijen mee, en dan zou de volgende test op een al verschoven
    //    opstelling meten.
    const anderenTerug = await admin
      .from('weekly_goals')
      .update({ cycle_start_date: f.oudeStart, status: 'todo' })
      .in('id', [f.bramWeekId, f.carlaWeekId]);
    if (anderenTerug.error) throw new Error(`anderen terugzetten: ${anderenTerug.error.message}`);

    // ⚠️ **En hun profiel, niet alleen hun weekdoel.** De `update profiles` in de
    //    RPC is een tweede grendel met dezelfde vorm; zonder deze regel herstelt
    //    die zichzelf niet tussen twee tests.
    const dagenTerug = await admin
      .from('profiles')
      .update({ week_start_day: OUDE_DAG })
      .in('id', [f.bramId, f.carlaId]);
    if (dagenTerug.error) throw new Error(`dagen terugzetten: ${dagenTerug.error.message}`);
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
  /**
   * ⚠️⚠️ **De eigenaarsconjunct in de `update` — QS8-282.**
   *
   * `zet_week_startdag()` is `SECURITY DEFINER`, dus er komt op `weekly_goals`
   * geen enkele policy aan te pas. De hele bescherming van andermans cyclus is
   * één conjunct in de `where` van de verhuizing: `and g.owner_id = v_uid`.
   *
   * 📏 Die conjunct werd tot 05-09 door **geen enkele test** bewaakt. Gemeten
   *    met twee gebruikers zonder enige relatie, allebei een `todo` in dezelfde
   *    cyclus, waarna de één zijn startdag verzet:
   *
   * ```
   * functie zoals hij is     {"ok": true, "verzet": 1}   het weekdoel van de ander blijft staan
   * conjunct -> `and true`   {"ok": true, "verzet": 2}   het weekdoel van de ander schuift mee
   * ```
   *
   * ⚠️⚠️ **De eerste versie van deze test had de zwakke acteur, en dat is de
   *    standaardfout van dit project.** Met alléén een wildvreemde in de
   *    opstelling bleef de suite groen onder de verruiming die hier écht
   *    gebeurt: `and (g.owner_id = v_uid or shares_group_with_goal(g.id))` gaf
   *    **nul rood van 964**. De dossierrij van 03-09 zegt het met zoveel
   *    woorden — *"de gevaarlijke acteur bij een RLS-test is de buddy en niet de
   *    vreemde … dit is de standaardfout, niet een incident"* — en bij
   *    `milestones_write` en `completions_insert` is precies die verruiming al
   *    een keer aangebracht met de suite groen. Carla staat er sinds de
   *    security-review op deze ronde bij.
   *
   *    Wat er dan gebeurt: haar weekdoel schuift naar een cyclus waar zij niet
   *    in zit, `fetchWeekdoelen()` matcht exact op `cycle_start_date` dus die
   *    week valt uit élke lijst, en een week later stempelt de rollover hem als
   *    gemist. Het minpunt komt bij háár terecht. Exact de fout die 0139 kwam
   *    repareren, nu veroorzaakt door iemand anders.
   *
   * ⚠️⚠️ **En er staat een twéede grendel in dezelfde functie**, twee regels
   *    hoger, die óók ongedekt was: `update profiles set week_start_day = p_dag
   *    where id = v_uid`. Gemeten met `where id is not null`: **nul rood van
   *    964**, terwijl één ingelogde gebruiker de weekgrens van elk profiel in de
   *    database herschrijft (`totaal met week_start_day = 3` ging van 1 naar 2
   *    op een database met twee profielen). Domeinregel 1 én 2 tegelijk. Ook die
   *    komt uit de security-review; mijn eigen sweep had hem gemist omdat ik naar
   *    de `update weekly_goals` keek en niet naar de regel erboven.
   *
   *    Met maandag als standaard-startdag is "iedereen met een openstaand
   *    weekdoel in deze cyclus" in de praktijk bijna iedereen. En `verzet` gaat
   *    terug naar de aanroeper, dus de teller lekt hoeveel andermans weken er
   *    geraakt zijn.
   *
   * ⚠️ **Waarom het gat er zat, en dat is de les.** `definerpoorten.test.ts`
   *    noemt deze functie mét naam en zet hem opzij: *"scopet in de `update`
   *    zelf, en daar zegt deze mutatievorm principieel niets over"*. Dat klopt
   *    over díe vorm — dat bestand haalt een vroege `return`-poort weg en die
   *    heeft deze functie niet. Maar niemand kwam terug met de vorm die er wél
   *    iets over zegt. **"Zo niet te meten" werd stilletjes "niet gemeten"**,
   *    dezelfde beweging als bij `superseded_by` in QS8-280.
   *
   * ⚠️ **Beide asserties zijn nodig.** Alleen `verzet` toetsen mist het geval
   *    waarin de teller klopt en de rij toch verschoven is; alleen de datum
   *    toetsen laat het lek in de teruggegeven teller staan.
   *
   * ⚠️⚠️ **En het scherpste van deze ronde: de assertie bestónd al.** De test
   *    *"neemt een todo van de lopende week mee naar de nieuwe cyclus"* eist
   *    hierboven al `expect(uit.verzet).toBe(1)`, met de woorden *"er hoort
   *    precies één todo mee te gaan"*. Die zin was al die tijd juist. Wat
   *    ontbrak was een fixture waarin dat getal ooit iets ánders kon zijn: er
   *    stond maar één gebruiker met één `todo` in die cyclus, dus `1` was
   *    onvermijdelijk en de assertie bewaakte niets.
   *
   *    Sinds Bram in de opstelling staat, wordt díe test óók rood op deze
   *    mutatie — en dat is geen dubbeling maar het bewijs dat de reparatie in de
   *    fixture zat en niet in de assertie. Regel 18, vraag 6, in zijn zuiverste
   *    vorm: een aanname van *"er is er altijd precies één"* die naar *"er
   *    kunnen er meer zijn"* is getild, met de blinde vlek er al in.
   */
  it(
    'raakt de cyclus en de week-startdag van niemand anders aan',
    async () => {
      const uit = await verzet(NIEUWE_DAG, f.oudeStart, f.nieuweStart);

      expect(uit.ok, 'de verhuizing zelf hoort gewoon te slagen').toBe(true);
      expect(
        uit.verzet,
        'alleen het eigen `todo`-weekdoel telt mee — een hoger getal is het aantal ' +
          'weken van anderen dat is meeverhuisd, en dat getal gaat naar de aanroeper terug',
      ).toBe(1);

      expect(
        await cyclusVan(f.bramWeekId),
        'de cyclus van een wildvreemde hoort onaangeroerd te blijven — er is geen ' +
          'policy die hier meekijkt, alleen `and g.owner_id = v_uid` in de `update`',
      ).toBe(f.oudeStart);

      // ⚠️⚠️ **De buddy is de acteur die telt.** Een wildvreemde wordt door
      //    élke denkbare verruiming nog tegengehouden; een groepsgenoot niet.
      //    Gemeten met `and (g.owner_id = v_uid or shares_group_with_goal(g.id))`
      //    — de verruiming die in dit project al twee keer echt is aangebracht:
      //    zonder Carla nul rode tests van 964, met haar erbij deze.
      expect(
        await cyclusVan(f.carlaWeekId),
        'de cyclus van een groepsgenoot hoort net zo onaangeroerd te blijven — háár ' +
          'weekdoel schuift dan naar een week waar zij niet in zit, valt uit elke ' +
          'lijst, en wordt door de rollover als gemist gestempeld. Precies de fout ' +
          'die 0139 kwam repareren, nu veroorzaakt door iemand anders',
      ).toBe(f.oudeStart);

      // ⚠️⚠️ **De tweede grendel in dezelfde functie**, en die was tot 05-09
      //    óók ongedekt: `update profiles set week_start_day = p_dag where
      //    id = v_uid`. Gemeten met `where id is not null`: nul rode tests van
      //    964, terwijl één gebruiker de weekgrens van **elk profiel in de
      //    database** herschrijft. Dat is domeinregel 1 en 2 tegelijk — ieders
      //    weekdoelen resetten dan op een andere dag en elke reeks breekt op een
      //    verkeerd middernacht.
      const dagen = await adminDb()
        .from('profiles')
        .select('id, week_start_day')
        .in('id', [f.bramId, f.carlaId]);
      expect(dagen.error).toBeNull();
      expect(
        dagen.data?.map((r) => r.week_start_day),
        'de week-startdag van een ander hoort niet mee te veranderen',
      ).toEqual([OUDE_DAG, OUDE_DAG]);

      // ⚠️ De must-see. Zonder deze regels is elke uitkomst hierboven ook te
      //    halen met een RPC die helemaal niets doet.
      expect(
        await cyclusVan(f.ids.todo),
        'en het eigen weekdoel verhuist wél — anders bewijst de rest niets',
      ).toBe(f.nieuweStart);

      const eigen = await adminDb()
        .from('profiles')
        .select('week_start_day')
        .eq('id', f.alice.id)
        .single();
      expect(eigen.data?.week_start_day, 'en de eigen dag is wél gezet').toBe(NIEUWE_DAG);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Een cyclus begint op de week-startdag — óók als een RPC hem verzet.**
   *    QS8-357, migratie 0200.
   *
   *    0198 vestigt die invariant met een `before insert`-trigger op
   *    `weekly_goals`, en de kop van die migratie zegt met zoveel woorden dat
   *    elke rij een echte cyclusstart draagt. 📏 Dat gold bij INSERT en niet voor
   *    de tabel: `zet_week_startdag()` schrijft met een `update`, en die trigger
   *    vuurt daar niet. Nagemeten vóór de reparatie:
   *
   *      zet_week_startdag(p_dag => 4, oude => <maandag>, nieuwe => <dinsdag>)
   *        -> { ok: true, verzet: 1 }
   *        -> weekly_goals.cycle_start_date valt op dinsdag, week_start_day = 4
   *
   *    Dat is de vorm uit regel 18: elk onderdeel klopt en het geheel niet. De
   *    volgende grendel die op die invariant leunt, leunt op iets wat de
   *    database niet afdwingt.
   *
   * ⚠️ **Het ijkgeval moet lángs de bestaande grendel komen**, en dat is de val
   *    uit QS8-352. `zet_week_startdag()` weigert al zodra vandaag niet in béide
   *    cycli valt; een scheve datum ver weg wordt dus door díe toets afgevangen
   *    en bewijst niets over de nieuwe. De datums hieronder liggen daarom binnen
   *    het venster van vandaag en zijn alleen scheef.
   */
  describe('QS8-357 — de RPC schrijft geen cyclus die naast de startdag valt', () => {
    /**
     * Een datum die vandaag bevat maar níét op `dag` valt: de cyclusstart van
     * `dag`, één dag opgeschoven. Blijft binnen het venster zolang de
     * verschuiving kleiner is dan de resterende dagen van de cyclus.
     */
    function scheefMaarBinnenVandaag(dag: Weekday): IsoDate {
      const start = userCycle({ weekStartDay: dag, tz: ZONE }, now()).startDate;
      const vandaag = userCycle({ weekStartDay: dag, tz: ZONE }, now());
      // ⚠️ Eén dag terug in plaats van vooruit: vooruit kan vandaag buiten de
      //    nieuwe cyclus duwen, en dan meet de bestaande venstertoets mee.
      return addDays(start, -1) === vandaag.startDate ? addDays(start, 1) : addDays(start, -1);
    }

    it(
      'weigert een nieuwe cyclus die niet op de nieuwe week-startdag valt',
      async () => {
        const scheef = scheefMaarBinnenVandaag(NIEUWE_DAG);
        expect(scheef, 'het ijkgeval valt tóch op de startdag').not.toBe(f.nieuweStart);

        const uit = await verzet(NIEUWE_DAG, f.oudeStart, scheef);

        expect(uit.ok, 'de scheve cyclus werd geschreven').toBe(false);
        expect(uit.reason, 'geweigerd, maar door de verkeerde grendel').toBe(
          'cyclus_valt_niet_op_startdag',
        );
        expect(
          await cyclusVan(f.ids.todo),
          'het weekdoel is alsnog verzet',
        ).toBe(f.oudeStart);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ Acceptatiecriterium 2: `p_oude_start` tegen de **oude** dag. Zonder deze
     *    toets verschuift de RPC een rij die zelf al scheef stond, en dan is de
     *    uitkomst wél recht maar de selectie niet.
     */
    it(
      'weigert een oude cyclus die niet op de oude week-startdag valt',
      async () => {
        const scheef = scheefMaarBinnenVandaag(OUDE_DAG);
        expect(scheef, 'het ijkgeval valt tóch op de startdag').not.toBe(f.oudeStart);

        const uit = await verzet(NIEUWE_DAG, scheef, f.nieuweStart);

        expect(uit.ok, 'de scheve oude cyclus werd geaccepteerd').toBe(false);
        expect(uit.reason, 'geweigerd, maar door de verkeerde grendel').toBe(
          'oude_cyclus_valt_niet_op_startdag',
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de gewone weg gewoon werken — de must-allow',
      async () => {
        const uit = await verzet(NIEUWE_DAG, f.oudeStart, f.nieuweStart);

        expect(uit.ok, `geweigerd met ${uit.reason}`).toBe(true);
        expect(await cyclusVan(f.ids.todo)).toBe(f.nieuweStart);
      },
      TEST_TIMEOUT,
    );
  });
});