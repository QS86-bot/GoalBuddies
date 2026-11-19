import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PROFIEL_RPC_KOLOMMEN } from '../../src/modules/buddies/profiel-kolommen';

import {
  adminDb,
  anonDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { proefId } from './proefid';
import { psql } from './psql-stack';

/**
 * Het profiel van een groepsgenoot — QS8-750, migratie 0308.
 *
 * ⚠️ **De vraag is niet "werkt het profiel" maar: wat kan een groepsgenoot met
 *    één API-verzoek uitlezen, en kan daar een gemiste week uit volgen?** Elke
 *    toets hieronder gaat dus met een echt JWT rechtstreeks naar de RPC, zonder
 *    scherm ertussen.
 *
 * ⚠️ De naadtoets (regel 18) staat onderaan: de kolommen die de module
 *    (`PROFIEL_RPC_KOLOMMEN`, de bron van wat de tabs tonen) belooft zijn
 *    exact de kolommen die de database geeft.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

let anna: TestUser; // eigenaar van de doelen
let bram: TestUser; // deelt G (beschermd) en O (open) met Anna
let cor: TestUser; // in niets
let dirk: TestUser; // deelt alleen G2 met Anna
let G: Groep;
let G2: Groep;
let O: Groep;
let Z: Groep;
const doelen: Record<string, string> = {};

async function maakGroep(eigenaar: TestUser, naam: string, zicht: string): Promise<Groep> {
  const { data, error } = await eigenaar.db.rpc('create_group', {
    group_name: naam,
    zichtbaarheid: zicht,
  });
  if (error) throw new Error(`groep ${naam}: ${error.message}`);
  const g = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (g.ok !== true || !g.group) throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
  return { id: g.group.id, code: g.group.invite_code };
}

async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
  const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
  if (error) throw new Error(`meedoen: ${error.message}`);
  if ((data as unknown as { ok?: boolean }).ok !== true) {
    throw new Error(`meedoen mislukte: ${JSON.stringify(data)}`);
  }
}

async function maakDoel(titel: string, groepen: readonly Groep[], status = 'active') {
  const doel = await anna.db
    .from('goals')
    .insert({ owner_id: anna.id, title: titel, target_date: '2027-06-30' })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);
  for (const g of groepen) {
    const k = await anna.db.from('goal_group_links').insert({ goal_id: doel.data.id, group_id: g.id });
    if (k.error) throw new Error(`koppelen: ${k.error.message}`);
  }
  if (status !== 'active') {
    psql(`update goals set status = '${status}' where id = '${doel.data.id}'`);
  }
  doelen[titel] = doel.data.id;
  return doel.data.id;
}

type Rij = Record<string, unknown>;

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>): Promise<Rij[]> {
  const { data, error } = await (wie.db as unknown as {
    rpc(n: string, a: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  }).rpc(naam, args);
  if (error) throw new Error(`${naam}: ${error.message}`);
  return (data ?? []) as Rij[];
}

const doelenVan = (kijker: TestUser, van: TestUser, extra: Record<string, unknown> = {}) =>
  rpc(kijker, 'profiel_doelen_van_lid', { p_user: van.id, ...extra });
const titels = (rijen: Rij[]) => rijen.map((r) => r.titel as string).sort();

describe.skipIf(!rlsTestsConfigured)('het profiel van een groepsgenoot', () => {
  beforeAll(async () => {
    anna = await createTestUser('profiel-anna');
    bram = await createTestUser('profiel-bram');
    cor = await createTestUser('profiel-cor');
    dirk = await createTestUser('profiel-dirk');

    G = await maakGroep(anna, 'Profiel-G', 'beschermd');
    G2 = await maakGroep(anna, 'Profiel-G2', 'beschermd');
    O = await maakGroep(anna, 'Profiel-O', 'open');
    Z = await maakGroep(anna, 'Profiel-Z', 'beschermd');
    await laatMeedoen(bram, G);
    await laatMeedoen(bram, O);
    await laatMeedoen(dirk, G2);
    await laatMeedoen(bram, Z);

    const x = await maakDoel('PROFIEL actief gedeeld', [G]);
    await maakDoel('PROFIEL afgerond gedeeld', [G], 'completed');
    await maakDoel('PROFIEL opgegeven', [G], 'archived');
    await maakDoel('PROFIEL alleen G2', [G2]);
    await maakDoel('PROFIEL zonder groep', []);
    await maakDoel('PROFIEL open', [O]);
    await maakDoel('PROFIEL gedeeld en niet-gedeeld', [G, G2]);
    await maakDoel('PROFIEL alleen gearchiveerde groep', [Z]);

    // Pas na het koppelen: in een gearchiveerde groep kun je niets meer koppelen.
    psql(`update groups set status = 'archived' where id = '${Z.id}'`);

    // Mijlpalen worden niet door een client geschreven; psql, met de status direct.
    for (const [i, status] of ['done', 'todo', 'dropped'].entries()) {
      psql(
        `insert into milestones (goal_id, title, order_index, status) ` +
          `values ('${x}', 'PROFIEL mijlpaal ${i}', ${i}, '${status}')`,
      );
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('een groepsgenoot ziet alleen actieve en afgeronde doelen in een gedeelde groep', async () => {
    const rijen = await doelenVan(bram, anna);
    expect(titels(rijen)).toEqual(
      [
        'PROFIEL actief gedeeld',
        'PROFIEL afgerond gedeeld',
        'PROFIEL gedeeld en niet-gedeeld',
        'PROFIEL open',
      ].sort(),
    );
  }, TEST_TIMEOUT);

  it('geeft exact de beloofde kolommen en geen datum, reeks of punt', async () => {
    const rij = (await doelenVan(bram, anna))[0];
    expect(Object.keys(rij ?? {}).sort()).toEqual([...PROFIEL_RPC_KOLOMMEN.doelen].sort());
    const profiel = await rpc(bram, 'profiel_van_lid', { p_user: anna.id });
    expect(profiel).toHaveLength(1);
    expect(Object.keys(profiel[0] ?? {}).sort()).toEqual([...PROFIEL_RPC_KOLOMMEN.profiel].sort());
    const groepen = await rpc(bram, 'profiel_groepen_van_lid', { p_user: anna.id });
    expect(Object.keys(groepen[0] ?? {}).sort()).toEqual([...PROFIEL_RPC_KOLOMMEN.groepen].sort());
  }, TEST_TIMEOUT);

  it('telt mijlpalen zonder de afgevallen', async () => {
    const rij = (await doelenVan(bram, anna)).find((r) => r.titel === 'PROFIEL actief gedeeld');
    expect(Number(rij?.mijlpalen_totaal)).toBe(2);
    expect(Number(rij?.mijlpalen_klaar)).toBe(1);
  }, TEST_TIMEOUT);

  it('geeft een niet-groepsgenoot en een onbekend id hetzelfde lege antwoord', async () => {
    const onbekend = proefId(1);
    for (const naam of ['profiel_van_lid', 'profiel_doelen_van_lid', 'profiel_groepen_van_lid']) {
      expect(await rpc(cor, naam, { p_user: anna.id })).toEqual([]);
      expect(await rpc(bram, naam, { p_user: onbekend })).toEqual([]);
    }
  }, TEST_TIMEOUT);

  it('geeft een groepsgenoot van een andere groep alleen die gedeelde groep', async () => {
    expect(titels(await doelenVan(dirk, anna))).toEqual(['PROFIEL alleen G2', 'PROFIEL gedeeld en niet-gedeeld'].sort());
    const groepen = await rpc(dirk, 'profiel_groepen_van_lid', { p_user: anna.id });
    expect(groepen.map((g) => g.naam)).toEqual(['Profiel-G2']);
    const bramGroepen = await rpc(bram, 'profiel_groepen_van_lid', { p_user: anna.id });
    expect(bramGroepen.map((g) => g.naam).sort()).toEqual(['Profiel-G', 'Profiel-O']); // niet G2, niet de gearchiveerde Z
  }, TEST_TIMEOUT);

  it('geeft jezelf dezelfde projectie, niet rijker ("zo ziet je groep je")', async () => {
    const eigen = await doelenVan(anna, anna);
    expect(titels(eigen)).not.toContain('PROFIEL zonder groep');
    expect(titels(eigen)).not.toContain('PROFIEL opgegeven');
  }, TEST_TIMEOUT);

  it('is anon niet toegestaan', async () => {
    const { error } = await (anonDb() as unknown as {
      rpc(n: string, a: Record<string, unknown>): PromiseLike<{ error: unknown }>;
    }).rpc('profiel_doelen_van_lid', { p_user: anna.id });
    expect(error).not.toBeNull();
  }, TEST_TIMEOUT);

  it('kapt de pagina af op 50 en pagineert zonder dubbelen', async () => {
    expect((await doelenVan(bram, anna, { p_limit: 10000 })).length).toBeLessThanOrEqual(50);
    const a = await doelenVan(bram, anna, { p_limit: 2, p_offset: 0 });
    const b = await doelenVan(bram, anna, { p_limit: 2, p_offset: 2 });
    const alles = titels([...a, ...b]);
    expect(new Set(alles).size).toBe(alles.length);
    expect(alles).toHaveLength(4);
  }, TEST_TIMEOUT);

  it('verandert niet door een gemiste week, ook niet in een open groep', async () => {
    const voor = JSON.stringify(await doelenVan(bram, anna));
    const voorProfiel = JSON.stringify(await rpc(bram, 'profiel_van_lid', { p_user: anna.id }));

    // Een gemiste week en een gebroken reeks, rechtstreeks in de database.
    const doelId = doelen['PROFIEL open'];
    const week = adminDb()
      .from('weekly_goals')
      .insert({
        goal_id: doelId ?? '',
        title: 'PROFIEL gemist',
        floor_text: 'a',
        ceiling_text: 'b',
        cycle_start_date: '2026-01-05',
        status: 'missed',
      });
    const gemist = await week;
    if (gemist.error) throw new Error(`gemiste week: ${gemist.error.message}`);
    psql(`update user_streaks set current_streak = 0 where user_id = '${anna.id}'`);

    expect(JSON.stringify(await doelenVan(bram, anna))).toBe(voor);
    expect(JSON.stringify(await rpc(bram, 'profiel_van_lid', { p_user: anna.id }))).toBe(voorProfiel);
  }, TEST_TIMEOUT);

  it('laat een uitgezet lid niet langer zien', async () => {
    psql(`update group_members set status = 'inactive' where user_id = '${dirk.id}'`);
    expect(await doelenVan(dirk, anna)).toEqual([]);
    expect(await rpc(dirk, 'profiel_van_lid', { p_user: anna.id })).toEqual([]);
    expect(await doelenVan(anna, dirk)).toEqual([]);
  }, TEST_TIMEOUT);

  it('geeft in een open groep niet meer dan in een beschermde (zelfde kolommen)', async () => {
    const open = (await doelenVan(bram, anna)).find((r) => r.titel === 'PROFIEL open');
    const dicht = (await doelenVan(bram, anna)).find((r) => r.titel === 'PROFIEL actief gedeeld');
    expect(Object.keys(open ?? {}).sort()).toEqual(Object.keys(dicht ?? {}).sort());
  }, TEST_TIMEOUT);
});
