import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Twee systeemberichten voor teams — QS8-656, criterium 11.
 *
 * ⚠️ **Over het echte pad**: een teamdoel via `maak_teamdoel()`, en het bericht
 *    dat de trigger daarop plaatst, gelezen door een teamlid via PostgREST.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 18-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0304 opnieuw afgespeeld):
 *
 *    1. `team_goal_created` uit de CHECK → "plaatst bij een nieuw teamdoel één
 *       bericht" rood (`plaats_systeembericht()` slikt de fout en waarschuwt; het
 *       teamdoel ontstaat wel, het bericht niet), en daardoor ook "noemt geen
 *       titel en geen persoon", dat dan niets te lezen heeft.
 *    2. De CHECK helemaal weg → alleen "weigert een onbekend type, ook voor
 *       service_role" rood.
 *    3. In `meld_teamdoel()` de titel als `body` en de aanmaker als subject →
 *       alleen "noemt geen titel en geen persoon" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const TITEL = 'Geheime kwartaaltitel QS8-656';

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

const organisaties: string[] = [];
const groepen: string[] = [];

interface Bericht {
  readonly system_event: string | null;
  readonly body: string;
  readonly subject_id: string | null;
  readonly actor_id: string | null;
  readonly payload: unknown;
}

describe.runIf(rlsTestsConfigured)('twee systeemberichten voor teams (QS8-656)', () => {
  let anna: TestUser; // organisatiebeheerder, geen lid
  let bert: TestUser;
  let cleo: TestUser;
  let team: string;

  beforeAll(async () => {
    [anna, bert, cleo] = await Promise.all([
      createTestUser('tbericht-anna'),
      createTestUser('tbericht-bert'),
      createTestUser('tbericht-cleo'),
    ]);
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Bericht BV' });
    const org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    }
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Team Bericht' });
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    }
    const td = await rpc(bert, 'maak_teamdoel', {
      p_group_id: team,
      p_titel: TITEL,
      p_streefdatum: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(uitkomst(td)).toBe('ok');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('team_goals' as never).delete().in('group_id' as never, groepen as never);
      await admin.from('chat_messages').delete().in('group_id', groepen);
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

  async function teamberichten(wie: TestUser): Promise<Bericht[]> {
    const { data, error } = await wie.db
      .from('chat_messages')
      .select('system_event, body, subject_id, actor_id, payload')
      .eq('group_id', team)
      .in('system_event', ['team_goal_created', 'team_goal_completed']);
    expect(error).toBeNull();
    return data as Bericht[];
  }

  it('plaatst bij een nieuw teamdoel één bericht, leesbaar voor een teamgenoot', async () => {
    const berichten = await teamberichten(cleo);
    expect(berichten.map((b) => b.system_event)).toEqual(['team_goal_created']);
  }, TEST_TIMEOUT);

  it('noemt geen titel en geen persoon', async () => {
    const [b] = await teamberichten(cleo);
    expect(b?.subject_id).toBeNull();
    expect(b?.actor_id).toBeNull();
    expect(JSON.stringify(b)).not.toContain(TITEL);
    expect(JSON.stringify(b)).not.toContain(bert.id);
  }, TEST_TIMEOUT);

  it('is niet leesbaar voor een organisatiebeheerder die geen lid is', async () => {
    expect(await teamberichten(anna)).toEqual([]);
  }, TEST_TIMEOUT);

  it('weigert een onbekend type, ook voor service_role, en kent de twee nieuwe', async () => {
    const admin = adminDb();
    const rij = (system_event: string) => ({ group_id: team, type: 'system', system_event, body: 'x' });
    expect((await admin.from('chat_messages').insert(rij('team_goal_behind') as never)).error?.code).toBe('23514');
    expect((await admin.from('chat_messages').insert(rij('team_bonus_awarded') as never)).error?.code).toBe('23514');
    expect((await admin.from('chat_messages').insert(rij('team_goal_completed') as never)).error).toBeNull();
  }, TEST_TIMEOUT);
});
