import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * QS8-127 (Q-TODO A37) — één gehaald weekdoel redt de week.
 *
 * ⚠️ **Dit bestand bestaat omdat de oude regel geen regel was maar een gok.**
 *    `herbereken_reeks()` groepeerde op `(cycle_start_date, status)`. Twee
 *    weekdoelen op hetzelfde doel in dezelfde week — één gehaald, één gemist —
 *    leverden daarmee twee rijen voor dezelfde datum, en de `order by` sorteerde
 *    alleen op datum. Welke van de twee als laatste langskwam, bepaalde of de
 *    reeks doorliep; Postgres belooft daar niets over.
 *
 * ⚠️ **Een test die dat één keer draait, bewijst niets** — hij kan toevallig de
 *    goede kant op vallen. De test hieronder herberekent daarom herhaald, en
 *    wisselt bovendien de invoegvolgorde om. Dat is het verschil tussen "het
 *    werkte deze keer" en "het kan niet anders".
 */

const SETUP_TIMEOUT = 120_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  alice: TestUser;
  goalId: string;
  /** De cyclus met twee weekdoelen: één gehaald, één gemist. */
  gemengd: string;
}

describe.skipIf(!rlsTestsConfigured)('QS8-127 — één gehaald weekdoel redt de week', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('reeks-alice');

    const { data: doel, error: doelFout } = await admin
      .from('goals')
      .insert({
        owner_id: alice.id,
        title: 'Reeksdoel',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (doelFout) throw new Error(`doel aanmaken: ${doelFout.message}`);

    // ⚠️ De cyclus komt uit `shared/time` en wordt hier niet nagerekend —
    //    correctheidsregel 7.
    const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    // Drie schone weken, zodat er een reeks ís om te verliezen.
    for (let i = 4; i >= 2; i -= 1) {
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: doel.id,
        title: `schone week -${i}`,
        cycle_start_date: addDays(basis.startDate, -7 * i),
        cycle_index: 200 - i,
        status: 'approved',
      });
      if (error) throw new Error(`weekdoel aanmaken: ${error.message}`);
    }

    // En dan de gemengde week: twee weekdoelen, één gehaald en één gemist.
    //
    // ⚠️ De gemiste gaat er eerst in. Dat is de volgorde waarin de oude functie
    //    hem het váákst goed had — de test hieronder draait hem ook om.
    const gemengd = addDays(basis.startDate, -7);

    for (const [titel, status] of [
      ['gemist weekdoel', 'missed'],
      ['gehaald weekdoel', 'approved'],
    ] as const) {
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: doel.id,
        title: titel,
        cycle_start_date: gemengd,
        cycle_index: 199,
        status,
      });
      if (error) throw new Error(`gemengd weekdoel: ${error.message}`);
    }

    f = { alice, goalId: doel.id, gemengd };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('weekly_goals').delete().eq('goal_id', f.goalId);
    await admin.from('user_streaks').delete().eq('goal_id', f.goalId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * De drie schone weken uit `beforeAll`.
   *
   * ⚠️ **Bewust niet "alle vijf weekdoelen".** De tests hieronder herschrijven
   *    de gemengde week met opzet — één laat er zelfs maar één `missed` van
   *    over en verwacht dan reeks 0. Een controle op het totaal zou die test
   *    kapotmaken; dat is bij het bouwen van deze vangrail ook precies gebeurd,
   *    en de suite ving het. Wat géén enkele test aanraakt zijn de drie schone
   *    weken, en juist die verdwijnen bij het faalbeeld dat we zoeken.
   */
  const SCHONE_WEKEN = 3;

  /**
   * ⚠️ **Een vangrail en geen assertie — hij repareert niets.**
   *
   * Op 27-08-2026 viel dit bestand vier keer om in een volle parallelle run,
   * terwijl het los gedraaid altijd groen was. De faalmelding was
   * `wisselende uitkomsten: 4, 4, 4, 4, 4, 4, 0, 0, 0, 0` — en die zegt niet
   * wát er gebeurde, alleen dat het getal veranderde.
   *
   * Dat kostte de diagnose een halve dag, terwijl er één meting nodig was:
   * `herbereken_reeks()` is aantoonbaar deterministisch (`group by` plus
   * `bool_or`, geen afhankelijkheid van rijvolgorde), dus **een reeks van nul
   * kán maar één ding betekenen: de weekdoelen van dit doel zijn er niet meer.**
   * Niet gewijzigd — weg. Dat is een cascade, en dus is het doel of de eigenaar
   * onder de lopende test uit verwijderd.
   *
   * Deze controle zegt dat meteen, in plaats van het achter een getal te
   * verstoppen. Hij verandert niets aan de uitkomst zolang de fixture heel is.
   *
   * ⚠️ **De bevinding zelf staat nog open** — zie de rij van 27-08 in
   * `docs/ENGINEER-REVIEW.md`. `vitest.config.mts` draait `tests/rls/` sinds
   * diezelfde dag sequentieel, wat de kans erop wegneemt maar niet de oorzaak.
   * Valt hij ooit tóch weer om, dan is dít de melding die je wilt zien.
   */
  async function fixtureGaaf(): Promise<string | null> {
    const admin = adminDb();

    const { count: schoon, error } = await admin
      .from('weekly_goals')
      .select('id', { count: 'exact', head: true })
      .eq('goal_id', f.goalId)
      .neq('cycle_start_date', f.gemengd);

    if (error) return `de weekdoelen zijn niet leesbaar: ${error.message}`;
    if ((schoon ?? 0) === SCHONE_WEKEN) return null;

    const { count: doelen } = await admin
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('id', f.goalId);

    return [
      `de fixture is onder de test uit verdwenen: ${schoon ?? 0} van de`,
      `${SCHONE_WEKEN} schone weken over, en het doel zelf bestaat`,
      `${(doelen ?? 0) > 0 ? 'nog wél' : 'NIET meer'}.`,
      'Die drie weken worden door geen enkele test aangeraakt, dus dit is',
      'geen rekenfout maar ontbrekende data — zie de rij van 27-08-2026 in',
      'docs/ENGINEER-REVIEW.md.',
    ].join(' ');
  }

  async function reeks(): Promise<number> {
    const admin = adminDb();

    // ⚠️ Vóór het herberekenen, zodat de gemelde toestand ook de toestand is
    //    die het getal hieronder heeft opgeleverd.
    const stuk = await fixtureGaaf();
    if (stuk !== null) throw new Error(stuk);

    const herberekend = await admin.rpc('herbereken_reeks', {
      p_user_id: f.alice.id,
      p_goal_id: f.goalId,
    });
    if (herberekend.error) throw new Error(`herberekenen: ${herberekend.error.message}`);

    const { data, error } = await admin
      .from('user_streaks')
      .select('current_streak')
      .eq('goal_id', f.goalId)
      .single();
    if (error) throw new Error(`reeks lezen: ${error.message}`);

    return data.current_streak;
  }

  it(
    'telt de gemengde week mee: drie schone weken plus deze is vier',
    async () => {
      expect(await reeks()).toBe(4);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De eigenlijke test, en hij toetst een eigenschap en geen uitkomst.**
   *    De belofte is niet "de reeks is 4" maar "de reeks hángt niet af van iets
   *    wat de database niet belooft". Tien herberekeningen op dezelfde data
   *    horen tien keer hetzelfde te geven.
   *
   *    Met de oude functie was dit precies de test die soms groen was.
   */
  it(
    'geeft bij tien herberekeningen tien keer dezelfde reeks',
    async () => {
      const uitkomsten: number[] = [];
      for (let i = 0; i < 10; i += 1) uitkomsten.push(await reeks());

      expect(new Set(uitkomsten), `wisselende uitkomsten: ${uitkomsten.join(', ')}`).toEqual(
        new Set([4]),
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ En dezelfde vraag vanaf de andere kant: maakt de invoegvolgorde uit? Bij
   *    de oude functie kon een `seq scan` de rijen in fysieke volgorde teruggeven,
   *    en dan bepaalt wie er als eerste in ging wat eruit komt.
   */
  it(
    'geeft dezelfde reeks als de gehaalde er eerst in gaat',
    async () => {
      const admin = adminDb();

      await admin.from('weekly_goals').delete().eq('goal_id', f.goalId).eq('cycle_start_date', f.gemengd);

      for (const [titel, status] of [
        ['gehaald weekdoel', 'approved'],
        ['gemist weekdoel', 'missed'],
      ] as const) {
        const { error } = await admin.from('weekly_goals').insert({
          goal_id: f.goalId,
          title: titel,
          cycle_start_date: f.gemengd,
          cycle_index: 199,
          status,
        });
        if (error) throw new Error(`omgekeerd invoegen: ${error.message}`);
      }

      expect(await reeks()).toBe(4);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest. Zonder deze wordt dit hele bestand groen als
   *    `herbereken_reeks()` altijd het aantal cycli teruggeeft en `missed`
   *    helemaal niet meer leest. Een week waarin níéts gehaald is, hoort de reeks
   *    wél te breken.
   */
  it(
    'breekt de reeks nog steeds als er in een week niets gehaald is',
    async () => {
      const admin = adminDb();

      await admin.from('weekly_goals').delete().eq('goal_id', f.goalId).eq('cycle_start_date', f.gemengd);

      const { error } = await admin.from('weekly_goals').insert({
        goal_id: f.goalId,
        title: 'alleen gemist',
        cycle_start_date: f.gemengd,
        cycle_index: 199,
        status: 'missed',
      });
      if (error) throw new Error(`gemist weekdoel: ${error.message}`);

      expect(await reeks()).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
