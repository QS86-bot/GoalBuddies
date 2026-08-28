import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Seizoenen per groep, met één recap — QS8-79 (PRD 8.5), migratie 0108.
 *
 * ⚠️ **Vier acceptatiecriteria, en drie ervan zijn hier te meten.** De cadans per
 *    groep staat in `seizoenen.test.ts` (dat is een lijst naast een CHECK); wat
 *    hier staat is het gedrag: één bericht, op het juiste moment, met alleen wat
 *    er wél gedaan is.
 *
 * ⚠️ **`maak_seizoensrecaps()` krijgt zijn moment als parameter mee.** Met een
 *    harde `now()` zou de timingtak — eerste dag van het seizoen, om 08:00 in de
 *    tijdzone van de gróép — alleen te toetsen zijn door tot 1 januari te
 *    wachten. Dat is een belofte die geen test kan raken (regel 18, vraag 3).
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  id: string;
  code: string;
}

/** 1 oktober 2026 om 08:30 in Amsterdam — de eerste dag van Q4. */
const EERSTE_DAG_Q4 = '2026-10-01T06:30:00Z';
/** Hetzelfde moment, maar dan middenin de nacht in Amsterdam. */
const NACHT_Q4 = '2026-10-01T01:30:00Z';
/** Tweede dag van het kwartaal, ook om 08:30 lokaal. */
const TWEEDE_DAG_Q4 = '2026-10-02T06:30:00Z';

/** Q3 2026 loopt van 1 juli tot en met 30 september. */
const Q3_START = '2026-07-01';
const Q3_EIND = '2026-09-30';

describe.skipIf(!rlsTestsConfigured)('QS8-79 — de seizoensrecap', () => {
  let alice: TestUser;
  let bob: TestUser;
  let groep: Groep;
  let stilleGroep: Groep;
  let doelId: string;

  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  async function maakGroep(naam: string): Promise<Groep> {
    const { data, error } = await alice.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    return { id: g.group.id, code: g.group.invite_code };
  }

  async function recapsIn(g: Groep): Promise<number> {
    const { count } = await adminDb()
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', g.id)
      .eq('system_event', 'season_recap');
    return count ?? 0;
  }

  async function draai(op: string): Promise<{ recaps: number; stil: number }> {
    const { data, error } = await adminDb().rpc('maak_seizoensrecaps', { p_op: op });
    if (error) throw new Error(`recaps draaien: ${error.message}`);
    return data as unknown as { recaps: number; stil: number };
  }

  beforeAll(async () => {
    alice = await createTestUser('recap-alice');
    bob = await createTestUser('recap-bob');

    groep = await maakGroep('Recap-actief');
    stilleGroep = await maakGroep('Recap-stil');

    const mee = await bob.db.rpc('join_group_with_code', { code: groep.code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    const admin = adminDb();

    // ⚠️ Beide groepen op Amsterdam, zodat de tijdzone in de tests een constante
    //    is en niet een tweede variabele. De tijdzone zelf wordt apart getoetst.
    const tz = await admin
      .from('groups')
      .update({ tz: 'Europe/Amsterdam', season_cadence: 'quarterly' })
      .in('id', [groep.id, stilleGroep.id]);
    if (tz.error) throw new Error(`tijdzone zetten: ${tz.error.message}`);

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Seizoensdoel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;

    const link = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: groep.id });
    if (link.error) throw new Error(`koppeling: ${link.error.message}`);

    // Twee afgeronde weken ín Q3, en één ver ervóór — die laatste hoort niet mee
    // te tellen en is de enige manier om te zien dat het venster echt werkt.
    const weken: readonly (readonly [string, string])[] = [
      ['1', '2026-07-06'],
      ['2', '2026-08-10'],
      // ⚠️ Ver vóór het seizoen. Dit is de enige rij die bewijst dat het venster
      //    echt afkapt; zonder hem zou "twee weken" ook kloppen bij een telling
      //    die alles meeneemt.
      ['3', '2026-04-06'],
    ];

    for (const [i, start] of weken) {
      const w = await admin.from('weekly_goals').insert({
        goal_id: doelId,
        title: `week ${i}`,
        cycle_start_date: start,
        cycle_index: Number(i),
        status: 'approved',
      });
      if (w.error) throw new Error(`weekdoel ${i}: ${w.error.message}`);
    }

    // Eén schakel in Q3, één erbuiten.
    for (const periode of [Q3_START, '2026-04-06']) {
      const c = await admin.from('chain_links').insert({
        group_id: groep.id,
        user_id: alice.id,
        group_period_start: periode,
      });
      if (c.error) throw new Error(`schakel ${periode}: ${c.error.message}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goals').delete().eq('id', doelId);
    await admin.from('groups').delete().in('id', [groep.id, stilleGroep.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ Acceptatiecriterium 3, en de reden dat de job elk uur draait in plaats van
   *    één keer per dag. Zonder deze toets komt de recap op het moment dat de
   *    kalender omslaat — middenin de nacht.
   */
  it(
    'zwijgt buiten 08:00 en op elke dag behalve de eerste',
    async () => {
      expect((await draai(NACHT_Q4)).recaps, 'de nacht leverde een recap op').toBe(0);
      expect((await draai(TWEEDE_DAG_Q4)).recaps, 'de tweede dag leverde er een op').toBe(0);
      expect(await recapsIn(groep)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'plaatst op de eerste dag om 08:00 één bericht met de cijfers van dat seizoen',
    async () => {
      const admin = adminDb();
      expect((await draai(EERSTE_DAG_Q4)).recaps).toBeGreaterThan(0);

      const { data } = await admin
        .from('chat_messages')
        .select('payload, subject_id, actor_id, body')
        .eq('group_id', groep.id)
        .eq('system_event', 'season_recap');

      expect(data?.length, 'niet precies één bericht').toBe(1);

      const lading = data?.[0]?.payload as Record<string, number> | null;
      // Twee weken ín Q3; de week van april telt niet mee.
      expect(lading?.weken, 'het venster telde buiten het seizoen mee').toBe(2);
      expect(lading?.mijlpalen).toBe(0);
      expect(lading?.schakels, 'de schakel van april telde mee').toBe(1);

      // ⚠️ Domeinregel 7: een recap is van de groep en noemt niemand.
      expect(data?.[0]?.subject_id, 'de recap noemt een persoon').toBeNull();
      expect(data?.[0]?.actor_id, 'de recap noemt een actor').toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Acceptatiecriterium 2. Habit Huddle heeft losse recap-berichten moeten
   *    terugdraaien; de primaire sleutel op `season_recaps` ís hier de belofte.
   */
  it(
    'plaatst er geen tweede als de job nog een keer langskomt',
    async () => {
      expect((await draai(EERSTE_DAG_Q4)).recaps).toBe(0);
      expect(await recapsIn(groep), 'er kwam een tweede recap bij').toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **"Jullie hebben samen 0 weken afgerond" is een tegenslagbericht met een
   *    vrolijke kop erop.** In een stille groep zwijgt de recap.
   */
  it(
    'zwijgt in een groep waar niets gebeurd is',
    async () => {
      // De vorige test heeft de job al op dit moment gedraaid; de stille groep
      // hoorde daar toen al niets van te krijgen.
      expect(await recapsIn(stilleGroep), 'de stille groep kreeg een recap').toBe(0);

      const { count } = await adminDb()
        .from('season_recaps')
        .select('group_id', { count: 'exact', head: true })
        .eq('group_id', stilleGroep.id);
      expect(count, 'er staat een rij voor een seizoen dat nooit verstuurd is').toBe(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tijdzone van de gróép, niet van de server. Om 06:30 UTC is het 08:30 in
   *    Amsterdam en 15:30 in Tokio — dus dezelfde job hoort daar te zwijgen.
   */
  it(
    'rekent 08:00 in de tijdzone van de groep en niet die van de server',
    async () => {
      const { data, error } = await adminDb().rpc('seizoensgrens', {
        p_tz: 'Asia/Tokyo',
        p_cadence: 'quarterly',
        p_op: EERSTE_DAG_Q4,
      });
      if (error) throw new Error(`grens lezen: ${error.message}`);

      const rij = (data ?? [])[0] as
        | { season_start: string; season_end: string; is_eerste_dag: boolean; is_acht_uur: boolean }
        | undefined;

      expect(rij?.is_eerste_dag, 'Tokio zat niet op de eerste dag').toBe(true);
      expect(rij?.is_acht_uur, 'het was 15:30 in Tokio en de toets zei acht uur').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'kent het seizoen dat net afgelopen is, voor beide cadansen',
    async () => {
      const admin = adminDb();

      const kwartaal = await admin.rpc('seizoensgrens', {
        p_tz: 'Europe/Amsterdam',
        p_cadence: 'quarterly',
        p_op: EERSTE_DAG_Q4,
      });
      if (kwartaal.error) throw new Error(kwartaal.error.message);
      expect((kwartaal.data ?? [])[0]).toMatchObject({
        season_start: Q3_START,
        season_end: Q3_EIND,
      });

      const maand = await admin.rpc('seizoensgrens', {
        p_tz: 'Europe/Amsterdam',
        p_cadence: 'monthly',
        p_op: EERSTE_DAG_Q4,
      });
      if (maand.error) throw new Error(maand.error.message);
      expect((maand.data ?? [])[0]).toMatchObject({
        season_start: '2026-09-01',
        season_end: '2026-09-30',
      });
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De job plaatst berichten in groepschats. Een ingelogde gebruiker die hem
   *    kan aanroepen, laat de hele boel afgaan wanneer het hem uitkomt.
   */
  it(
    'is voor een gewone gebruiker niet aanroepbaar',
    async () => {
      const { error } = await alice.db.rpc('maak_seizoensrecaps', { p_op: EERSTE_DAG_Q4 });
      expect(error, 'een gewoon lid mocht de recap-job draaien').not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand zijn eigen seizoenscijfers schrijven',
    async () => {
      const admin = adminDb();
      const lees = () => admin.from('season_recaps').select('weken').eq('group_id', groep.id);

      await magNietLanden(
        () => alice.db.from('season_recaps').update({ weken: 999 }).eq('group_id', groep.id),
        lees,
      );
      await magNietLanden(
        () => alice.db.from('season_recaps').delete().eq('group_id', groep.id),
        lees,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest: lézen mag wél, anders bewijst de vorige alleen dat de tabel
   *    onbereikbaar is. Een lid hoort zijn eigen seizoenen te kunnen terugzien.
   */
  it(
    'laat een lid de cijfers van zijn eigen groep wél lezen',
    async () => {
      const { data, error } = await bob.db
        .from('season_recaps')
        .select('weken, mijlpalen, schakels')
        .eq('group_id', groep.id);

      if (error) throw new Error(`lezen: ${error.message}`);
      expect(data?.[0]).toMatchObject({ weken: 2, mijlpalen: 0, schakels: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de seizoenen van een groep waar je niet in zit dicht',
    async () => {
      // Alice zit wél in `stilleGroep` (ze maakte hem), dus bob is de kijker.
      const { data, error } = await bob.db
        .from('season_recaps')
        .select('weken')
        .eq('group_id', stilleGroep.id);

      if (error) throw new Error(`lezen: ${error.message}`);
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
