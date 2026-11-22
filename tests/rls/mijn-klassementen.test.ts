import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, anonDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Alle klassementen in één verzoek — QS8-666 (A57), deel 3c-db: `mijn_klassementen()`.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel en niet van de functie:** `mijn_klassementen()` is een
 *    tweede rangschikking naast `groep_klassement()` (besluit Quinten 22-11-2026: variant A, één RPC, geen N+1).
 *    Twee correcte onderdelen die uiteen kunnen lopen. Daarom legt dit bestand ze naast elkaar: per groep dezelfde
 *    rijen als `groep_klassement()`, en dezelfde verzameling groepen waar die functie rijen geeft.
 *
 * ⚠️ **Beide kanten.** Aan geeft rijen; uit, uitgezet, gearchiveerd, automatisch, verlaten en niet-lid geven er geen.
 *
 * MET DE HAND GEBROKEN (zie de PR): de poort (lid_van_levende_groep, m.user_id = auth.uid(), klassement_aan,
 * organization_id, automatisch), de sommen zonder filter op groep, `rank()` in plaats van `row_number()`, de eigen rij
 * (`or user_id = auth.uid()`), de grant aan anon, de klem op het aantal groepen, een datumkolom erbij.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;
const SLEUTELS = ['display_name', 'group_id', 'group_name', 'positie', 'punten', 'total_groups', 'total_members', 'user_id'];

interface Rij {
  readonly group_id: string;
  readonly group_name: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly punten: number;
  readonly positie: number;
  readonly total_members: number;
  readonly total_groups: number;
}

interface Standrij {
  readonly user_id: string;
  readonly display_name: string;
  readonly punten: number;
  readonly positie: number;
  readonly total_members: number;
}

interface Groep {
  readonly id: string;
  readonly code: string;
}

async function maakGroep(eigenaar: TestUser, naam: string, zichtbaarheid: 'beschermd' | 'open', klassementAan = true): Promise<Groep> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam, zichtbaarheid });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  if (!klassementAan) await zetKlassement(d.group.id, false);
  return { id: d.group.id, code: d.group.invite_code };
}

async function zetKlassement(groupId: string, aan: boolean): Promise<void> {
  const r = await adminDb().from('groups').update({ klassement_aan: aan } as never).eq('id', groupId);
  if (r.error) throw new Error(`klassement zetten: ${r.error.message}`);
}

async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
  const mee = await wie.db.rpc('join_group_with_code', { code: groep.code });
  if ((mee.data as { ok?: boolean } | null)?.ok !== true) throw new Error(`lid worden: ${JSON.stringify(mee.data)}`);
}

async function geefPunten(wie: TestUser, groupId: string, delta: number): Promise<void> {
  const r = await adminDb().from('points_ledger').insert({
    user_id: wie.id,
    group_id: groupId,
    delta,
    reason: 'correction',
  } as never);
  if (r.error) throw new Error(`punten boeken: ${r.error.message}`);
}

async function mijn(wie: TestUser, limit?: number, offset?: number): Promise<Rij[]> {
  const args: Record<string, unknown> = {};
  if (limit !== undefined) args.p_limit = limit;
  if (offset !== undefined) args.p_offset = offset;
  const { data, error } = await wie.db.rpc('mijn_klassementen' as never, args as never);
  expect(error, JSON.stringify(error)).toBeNull();
  return (data ?? []) as unknown as Rij[];
}

async function klassement(wie: TestUser, groupId: string, limit = 50): Promise<Standrij[]> {
  const { data, error } = await wie.db.rpc('groep_klassement', { p_group_id: groupId, p_limit: limit, p_offset: 0 });
  expect(error).toBeNull();
  return (data ?? []) as unknown as Standrij[];
}

const vanGroep = (rijen: readonly Rij[], groupId: string): Rij[] => rijen.filter((r) => r.group_id === groupId);

describe.runIf(rlsTestsConfigured)('mijn_klassementen() volgt groep_klassement() (QS8-666, 3c-db)', () => {
  let anna: TestUser; // staat 7e in K7
  let bram: TestUser;
  let cor: TestUser;
  let dirk: TestUser;
  let eva: TestUser;
  let fien: TestUser;
  let gijs: TestUser;
  let k7: Groep; // zeven leden, beschermd, klassement aan
  let kopen: Groep; // open, aan, Anna bij de vijf
  let uit: Groep; // beschermd, klassement uit
  let elders: Groep; // Bram, uit, met punten

  beforeAll(async () => {
    [anna, bram, cor, dirk, eva, fien, gijs] = await Promise.all([
      createTestUser('mk-anna'),
      createTestUser('mk-bram'),
      createTestUser('mk-cor'),
      createTestUser('mk-dirk'),
      createTestUser('mk-eva'),
      createTestUser('mk-fien'),
      createTestUser('mk-gijs'),
    ]);

    k7 = await maakGroep(anna, 'MK-zeven', 'beschermd');
    for (const lid of [bram, cor, dirk, eva, fien, gijs]) await laatMeedoen(lid, k7);
    // Bram, Cor en Dirk staan gelijk op 4e (drie gelijk over de grens van vijf heen); Anna is 7e met de minste punten.
    for (const [wie, n] of [[gijs, 10], [fien, 9], [eva, 8], [dirk, 7], [cor, 7], [bram, 7], [anna, 2]] as const) {
      await geefPunten(wie, k7.id, n);
    }

    kopen = await maakGroep(anna, 'MK-kopen', 'open');
    await laatMeedoen(bram, kopen);
    await laatMeedoen(cor, kopen);
    await geefPunten(anna, kopen.id, 5);
    await geefPunten(bram, kopen.id, 3);

    uit = await maakGroep(anna, 'MK-uit', 'beschermd', false);
    elders = await maakGroep(bram, 'MK-elders', 'beschermd', false);
    await geefPunten(bram, elders.id, 40);
    await geefPunten(bram, uit.id, 11);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('AC1: de vijf bovenste zijn rij voor rij groep_klassement(g,5,0), plus Anna als zesde rij', async () => {
    const rijen = vanGroep(await mijn(anna), k7.id);
    const eerste = (await klassement(anna, k7.id, 5)).map(({ user_id, display_name, punten, positie, total_members }) => ({ user_id, display_name, punten, positie, total_members }));
    const uitRpc = rijen.slice(0, 5).map(({ user_id, display_name, punten, positie, total_members }) => ({ user_id, display_name, punten, positie, total_members }));
    expect(uitRpc).toEqual(eerste);

    const volledig = await klassement(anna, k7.id, 50);
    const eigen = volledig.find((r) => r.user_id === anna.id);
    expect(eigen, 'Anna staat niet in groep_klassement').toBeDefined();
    expect(rijen).toHaveLength(6);
    expect(rijen[5]).toMatchObject({ user_id: anna.id, punten: eigen?.punten, positie: eigen?.positie, total_members: 7 });
  }, TEST_TIMEOUT);

  it('AC2: staat Anna bij de vijf, dan staat ze er één keer in en zijn er niet meer rijen dan leden', async () => {
    const rijen = vanGroep(await mijn(anna), kopen.id);
    expect(rijen).toHaveLength(3);
    expect(rijen.filter((r) => r.user_id === anna.id)).toHaveLength(1);
  }, TEST_TIMEOUT);

  it('AC3: dezelfde groepen als waar groep_klassement() Anna rijen geeft, in twee richtingen', async () => {
    // Extra groepen die de poort moet afwijzen: gearchiveerd, automatisch gevormd, verlaten, en een groep waar ze niet in zit.
    const archief = await maakGroep(anna, 'MK-archief', 'beschermd');
    await adminDb().from('groups').update({ status: 'archived' } as never).eq('id', archief.id);
    const auto = await maakGroep(anna, 'MK-auto', 'beschermd', false);
    // De CHECK `groups_automatisch_geen_klassement` houdt een automatisch gevormde groep met klassement tegen; zonder die CHECK zou
    // `groep_klassement()` er rijen voor geven en `mijn_klassementen()` niet, en wordt de vergelijking hieronder rood (bedoeld alarm).
    expect((await adminDb().from('groups').update({ automatisch: true } as never).eq('id', auto.id)).error).toBeNull();
    const verlaten = await maakGroep(bram, 'MK-verlaten', 'beschermd');
    await laatMeedoen(anna, verlaten);
    await adminDb().from('group_members').update({ status: 'inactive' } as never).eq('group_id', verlaten.id).eq('user_id', anna.id);
    const vreemd = await maakGroep(bram, 'MK-vreemd', 'beschermd');

    const kandidaten = [k7, kopen, uit, elders, archief, auto, verlaten, vreemd];
    const viaKlassement: string[] = [];
    for (const g of kandidaten) if ((await klassement(anna, g.id)).length > 0) viaKlassement.push(g.id);

    const viaRpc = [...new Set((await mijn(anna)).map((r) => r.group_id))];
    expect(viaRpc.sort()).toEqual(viaKlassement.sort());
    expect(viaRpc.sort()).toEqual([k7.id, kopen.id].sort());
  }, TEST_TIMEOUT);

  it('AC4: een gemiste week beweegt niets, en de database weigert er een met een groep', async () => {
    const voor = vanGroep(await mijn(anna), k7.id).find((r) => r.user_id === anna.id);
    const metGroep = await adminDb().from('points_ledger').insert({ user_id: anna.id, group_id: k7.id, delta: -1, reason: 'cycle_missed' } as never);
    expect(metGroep.error?.code, 'een gemiste week mét groep werd geboekt').toBe('23514');
    const zonder = await adminDb().from('points_ledger').insert({ user_id: anna.id, group_id: null, delta: -1, reason: 'cycle_missed' } as never);
    expect(zonder.error, zonder.error?.message).toBeNull();
    const na = vanGroep(await mijn(anna), k7.id).find((r) => r.user_id === anna.id);
    expect(na).toMatchObject({ punten: voor?.punten, positie: voor?.positie });
  }, TEST_TIMEOUT);

  it('AC5: alleen de punten van déze groep, en een groep zonder klassement komt er niet in', async () => {
    const rijen = await mijn(bram);
    const inK7 = vanGroep(rijen, k7.id).find((r) => r.user_id === bram.id);
    expect(inK7?.punten).toBe(7);
    expect(rijen.some((r) => r.group_id === elders.id || r.group_id === uit.id), 'een groep zonder klassement stond erin').toBe(false);
  }, TEST_TIMEOUT);

  it('AC6: precies deze kolommen, geen datum en geen delta', async () => {
    const rijen = await mijn(anna);
    expect(rijen.length).toBeGreaterThan(0);
    for (const r of rijen) expect(Object.keys(r).sort()).toEqual(SLEUTELS);
  }, TEST_TIMEOUT);

  it('AC7: anon mag hem niet aanroepen', async () => {
    const { data, error } = await anonDb().rpc('mijn_klassementen' as never, {} as never);
    expect(error, 'anon kreeg een antwoord').not.toBeNull();
    expect(data ?? []).toEqual([]);
  }, TEST_TIMEOUT);

  it('AC8: zonder groepen komen er nul rijen', async () => {
    const leeg = await createTestUser('mk-leeg');
    expect(await mijn(leeg)).toEqual([]);
  }, TEST_TIMEOUT);

  it('AC9: pagineert op groepen, begrensd, en lege of negatieve waarden vallen terug', async () => {
    const alles = await mijn(anna);
    const groepen = [...new Set(alles.map((r) => r.group_id))];
    expect(groepen.length).toBeGreaterThanOrEqual(2);
    expect(alles[0]?.total_groups).toBe(groepen.length);

    const eerste = await mijn(anna, 1, 0);
    const tweede = await mijn(anna, 1, 1);
    const g1 = new Set(eerste.map((r) => r.group_id));
    const g2 = new Set(tweede.map((r) => r.group_id));
    expect(g1.size).toBe(1);
    expect(g2.size).toBe(1);
    expect([...g1].some((g) => g2.has(g)), 'de pagina\'s overlappen').toBe(false);

    expect(await mijn(anna, 1000)).toEqual(alles);
    expect(await mijn(anna, 10, -5)).toEqual(alles);
  }, TEST_TIMEOUT);

  it('AC10: hoogstens zes rijen per groep', async () => {
    for (const groupId of new Set((await mijn(anna)).map((r) => r.group_id))) {
      expect(vanGroep(await mijn(anna), groupId).length).toBeLessThanOrEqual(6);
    }
  }, TEST_TIMEOUT);

  it('AC12: een uitgezet lid van een groep staat er niet in en telt niet mee in total_members, net als in groep_klassement()', async () => {
    const g = await maakGroep(anna, 'MK-inactief', 'beschermd');
    await laatMeedoen(bram, g);
    await laatMeedoen(cor, g);
    await geefPunten(anna, g.id, 3);
    await geefPunten(bram, g.id, 2);
    await geefPunten(cor, g.id, 9);
    const uitgezet = await adminDb().from('group_members').update({ status: 'inactive' } as never).eq('group_id', g.id).eq('user_id', cor.id);
    expect(uitgezet.error).toBeNull();

    const rijen = vanGroep(await mijn(anna), g.id);
    expect(rijen.map((r) => r.user_id).sort()).toEqual([anna.id, bram.id].sort());
    expect(rijen.every((r) => r.total_members === 2), 'een uitgezet lid telt mee in total_members').toBe(true);
    expect(await klassement(anna, g.id)).toHaveLength(2);
  }, TEST_TIMEOUT);

  it('AC11: een buitenstaander ziet niets van een groep waar hij geen lid van is', async () => {
    const vreemde = await createTestUser('mk-buiten');
    expect(await mijn(vreemde)).toEqual([]);
    // Een buitenstaander die wél lid is van een eigen groep met klassement, ziet daar K7 niet tussen.
    const eigen = await maakGroep(vreemde, 'MK-buiten-eigen', 'beschermd');
    const zijnLijst = await mijn(vreemde);
    expect(zijnLijst.length).toBeGreaterThan(0);
    expect(zijnLijst.every((r) => r.group_id === eigen.id)).toBe(true);
    expect(zijnLijst.some((r) => r.group_id === k7.id)).toBe(false);
  }, TEST_TIMEOUT);
});
