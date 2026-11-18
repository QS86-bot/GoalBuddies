import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEAMSTRAF_HINT } from '../../src/modules/commitments/commitment-schemas';
import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een teamstraf blijft in het team — QS8-660, besluit 12 en 29 en de ontwerpronde
 * met Quinten van 18-11-2026.
 *
 * ⚠️ **De naad met de app**: de weigering draagt `hint = TEAMSTRAF_HINT`, en die
 *    constante is wat `zetStraf()` herkent om een uitleg te tonen in plaats van
 *    "probeer het opnieuw". Hernoemt iemand één kant, dan wordt dit rood.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 18-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0305 opnieuw afgespeeld):
 *
 *    1. De trigger `commitments_teamstraf` weg → rood op elke weigering, ook die
 *       voor `service_role`. Daarna ook de twee toetsen die een straf op
 *       hetzelfde aandeel vastleggen: er staat er dan al een (één straf per doel).
 *    2. De tak voor een begunstigde persoon weg → "weigert een vriend als getuige
 *       op een aandeel" rood, en om dezelfde reden de twee toetsen erna.
 *    3. De tak "een teamgroep alleen op een aandeel" weg → alleen "weigert het
 *       team als getuige van een gewoon doel" rood.
 *    4. De woordelijke policymelding voor een niet-eigenaar vervangen door een
 *       eigen tekst → alleen "verraadt een vreemde niet dat het doel een aandeel
 *       is" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const STRAFTEKST = 'Ik trakteer het team op taart';

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string; hint?: string | null } | null;
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

function datum(dagen: number): string {
  return new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
}

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('een teamstraf blijft in het team (QS8-660)', () => {
  let anna: TestUser; // organisatiebeheerder
  let bert: TestUser; // eigenaar: twee aandelen, een gewoon doel aan het team, en in de vriendengroep
  let cleo: TestUser; // teamgenoot
  let nina: TestUser; // vriendin van bert, geen teamlid
  let team: string;
  let vrienden: string;
  const aandeel: string[] = [];
  let gewoonAanTeam: string;

  beforeAll(async () => {
    [anna, bert, cleo, nina] = await Promise.all([
      createTestUser('tstraf-anna'),
      createTestUser('tstraf-bert'),
      createTestUser('tstraf-cleo'),
      createTestUser('tstraf-nina'),
    ]);
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Straf BV' });
    const org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    }
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Team Straf' });
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    for (const wie of [bert, cleo]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    }

    const v = await rpc(nina, 'create_group', { group_name: 'Vrienden van Bert' });
    vrienden = (v.data as { group: { id: string } }).group.id;
    groepen.push(vrienden);
    registreerGroep(vrienden);
    const vcode = (v.data as { group: { invite_code: string } }).group.invite_code;
    expect(uitkomst(await rpc(bert, 'join_group_with_code', { code: vcode }))).toBe('ok');

    // Twee teamdoelen, zodat bert twee aandelen heeft: één straf per doel.
    for (const titel of ['Kwartaal', 'Halfjaar']) {
      const td = await rpc(bert, 'maak_teamdoel', { p_group_id: team, p_titel: titel, p_streefdatum: datum(90) });
      const a = await rpc(bert, 'neem_aandeel', { p_team_goal_id: (td.data as { team_goal_id: string }).team_goal_id });
      expect(uitkomst(a)).toBe('ok');
      aandeel.push((a.data as { goal_id: string }).goal_id);
    }

    const { data: d } = await bert.db
      .from('goals')
      .insert({ owner_id: bert.id, title: 'Eigen doel aan het team', target_date: datum(90) } as never)
      .select('id')
      .single();
    gewoonAanTeam = (d as { id: string }).id;
    expect((await bert.db.from('goal_group_links').insert({ goal_id: gewoonAanTeam, group_id: team } as never)).error).toBeNull();
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

  function straf(goal: string, getuige: { groep?: string; persoon?: string }): Record<string, unknown> {
    return {
      goal_id: goal,
      type: 'penalty',
      body: STRAFTEKST,
      beneficiary_group_id: getuige.groep ?? null,
      beneficiary_user_id: getuige.persoon ?? null,
      confirmed_at: new Date().toISOString(),
    };
  }

  async function leg(wie: TestUser, rij: Record<string, unknown>): Promise<Antwoord> {
    const { data, error } = await wie.db.from('commitments').insert(rij as never).select('id').maybeSingle();
    return { data, error };
  }

  it('weigert een vriendengroep als getuige op een aandeel, met de hint die de app herkent', async () => {
    const r = await leg(bert, straf(aandeel[0]!, { groep: vrienden }));
    expect(r.error?.code).toBe('23514');
    expect(r.error?.hint).toBe(TEAMSTRAF_HINT);
  }, TEST_TIMEOUT);

  it('weigert een vriend als getuige op een aandeel', async () => {
    const r = await leg(bert, straf(aandeel[0]!, { persoon: nina.id }));
    expect(r.error?.hint).toBe(TEAMSTRAF_HINT);
  }, TEST_TIMEOUT);

  it('weigert het team als getuige van een gewoon doel, ook als dat aan het team hangt', async () => {
    const r = await leg(bert, straf(gewoonAanTeam, { groep: team }));
    expect(r.error?.hint).toBe(TEAMSTRAF_HINT);
  }, TEST_TIMEOUT);

  it('weigert ook voor service_role', async () => {
    const { error } = await adminDb().from('commitments').insert(straf(aandeel[0]!, { groep: vrienden }) as never);
    expect(error?.code).toBe('23514');
  }, TEST_TIMEOUT);

  it('verraadt een vreemde niet dat het doel een aandeel is', async () => {
    const opAandeel = await leg(nina, straf(aandeel[0]!, { groep: vrienden }));
    const opGewoon = await leg(nina, straf(gewoonAanTeam, { groep: vrienden }));
    expect(opAandeel.error?.code).toBe('42501');
    expect(opAandeel.error).toEqual(opGewoon.error);
  }, TEST_TIMEOUT);

  it('controle: een gewoon doel met de vriendengroep mag gewoon', async () => {
    const { data } = await bert.db
      .from('goals')
      .insert({ owner_id: bert.id, title: 'Privé', target_date: datum(60) } as never)
      .select('id')
      .single();
    const r = await leg(bert, straf((data as { id: string }).id, { groep: vrienden }));
    expect(r.error).toBeNull();
  }, TEST_TIMEOUT);

  let teamstraf: string;

  it('staat het team toe op een aandeel, en een teamgenoot op het andere', async () => {
    const a = await leg(bert, straf(aandeel[0]!, { groep: team }));
    expect(a.error).toBeNull();
    teamstraf = (a.data as { id: string }).id;
    const b = await leg(bert, straf(aandeel[1]!, { persoon: cleo.id }));
    expect(b.error).toBeNull();
  }, TEST_TIMEOUT);

  it('is pas leesbaar voor een collega als hij verschuldigd is, en dan met de tekst', async () => {
    const lees = async (): Promise<{ body: string }[]> => {
      const { data, error } = await cleo.db.from('commitments').select('body').eq('id', teamstraf);
      expect(error).toBeNull();
      return data as { body: string }[];
    };
    expect(await lees()).toEqual([]);
    expect((await adminDb().from('commitments').update({ status: 'due' } as never).eq('id', teamstraf)).error).toBeNull();
    expect(await lees()).toEqual([{ body: STRAFTEKST }]);
    // Het aandeel zelf blijft dicht: de straf opent alleen de straf.
    const { data: doel } = await cleo.db.from('goals').select('id').eq('id', aandeel[0]!);
    expect(doel).toEqual([]);
    // En de straftekst staat niet in de teamchat.
    const { data: chat } = await cleo.db.from('chat_messages').select('body, payload').eq('group_id', team);
    expect(JSON.stringify(chat)).not.toContain(STRAFTEKST);
  }, TEST_TIMEOUT);
});
