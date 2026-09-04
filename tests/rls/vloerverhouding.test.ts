import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';

/**
 * De vloerverhouding telt teller en noemer over hetzelfde venster — QS8-271.
 *
 * ⚠️ **De belofte is domeinregel 8:** vloer gehaald betekent dat de week telt, en
 *    de reeks dient de gebruiker en nooit andersom. `herbereken_risico()` brak
 *    die belofte op de stilste manier die er is — door je te belónen met een
 *    waarschuwing.
 *
 * De noemer (`v_recent_goed`) telde cycli met `>= v_venster_start` **én**
 * `< v_vandaag`. De teller (`v_recent_vloer`) had alleen de ondergrens, en telde
 * bovendien `count(*)` over wéékdoelen waar de noemer `count(distinct
 * cycle_start_date)` over cycli telt. Twee fouten van dezelfde soort en allebei
 * één kant op, dus `v_vloerdeel` kon boven 1 uitkomen terwijl de drempel op 0,75
 * staat.
 *
 * ⚠️ **Waarom `risicoradar.test.ts` hem niet zag.** Die suite heeft zeven
 *    scenario's, maar zijn opbouwer zet elke cyclus in het verleden
 *    (`-7 * wekenTerug`, en `wekenTerug` is minstens 1). Er was dus nooit een
 *    voltooiing in de lópende cyclus, en `vloeraandeel` stond in geen enkele
 *    assertie. De tests toetsten een eigenschap van het ónderdeel; deze grens zat
 *    in de naad ertussen — regel 18, vraag 1.
 *
 * ## Twee tests, één per helft van de reparatie
 *
 * De eerste toetst de bovengrens, de tweede de eenheid. Ze staan los omdat een
 * rode test anders niet zegt wélke van de twee weg is.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Dezelfde klok als `herbereken_risico()`: die van de eigenaar. */
let eigenaarId = '';
let eigenDatum: IsoDate;

interface Reden {
  cycli_bekeken?: number;
  cycli_gehaald?: number;
  vloeraandeel?: number | null;
}

/**
 * Zet één cyclus neer: een weekdoel op `dag`, met een goedgekeurde voltooiing op
 * het gevraagde niveau.
 *
 * ⚠️ De volgorde is het hele punt, en die komt uit `risicoradar.test.ts`: een
 *    voltooiing invoegen zet het weekdoel via `mark_weekly_goal_pending()` op
 *    `pending`. Staat de rij meteen op `approved`, dan draait die trigger hem
 *    terug en meet de test iets anders dan hij denkt. Dus eerst `todo`, dan de
 *    voltooiing, dan de eindstatus.
 */
async function zetCyclus(
  goalId: string,
  dag: IsoDate,
  niveau: 'floor' | 'ceiling',
  titel: string,
): Promise<void> {
  const admin = adminDb();

  const week = await admin
    .from('weekly_goals')
    .insert({
      goal_id: goalId,
      title: titel,
      cycle_start_date: dag,
      cycle_index: 1,
      status: 'todo',
    })
    .select('id')
    .single();
  if (week.error || week.data === null) throw new Error(`weekdoel ${titel}: ${week.error?.message}`);

  const voltooiing = await admin.from('completions').insert({
    weekly_goal_id: week.data.id,
    user_id: eigenaarId,
    achieved_level: niveau,
    note: `Fixture ${titel}`,
    cycle_start_date: dag,
  });
  if (voltooiing.error) throw new Error(`voltooiing ${titel}: ${voltooiing.error.message}`);

  const bij = await admin.from('weekly_goals').update({ status: 'approved' }).eq('id', week.data.id);
  if (bij.error) throw new Error(`status ${titel}: ${bij.error.message}`);
}

/** Maakt een doel zonder mijlpalen en met een verre streefdatum. */
async function maakDoel(titel: string): Promise<string> {
  // ⚠️ Geen open mijlpalen en de streefdatum ver weg: anders wint een van de
  //    `unreachable`-takken, die bovenaan staan, en zegt de stand niets over de
  //    vloerverhouding.
  const doel = await adminDb()
    .from('goals')
    .insert({
      owner_id: eigenaarId,
      title: titel,
      target_date: addDays(eigenDatum, 200),
      status: 'active',
    })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);
  return doel.data.id;
}

/** Draait de radar en geeft stand plus onderbouwing terug. */
async function meet(goalId: string): Promise<{ stand: string; reden: Reden }> {
  const draai = await adminDb().rpc('herbereken_risico', { p_goal_id: goalId });
  if (draai.error) throw new Error(`herbereken_risico: ${draai.error.message}`);

  const rij = await adminDb()
    .from('goal_risk')
    .select('status, reason')
    .eq('goal_id', goalId)
    .single();
  if (rij.error || rij.data === null) throw new Error(`goal_risk: ${rij.error?.message}`);

  return { stand: rij.data.status as string, reden: (rij.data.reason ?? {}) as Reden };
}

describe.skipIf(!rlsTestsConfigured)('De vloerverhouding van de Risico-radar', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('vloerverhouding-eigenaar');
    eigenaarId = eigenaar.id;

    const profiel = await adminDb()
      .from('profiles')
      .select('tz')
      .eq('id', eigenaarId)
      .single();
    if (profiel.error || profiel.data === null) {
      throw new Error(`profiel: ${profiel.error?.message}`);
    }
    eigenDatum = localDateIn(profiel.data.tz as TimeZone, now());
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'telt de lopende cyclus niet mee in de teller',
    async () => {
      const goalId = await maakDoel('VLOER-LOPEND');

      // Drie afgesloten cycli: twee op de vloer, één op het plafond.
      // 2 / 3 = 0,667 en dat blijft onder de drempel van 0,75.
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');

      const voor = await meet(goalId);
      expect(voor.reden.cycli_gehaald, 'de opstelling telt drie afgesloten cycli').toBe(3);
      expect(voor.stand, 'zonder de lopende cyclus staat dit doel op koers').toBe('on_track');

      // ⚠️ **En nu de week van vandaag, gehaald op de vloer.** Dat is precies wat
      //    domeinregel 8 een geslaagde week noemt. De noemer telt hem niet mee
      //    (`< v_vandaag`); telde de teller hem wél, dan wordt 2/3 ineens 3/3.
      await zetCyclus(goalId, eigenDatum, 'floor', 'week 0');

      const na = await meet(goalId);

      expect(
        na.reden.cycli_gehaald,
        'de noemer hoort de lopende cyclus niet te tellen — die is nog niet af',
      ).toBe(3);

      expect(
        na.reden.vloeraandeel,
        'de lopende cyclus telde mee in de teller en niet in de noemer, dus het ' +
          'vloeraandeel sprong van 0,667 naar 1,0',
      ).toBeCloseTo(2 / 3, 5);

      expect(
        na.stand,
        'je vloer halen en goedgekeurd krijgen leverde een risicowaarschuwing op — ' +
          'domeinregel 8 zegt dat een gehaalde vloer een geslaagde week is',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'telt een cyclus met twee weekdoelen één keer',
    async () => {
      const goalId = await maakDoel('VLOER-DUBBEL');

      // ⚠️ Twee weekdoelen in dezelfde cyclus, allebei op de vloer. De noemer
      //    telt `distinct cycle_start_date` en ziet dus één cyclus; telde de
      //    teller `count(*)` over weekdoelen, dan telt deze week dubbel.
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3a');
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3b');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'drie cycli, ook al liggen er vier weekdoelen').toBe(3);

      expect(
        uit.reden.vloeraandeel,
        'de cyclus met twee weekdoelen telde dubbel in de teller: 3/3 in plaats van 2/3',
      ).toBeCloseTo(2 / 3, 5);

      expect(
        uit.stand,
        'twee weekdoelen in één week maakten van twee vloerweken er drie, en dat ' +
          'tilde het aandeel over de drempel',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );
});
