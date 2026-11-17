import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De teambalk telt alleen op — QS8-655, criterium 6(b) en 6(c).
 *
 * ⚠️ **Over het echte teampad**: organisatie, teamgroep, uitnodigingscode,
 *    `maak_teamdoel()`, `neem_aandeel()`, en dan een mijlpaal op het aandeel die
 *    de eigenaar zelf op gedaan zet. Mijlpaal, aandeel, koppeling en teller zijn
 *    elk apart correct; "de balk daalt nooit en zegt niets over een persoon" is
 *    een eigenschap van hun naad.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 17-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0302 opnieuw afgespeeld):
 *
 *    1. `on conflict … do nothing` vervangen door een kale insert zonder de
 *       UNIQUE → eerst "telt een mijlpaal één keer, ook als hij heen en weer
 *       gaat" rood, en daarna de vier tests die op die telling verder bouwen.
 *    2. De diepte-uitzondering voor een DELETE weg → alleen "gaat mee weg met
 *       het teamdoel zelf" rood.
 *    3. De hele trigger `team_progress_events_alleen_erbij` weg → "weigert een
 *       rechtstreekse wijziging, ook van service_role" rood.
 *    4. De join op `goal_group_links` uit `tel_teammijlpaal()` → alleen "telt
 *       na vertrek niets meer bij" rood.
 *    5. `mag_groep_lezen()` uit `teambalk()` → alleen "geeft wie het teamdoel
 *       niet mag lezen null" rood.
 *    6. Trigger `milestones_geteld_blijft` weg → alleen "laat een getelde
 *       mijlpaal niet rechtstreeks verwijderen" rood.
 *    7. Trigger `team_progress_events_niet_leeg` weg én de TRUNCATE terug aan
 *       `service_role` → alleen "laat service_role de teller niet leegmaken" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const NERGENS = '00000000-0000-4000-8000-000000000000';

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

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'team_progress_events'",
  import.meta.url,
);

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('de teambalk telt alleen op (QS8-655)', () => {
  let anna: TestUser; // organisatiebeheerder, geen lid van het team
  let bert: TestUser;
  let cleo: TestUser;
  let zoe: TestUser; // in geen enkele organisatie
  let org: string;
  let team: string;
  let teamdoel: string;
  const aandeel: Record<string, string> = {};

  beforeAll(async () => {
    [anna, bert, cleo, zoe] = await Promise.all([
      createTestUser('balk-anna'),
      createTestUser('balk-bert'),
      createTestUser('balk-cleo'),
      createTestUser('balk-zoe'),
    ]);
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Balk BV' });
    expect(o.error).toBeNull();
    org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    }
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Team Balk' });
    expect(uitkomst(t)).toBe('ok');
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    }
    const td = await rpc(bert, 'maak_teamdoel', { p_group_id: team, p_titel: 'Samen', p_streefdatum: streefdatum(90) });
    expect(uitkomst(td)).toBe('ok');
    teamdoel = (td.data as { team_goal_id: string }).team_goal_id;
    for (const wie of [bert, cleo]) {
      const a = await rpc(wie, 'neem_aandeel', { p_team_goal_id: teamdoel });
      expect(uitkomst(a)).toBe('ok');
      aandeel[wie.id] = (a.data as { goal_id: string }).goal_id;
    }
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

  async function balk(wie: TestUser, id = teamdoel): Promise<unknown> {
    const { data, error } = await wie.db.rpc('teambalk' as never, { p_team_goal_id: id } as never);
    expect(error).toBeNull();
    return data;
  }

  // ⚠️ Een eigen volgnummer per mijlpaal: `order_index` is uniek per doel, en
  //    sinds de grendel van review H1 blijft een getelde mijlpaal staan.
  let volgnummer = 10;
  async function mijlpaal(wie: TestUser, titel: string): Promise<string> {
    volgnummer += 1;
    const { data, error } = await wie.db
      .from('milestones')
      .insert({ goal_id: aandeel[wie.id], title: titel, order_index: volgnummer } as never)
      .select('id')
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  async function zet(wie: TestUser, id: string, status: 'done' | 'todo'): Promise<void> {
    const { error } = await wie.db.from('milestones').update({ status } as never).eq('id', id);
    expect(error).toBeNull();
  }

  let bertsEerste: string;

  it('begint op nul en telt elke eerste keer gedaan', async () => {
    expect(await balk(bert)).toBe(0);
    bertsEerste = await mijlpaal(bert, 'Eerste stap');
    await zet(bert, bertsEerste, 'done');
    expect(await balk(cleo)).toBe(1);
    await zet(cleo, await mijlpaal(cleo, 'Mijn stap'), 'done');
    expect(await balk(bert)).toBe(2);
  }, TEST_TIMEOUT);

  it('telt een mijlpaal één keer, ook als hij heen en weer gaat (6c)', async () => {
    await zet(bert, bertsEerste, 'todo');
    expect(await balk(cleo)).toBe(2);
    await zet(bert, bertsEerste, 'done');
    expect(await balk(cleo)).toBe(2);
  }, TEST_TIMEOUT);

  it('blijft gelijk na een gemiste week (6c)', async () => {
    const vorige = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date(Date.now() - 7 * 86_400_000));
    const w = await adminDb().from('weekly_goals').insert({
      goal_id: aandeel[cleo.id]!,
      title: 'Gemiste week',
      points_ceiling: 2,
      points_floor: 1,
      points_miss: -1,
      cycle_start_date: vorige.startDate,
      status: 'missed',
    });
    expect(w.error).toBeNull();
    expect(await balk(bert)).toBe(2);
  }, TEST_TIMEOUT);

  it('geeft wie het teamdoel niet mag lezen null, net als een verzonnen id', async () => {
    expect(await balk(anna)).toBeNull();
    expect(await balk(zoe)).toBeNull();
    expect(await balk(bert, NERGENS)).toBeNull();
  }, TEST_TIMEOUT);

  it('is niet rechtstreeks leesbaar: geen persoon, geen tijdstip', async () => {
    const { error } = await bert.db.from('team_progress_events' as never).select('team_goal_id');
    expect(error?.code).toBe('42501');
  }, TEST_TIMEOUT);

  it('weigert een rechtstreekse wijziging, ook van service_role', async () => {
    const admin = adminDb();
    const upd = await admin
      .from('team_progress_events' as never)
      .update({ milestone_id: null } as never)
      .eq('team_goal_id' as never, teamdoel as never);
    expect(upd.error?.code).toBe('23514');
    const del = await admin.from('team_progress_events' as never).delete().eq('team_goal_id' as never, teamdoel as never);
    expect(del.error?.code).toBe('23514');
    expect(await balk(bert)).toBe(2);
  }, TEST_TIMEOUT);

  it('laat een getelde mijlpaal niet rechtstreeks verwijderen, ook niet na dropped (review H1)', async () => {
    // De lus van de review: aanmaken, gedaan, weggooien, opnieuw. Zonder deze
    // grendel liet elke ronde een rij achter en steeg de balk zonder grens.
    const id = await mijlpaal(bert, 'Lus');
    await zet(bert, id, 'done');
    expect(await balk(cleo)).toBe(3);
    const weg = await bert.db.from('milestones').delete().eq('id', id);
    expect(weg.error?.code).toBe('23514');
    const { error } = await bert.db.from('milestones').update({ status: 'dropped' } as never).eq('id', id);
    expect(error).toBeNull();
    const nogEens = await bert.db.from('milestones').delete().eq('id', id);
    expect(nogEens.error?.code).toBe('23514');
    // Een mijlpaal die nooit geteld is, gaat gewoon weg.
    const los = await mijlpaal(bert, 'Nooit gedaan');
    expect((await bert.db.from('milestones').delete().eq('id', los)).error).toBeNull();
    expect(await balk(cleo)).toBe(3);
  }, TEST_TIMEOUT);

  it.runIf(beschikbaar)('laat service_role de teller niet leegmaken met TRUNCATE (review L1)', () => {
    const uit = psqlMetInvoer(`
      begin;
      set local role service_role;
      do $$ begin
        truncate public.team_progress_events;
        perform set_config('ijk.uitkomst', 'geleegd', true);
      exception when others then
        perform set_config('ijk.uitkomst', sqlstate, true);
      end $$;
      select 'UITKOMST|' || current_setting('ijk.uitkomst');
      rollback;`);
    expect(uit.split('\n').find((r) => r.startsWith('UITKOMST|'))).toMatch(/^UITKOMST\|(42501|23514)$/);
  }, TEST_TIMEOUT);

  it('telt na vertrek niets meer bij, en houdt wat er was', async () => {
    expect(uitkomst(await rpc(cleo, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
    // De koppeling is weg (vertrek-cascade, 0300); een mijlpaal op haar eigen
    // doel is niet meer van het team.
    const { data } = await adminDb()
      .from('milestones')
      .insert({ goal_id: aandeel[cleo.id]!, title: 'Na vertrek', order_index: 1, status: 'done' })
      .select('id');
    expect((data as unknown[]).length).toBe(1);
    expect(await balk(bert)).toBe(3);
  }, TEST_TIMEOUT);

  it('staat niet in de realtime-publicatie en heeft geen REPLICA IDENTITY FULL (6b)', async () => {
    const { data, error } = await adminDb().rpc('realtime_bewaking');
    expect(error).toBeNull();
    const rijen = (data as { tabel: string; in_publicatie: boolean; replica_identity: string }[]).filter((r) =>
      ['team_progress_events', 'team_goals', 'team_goal_shares'].includes(r.tabel),
    );
    expect(rijen.map((r) => r.tabel).sort()).toEqual(['team_goal_shares', 'team_goals', 'team_progress_events']);
    for (const r of rijen) {
      expect(r.in_publicatie, r.tabel).toBe(false);
      expect(r.replica_identity, r.tabel).not.toBe('full');
    }
  }, TEST_TIMEOUT);

  it('gaat mee weg met het teamdoel zelf', async () => {
    const td = await rpc(bert, 'maak_teamdoel', { p_group_id: team, p_titel: 'Weg', p_streefdatum: streefdatum(30) });
    const id = (td.data as { team_goal_id: string }).team_goal_id;
    const { data: g } = await adminDb().from('goals').insert({ owner_id: bert.id, title: 'Los', target_date: streefdatum(30) }).select('id').single();
    const doel = (g as { id: string }).id;
    await adminDb().from('team_goal_shares' as never).insert({ goal_id: doel, team_goal_id: id } as never);
    await adminDb().from('goal_group_links').insert({ goal_id: doel, group_id: team });
    await adminDb().from('milestones').insert({ goal_id: doel, title: 'Klaar', order_index: 0, status: 'done' });
    expect(await balk(bert, id)).toBe(1);
    // Het doel verdwijnt (zoals bij een accountverwijdering): de mijlpaal gaat
    // via de cascade mee, de rij blijft met een lege mijlpaal, de balk daalt niet.
    expect((await adminDb().from('goals').delete().eq('id', doel)).error).toBeNull();
    expect(await balk(bert, id)).toBe(1);
    const weg = await adminDb().from('team_goals' as never).delete().eq('id' as never, id as never);
    expect(weg.error).toBeNull();
    expect(await balk(bert, id)).toBeNull();
  }, TEST_TIMEOUT);
});
