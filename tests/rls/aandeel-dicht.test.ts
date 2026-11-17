import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';
import type { UserClock } from '../../src/shared/time';
import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een aandeel blijft van zijn eigenaar — QS8-661, criterium 6(d) en 6(f).
 *
 * ⚠️ **In een open teamgroep, en met een controle ernaast.** Bert heeft naast
 *    zijn aandeel een gewoon doel dat hij aan hetzelfde team koppelt. Daarvan
 *    ziet Cleo in een open groep wél de gemiste week (A41). Zonder die controle
 *    is een groep die niets laat zien net zo groen als een groep die precies
 *    het aandeel dichthoudt.
 *
 * ⚠️ **Per leesroute een toets op de naad**: de rij van het doel, de mijlpalen,
 *    de doelgebeurtenissen, de weekdoelen (beschermde én open tak), de
 *    voltooiingen, de wachtrij `openstaande_beoordelingen()`, en het
 *    klassement.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 17-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0303 opnieuw afgespeeld):
 *
 *    1. `and not is_aandeel_van_een_ander(g)` uit `shares_group_with_goal()` →
 *       rood op "ziet van het aandeel de rij niet…", "ziet een lopend weekdoel…"
 *       en "na de goedkeuring is het weer dicht".
 *    2. Dezelfde regel uit `deelt_open_groep_met_doel()` → eerst "ziet een gemist
 *       aandeel niet, ook niet in een open teamgroep" rood, daarna de toetsen die
 *       op de goedkeuring verder bouwen (die faalt dan op dezelfde vergelijking).
 *    3. De tak `aandeel_wacht_op_teamgenoot()` uit `goals_select` → eerst "ziet
 *       een wachtende voltooiing en kan hem goedkeuren" rood (de wachtrij mist de
 *       rij), daarna de twee toetsen die op die goedkeuring verder bouwen.
 *    4. De voorwaarde op `organization_id` uit `groep_klassement()` → alleen
 *       "geeft nooit een klassement in een teamgroep" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const KLOK: UserClock = { weekStartDay: 1, tz: 'Europe/Amsterdam' };

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string } | null;
}

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>): Promise<Antwoord> {
  const { data, error } = await wie.db.rpc(naam as never, args as never);
  return { data, error };
}

function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

function streefdatum(dagen: number): string {
  return new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
}

async function tel(wie: TestUser, tabel: string, kolom: string, waarde: string): Promise<number> {
  const { data, error } = await wie.db.from(tabel as never).select('id').eq(kolom as never, waarde as never);
  expect(error).toBeNull();
  return (data as unknown[]).length;
}

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('een aandeel blijft van zijn eigenaar (QS8-661)', () => {
  let anna: TestUser; // organisatiebeheerder
  let bert: TestUser; // aandeel én een gewoon gekoppeld doel
  let cleo: TestUser; // de teamgenoot die kijkt
  let team: string;
  let aandeel: string;
  let gewoon: string;
  let gemistAandeel: string;
  let gemistGewoon: string;

  async function weekdoel(doel: string, titel: string, status?: string, terug = 0): Promise<string> {
    const cyclus = userCycle(KLOK, new Date(Date.now() - terug * 7 * 86_400_000));
    const rij: Record<string, unknown> = {
      goal_id: doel,
      title: titel,
      points_ceiling: 2,
      points_floor: 1,
      points_miss: -1,
      cycle_start_date: cyclus.startDate,
    };
    if (status) rij.status = status;
    const { data, error } = await adminDb().from('weekly_goals').insert(rij as never).select('id').single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  beforeAll(async () => {
    [anna, bert, cleo] = await Promise.all([
      createTestUser('dicht-anna'),
      createTestUser('dicht-bert'),
      createTestUser('dicht-cleo'),
    ]);
    for (const wie of [bert, cleo]) {
      await adminDb()
        .from('profiles')
        .update({ week_start_day: KLOK.weekStartDay, tz: KLOK.tz } as never)
        .eq('id', wie.id);
    }
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Open Zaak' });
    const org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    }
    // Een OPEN teamgroep: sinds 0303 mag dat weer (besluit 18).
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Open Team', p_zichtbaarheid: 'open' });
    expect(uitkomst(t)).toBe('ok');
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code, zichtbaarheid').eq('id', team).single();
    expect((g as { zichtbaarheid: string }).zichtbaarheid).toBe('open');
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    }

    const td = await rpc(bert, 'maak_teamdoel', { p_group_id: team, p_titel: 'Kwartaal', p_streefdatum: streefdatum(90) });
    const teamdoel = (td.data as { team_goal_id: string }).team_goal_id;
    const a = await rpc(bert, 'neem_aandeel', { p_team_goal_id: teamdoel });
    expect(uitkomst(a)).toBe('ok');
    aandeel = (a.data as { goal_id: string }).goal_id;

    const { data: d } = await bert.db
      .from('goals')
      .insert({ owner_id: bert.id, title: 'Gewoon doel', target_date: streefdatum(90) } as never)
      .select('id')
      .single();
    gewoon = (d as { id: string }).id;
    expect((await bert.db.from('goal_group_links').insert({ goal_id: gewoon, group_id: team } as never)).error).toBeNull();

    for (const doel of [aandeel, gewoon]) {
      const { error } = await bert.db
        .from('milestones')
        .insert({ goal_id: doel, title: 'Stap', order_index: 1 } as never);
      expect(error).toBeNull();
    }
    gemistAandeel = await weekdoel(aandeel, 'Gemist aandeel', 'missed', 1);
    gemistGewoon = await weekdoel(gewoon, 'Gemist gewoon', 'missed', 1);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('team_goals' as never).delete().in('group_id' as never, groepen as never);
      await admin.from('group_join_requests').delete().in('group_id', groepen);
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    if (organisaties.length > 0) {
      await admin.from('organization_members' as never).delete().in('organization_id' as never, organisaties as never);
      await admin.from('organizations' as never).delete().in('id' as never, organisaties as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('controle: een gewoon gekoppeld doel is in een open teamgroep open, ook de gemiste week (A41)', async () => {
    expect(await tel(cleo, 'goals', 'id', gewoon)).toBe(1);
    expect(await tel(cleo, 'milestones', 'goal_id', gewoon)).toBe(1);
    expect(await tel(cleo, 'weekly_goals', 'id', gemistGewoon)).toBe(1);
  }, TEST_TIMEOUT);

  it('ziet van het aandeel de rij niet, de mijlpalen niet en de doelgebeurtenissen niet', async () => {
    expect(await tel(cleo, 'goals', 'id', aandeel)).toBe(0);
    expect(await tel(cleo, 'milestones', 'goal_id', aandeel)).toBe(0);
    expect(await tel(cleo, 'goal_events', 'goal_id', aandeel)).toBe(0);
    // De eigenaar zelf wel.
    expect(await tel(bert, 'goals', 'id', aandeel)).toBe(1);
    expect(await tel(bert, 'milestones', 'goal_id', aandeel)).toBe(1);
  }, TEST_TIMEOUT);

  it('ziet een gemist aandeel niet, ook niet in een open teamgroep (6f)', async () => {
    expect(await tel(cleo, 'weekly_goals', 'id', gemistAandeel)).toBe(0);
    expect(await tel(anna, 'weekly_goals', 'id', gemistAandeel)).toBe(0);
    expect(await tel(bert, 'weekly_goals', 'id', gemistAandeel)).toBe(1);
  }, TEST_TIMEOUT);

  it('ziet een lopend weekdoel van het aandeel niet: hoe ver een ander is, blijft van hem (6f)', async () => {
    const lopend = await weekdoel(aandeel, 'Lopende week');
    expect(await tel(cleo, 'weekly_goals', 'id', lopend)).toBe(0);
    expect(await tel(cleo, 'weekly_goals', 'goal_id', aandeel)).toBe(0);
  }, TEST_TIMEOUT);

  let wachtend: string;

  it('ziet een wachtende voltooiing en kan hem goedkeuren (besluit 5)', async () => {
    const week = await weekdoel(aandeel, 'Klaar om goed te keuren', undefined, 0);
    const { data: c, error } = await bert.db
      .from('completions')
      .insert({
        weekly_goal_id: week,
        user_id: bert.id,
        achieved_level: 'ceiling',
        note: 'Gedaan',
        cycle_start_date: userCycle(KLOK, new Date()).startDate,
      } as never)
      .select('id')
      .single();
    expect(error).toBeNull();
    wachtend = week;
    const completion = (c as { id: string }).id;

    // Het venster: precies dit weekdoel, zijn voltooiing en de rij van het doel.
    expect(await tel(cleo, 'weekly_goals', 'id', week)).toBe(1);
    expect(await tel(cleo, 'completions', 'id', completion)).toBe(1);
    expect(await tel(cleo, 'goals', 'id', aandeel)).toBe(1);
    expect(await tel(cleo, 'weekly_goals', 'id', gemistAandeel)).toBe(0);

    const { data: rij } = await cleo.db.rpc('openstaande_beoordelingen', { p_limit: 20 });
    expect((rij as { completion_id: string }[]).map((r) => r.completion_id)).toContain(completion);

    const g = await cleo.db.from('completion_approvals').insert({
      completion_id: completion,
      approver_id: cleo.id,
      subject_id: bert.id,
      group_id: team,
      status: 'approved',
    } as never);
    expect(g.error).toBeNull();
  }, TEST_TIMEOUT);

  it('na de goedkeuring is het weer dicht', async () => {
    const { data } = await adminDb().from('weekly_goals').select('status').eq('id', wachtend).single();
    expect((data as { status: string }).status).toBe('approved');
    expect(await tel(cleo, 'weekly_goals', 'id', wachtend)).toBe(0);
    expect(await tel(cleo, 'goals', 'id', aandeel)).toBe(0);
  }, TEST_TIMEOUT);

  it('geeft nooit een klassement in een teamgroep, ook niet in een open (6d)', async () => {
    // Na de goedkeuring staan er punten van bert op deze groep.
    const { data: punten } = await adminDb().from('points_ledger').select('delta').eq('group_id', team).eq('user_id', bert.id);
    expect((punten as unknown[]).length).toBeGreaterThan(0);
    const { data, error } = await cleo.db.rpc('groep_klassement', { p_group_id: team });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, TEST_TIMEOUT);
});
