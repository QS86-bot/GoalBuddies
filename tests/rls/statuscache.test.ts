/**
 * `weekly_goals.status` is een cache, en caches lopen stil uit de pas.
 *
 * ⚠️ **De bevinding van 15-08 vroeg hier twee dingen om en had er nul.**
 *    `docs/decisions/001-datamodel.md` legt vast dat `status` een denormalisatie
 *    is van `completions` plus `completion_approvals` — bewust, zodat een
 *    lijstscherm niet per weekdoel twee tabellen hoeft te bevragen. Wat ontbrak
 *    was een herstelweg en een toets die de cache tegen de gebeurtenissen aan
 *    houdt. Loopt hij uit de pas, dan gaat er niets kapot: geen policy weigert
 *    iets, geen test wordt rood, en het scherm laat alleen iets anders zien dan
 *    er gebeurd is.
 *
 * ⚠️ **Drie van de zeven statussen zijn afleidbaar, en die grens is het punt.**
 *    `todo`, `pending` en `approved` volgen uit de gebeurtenissen. `missed`,
 *    `carried`, `excused` en `cancelled` komen van de rollover, een weekpas,
 *    doorschuiven of de gebruiker zelf, en zijn nergens uit te herleiden. Een
 *    controle die ze tóch beoordeelt, meldt elke gemiste week als drift — en
 *    dan leer je hem te negeren. Die blinde vlek is bewust, en hij staat
 *    hieronder ook als test: een `missed` mag níét meegenomen worden.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Afwijking {
  weekly_goal_id: string;
  opgeslagen: string;
  verwacht: string;
}

describe.skipIf(!rlsTestsConfigured)('De statuscache tegen de gebeurtenissen', () => {
  let alice: TestUser;
  let weekdoelId: string;
  let cyclusStart: string;

  /**
   * De afwijkingen van **dit** weekdoel.
   *
   * ⚠️ **Bewust gefilterd, en dat is geen zwakkere test maar de juiste.**
   *    `weekdoelstatus_afwijkingen()` leest de héle database, en andere suites
   *    in dezelfde stack zetten `weekly_goals.status` rechtstreeks met de
   *    admin-client zonder een voltooiing erbij — `besluiten.test.ts` en
   *    `policies.test.ts` doen dat allebei, en dat ís drift volgens de definitie
   *    hierboven. Een assertie op de globale lijst hangt daarmee af van de
   *    volgorde waarin vitest de bestanden draait: hij slaagt of faalt naar
   *    gelang wiens `afterAll` al gelopen heeft.
   *
   *    Dat is precies het soort test dat je één keer geel ziet en daarna
   *    wegklikt. De belofte die hier hoort is "de cache van dít weekdoel volgt de
   *    gebeurtenissen"; de globale nul is een auditvraag en staat als stap in
   *    `/audit`.
   */
  async function afwijkingen(): Promise<Afwijking[]> {
    const { data, error } = await adminDb().rpc('weekdoelstatus_afwijkingen');
    if (error) throw new Error(`afwijkingen lezen: ${error.message}`);
    return ((data ?? []) as Afwijking[]).filter((a) => a.weekly_goal_id === weekdoelId);
  }

  async function statusVan(id: string): Promise<string | null> {
    const { data } = await adminDb().from('weekly_goals').select('status').eq('id', id).single();
    return data?.status ?? null;
  }

  /** Zet de cache met opzet uit de pas — alleen de admin kan dat. */
  async function zetStatus(id: string, status: string): Promise<void> {
    const { error } = await adminDb().from('weekly_goals').update({ status }).eq('id', id);
    if (error) throw new Error(`status zetten: ${error.message}`);
  }

  beforeAll(async () => {
    alice = await createTestUser('statuscache-alice');
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
    cyclusStart = cyclus.startDate;

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'CACHEDOEL', target_date: addDays(cyclus.startDate, 60) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const weekdoel = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'CACHEWEEKDOEL',
        cycle_start_date: cyclus.startDate,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (weekdoel.error || weekdoel.data === null) throw new Error(`weekdoel: ${weekdoel.error?.message}`);
    weekdoelId = weekdoel.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'meldt niets zolang de cache klopt',
    async () => {
      // De positieve controle. Zonder deze is een functie die altijd niets
      // teruggeeft net zo groen als een functie die werkt.
      expect(await statusVan(weekdoelId)).toBe('todo');
      expect(await afwijkingen()).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'ziet een cache die te ver vooruit staat',
    async () => {
      // Er is geen enkele voltooiing, en de cache zegt `approved`. Dit is de
      // richting die het duurst is: het scherm meldt een afgeronde week die
      // nooit heeft plaatsgevonden.
      await zetStatus(weekdoelId, 'approved');

      const uit = await afwijkingen();

      expect(uit).toHaveLength(1);
      expect(uit[0]?.weekly_goal_id).toBe(weekdoelId);
      expect(uit[0]?.opgeslagen).toBe('approved');
      expect(uit[0]?.verwacht).toBe('todo');
    },
    TEST_TIMEOUT,
  );

  it(
    'zet hem terug, en telt hoeveel',
    async () => {
      // ⚠️ Geen assertie op het áántal: `herstel_weekdoelstatus()` repareert de
      //    hele database en andere suites laten drift achter. Wat deze test
      //    bezit is de status van dít weekdoel.
      const { error } = await adminDb().rpc('herstel_weekdoelstatus');

      expect(error).toBeNull();
      expect(await statusVan(weekdoelId)).toBe('todo');
      expect(await afwijkingen()).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'volgt een echte voltooiing naar `pending`',
    async () => {
      const { error } = await alice.db.from('completions').insert({
        weekly_goal_id: weekdoelId,
        user_id: alice.id,
        achieved_level: 'ceiling',
        cycle_start_date: cyclusStart,
      });

      expect(error).toBeNull();
      // De trigger `mark_weekly_goal_pending` doet dit; de controle hoort het
      // eens te zijn met wat er gebeurd is.
      expect(await statusVan(weekdoelId)).toBe('pending');
      expect(await afwijkingen()).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'ziet een cache die achterloopt op een voltooiing',
    async () => {
      // De andere richting: er ís iets gedaan en het scherm toont het niet.
      await zetStatus(weekdoelId, 'todo');

      const uit = await afwijkingen();

      expect(uit).toHaveLength(1);
      expect(uit[0]?.verwacht).toBe('pending');

      await adminDb().rpc('herstel_weekdoelstatus');
      expect(await statusVan(weekdoelId)).toBe('pending');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een bestuurlijke status met rust — de bewuste blinde vlek',
    async () => {
      // ⚠️ De helft die je vergeet te bouwen, en zonder welke deze controle
      //    onbruikbaar is. Een gemiste week heeft een levende voltooiing noch
      //    een goedkeuring, dus "verwacht" zou `todo` zeggen — en dan meldt de
      //    controle élke gemiste week als drift, en repareert `herstel` ze
      //    stilletjes weg. Dat is erger dan geen controle.
      await zetStatus(weekdoelId, 'missed');

      expect(await afwijkingen()).toEqual([]);

      await adminDb().rpc('herstel_weekdoelstatus');
      expect(await statusVan(weekdoelId)).toBe('missed');
    },
    TEST_TIMEOUT,
  );
});
