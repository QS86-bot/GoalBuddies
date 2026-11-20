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
 *    mutatie in de lokale database, daarna 0325 opnieuw afgespeeld):
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
 *    5–7. De teamband weg uit `commitments_select` (`straf_teamband_klopt_voor_mij()`), uit
 *       `getuigenissen()`, of uit `getuigenissen_voor()` en
 *       `teruggedraaide_straffen_voor()` → telkens alleen "een getuige die het
 *       team verlaat…" rood (besluit M1). ⚠️ `teruggedraaide_straffen_voor()` heeft
 *       geen eigen toets: hij vraagt een eerdere melding én een teruggedraaide
 *       straf, en draagt dezelfde regel als `getuigenissen_voor()`.
 *    8. De tak voor een privédoel weg → alleen "weigert een collega … als getuige
 *       van een privédoel" rood (besluit M2).
 *    9. De lidmaatschapstoets voor de eigenaar weg → alleen "verraadt de eigenaar
 *       niet of een vreemde groep een teamgroep is" rood (review L1).
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
  let org: string;
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
    org = (o.data as { organization_id: string }).organization_id;
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

  // ⚠️ Besluit V8 van Quinten (20-11-2026), op de naad met de weekbelofte van main
  //    (0312–0314): een weekbelofte op een aandeel heeft nooit de teamgroep als
  //    begunstigde, alleen een teamgenoot. Rood gemaakt op een lokale database door
  //    tak 1b uit `bewaak_teamstraf()` te halen: dan wordt de rij ingevoegd.
  it('weigert de teamgroep als begunstigde van een weekbelofte op een aandeel (besluit V8)', async () => {
    const maandag = new Date();
    maandag.setUTCDate(maandag.getUTCDate() - ((maandag.getUTCDay() + 6) % 7));
    const r = await leg(bert, {
      ...straf(aandeel[0]!, { groep: team }),
      periode_start: maandag.toISOString().slice(0, 10),
    });
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

  async function prive(titel: string): Promise<string> {
    const { data } = await bert.db
      .from('goals')
      .insert({ owner_id: bert.id, title: titel, target_date: datum(60) } as never)
      .select('id')
      .single();
    return (data as { id: string }).id;
  }

  it('weigert een collega met wie je alleen het team deelt als getuige van een privédoel (besluit M2)', async () => {
    const r = await leg(bert, straf(await prive('Privé met collega'), { persoon: cleo.id }));
    expect(r.error?.hint).toBe(TEAMSTRAF_HINT);
    // Controle: een vriend als getuige van een privédoel mag.
    const v = await leg(bert, straf(await prive('Privé met vriend'), { persoon: nina.id }));
    expect(v.error).toBeNull();
  }, TEST_TIMEOUT);

  it('verraadt de eigenaar niet of een vreemde groep een teamgroep is (review L1)', async () => {
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Ander team' });
    const ander = (t.data as { group_id: string }).group_id;
    groepen.push(ander);
    registreerGroep(ander);
    const g = await rpc(nina, 'create_group', { group_name: 'Andere vrienden' });
    const vreemd = (g.data as { group: { id: string } }).group.id;
    groepen.push(vreemd);
    registreerGroep(vreemd);
    const opTeam = await leg(bert, straf(await prive('Orakel A'), { groep: ander }));
    const opVreemd = await leg(bert, straf(await prive('Orakel B'), { groep: vreemd }));
    expect(opTeam.error?.code).toBe('42501');
    expect(opTeam.error).toEqual(opVreemd.error);
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

  it('een getuige die het team verlaat, leest de straf op het aandeel niet meer, ook niet via een vriendengroep (besluit M1)', async () => {
    const getuigeStraf = await adminDb()
      .from('commitments')
      .select('id')
      .eq('goal_id', aandeel[1]!)
      .eq('beneficiary_user_id', cleo.id)
      .single();
    const id = (getuigeStraf.data as { id: string }).id;
    expect((await adminDb().from('commitments').update({ status: 'due' } as never).eq('id', id)).error).toBeNull();
    // Cleo zit óók met bert in de vriendengroep: dat is de band die anders bleef.
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', vrienden).single();
    expect(uitkomst(await rpc(cleo, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');

    const routes = async (): Promise<number[]> => {
      const direct = await cleo.db.from('commitments').select('id').eq('id', id);
      const eigen = await cleo.db.rpc('getuigenissen');
      const melding = await adminDb().rpc('getuigenissen_voor' as never, { p_user_id: cleo.id } as never);
      expect(direct.error).toBeNull();
      expect(eigen.error).toBeNull();
      expect(melding.error).toBeNull();
      return [
        (direct.data as unknown[]).length,
        (eigen.data as { id: string }[]).filter((r) => r.id === id).length,
        (melding.data as unknown as { commitment_id: string }[]).filter((r) => r.commitment_id === id).length,
      ];
    };
    expect(await routes()).toEqual([1, 1, 1]);
    expect(uitkomst(await rpc(cleo, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
    expect(await routes()).toEqual([0, 0, 0]);
  }, TEST_TIMEOUT);

  // ⚠️ Besluit V11 van Quinten (20-11-2026): verliet de eigenaar het team, dan meldt
  //    `meld_commitment()` een verschuldigde straf op zijn aandeel niet meer in de
  //    teamchat. Rood gemaakt op een lokale database door de regel met
  //    `straf_teamband_klopt()` weg te halen: dan blijft het bericht komen.
  it('meldt geen verschuldigde straf in de teamchat als de eigenaar het team verliet (besluit V11)', async () => {
    const nieuw = await leg(bert, straf(aandeel[1]!, { groep: team }));
    expect(nieuw.error).toBeNull();
    const id = (nieuw.data as { id: string }).id;
    const berichten = async (): Promise<number> => {
      const { data, error } = await adminDb()
        .from('chat_messages')
        .select('id')
        .eq('group_id', team)
        .eq('system_event', 'commitment_due')
        .eq('subject_id', bert.id);
      expect(error).toBeNull();
      return (data ?? []).length;
    };
    const voor = await berichten();
    expect(uitkomst(await rpc(bert, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
    expect((await adminDb().from('commitments').update({ status: 'due' } as never).eq('id', id)).error).toBeNull();
    expect(await berichten()).toBe(voor);
  }, TEST_TIMEOUT);
});
