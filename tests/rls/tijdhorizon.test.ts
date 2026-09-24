import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * QS8-609 — wat een lange horizon wél en niet blootlegt.
 *
 * Rij 618 van `docs/ENGINEER-REVIEW.md` noemt twee dingen die mogelijk blind
 * zijn voor tijd: de seizoensgrens en een reeks van maanden. Dit bestand meet
 * ze allebei, en het antwoord is voor allebei dat ze **niet** blind zijn —
 * `seizoensgrens()` neemt zijn moment als argument en `herbereken_reeks()` is
 * een zuivere functie van opgeslagen rijen. Er hoeft dus niets te verstrijken;
 * er moest alleen iemand kijken.
 *
 * ⚠️ **Wat een lange horizon dán wel oplevert, staat in de derde test en dat is
 *    de enige echte vondst van dit bestand:** een cyclus waarvoor niets gepland
 *    is, is iets anders dan een gemiste cyclus. `herbereken_reeks()` loopt de
 *    rijen af die er zíjn; een maand zonder rijen levert geen `missed` op en
 *    breekt de reeks dus niet. Over drie weken is dat onzichtbaar — er is altijd
 *    wel een rij — en over maanden is het een besluit.
 *
 *    Die test legt het gedrag vast zoals het vandaag is. Hij zegt niet dat het
 *    zo hoort; hij zorgt dat een wijziging een besluit is en geen neveneffect.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/**
 * ⚠️ **Lang genoeg om een jaargrens en beide zomertijdovergangen te passeren.**
 *    `addDays()` rekent op kalenderdatums in UTC en kan daar niet op stuk —
 *    dat is nagemeten en niet aangenomen — maar een reeks die de rand van het
 *    jaar niet haalt, bewijst dat ook niet.
 */
const LANGE_REEKS = 52;

/** De twee helften van de onderbroken reeks, met een gat ertussen. */
const HELFT = 12;
const GAT = 26;

interface Fixture {
  alice: TestUser;
  /** Doel met `LANGE_REEKS` aaneengesloten gehaalde cycli. */
  langGoalId: string;
  /** Doel met twee helften en een gat van `GAT` cycli zonder één rij. */
  gatGoalId: string;
}

describe.skipIf(!rlsTestsConfigured)('QS8-609 — de horizon van een reeks', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('horizon-alice');

    async function maakDoel(titel: string): Promise<string> {
      const { data, error } = await admin
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, category: 'other', target_date: '2027-12-31' })
        .select('id')
        .single();
      if (error) throw new Error(`doel ${titel}: ${error.message}`);
      return data.id as string;
    }

    // ⚠️ De cyclus komt uit `shared/time` en wordt hier niet nagerekend —
    //    correctheidsregel 7.
    const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    /** Zet één gehaalde cyclus neer, `terug` cycli vóór de huidige. */
    async function gehaaldeCyclus(goalId: string, terug: number): Promise<void> {
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: goalId,
        title: `week -${terug}`,
        cycle_start_date: addDays(basis.startDate, -7 * terug),
        status: 'approved',
      });
      if (error) throw new Error(`weekdoel -${terug}: ${error.message}`);
    }

    const langGoalId = await maakDoel('Reeks over maanden');
    for (let i = LANGE_REEKS; i >= 1; i -= 1) await gehaaldeCyclus(langGoalId, i);

    // De onderbroken reeks: HELFT gehaald, GAT cycli zonder één rij, HELFT gehaald.
    const gatGoalId = await maakDoel('Reeks met een stilte erin');
    const oudsteNa = HELFT;
    const oudsteVoor = HELFT + GAT + HELFT;
    for (let i = oudsteVoor; i > oudsteVoor - HELFT; i -= 1) await gehaaldeCyclus(gatGoalId, i);
    for (let i = oudsteNa; i >= 1; i -= 1) await gehaaldeCyclus(gatGoalId, i);

    f = { alice, langGoalId, gatGoalId };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    for (const goalId of [f?.langGoalId, f?.gatGoalId]) {
      if (!goalId) continue;
      await admin.from('weekly_goals').delete().eq('goal_id', goalId);
      await admin.from('user_streaks').delete().eq('goal_id', goalId);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Herberekent en leest de reeks van één doel terug. */
  async function reeksVan(goalId: string): Promise<{ current: number; best: number }> {
    const admin = adminDb();

    const { error: rekenFout } = await admin.rpc('herbereken_reeks', {
      p_user_id: f.alice.id,
      p_goal_id: goalId,
    });
    if (rekenFout) throw new Error(`herbereken_reeks: ${rekenFout.message}`);

    const { data, error } = await admin
      .from('user_streaks')
      .select('current_streak, best_streak')
      .eq('user_id', f.alice.id)
      .eq('goal_id', goalId)
      .single();
    if (error) throw new Error(`reeks lezen: ${error.message}`);

    return { current: data.current_streak as number, best: data.best_streak as number };
  }

  it(
    'telt een reeks van een jaar helemaal uit — er zit geen horizon in',
    async () => {
      const reeks = await reeksVan(f.langGoalId);

      expect(reeks.current, `${LANGE_REEKS} gehaalde cycli en de lopende reeks klopt niet`).toBe(
        LANGE_REEKS,
      );
      expect(reeks.best).toBe(LANGE_REEKS);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dit is de belofte en niet de implementatie.** Wat hier vastligt is dat
   *    stilte geen breuk is: `HELFT + HELFT` en niet `HELFT`. Zou iemand de
   *    ontbrekende cycli ooit als gemist gaan tellen, dan staat hier `24` tegen
   *    `12` en is dat een rood dat om een besluit vraagt.
   */
  it(
    'laat een reeks doorlopen over cycli waarvoor niets gepland is',
    async () => {
      const reeks = await reeksVan(f.gatGoalId);

      expect(
        reeks.current,
        `een gat van ${GAT} cycli zonder rijen hoort de reeks niet te breken`,
      ).toBe(HELFT * 2);
      expect(reeks.best).toBe(HELFT * 2);
    },
    TEST_TIMEOUT,
  );
});

/**
 * De randen van `seizoensgrens()`, in één tijdzone.
 *
 * ⚠️ **Waarom dit er nog niet stond, en waarom het niet hetzelfde is als wat er
 *    wél staat.** `seizoensrecap.test.ts` toetst `is_acht_uur = false` via
 *    Tokio: hetzelfde moment, een andere zone. Dat bewaakt dat de functie de
 *    klok van de gróép leest en niet die van de server — een andere belofte.
 *    Wat er niet stond is de rand zelf: één tijdzone, één minuut ertussen.
 *
 *    Dat is regel 18 vraag 2 in het klein. "Tokio zegt nee" is een eigenschap
 *    van één geval; "om 07:59 nog niet en om 08:00 wel" is de belofte.
 */
describe.skipIf(!rlsTestsConfigured)('QS8-609 — de randen van de seizoensgrens', () => {
  const ZONE = 'Europe/Amsterdam';

  interface Grens {
    season_start: string;
    season_end: string;
    is_eerste_dag: boolean;
    is_acht_uur: boolean;
  }

  async function grensOp(moment: string, cadans: 'quarterly' | 'monthly' = 'quarterly'): Promise<Grens> {
    const { data, error } = await adminDb().rpc('seizoensgrens', {
      p_tz: ZONE,
      p_cadence: cadans,
      p_op: moment,
    });
    if (error) throw new Error(`seizoensgrens op ${moment}: ${error.message}`);

    const rij = (data ?? [])[0] as Grens | undefined;
    if (!rij) throw new Error(`seizoensgrens gaf geen rij op ${moment}`);
    return rij;
  }

  /**
   * ⚠️ 2026-01-01 07:00Z is 08:00 in Amsterdam (wintertijd, UTC+1). De minuut
   *    ervóór hoort nee te zeggen en de minuut erna ja — dezelfde dag, dezelfde
   *    zone, alleen de klok verschilt.
   */
  it(
    'kantelt `is_acht_uur` op het hele uur en niet ervoor',
    async () => {
      const voor = await grensOp('2026-01-01T06:59:00Z');
      const op = await grensOp('2026-01-01T07:00:00Z');

      expect(voor.is_acht_uur, 'om 07:59 lokaal stond de poort al open').toBe(false);
      expect(op.is_acht_uur, 'om 08:00 lokaal bleef de poort dicht').toBe(true);

      // Allebei nog steeds de eerste dag — anders toetst de rand iets anders.
      expect(voor.is_eerste_dag).toBe(true);
      expect(op.is_eerste_dag).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'kantelt `is_eerste_dag` na de eerste dag en niet erop',
    async () => {
      const eerste = await grensOp('2026-01-01T07:00:00Z');
      const tweede = await grensOp('2026-01-02T07:00:00Z');

      expect(eerste.is_eerste_dag, '1 januari telde niet als eerste dag').toBe(true);
      expect(tweede.is_eerste_dag, '2 januari telde nog als eerste dag').toBe(false);

      // ⚠️ Het seizoen dat net afliep verandert niet van dag twee — alleen de
      //    poort gaat dicht. Zou `season_start` meeschuiven, dan zou een job die
      //    een dag te laat draait de verkeerde periode samenvatten.
      expect(tweede.season_start).toBe(eerste.season_start);
      expect(tweede.season_end).toBe(eerste.season_end);
    },
    TEST_TIMEOUT,
  );

  it(
    'kent bij `monthly` de maand die net afliep',
    async () => {
      const maart = await grensOp('2026-03-01T07:00:00Z', 'monthly');

      expect(maart).toMatchObject({
        season_start: '2026-02-01',
        season_end: '2026-02-28',
        is_eerste_dag: true,
        is_acht_uur: true,
      });
    },
    TEST_TIMEOUT,
  );
});
