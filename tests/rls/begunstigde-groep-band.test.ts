import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een begunstigde groep leest je straf alleen zolang je er lid van bent —
 * QS8-820, migratie 0343. De meting staat in QS8-818.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel, niet van één policy.** Een
 *    groep die je verliet, of die jou eruit zette, krijgt je straf niet meer te
 *    zien. Dat geldt niet alleen voor de rij (`commitments_select` tak 2): het
 *    chatbericht (`meld_commitment()`) mag er ook niet komen. En jij zit niet vast
 *    aan een straf die je niet meer kunt intrekken of afwikkelen. Daarom leest
 *    elke rol hieronder via zijn eigen JWT, en telt de chat via `service_role`.
 *
 * Rollen: de eigenaar (alice), twee leden van X (bob is beheerder, carol), een lid
 * dat pas na het vertrek toetrad (erik), een buitenstaander (dave), de eigenaar na
 * terugkeer, een uitgezette eigenaar (olga), en een gearchiveerde groep (W).
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 23-11-2026, lokaal, telkens
 *    één mutatie met `create or replace` of `create policy` en daarna 0343
 *    opnieuw afgespeeld; zie de afleverreactie op QS8-820 voor de uitslag per stap):
 *
 *    De basis was vóór en ná de negen mutaties groen (12 van 12).
 *
 *    9. `or status = 'cancelled'` weg uit de getuigeregel van de WITH CHECK
 *       → alleen "een persoonlijke getuige die geen groep meer deelt" rood.
 *
 *    1. `straf_groepsband_klopt_voor_mij` weg uit tak 2 van `commitments_select`
 *       → (a), "na het vertrek verschuldigd" en "uitzetting" rood.
 *    2. `straf_groepsband_klopt` weg uit `meld_commitment()` → "na het vertrek
 *       verschuldigd" en "uitzetting" rood.
 *    3. De archieftoets weg uit `meld_commitment()` → alleen "(b) archief" rood.
 *    4. `or status = 'cancelled'` weg uit de WITH CHECK van `commitments_update`
 *       → "alice trekt … in", "uitzetting" en "(b) archief" rood.
 *    5. Blok 5b weg uit `bewaak_begunstigde()` → alleen "intrekken verzet de
 *       begunstigde niet" rood, op de `service_role`-helft. De clienthelft blijft
 *       groen, want daar houdt de kolomgrant hem tegen.
 *    6. De stuurloos-tak weg uit `herstel_stuurloze_straf()` → "(c) afwikkelen",
 *       "(c) nieuwe getuige" en "uitzetting" rood.
 *    7. Blok 5a weg uit `bewaak_begunstigde()` → alleen "nieuwe getuige" rood.
 *    8. De lidmaatschapstoets van de vrager weg uit `straf_groepsband_klopt_voor_mij`
 *       → alleen "geen orakel" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const TEKST = 'Ik trakteer de groep op appeltaart';

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

const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('een begunstigde groep leest je straf alleen zolang je lid bent (QS8-820)', () => {
  let alice: TestUser; // eigenaar
  let bob: TestUser; // beheerder van X en W
  let carol: TestUser; // lid van X
  let dave: TestUser; // buitenstaander
  let erik: TestUser; // treedt toe ná het vertrek van alice
  let frank: TestUser; // deelt groep Y met alice; wordt nieuwe getuige
  let olga: TestUser; // eigenaar die eruit gezet wordt
  let x: string;
  let w: string;
  let y: string;
  let codeX: string;
  const straf: Record<string, string> = {};

  async function maakGroep(wie: TestUser, naam: string): Promise<{ id: string; code: string }> {
    const g = await rpc(wie, 'create_group', { group_name: naam });
    const groep = (g.data as { group: { id: string; invite_code: string } }).group;
    groepen.push(groep.id);
    registreerGroep(groep.id);
    return { id: groep.id, code: groep.invite_code };
  }

  async function doe(wie: TestUser, code: string): Promise<void> {
    expect(uitkomst(await rpc(wie, 'join_group_with_code', { code }))).toBe('ok');
  }

  async function zetStraf(wie: TestUser, sleutel: string, groep: string): Promise<void> {
    const { data: d, error: e1 } = await wie.db
      .from('goals')
      .insert({ owner_id: wie.id, title: `Doel ${sleutel}`, target_date: datum(60) } as never)
      .select('id')
      .single();
    expect(e1).toBeNull();
    const { data: c, error: e2 } = await wie.db
      .from('commitments')
      .insert({
        goal_id: (d as { id: string }).id,
        type: 'penalty',
        body: TEKST,
        beneficiary_group_id: groep,
        confirmed_at: new Date().toISOString(),
      } as never)
      .select('id')
      .single();
    expect(e2).toBeNull();
    straf[sleutel] = (c as { id: string }).id;
  }

  async function maakVerschuldigd(sleutel: string): Promise<void> {
    const { error } = await adminDb().from('commitments').update({ status: 'due' } as never).eq('id', straf[sleutel]!);
    expect(error).toBeNull();
  }

  async function leest(wie: TestUser, sleutel: string): Promise<number> {
    const { data, error } = await wie.db.from('commitments').select('id, body').eq('id', straf[sleutel]!);
    expect(error).toBeNull();
    return (data ?? []).length;
  }

  async function berichten(groep: string, over: TestUser): Promise<number> {
    const { data, error } = await adminDb()
      .from('chat_messages')
      .select('id')
      .eq('group_id', groep)
      .eq('system_event', 'commitment_due')
      .eq('subject_id', over.id);
    expect(error).toBeNull();
    return (data ?? []).length;
  }

  async function trekIn(wie: TestUser, sleutel: string, extra: Record<string, unknown> = {}): Promise<Antwoord> {
    const { data, error } = await wie.db
      .from('commitments')
      .update({ status: 'cancelled', ...extra } as never)
      .eq('id', straf[sleutel]!)
      .select('id');
    return { data, error };
  }

  async function stand(sleutel: string): Promise<{ status: string; beneficiary_group_id: string | null; beneficiary_user_id: string | null }> {
    const { data } = await adminDb()
      .from('commitments')
      .select('status, beneficiary_group_id, beneficiary_user_id')
      .eq('id', straf[sleutel]!)
      .single();
    return data as { status: string; beneficiary_group_id: string | null; beneficiary_user_id: string | null };
  }

  beforeAll(async () => {
    [alice, bob, carol, dave, erik, frank, olga] = await Promise.all([
      createTestUser('bgband-alice'),
      createTestUser('bgband-bob'),
      createTestUser('bgband-carol'),
      createTestUser('bgband-dave'),
      createTestUser('bgband-erik'),
      createTestUser('bgband-frank'),
      createTestUser('bgband-olga'),
    ]);
    const gx = await maakGroep(bob, 'Groep X');
    x = gx.id;
    codeX = gx.code;
    for (const wie of [alice, carol, olga]) await doe(wie, codeX);
    const gy = await maakGroep(frank, 'Groep Y');
    y = gy.id;
    await doe(alice, gy.code);
    const gw = await maakGroep(bob, 'Groep W');
    w = gw.id;
    await doe(alice, gw.code);

    // Elke straf op een eigen doel: één open straf per doel (0170).
    for (const s of ['leesA', 'verschuldigdC', 'intrekB', 'getuigeD']) await zetStraf(alice, s, x);
    for (const s of ['archief1', 'archief2']) await zetStraf(alice, s, w);
    for (const s of ['olga1', 'olga2']) await zetStraf(olga, s, x);

    // Verschuldigd vóór het vertrek: X leest hem, en het bericht staat er.
    await maakVerschuldigd('verschuldigdC');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('chat_messages').delete().in('group_id', groepen);
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // ⚠️ De must-allow vóór de must-deny: anders is een lege uitkomst hieronder
  //    niet te onderscheiden van een opstelling die nooit iets liet lezen.
  it('zolang alice lid is, lezen bob en carol de verschuldigde straf, dave niet', async () => {
    expect([await leest(bob, 'verschuldigdC'), await leest(carol, 'verschuldigdC'), await leest(dave, 'verschuldigdC')]).toEqual([1, 1, 0]);
    expect(await leest(bob, 'leesA')).toBe(0); // nog niet verschuldigd
    expect(await berichten(x, alice)).toBe(1);
    expect(uitkomst(await rpc(alice, 'verlaat_groep', { p_group_id: x, p_bevestigd: true }))).toBe('ok');
  }, TEST_TIMEOUT);

  it('(a) een straf die al verschuldigd was, leest X na het vertrek niet meer; alice wel', async () => {
    expect([await leest(bob, 'verschuldigdC'), await leest(carol, 'verschuldigdC')]).toEqual([0, 0]);
    expect(await leest(alice, 'verschuldigdC')).toBe(1);
    // Het al geplaatste bericht blijft: een systeembericht is een onveranderlijke kopie.
    expect(await berichten(x, alice)).toBe(1);
  }, TEST_TIMEOUT);

  it('een straf die na het vertrek verschuldigd wordt: X leest niets, ook een later lid niet, en er komt geen bericht', async () => {
    await doe(erik, codeX);
    await maakVerschuldigd('leesA');
    expect([await leest(bob, 'leesA'), await leest(carol, 'leesA'), await leest(erik, 'leesA'), await leest(dave, 'leesA')]).toEqual([0, 0, 0, 0]);
    expect(await berichten(x, alice)).toBe(1);
  }, TEST_TIMEOUT);

  // ⚠️ Twee sloten. Een client mag de begunstigde helemaal niet bijwerken (de
  //    kolomgrant laat alleen `body`, `image_url` en `status` toe), en blok 5b
  //    houdt ook `service_role` en elke definer-functie tegen.
  it('intrekken verzet de begunstigde niet (kolomgrant en blok 5b)', async () => {
    const r = await trekIn(alice, 'intrekB', { beneficiary_group_id: w });
    expect(r.error?.code).toBe('42501');
    const { error } = await adminDb()
      .from('commitments')
      .update({ status: 'cancelled', beneficiary_group_id: w } as never)
      .eq('id', straf.intrekB!);
    expect(error?.code).toBe('23514');
    expect(await stand('intrekB')).toEqual({ status: 'set', beneficiary_group_id: x, beneficiary_user_id: null });
  }, TEST_TIMEOUT);

  it('alice trekt een straf die nog niet verschuldigd is na het vertrek in, maar bewerkt hem niet', async () => {
    const bewerk = await alice.db.from('commitments').update({ body: 'Andere tekst' } as never).eq('id', straf.getuigeD!);
    expect(bewerk.error?.code).toBe('42501');
    const r = await trekIn(alice, 'intrekB');
    expect(r.error).toBeNull();
    expect((await stand('intrekB')).status).toBe('cancelled');
  }, TEST_TIMEOUT);

  it('(c) afwikkelen: een verschuldigde straf bij een groep zonder alice is stuurloos', async () => {
    expect(uitkomst(await rpc(alice, 'herstel_stuurloze_straf', { p_commitment_id: straf.leesA, p_actie: 'afwikkelen' }))).toBe('niet_bevestigd');
    expect(uitkomst(await rpc(bob, 'herstel_stuurloze_straf', { p_commitment_id: straf.leesA, p_actie: 'afwikkelen', p_bevestigd: true }))).toBe('not_owner');
    expect(uitkomst(await rpc(alice, 'herstel_stuurloze_straf', { p_commitment_id: straf.leesA, p_actie: 'afwikkelen', p_bevestigd: true }))).toBe('ok');
    // De groep blijft op de rij; bij terugkeer leest X hem weer, nu afgewikkeld.
    expect(await stand('leesA')).toEqual({ status: 'resolved', beneficiary_group_id: x, beneficiary_user_id: null });
  }, TEST_TIMEOUT);

  it('(c) nieuwe getuige: frank komt in de plaats van X, en leest de straf', async () => {
    await maakVerschuldigd('getuigeD');
    expect(uitkomst(await rpc(alice, 'herstel_stuurloze_straf', { p_commitment_id: straf.getuigeD, p_actie: 'nieuwe_getuige', p_getuige: frank.id }))).toBe('ok');
    expect(await stand('getuigeD')).toEqual({ status: 'due', beneficiary_group_id: null, beneficiary_user_id: frank.id });
    expect(await leest(frank, 'getuigeD')).toBe(1);
    expect(await leest(bob, 'getuigeD')).toBe(0);
    const { data } = await alice.db.from('commitment_events').select('payload').eq('commitment_id', straf.getuigeD!).eq('event_type', 'edited');
    expect(JSON.stringify(data)).toContain('groep_verlaten');
  }, TEST_TIMEOUT);

  it('na terugkeer leest X weer, en is de straf niet meer stuurloos', async () => {
    await doe(alice, codeX);
    expect([await leest(bob, 'verschuldigdC'), await leest(carol, 'verschuldigdC'), await leest(erik, 'leesA')]).toEqual([1, 1, 1]);
    expect(await leest(dave, 'verschuldigdC')).toBe(0);
    expect(uitkomst(await rpc(alice, 'herstel_stuurloze_straf', { p_commitment_id: straf.verschuldigdC, p_actie: 'afwikkelen', p_bevestigd: true }))).toBe('heeft_nog_een_begunstigde');
  }, TEST_TIMEOUT);

  it('geen orakel: een niet-lid hoort niets over de band, en de kale functie is dicht', async () => {
    const { data: doel } = await adminDb().from('commitments').select('goal_id').eq('id', straf.verschuldigdC!).single();
    const g = (doel as { goal_id: string }).goal_id;
    expect((await rpc(bob, 'straf_groepsband_klopt_voor_mij', { p_goal_id: g, p_group_id: x })).data).toBe(true);
    expect((await rpc(dave, 'straf_groepsband_klopt_voor_mij', { p_goal_id: g, p_group_id: x })).data).toBe(false);
    expect((await rpc(dave, 'straf_groepsband_klopt', { p_goal_id: g, p_group_id: x })).error).not.toBeNull();
  }, TEST_TIMEOUT);

  it('uitzetting: X leest olga’s straf niet meer, er komt geen bericht, en olga trekt in of wikkelt af', async () => {
    expect(uitkomst(await rpc(bob, 'verwijder_lid', { p_group_id: x, p_user_id: olga.id, p_bevestigd: true }))).toBe('ok');
    expect((await trekIn(olga, 'olga1')).error).toBeNull();
    expect((await stand('olga1')).status).toBe('cancelled');
    await maakVerschuldigd('olga2');
    expect([await leest(bob, 'olga2'), await leest(carol, 'olga2')]).toEqual([0, 0]);
    expect(await berichten(x, olga)).toBe(0);
    expect(uitkomst(await rpc(olga, 'herstel_stuurloze_straf', { p_commitment_id: straf.olga2, p_actie: 'afwikkelen', p_bevestigd: true }))).toBe('ok');
  }, TEST_TIMEOUT);

  it('(b) archief: alice trekt in, X leest zoals voorheen, en er komt geen nieuw bericht', async () => {
    expect(uitkomst(await rpc(bob, 'archiveer_groep', { p_group_id: w, p_bevestigd: true }))).toBe('ok');
    expect((await trekIn(alice, 'archief1')).error).toBeNull();
    expect((await stand('archief1')).status).toBe('cancelled');
    await maakVerschuldigd('archief2');
    expect(await leest(bob, 'archief2')).toBe(1);
    expect(await berichten(w, alice)).toBe(0);
    // De band is er nog: dit is geen stuurloze straf.
    expect(uitkomst(await rpc(alice, 'herstel_stuurloze_straf', { p_commitment_id: straf.archief2, p_actie: 'afwikkelen', p_bevestigd: true }))).toBe('heeft_nog_een_begunstigde');
  }, TEST_TIMEOUT);

  // ⚠️ Aanvulling van Quinten (23-11, 17:16 UTC): het derde geval waarin intrekken
  //    stukliep. Alice en frank delen alleen Y; alice verlaat Y.
  it('een persoonlijke getuige die geen groep meer deelt: alice trekt in, maar bewerkt niet', async () => {
    const { data: d } = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Doel getuige', target_date: datum(60) } as never)
      .select('id')
      .single();
    const { data: c, error } = await alice.db
      .from('commitments')
      .insert({ goal_id: (d as { id: string }).id, type: 'penalty', body: TEKST, beneficiary_user_id: frank.id, confirmed_at: new Date().toISOString() } as never)
      .select('id')
      .single();
    expect(error).toBeNull();
    straf.persoon = (c as { id: string }).id;
    expect(uitkomst(await rpc(alice, 'verlaat_groep', { p_group_id: y, p_bevestigd: true }))).toBe('ok');
    const bewerk = await alice.db.from('commitments').update({ body: 'Andere tekst' } as never).eq('id', straf.persoon);
    expect(bewerk.error?.code).toBe('42501');
    expect((await trekIn(alice, 'persoon')).error).toBeNull();
    expect((await stand('persoon')).status).toBe('cancelled');
    const { data: spoor } = await alice.db.from('commitment_events').select('event_type').eq('commitment_id', straf.persoon);
    expect((spoor as { event_type: string }[]).map((r) => r.event_type)).toContain('cancelled');
  }, TEST_TIMEOUT);
});
