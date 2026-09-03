import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestUser,
} from './harness';

/**
 * De schrijfkant van `profiles`, `weekly_plan_steps` en `goal_interviews` —
 * QS8-262, ronde 3.
 *
 * ⚠️ **De schrijfkant van `profiles` staat woordelijk in de dossierrij van
 *    15-08** die dit issue opleverde, en beide helften waren onbewaakt.
 *
 * ⚠️ **Per conjunct en niet per policy, want hier zitten de grendels ín de
 *    clausule.** `weekly_plan_steps_insert` is *"ik ben de eigenaar"* **én**
 *    *"ik zit onder de dagelijkse limiet"*; `_update` is *"ik ben de eigenaar"*
 *    **én** *"deze stap is nog niet geactiveerd"*, met in de `check` daarbovenop
 *    *"en hij wijst nog naar geen weekdoel"*. Dat zijn vijf afzonderlijke
 *    grendels in twee policies, en elk is los te breken — dus elk hoort los
 *    geijkt.
 *
 * ⚠️⚠️ **De les van ronde 1 en 2, en hij gold hier weer: zoek eerst welke ándere
 *    grendel het geval toevallig dekt.** Een profiel wordt automatisch
 *    aangemaakt door een trigger op `auth.users`, dus een insert van een ánder
 *    profiel ketst af op de primaire sleutel (`23505`) en niet op de policy —
 *    en `23505` is geen weigercode, dus de test zou rood zijn om de verkeerde
 *    reden. Daarom wordt het profiel eerst via `adminDb()` weggehaald.
 *
 * ⚠️⚠️ **Twee helften zijn niet te breken, en dat staat hier in plaats van dat
 *    het verzwegen wordt** (QS8-262 laat dat toe, mits met een
 *    terugkeervoorwaarde). Beide zijn gemeten, niet beredeneerd.
 *
 *    1. **`profiles_update` — `using` en `check` zijn letterlijk dezelfde
 *       uitdrukking** (`id = auth.uid()`), op dezelfde kolom, en `id` staat niet
 *       in de UPDATE-kolomgrant. Er bestáát geen rij die de ene helft passeert
 *       en de andere niet. Het páár is bewaakt — beide open zetten maakt *"je
 *       past de naam van een ander niet aan"* rood — maar de helften zijn niet
 *       te scheiden. **Wordt toetsbaar zodra de twee uitdrukkingen uit elkaar
 *       lopen**, bijvoorbeeld als een beheerder ooit andermans profiel mag
 *       lezen maar niet schrijven.
 *
 *    2. **De eigenaarsconjunct van `weekly_plan_steps_update.using`.**
 *       `weekly_plan_steps_select` is eigenaar-only, dus een client zíet de stap
 *       van een ander helemaal niet: de `where` van zijn UPDATE raakt nul rijen
 *       en de `using` komt er niet aan te pas. Dat is een stríkter slot en geen
 *       zwakker, maar het betekent dat deze conjunct voor een client nooit de
 *       werkzame grendel is. **Wordt toetsbaar zodra `weekly_plan_steps_select`
 *       verruimt** — bijvoorbeeld als groepsgenoten ooit elkaars weekplan mogen
 *       inzien; dan is dit de enige regel die schrijven nog tegenhoudt.
 *
 * ## ⚠️⚠️ Nagemeten op 03-09-2026 — de acteur was de zwakke
 *
 * Deze ronde toetste `weekly_plan_steps_insert` en `goal_interviews_all` tegen een
 * gebruiker die met de eigenaar níets deelde. Dat is de zwákkere aanvaller: hij
 * wordt overal twee keer tegengehouden.
 *
 * **Gemeten.** Verruim een van beide met `or shares_group_with_goal(g.id)` — wat
 * iemand erin zet die hem van een leespolicy overneemt — en de héle suite van 843
 * tests bleef groen. Een buddy kon dus een interviewantwoord op jouw doel
 * schrijven en een weekplanstap aan jouw doel hangen.
 *
 * De reparatie is geen extra test maar een sterkere acteur: `eigenaar` en `ander`
 * delen nu een groep en `andersGoalId` hangt eraan, dus de eigenaarsconjunct is
 * het énige slot dat nog werkt. Beide verruimingen maken nu hun eigen test rood.
 * Dezelfde les als ronde 4 (#174).
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  eigenaar: TestUser;
  ander: TestUser;
  /**
   * Twee wegwerpgebruikers, alleen voor de twee insert-gevallen op `profiles`.
   *
   * ⚠️ **Ze bestaan omdat het profiel wég moet om de policy te kunnen raken, en
   *    dat cascadeert.** `goals.owner_id` hangt met `on delete cascade` aan
   *    `profiles`, dus het profiel van `eigenaar` weghalen nam zijn doel mee en
   *    daarna viel de halve suite om op een foreign key. Gemeten en niet
   *    bedacht: dit bestand was in zijn eerste vorm zes tests rood om precies
   *    die reden.
   */
  profielA: TestUser;
  profielB: TestUser;
  eigenGoalId: string;
  andersGoalId: string;
  eigenStapId: string;
  andersStapId: string;
  weeklyGoalId: string;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de schrijfgrenzen van profiel, weekplan en interview', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('schrijf-eigenaar');
    const ander = await createTestUser('schrijf-ander');
    const profielA = await createTestUser('schrijf-profiel-a');
    const profielB = await createTestUser('schrijf-profiel-b');
    const admin = adminDb();
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const maakDoel = async (wie: TestUser, titel: string): Promise<string> => {
      const d = await wie.db
        .from('goals')
        .insert({ owner_id: wie.id, title: titel, target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return d.data.id;
    };

    const eigenGoalId = await maakDoel(eigenaar, 'SCHRIJF-EIGEN');
    const andersGoalId = await maakDoel(ander, 'SCHRIJF-ANDER');

    // ⚠️⚠️ **`eigenaar` en `ander` delen een groep, en `andersGoalId` hangt eraan.**
    //    Dat is er op 03-09 bij gekomen na het nameten van deze ronde, en het is
    //    de kern van de correctie.
    //
    //    Zonder die koppeling was `eigenaar` een volstrékt onbetrokken gebruiker,
    //    en dan is hij de zwákkere aanvaller: hij wordt overal twee keer
    //    tegengehouden. Gemeten: verruim `goal_interviews_all.check` of
    //    `weekly_plan_steps_insert.check` met `or shares_group_with_goal(g.id)` —
    //    precies wat iemand erin zet die hem van een leespolicy overneemt — en de
    //    héle suite van 843 tests bleef groen. Een buddy kon dus een
    //    interviewantwoord op jouw doel schrijven en een weekplanstap aan jouw
    //    doel hangen, en niets merkte het.
    //
    //    Met de koppeling is `eigenaar` een groepsgenoot van `ander`, en dan is de
    //    eigenaarsconjunct het énige slot. Dezelfde les als ronde 4.
    const groep = await ander.db.rpc('create_group', { group_name: 'Schrijfgrenzen' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await eigenaar.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    const meeUit = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (meeUit.ok !== true) throw new Error(`meedoen: ${meeUit.reason ?? '?'}`);

    const koppel = await ander.db
      .from('goal_group_links')
      .insert({ goal_id: andersGoalId, group_id: gd.group.id });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    const maakStap = async (goalId: string): Promise<string> => {
      const s = await admin
        .from('weekly_plan_steps')
        .insert({ goal_id: goalId, order_index: 1, title: 'STAP', ai_generated: false })
        .select('id')
        .single();
      if (s.error || s.data === null) throw new Error(`stap: ${s.error?.message}`);
      return s.data.id;
    };

    const eigenStapId = await maakStap(eigenGoalId);
    const andersStapId = await maakStap(andersGoalId);

    const week = await admin
      .from('weekly_goals')
      .insert({
        goal_id: eigenGoalId,
        title: 'SCHRIJFWEEK',
        points_ceiling: 2,
        points_floor: 1,
        points_miss: -1,
        cycle_start_date: vandaag,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

    w = {
      eigenaar,
      ander,
      profielA,
      profielB,
      eigenGoalId,
      andersGoalId,
      eigenStapId,
      andersStapId,
      weeklyGoalId: week.data.id,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een insert die moet weigeren, met de code die daarbij hoort. */
  async function insertMagNiet(
    poging: () => PromiseLike<{ error: { code?: string; message?: string } | null }>,
    wat: string,
  ): Promise<void> {
    const { error } = await poging();
    expect(error, `${wat}: dit hoort geweigerd te worden`).not.toBeNull();
    expect(
      WEIGERCODES as readonly string[],
      `${wat}: geweigerd met ${error?.code} — ${error?.message}. Dat is geen ` +
        'policy-weigering maar iets anders, en dan bewaakt deze test de verkeerde grendel',
    ).toContain(error?.code);
  }

  describe('profiles — een profiel is van jou en van niemand anders', () => {
    it(
      'je mag je eigen profiel invoegen',
      async () => {
        const weg = await adminDb().from('profiles').delete().eq('id', w.profielA.id);
        if (weg.error) throw new Error(`profiel weghalen: ${weg.error.message}`);

        const { error } = await w.profielA.db
          .from('profiles')
          .insert({ id: w.profielA.id, display_name: 'Profiel A' });
        expect(error, 'je eigen profiel invoegen hoort te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'je mag het profiel van een ander niet invoegen',
      async () => {
        // ⚠️ Eerst weg, anders ketst de insert af op de primaire sleutel en niet
        //    op de policy — zie de kop van dit bestand.
        const weg = await adminDb().from('profiles').delete().eq('id', w.profielB.id);
        if (weg.error) throw new Error(`profiel weghalen: ${weg.error.message}`);

        await insertMagNiet(
          () =>
            w.profielA.db.from('profiles').insert({ id: w.profielB.id, display_name: 'Gekaapt' }),
          'profiles_insert',
        );

        // Terugzetten, zodat `removeTestUsers()` hem netjes opruimt.
        const terug = await adminDb()
          .from('profiles')
          .insert({ id: w.profielB.id, display_name: 'Profiel B' });
        if (terug.error) throw new Error(`profiel terugzetten: ${terug.error.message}`);
      },
      TEST_TIMEOUT,
    );

    it(
      'je past je eigen naam aan',
      async () => {
        const { error } = await w.eigenaar.db
          .from('profiles')
          .update({ display_name: 'Nieuwe naam' })
          .eq('id', w.eigenaar.id);
        expect(error).toBeNull();

        const na = await adminDb()
          .from('profiles')
          .select('display_name')
          .eq('id', w.eigenaar.id)
          .single();
        expect(na.data?.display_name).toBe('Nieuwe naam');
      },
      TEST_TIMEOUT,
    );

    it(
      'je past de naam van een ander niet aan',
      async () => {
        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('profiles')
              .update({ display_name: 'Gekaapt' })
              .eq('id', w.ander.id),
          () => adminDb().from('profiles').select('display_name').eq('id', w.ander.id),
        );
      },
      TEST_TIMEOUT,
    );
  });

  describe('weekly_plan_steps — vijf grendels in twee policies', () => {
    it(
      'je voegt een stap toe aan je eigen doel',
      async () => {
        const { error } = await w.eigenaar.db
          .from('weekly_plan_steps')
          .insert({ goal_id: w.eigenGoalId, order_index: 2, title: 'EIGEN', ai_generated: false });
        expect(error, 'op je eigen doel hoort dit te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'je voegt geen stap toe aan het doel van een ander',
      async () => {
        await insertMagNiet(
          () =>
            w.eigenaar.db.from('weekly_plan_steps').insert({
              goal_id: w.andersGoalId,
              order_index: 3,
              title: 'GEKAAPT',
              ai_generated: false,
            }),
          'weekly_plan_steps_insert — eigenaarsconjunct',
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'je wijzigt je eigen stap',
      async () => {
        const { error } = await w.eigenaar.db
          .from('weekly_plan_steps')
          .update({ title: 'BIJGEWERKT' })
          .eq('id', w.eigenStapId);
        expect(error).toBeNull();

        const na = await adminDb()
          .from('weekly_plan_steps')
          .select('title')
          .eq('id', w.eigenStapId)
          .single();
        expect(na.data?.title).toBe('BIJGEWERKT');
      },
      TEST_TIMEOUT,
    );

    it(
      'je wijzigt de stap van een ander niet',
      async () => {
        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('weekly_plan_steps')
              .update({ title: 'GEKAAPT' })
              .eq('id', w.andersStapId),
          () => adminDb().from('weekly_plan_steps').select('title').eq('id', w.andersStapId),
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De tweede conjunct van de `using`-helft. Een geactiveerde stap is
     *    geschiedenis: hij hoort bij een cyclus die gelopen heeft, en die
     *    achteraf herschrijven is precies wat domeinregel 6 verbiedt.
     */
    it(
      'een geactiveerde stap is niet meer te wijzigen',
      async () => {
        const stap = await adminDb()
          .from('weekly_plan_steps')
          .insert({
            goal_id: w.eigenGoalId,
            order_index: 4,
            title: 'GEACTIVEERD',
            ai_generated: false,
            activated_cycle: '2024-01-01',
          })
          .select('id')
          .single();
        if (stap.error || stap.data === null) throw new Error(`stap: ${stap.error?.message}`);

        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('weekly_plan_steps')
              .update({ title: 'HERSCHREVEN' })
              .eq('id', stap.data!.id),
          () => adminDb().from('weekly_plan_steps').select('title').eq('id', stap.data!.id),
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Dit geval isoleert de `using`-helft, en zonder hem bewaakt niets
     *    hem.** De vorige test laat een geactiveerde stap met rust — maar dáár
     *    weigert óók de `check`-helft, want die eist eveneens
     *    `activated_cycle is null` en de rij houdt zijn waarde. Haal je de
     *    conjunct alleen uit de `using`, dan blijft die test dus groen: gemeten.
     *
     *    Door `activated_cycle` juist op `null` te zetten, voldoet de níeuwe rij
     *    wél aan de check en blijft alleen de `using` over — die naar de óude
     *    rij kijkt. En het is een echte belofte: je maakt een geactiveerde stap
     *    niet los om hem alsnog te herschrijven.
     */
    it(
      'je maakt een geactiveerde stap niet los door de cyclus leeg te maken',
      async () => {
        const stap = await adminDb()
          .from('weekly_plan_steps')
          .insert({
            goal_id: w.eigenGoalId,
            order_index: 6,
            title: 'LOSMAKEN',
            ai_generated: false,
            // ⚠️ Een ándere cyclus dan de stap hierboven: `weekly_plan_steps_een_per_cyclus`
            //    staat er één per doel per cyclus toe.
            activated_cycle: '2024-02-01',
          })
          .select('id')
          .single();
        if (stap.error || stap.data === null) throw new Error(`stap: ${stap.error?.message}`);

        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('weekly_plan_steps')
              .update({ activated_cycle: null })
              .eq('id', stap.data!.id),
          () =>
            adminDb().from('weekly_plan_steps').select('activated_cycle').eq('id', stap.data!.id),
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **En dit geval isoleert de eigenaarsconjunct van de `using`-helft.**
     *    "Je wijzigt de stap van een ander niet" raakt beide helften tegelijk:
     *    de `check` eist óók dat het doel van jou is, en de rij houdt zijn
     *    `goal_id`. Haal je de conjunct alleen uit de `using`, dan blijft die
     *    test groen — gemeten.
     *
     *    Door `goal_id` naar je éigen doel te wijzen, voldoet de níeuwe rij aan
     *    de check en blijft alleen de `using` over. Ook dit is een echte
     *    belofte: je kaapt de stap van een ander niet door hem naar je eigen
     *    doel te verplaatsen.
     *
     * ⚠️ **Het lukt alleen niet om de reden die je zou denken.** Gemeten: met de
     *    eigenaarsconjunct alleen uit de `using` blijft ook dit geval groen,
     *    want `weekly_plan_steps_select` is eigenaar-only en de `where` raakt
     *    dan nul rijen. Zie punt 2 in de kop van dit bestand. De belofte klopt,
     *    de grendel eronder is een andere dan de policy die hier op naam staat.
     */
    it(
      'je kaapt de stap van een ander niet door hem naar je eigen doel te wijzen',
      async () => {
        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('weekly_plan_steps')
              .update({ goal_id: w.eigenGoalId })
              .eq('id', w.andersStapId),
          () => adminDb().from('weekly_plan_steps').select('goal_id').eq('id', w.andersStapId),
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De derde conjunct, en die staat alléén in de `check`-helft: je mag een
     *    stap niet zélf aan een weekdoel koppelen. Dat is werk van de activering.
     */
    it(
      'je koppelt een stap niet zelf aan een weekdoel',
      async () => {
        await magNietLanden(
          () =>
            w.eigenaar.db
              .from('weekly_plan_steps')
              .update({ weekly_goal_id: w.weeklyGoalId })
              .eq('id', w.eigenStapId),
          () => adminDb().from('weekly_plan_steps').select('weekly_goal_id').eq('id', w.eigenStapId),
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De tweede conjunct van de `insert`-helft: de dagelijkse limiet van 200.
     *    Zonder dit geval bewaakt niets die rem, en een AI-opsplitsing die
     *    doordraait vult de tabel.
     */
    it(
      'boven de dagelijkse limiet weigert de policy',
      async () => {
        const admin = adminDb();
        const vulling = Array.from({ length: 200 }, (_, i) => ({
          goal_id: w.eigenGoalId,
          order_index: (i % 52) + 1,
          title: `VUL-${i}`,
          ai_generated: false,
        }));
        const gevuld = await admin.from('weekly_plan_steps').insert(vulling);
        if (gevuld.error) throw new Error(`vullen: ${gevuld.error.message}`);

        await insertMagNiet(
          () =>
            w.eigenaar.db.from('weekly_plan_steps').insert({
              goal_id: w.eigenGoalId,
              order_index: 5,
              title: 'OVER DE LIMIET',
              ai_generated: false,
            }),
          'weekly_plan_steps_insert — limietconjunct',
        );
      },
      SETUP_TIMEOUT,
    );
  });

  describe('goal_interviews — een vragenlijst hoort bij jouw doel', () => {
    it(
      'je legt een interview vast bij je eigen doel',
      async () => {
        const { error } = await w.eigenaar.db
          .from('goal_interviews')
          .insert({ goal_id: w.eigenGoalId, answers: { waarom: 'omdat het kan' } });
        expect(error, 'op je eigen doel hoort dit te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'je legt er geen vast bij het doel van een ander',
      async () => {
        await insertMagNiet(
          () =>
            w.eigenaar.db
              .from('goal_interviews')
              .insert({ goal_id: w.andersGoalId, answers: { waarom: 'gekaapt' } }),
          'goal_interviews_all — checkhelft',
        );
      },
      TEST_TIMEOUT,
    );
  });
});
