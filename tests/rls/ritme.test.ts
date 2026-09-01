import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { niveauUitDagen } from '../../src/modules/goals/schemas';

import {
  adminDb,
  createTestUser,
  gebruikerDb,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Het ritme van een doel — QS8-253, besluit A53, migratie 0140.
 *
 * ⚠️ **Vier beloftes, en twee ervan zijn eigenschappen van het gehéél.**
 *
 *   1. *Het niveau komt uit de dagen en niet uit het formulier.* Zonder dat is
 *      een plafond met één afgevinkte dag te claimen — het formulier zou dan de
 *      regel meeleveren waaraan het getoetst wordt.
 *   2. *De twee uitvoeringen van die regel zeggen hetzelfde.* `niveauUitDagen()`
 *      in TypeScript voedt het scherm, `niveau_uit_dagen()` in de database
 *      beslist. Lopen ze uiteen, dan ziet de gebruiker een ander woord dan er
 *      geboekt wordt — en géén van beide is dan kapot. Dat is regel 18 in zijn
 *      zuiverste vorm, en het is de reden dat dit bestand bestaat.
 *   3. *Een afvinking is privé.* Ook in een open groep (A41).
 *   4. *Een afvinking valt binnen zijn eigen week.* De datum komt van de client
 *      (correctheidsregel 7); dat hij klopt, is niet aan de client.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Ver in het verleden, zodat niets van deze test elders meetelt. */
const CYCLUS = '2024-02-05';
const DAGEN = [
  '2024-02-05',
  '2024-02-06',
  '2024-02-07',
  '2024-02-08',
  '2024-02-09',
  '2024-02-10',
  '2024-02-11',
] as const;

interface Fixture {
  eigenaar: TestUser;
  buiten: TestUser;
  goalId: string;
}

let f: Fixture;

/** Een ritme-weekdoel met een vloer en een plafond in dagen. */
async function maakRitmeWeek(
  goalId: string,
  titel: string,
  vloer: number | null,
  plafond: number,
): Promise<string> {
  const rij = await adminDb()
    .from('weekly_goals')
    .insert({
      goal_id: goalId,
      title: titel,
      cycle_start_date: CYCLUS,
      cycle_index: 1,
      floor_days: vloer,
      ceiling_days: plafond,
    })
    .select('id')
    .single();

  if (rij.error || rij.data === null) throw new Error(`weekdoel: ${rij.error?.message}`);
  return rij.data.id;
}

async function vinkAf(weeklyGoalId: string, aantal: number): Promise<void> {
  for (let i = 0; i < aantal; i += 1) {
    const uit = await adminDb()
      .from('day_checkins')
      .insert({ weekly_goal_id: weeklyGoalId, local_date: DAGEN[i] ?? DAGEN[0] });
    if (uit.error) throw new Error(`afvinken: ${uit.error.message}`);
  }
}

/** Dient een voltooiing in en geeft terug wat de database ervan gemaakt heeft. */
async function dienIn(weeklyGoalId: string, userId: string, claim: 'floor' | 'ceiling') {
  return adminDb()
    .from('completions')
    .insert({
      weekly_goal_id: weeklyGoalId,
      user_id: userId,
      achieved_level: claim,
      note: 'RITME proefnotitie',
      cycle_start_date: '1970-01-01',
    })
    .select('achieved_level')
    .maybeSingle();
}

describe.skipIf(!rlsTestsConfigured)('het ritme van een doel', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('ritme-eigenaar');
    const buiten = await createTestUser('ritme-buiten');

    const doel = await adminDb()
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'RITME proefdoel',
        target_date: '2030-01-01',
        ritme: 'times_per_week',
      })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    f = { eigenaar, buiten, goalId: doel.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. Het niveau komt uit de dagen
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Dit is de belofte waar het hele ontwerp op rust.** Zonder deze trigger
   *    is een plafond te claimen met één afgevinkte dag, en dan is het ritme een
   *    formulierveld in plaats van een afspraak.
   *
   * ⚠️ Rood gemaakt door in `niveau_uit_dagen()` de regel die `achieved_level`
   *    overschrijft weg te halen: de claim `ceiling` kwam er toen ongewijzigd
   *    doorheen bij drie van de vijf dagen.
   */
  it(
    'overschrijft een te hoge claim met wat de dagen zeggen',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME drie van vijf', 3, 5);
      await vinkAf(week, 3);

      const uit = await dienIn(week, f.eigenaar.id, 'ceiling');

      expect(uit.error).toBeNull();
      expect(uit.data?.achieved_level).toBe('floor');
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft het plafond zodra de dagen er zijn, ook als je de vloer claimt',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME vijf van vijf', 3, 5);
      await vinkAf(week, 5);

      const uit = await dienIn(week, f.eigenaar.id, 'floor');

      expect(uit.error).toBeNull();
      expect(uit.data?.achieved_level).toBe('ceiling');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Onder de vloer is er geen week om in te dienen, en dát hoort een
   *    weigering te zijn en geen stille verlaging. Anders boek je een voltooiing
   *    op een week die niet gehaald is.
   */
  it(
    'weigert een voltooiing onder de vloer',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME een van vijf', 3, 5);
      await vinkAf(week, 1);

      const uit = await dienIn(week, f.eigenaar.id, 'floor');

      expect(uit.error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Bij elke weigering hoort een toelating.** Een gewoon weekdoel mag zijn
   *    niveau nog steeds zelf kiezen — zou deze trigger dat ook overschrijven,
   *    dan is elk bestaand weekdoel in de app stuk en zou geen van de gevallen
   *    hierboven dat laten zien.
   */
  it(
    'laat een gewoon weekdoel ongemoeid',
    async () => {
      const rij = await adminDb()
        .from('weekly_goals')
        .insert({
          goal_id: f.goalId,
          title: 'RITME gewone week',
          cycle_start_date: CYCLUS,
          cycle_index: 1,
        })
        .select('id')
        .single();
      if (rij.error || rij.data === null) throw new Error(`weekdoel: ${rij.error?.message}`);

      const uit = await dienIn(rij.data.id, f.eigenaar.id, 'floor');

      expect(uit.error).toBeNull();
      expect(uit.data?.achieved_level).toBe('floor');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De twee uitvoeringen zeggen hetzelfde
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De naad, en de reden dat dit bestand bestaat.** `niveauUitDagen()` voedt
   *    het scherm en `niveau_uit_dagen()` beslist. Beide kunnen los correct zijn
   *    en tóch verschillen — en dan ziet de gebruiker "plafond gehaald" staan
   *    terwijl er `floor` geboekt wordt. Geen enkele test op één van de twee kan
   *    dat zien.
   *
   * ⚠️ Rood gemaakt door in de SQL `>=` te vervangen door `>`: bij precies vijf
   *    van de vijf dagen zei TypeScript `ceiling` en de database `floor`.
   */
  it.each([
    { dagen: 5, vloer: 3, plafond: 5 },
    { dagen: 4, vloer: 3, plafond: 5 },
    { dagen: 3, vloer: 3, plafond: 5 },
    { dagen: 7, vloer: 5, plafond: 7 },
    { dagen: 5, vloer: null, plafond: 5 },
  ])(
    'de database en het scherm zijn het eens bij $dagen van $plafond dagen',
    async ({ dagen, vloer, plafond }) => {
      const week = await maakRitmeWeek(f.goalId, `RITME naad ${dagen}/${plafond}`, vloer, plafond);
      await vinkAf(week, dagen);

      const uit = await dienIn(week, f.eigenaar.id, 'floor');

      expect(uit.error).toBeNull();
      expect(uit.data?.achieved_level).toBe(niveauUitDagen(dagen, vloer, plafond));
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Een afvinking is privé
  // -------------------------------------------------------------------------

  it(
    'de eigenaar leest zijn eigen afvinkingen',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME eigen leesbaar', 1, 3);
      await vinkAf(week, 2);

      const db = gebruikerDb(f.eigenaar.token);
      const uit = await db.from('day_checkins').select('id').eq('weekly_goal_id', week);

      expect(uit.error).toBeNull();
      expect(uit.data?.length).toBe(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Rood gemaakt door `day_checkins_select` te verruimen met de tak voor
   *    groepsgenoten die bij bijna elke andere tabel wél bestaat en hier met
   *    opzet niet — een rooster met gaten is fijnmaziger tegenslag dan een
   *    gemiste week.
   */
  it(
    'een ander ziet er niets van, ook niet gericht',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME niet van jou', 1, 3);
      await vinkAf(week, 2);

      const db = gebruikerDb(f.buiten.token);

      const alles = await db.from('day_checkins').select('id').eq('weekly_goal_id', week);
      expect(alles.error).toBeNull();
      expect(alles.data).toEqual([]);

      const inbraak = await db
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: DAGEN[5] })
        .select('id');
      expect(inbraak.error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. Een afvinking valt binnen zijn eigen week
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Zonder deze toets is elk ritme-doel met één verzoek op plafond te
   *    zetten.** De datum moet van de client komen — alleen `shared/time` weet
   *    welke dag het is in zijn tijdzone — maar zeven willekeurige datums zijn
   *    geen week.
   *
   * ⚠️ Rood gemaakt door de trigger `day_checkins_binnen_de_cyclus` te droppen:
   *    een datum uit 2023 kwam er toen gewoon doorheen.
   */
  it(
    'weigert een datum buiten de zeven dagen van het weekdoel',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME buiten de week', 1, 3);

      const ervoor = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: '2024-02-04' })
        .select('id');
      expect(ervoor.error).not.toBeNull();

      const erna = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: '2024-02-12' })
        .select('id');
      expect(erna.error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De randen tellen wél mee. Een grens die zijn eigen eerste en laatste dag
   *    weigert, kost de gebruiker twee van de zeven dagen — en dat merk je pas
   *    als iemand op maandag begint.
   */
  it(
    'laat de eerste en de laatste dag van de week toe',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME de randen', 1, 3);

      const eerste = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: DAGEN[0] })
        .select('id');
      expect(eerste.error).toBeNull();

      const laatste = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: DAGEN[6] })
        .select('id');
      expect(laatste.error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De grendel tegen zeven keer dezelfde dag.** Zonder de unieke index is
   *    elk dagdoel met één knop op plafond te krijgen, en dat is geen randgeval
   *    maar het eerste wat een gebruiker per ongeluk doet met een dubbele tik.
   */
  it(
    'telt dezelfde dag maar één keer',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME dubbele tik', 1, 3);

      const eerste = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: DAGEN[2] })
        .select('id');
      expect(eerste.error).toBeNull();

      const tweede = await adminDb()
        .from('day_checkins')
        .insert({ weekly_goal_id: week, local_date: DAGEN[2] })
        .select('id');
      expect(tweede.error).not.toBeNull();

      const alles = await adminDb().from('day_checkins').select('id').eq('weekly_goal_id', week);
      expect(alles.data?.length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Bijwerken bestaat niet, en dat is geen omissie. Een afvinking heeft geen
   *    veld dat je kunt bijstellen; wél een `local_date` die je zou kunnen
   *    verzetten, en dat is precies de backdating die de trigger dichtzet.
   */
  it(
    'geeft de eigenaar geen UPDATE-recht op een afvinking',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME geen update', 1, 3);
      await vinkAf(week, 1);

      const db = gebruikerDb(f.eigenaar.token);
      const uit = await db
        .from('day_checkins')
        .update({ local_date: DAGEN[6] })
        .eq('weekly_goal_id', week)
        .select('id');

      expect(uit.error !== null || (uit.data ?? []).length === 0).toBe(true);

      const na = await adminDb()
        .from('day_checkins')
        .select('local_date')
        .eq('weekly_goal_id', week)
        .single();
      expect(na.data?.local_date).toBe(DAGEN[0]);
    },
    TEST_TIMEOUT,
  );

  /** De eigenaar mag hem wél weghalen — anders is een verkeerde tik permanent. */
  it(
    'laat de eigenaar een afvinking weghalen',
    async () => {
      const week = await maakRitmeWeek(f.goalId, 'RITME ongedaan', 1, 3);
      await vinkAf(week, 1);

      const db = gebruikerDb(f.eigenaar.token);
      const uit = await db
        .from('day_checkins')
        .delete()
        .eq('weekly_goal_id', week)
        .select('id');

      expect(uit.error).toBeNull();
      expect(uit.data?.length).toBe(1);
    },
    TEST_TIMEOUT,
  );
});
