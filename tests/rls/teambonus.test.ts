import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  verwijderAuthGebruiker,
  type TestUser,
} from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';
import { proefId } from './proefid';

/**
 * Afronden van een teamdoel en de teambonus — QS8-662, criterium 13 en 14, en de
 * besluiten van Quinten van 18-11-2026 (reacties op het issue).
 *
 * ⚠️ **Over het echte pad**: organisatie, teamgroep, `maak_teamdoel()`,
 *    `neem_aandeel()`, `vraag_teamdoel_afronding()` en `keur_teamdoel_goed()`,
 *    via PostgREST met het JWT van elke gebruiker.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 18-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0326 opnieuw afgespeeld):
 *
 *    1. De toets `eigen_afronding` uit `keur_teamdoel_goed()` → alleen 13(a, d)
 *       rood (de trigger houdt het nog tegen, maar met een fout en geen reden).
 *    2. De trigger `team_goals_afronding` weg → eerst "zonder goedkeurder (de
 *       trigger)" rood; daarna de toetsen die op dat teamdoel verder bouwen.
 *    3. De CHECK `team_goals_niet_zelf_goedgekeurd` weg → alleen "de vrager niet
 *       als goedkeurder (de CHECK)" rood.
 *    4. De seizoenstoets weg → alleen 14 rood.
 *    5–6. De toets op het organisatielidmaatschap, of die op het lidmaatschap
 *       van de teamgroep, apart weg → **groen**, en dat is gemeten en geen
 *       vergissing: de twee dekken elkaar. Wie de organisatie verlaat, wordt
 *       ook in de teamgroep inactief (0317). Beide samen weg → 14 rood, op Eva.
 *    8. De unieke index `points_ledger_teambonus_per_seizoen_idx` weg → alleen
 *       H1 rood (securityreview).
 *    9. De toets "minstens één gedane stap" weg, in de aanvraag én de
 *       goedkeuring → alleen 13(a, d) rood (besluit M2). ⚠️ Die in de goedkeuring
 *       alleen is niet apart te raken: de aanvraag weigert al eerder.
 *   10. Het opruimen van een aanvraag zonder aanvrager weg → alleen M1 rood.
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

function datum(dagen: number): string {
  return new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
}

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('afronden van een teamdoel en de teambonus (QS8-662)', () => {
  let anna: TestUser; // organisatiebeheerder, geen lid
  let bert: TestUser;
  let cleo: TestUser;
  let dirk: TestUser; // neemt pas een aandeel ná de aanvraag (besluit 4)
  let eva: TestUser; // heeft een aandeel, maar vertrekt vóór de goedkeuring
  let org: string;
  let team: string;

  async function teamdoel(wie: TestUser, titel: string): Promise<string> {
    const td = await rpc(wie, 'maak_teamdoel', { p_group_id: team, p_titel: titel, p_streefdatum: datum(90) });
    expect(uitkomst(td)).toBe('ok');
    return (td.data as { team_goal_id: string }).team_goal_id;
  }

  const aandelen: Record<string, string> = {};

  async function aandeel(wie: TestUser, td: string): Promise<void> {
    const a = await rpc(wie, 'neem_aandeel', { p_team_goal_id: td });
    expect(uitkomst(a)).toBe('ok');
    aandelen[`${wie.id}:${td}`] = (a.data as { goal_id: string }).goal_id;
  }

  /** Eén gedane stap op het aandeel van `wie`: zonder kan een teamdoel niet af (besluit M2). */
  async function stap(wie: TestUser, td: string): Promise<void> {
    const doel = aandelen[`${wie.id}:${td}`]!;
    const { data, error } = await wie.db
      .from('milestones')
      .insert({ goal_id: doel, title: 'Stap', order_index: Object.keys(aandelen).length } as never)
      .select('id')
      .single();
    expect(error).toBeNull();
    const klaar = await wie.db.from('milestones').update({ status: 'done' } as never).eq('id', (data as { id: string }).id);
    expect(klaar.error).toBeNull();
  }

  /** Het begin van het lopende kwartaal in de tijdzone van de teamgroep, uit de database zelf. */
  async function ditKwartaal(): Promise<string> {
    const { data, error } = await adminDb().rpc('seizoensgrens' as never, {
      p_tz: 'Europe/Amsterdam',
      p_cadence: 'quarterly',
    } as never);
    expect(error).toBeNull();
    const eind = new Date(`${(data as unknown as { season_end: string }[])[0]!.season_end}T00:00:00Z`);
    return new Date(eind.getTime() + 86_400_000).toISOString().slice(0, 10);
  }

  async function bonussen(wie: TestUser): Promise<{ ref_id: string; delta: number }[]> {
    const { data, error } = await adminDb()
      .from('points_ledger')
      .select('ref_id, delta')
      .eq('user_id', wie.id)
      .eq('reason', 'team_goal_bonus' as never);
    expect(error).toBeNull();
    return data as { ref_id: string; delta: number }[];
  }

  /**
   * De XP van de teambonus — besluit van Quinten, 20-11-2026 (V7): 20 XP per
   * bonus, idempotent per teamdoel. ⚠️ Gelezen als service_role: het gaat hier om
   * wat er geboekt is, niet om wie het mag lezen (dat is `tests/rls/xp.test.ts`).
   */
  async function teambonusXp(wie: TestUser): Promise<{ teamdoel_id: string; bedrag: number }[]> {
    const { data, error } = await adminDb()
      .from('xp_grootboek' as never)
      .select('teamdoel_id, bedrag')
      .eq('user_id' as never, wie.id as never)
      .eq('bron' as never, 'teambonus' as never);
    expect(error).toBeNull();
    return data as unknown as { teamdoel_id: string; bedrag: number }[];
  }

  beforeAll(async () => {
    [anna, bert, cleo, dirk, eva] = await Promise.all([
      createTestUser('tbonus-anna'),
      createTestUser('tbonus-bert'),
      createTestUser('tbonus-cleo'),
      createTestUser('tbonus-dirk'),
      createTestUser('tbonus-eva'),
    ]);
    await laatOrganisatieAanmaken(anna);
    const o = await rpc(anna, 'maak_organisatie', { p_naam: 'Bonus BV' });
    org = (o.data as { organization_id: string }).organization_id;
    organisaties.push(org);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    for (const wie of [bert, cleo, dirk, eva]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    }
    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Team Bonus' });
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    for (const wie of [bert, cleo, dirk, eva]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    for (const wie of [bert, cleo, dirk, eva]) {
      await admin.from('points_ledger').delete().eq('user_id', wie.id);
    }
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

  let eerste: string;

  it('13(a, d): een lid kan zijn eigen afronding niet goedkeuren, en zonder goedkeuring boekt er niets', async () => {
    eerste = await teamdoel(bert, 'Kwartaal');
    await aandeel(bert, eerste);
    await aandeel(cleo, eerste);
    // Besluit M2: zonder gedane stap kan het niet.
    expect(uitkomst(await rpc(bert, 'vraag_teamdoel_afronding', { p_team_goal_id: eerste }))).toBe('nog_geen_stap');
    await stap(bert, eerste);
    expect(uitkomst(await rpc(bert, 'vraag_teamdoel_afronding', { p_team_goal_id: eerste }))).toBe('ok');
    expect(uitkomst(await rpc(bert, 'keur_teamdoel_goed', { p_team_goal_id: eerste }))).toBe('eigen_afronding');
    // De organisatiebeheerder die geen lid is, keurt niets goed.
    expect(uitkomst(await rpc(anna, 'keur_teamdoel_goed', { p_team_goal_id: eerste }))).toBe('niet_toegestaan');
    expect(await bonussen(bert)).toEqual([]);
    expect(await bonussen(cleo)).toEqual([]);
  }, TEST_TIMEOUT);

  it('13(a): ook service_role zet een teamdoel niet op afgerond zonder goedkeurder (de trigger)', async () => {
    const r = await adminDb()
      .from('team_goals' as never)
      .update({ status: 'completed' } as never)
      .eq('id' as never, eerste as never);
    expect(r.error?.code).toBe('23514');
  }, TEST_TIMEOUT);

  it('13(a): ook service_role zet de vrager niet als goedkeurder (de CHECK)', async () => {
    const r = await adminDb()
      .from('team_goals' as never)
      .update({ afronding_goedgekeurd_door: bert.id } as never)
      .eq('id' as never, eerste as never);
    expect(r.error?.code).toBe('23514');
  }, TEST_TIMEOUT);

  it('13(b): een teamgenoot keurt goed, en wie een aandeel had krijgt eenmalig +2', async () => {
    expect(uitkomst(await rpc(cleo, 'keur_teamdoel_goed', { p_team_goal_id: eerste }))).toBe('ok');
    expect(await bonussen(bert)).toEqual([{ ref_id: eerste, delta: 2 }]);
    expect(await bonussen(cleo)).toEqual([{ ref_id: eerste, delta: 2 }]);
    // Dirk had geen aandeel.
    expect(await bonussen(dirk)).toEqual([]);
    // Nog eens goedkeuren boekt niets: het teamdoel is af.
    expect(uitkomst(await rpc(cleo, 'keur_teamdoel_goed', { p_team_goal_id: eerste }))).toBe('niet_actief');
    expect(await bonussen(bert)).toHaveLength(1);

    // De naad met XP (0304), besluit V7 van 20-11-2026: één bonus is precies één
    // XP-rij van 20, en wie geen bonus kreeg, krijgt ook geen XP.
    // ⚠️ Rood gemaakt op een lokale database: zonder de trigger `xp_na_teambonus`
    //    nul rijen; zonder `xp_grootboek_teamdoel_uniek_idx` een tweede rij bij een
    //    herhaalde boeking.
    expect(await teambonusXp(bert)).toEqual([{ teamdoel_id: eerste, bedrag: 20 }]);
    expect(await teambonusXp(cleo)).toEqual([{ teamdoel_id: eerste, bedrag: 20 }]);
    expect(await teambonusXp(dirk)).toEqual([]);
  }, TEST_TIMEOUT);

  it('een goedgekeurde afronding is definitief, ook voor service_role (besluit 2)', async () => {
    const r = await adminDb()
      .from('team_goals' as never)
      .update({ status: 'active' } as never)
      .eq('id' as never, eerste as never);
    expect(r.error?.code).toBe('23514');
  }, TEST_TIMEOUT);

  it('13(c): de bonus staat alleen in het puntenboek van de eigenaar', async () => {
    const lees = async (lezer: TestUser, van: TestUser): Promise<number> => {
      const { data, error } = await lezer.db.from('points_ledger').select('id').eq('user_id', van.id);
      expect(error).toBeNull();
      return (data as unknown[]).length;
    };
    expect(await lees(bert, bert)).toBeGreaterThan(0);
    expect(await lees(cleo, bert)).toBe(0);
    expect(await lees(anna, bert)).toBe(0);
    // En het afrondbericht noemt niemand.
    const { data } = await cleo.db
      .from('chat_messages')
      .select('subject_id, actor_id')
      .eq('group_id', team)
      .eq('system_event', 'team_goal_completed');
    expect(data).toEqual([{ subject_id: null, actor_id: null }]);
  }, TEST_TIMEOUT);

  it('14: een tweede teambonus in hetzelfde seizoen boekt niet, ook niet als twee leden elkaar goedkeuren', async () => {
    const tweede = await teamdoel(cleo, 'Halfjaar');
    await aandeel(bert, tweede);
    await aandeel(cleo, tweede);
    await aandeel(eva, tweede);
    await stap(cleo, tweede);
    // Andersom dan bij het eerste: cleo vraagt, bert keurt goed.
    expect(uitkomst(await rpc(cleo, 'vraag_teamdoel_afronding', { p_team_goal_id: tweede }))).toBe('ok');

    // Besluit 4: dirk neemt pas ná de aanvraag een aandeel, en telt mee.
    await aandeel(dirk, tweede);
    // Dirk had in een vórig kwartaal al een bonus; die telt niet voor dit seizoen.
    const oud = await adminDb().from('points_ledger').insert({
      user_id: dirk.id,
      delta: 2,
      reason: 'team_goal_bonus',
      ref_type: 'team_goal',
      ref_id: proefId(1),
      created_at: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      seizoen: '2020-01-01',
    } as never);
    expect(oud.error).toBeNull();
    // Eva vertrekt vóór de goedkeuring uit de organisatie: geen bonus.
    expect(uitkomst(await rpc(eva, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
    // ⚠️ De vertrek-cascade haalt haar koppeling al weg (0317), en dan toetst
    //    deze test alleen die cascade. Dus de koppeling terug via service_role:
    //    nu zijn het de lidmaatschapstoetsen in `keur_teamdoel_goed()` die haar
    //    weigeren (besluit van Quinten: alleen een actief organisatielid).
    const { data: evasAandeel } = await adminDb()
      .from('team_goal_shares' as never)
      .select('goal_id')
      .eq('user_id' as never, eva.id as never)
      .single();
    const terug = await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: (evasAandeel as unknown as { goal_id: string }).goal_id, group_id: team });
    expect(terug.error).toBeNull();

    expect(uitkomst(await rpc(bert, 'keur_teamdoel_goed', { p_team_goal_id: tweede }))).toBe('ok');

    expect((await bonussen(bert)).map((b) => b.ref_id)).toEqual([eerste]);
    expect((await bonussen(cleo)).map((b) => b.ref_id)).toEqual([eerste]);
    // Geen tweede bonus in hetzelfde seizoen, dus ook geen tweede XP-rij (V7).
    expect(await teambonusXp(bert)).toEqual([{ teamdoel_id: eerste, bedrag: 20 }]);
    expect(await teambonusXp(cleo)).toEqual([{ teamdoel_id: eerste, bedrag: 20 }]);
    expect((await bonussen(dirk)).map((b) => b.ref_id).sort()).toEqual(
      [proefId(1), tweede].sort(),
    );
    expect(await bonussen(eva)).toEqual([]);
  }, TEST_TIMEOUT);

  it('H1: de database staat hoogstens één teambonus per kwartaallabel toe, ook voor service_role', async () => {
    const kwartaal = await ditKwartaal();
    // Een bonus met het label van dit kwartaal maar een oude aanmaakdatum, zoals
    // er een uit een teamgroep in een andere tijdzone kan komen.
    const zelfdeLabel = await adminDb().from('points_ledger').insert({
      user_id: eva.id,
      delta: 2,
      reason: 'team_goal_bonus',
      ref_type: 'team_goal',
      ref_id: proefId(2),
      created_at: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      seizoen: kwartaal,
    } as never);
    expect(zelfdeLabel.error).toBeNull();
    // Een tweede met hetzelfde label: de database weigert, ook voor service_role.
    const tweede = await adminDb().from('points_ledger').insert({
      user_id: eva.id,
      delta: 2,
      reason: 'team_goal_bonus',
      ref_type: 'team_goal',
      ref_id: proefId(3),
      seizoen: kwartaal,
    } as never);
    expect(tweede.error?.code).toBe('23505');
    // En een bonus zonder label kan niet bestaan.
    const zonder = await adminDb().from('points_ledger').insert({
      user_id: eva.id,
      delta: 2,
      reason: 'team_goal_bonus',
      ref_type: 'team_goal',
      ref_id: proefId(4),
    } as never);
    expect(zonder.error?.code).toBe('23514');
  }, TEST_TIMEOUT);

  it('M1: een aanvraag van een verwijderd account houdt het teamdoel niet vast', async () => {
    const fien = await createTestUser('tbonus-fien');
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
    expect(uitkomst(await rpc(fien, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    expect(uitkomst(await rpc(fien, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe('ok');
    const derde = await teamdoel(fien, 'Jaar');
    await aandeel(fien, derde);
    await aandeel(dirk, derde);
    await stap(dirk, derde);
    expect(uitkomst(await rpc(fien, 'vraag_teamdoel_afronding', { p_team_goal_id: derde }))).toBe('ok');
    expect(await verwijderAuthGebruiker(fien.id)).toBeNull();

    // De teamgenoot krijgt een nette reden en geen fout, en kan zelf opnieuw aanvragen.
    expect(uitkomst(await rpc(dirk, 'keur_teamdoel_goed', { p_team_goal_id: derde }))).toBe('niet_gevraagd');
    expect(uitkomst(await rpc(dirk, 'vraag_teamdoel_afronding', { p_team_goal_id: derde }))).toBe('ok');
  }, TEST_TIMEOUT);
});
