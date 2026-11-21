import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een aandeel in een teamdoel is niet weg te gooien, alleen los te koppelen — QS8-772, 0332.
 *
 * ⚠️ **De belofte is de lus en niet de weigering.** `neem_aandeel()` → mijlpalen op `done` →
 *    ontkoppelen → `verwijder_doel()` → opnieuw nemen was elk onderdeel correct en samen
 *    onbeperkt op te blazen (de plafonds tellen alleen rijen die nog bestaan). Daarom speelt
 *    deze test de lus na over het echte teampad en eindigt hij op de teller: die hoort niet te
 *    zijn gegroeid door een tweede ronde.
 *
 * ⚠️ **Beide kanten.** Een weigering die alles weigert is niets waard: een gewoon doel binnen
 *    de bedenktijd moet nog steeds weg kunnen, en loskoppelen van het aandeel ook.
 *
 * Breek de grendel met de hand: haal het blok `is_aandeel` uit `verwijder_doel()` (0190) en
 * "weigert een aandeel, ook nadat het is losgekoppeld" wordt rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;

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

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('een aandeel is niet weg te gooien (QS8-772)', () => {
  let anna: TestUser;
  let bert: TestUser;
  let org: string;
  let team: string;
  let teamdoel: string;
  let aandeel: string;

  beforeAll(async () => {
    [anna, bert] = await Promise.all([createTestUser('weg-anna'), createTestUser('weg-bert')]);
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Weg BV' });
    expect(o.error).toBeNull();
    org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    expect(uitkomst(await rpc(bert, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Team Weg' });
    expect(uitkomst(t)).toBe('ok');
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    expect(uitkomst(await rpc(bert, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    const td = await rpc(bert, 'maak_teamdoel', { p_group_id: team, p_titel: 'Samen', p_streefdatum: streefdatum(90) });
    expect(uitkomst(td)).toBe('ok');
    teamdoel = (td.data as { team_goal_id: string }).team_goal_id;
    const a = await rpc(bert, 'neem_aandeel', { p_team_goal_id: teamdoel });
    expect(uitkomst(a)).toBe('ok');
    aandeel = (a.data as { goal_id: string }).goal_id;
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

  async function balk(): Promise<unknown> {
    const { data, error } = await bert.db.rpc('teambalk' as never, { p_team_goal_id: teamdoel } as never);
    expect(error).toBeNull();
    return data;
  }

  it('weigert een aandeel, ook nadat het is losgekoppeld, en de teller blijft staan', async () => {
    const m = await bert.db
      .from('milestones')
      .insert({ goal_id: aandeel, title: 'Stap', order_index: 1 } as never)
      .select('id')
      .single();
    expect(m.error).toBeNull();
    const id = (m.data as { id: string }).id;
    expect((await bert.db.from('milestones').update({ status: 'done' } as never).eq('id', id)).error).toBeNull();
    const voor = await balk();
    expect(voor).toBe(1);

    // Stap 3 van de lus: loskoppelen van de teamgroep.
    const los = await bert.db.from('goal_group_links').delete().eq('goal_id', aandeel).eq('group_id', team).select();
    expect(los.error).toBeNull();
    expect((los.data ?? []).length, 'loskoppelen deed niets (RLS geeft dan ook geen fout)').toBe(1);

    // Stap 4: weggooien. Dit is de handeling die dichtmoet.
    const weg = await rpc(bert, 'verwijder_doel', { p_goal_id: aandeel });
    expect(uitkomst(weg), 'het aandeel is na het loskoppelen weg te gooien: de lus is open').toBe('is_aandeel');

    const nog = await adminDb().from('goals').select('id').eq('id', aandeel);
    expect((nog.data ?? []).length, 'het aandeel is toch verdwenen').toBe(1);
    // Een tweede neem_aandeel levert geen tweede ronde op: het eerste aandeel bestaat nog.
    expect(uitkomst(await rpc(bert, 'neem_aandeel', { p_team_goal_id: teamdoel }))).toBe('al_aandeel');
    expect(await balk()).toBe(voor);
  }, TEST_TIMEOUT);

  it('laat een gewoon doel binnen de bedenktijd wel weggooien', async () => {
    const g = await bert.db
      .from('goals')
      .insert({ owner_id: bert.id, title: 'Per ongeluk', target_date: streefdatum(30) } as never)
      .select('id')
      .single();
    expect(g.error).toBeNull();
    const doel = (g.data as { id: string }).id;
    expect(uitkomst(await rpc(bert, 'verwijder_doel', { p_goal_id: doel }))).toBe('ok');
  }, TEST_TIMEOUT);
});
