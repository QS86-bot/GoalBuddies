import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { klassementPlek, toonKlassementUitnodiging, type KlassementGroep } from '../../src/modules/buddies/klassement-poort';

import { laatOrganisatieAanmaken } from './organisatie-toelating';
import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De uitnodigingskaart staat er precies waar de database het aanzetten zou accepteren — QS8-666 (A57), deel 3b.
 *
 * ⚠️ **De belofte is dat de kaart nooit een knop toont die gegarandeerd faalt, en nooit ontbreekt waar hij hoort.**
 *    `toonKlassementUitnodiging()` is een weergavehint; dit legt hem naast de echte weigering. De sondering is
 *    `zet_groepsklassement(p_aan => true, p_bevestigd => false)`: die geeft `not_confirmed` precies als alles
 *    wat het aanzetten zou weigeren (beheerder, teamgroep, automatisch, gearchiveerd) al voorbij is, en schrijft
 *    niets. Leunt een latere wijziging van 0336 op een andere volgorde van de toetsen, dan breekt deze sondering, en
 *    dat is de bedoeling.
 *
 * ⚠️ De rij komt zoals het scherm hem leest: `select('*')` onder de JWT van de kijker (`fetchGroep`).
 *
 * IJKING (met de hand, 22-11-2026): in `toonKlassementUitnodiging` `!groep.klassement_aan` weghalen -> de 'klassement aan'
 * rij valt om; `kanKlassementZetten` vervangen door `beheerder` -> de gearchiveerde, automatische en team-rij vallen om.
 */
const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

async function nieuweGroep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  return { id: d.group.id, code: d.group.invite_code };
}

async function zoalsHetScherm(wie: TestUser, groupId: string): Promise<KlassementGroep & { klassement_aan: boolean; automatisch: boolean }> {
  const { data, error } = await wie.db.from('groups').select('*').eq('id', groupId).maybeSingle();
  expect(error).toBeNull();
  const rij = data as unknown as KlassementGroep;
  // Een kolom die wegvalt is `undefined`, en `!undefined` maakt van elke beheerder een uitnodiging.
  expect(typeof rij.klassement_aan).toBe('boolean');
  expect(typeof rij.automatisch).toBe('boolean');
  return rij;
}

async function sondering(wie: TestUser, groupId: string): Promise<string | undefined> {
  const { data } = await wie.db.rpc('zet_groepsklassement' as never, { p_group_id: groupId, p_aan: true, p_bevestigd: false } as never);
  return (data as { reason?: string } | null)?.reason;
}

describe.runIf(rlsTestsConfigured)('de uitnodigingskaart volgt de poort van zet_groepsklassement (0336)', () => {
  let anna: TestUser;
  let bram: TestUser;
  let g: { id: string; code: string };

  beforeAll(async () => {
    [anna, bram] = await Promise.all([createTestUser('uitn-anna'), createTestUser('uitn-bram')]);
    g = await nieuweGroep(anna, 'Uitnodiging');
    const mee = await bram.db.rpc('join_group_with_code', { code: g.code });
    expect((mee.data as { ok?: boolean } | null)?.ok).toBe(true);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function uit(groupId: string): Promise<void> {
    expect((await adminDb().from('groups').update({ klassement_aan: false } as never).eq('id', groupId)).error).toBeNull();
  }

  it('beheerder in een gewone groep met het klassement uit: de kaart, en de database zou het aanzetten accepteren', async () => {
    await uit(g.id);
    const rij = await zoalsHetScherm(anna, g.id);
    expect(toonKlassementUitnodiging(rij, true)).toBe(true);
    expect(await sondering(anna, g.id)).toBe('not_confirmed');
  }, TEST_TIMEOUT);

  it('een gewoon lid krijgt de kaart niet, en de database weigert hem ook', async () => {
    await uit(g.id);
    const rij = await zoalsHetScherm(bram, g.id);
    expect(toonKlassementUitnodiging(rij, false)).toBe(false);
    expect(await sondering(bram, g.id)).toBe('not_admin');
  }, TEST_TIMEOUT);

  it('klassement aan: geen kaart', async () => {
    expect((await adminDb().from('groups').update({ klassement_aan: true } as never).eq('id', g.id)).error).toBeNull();
    const rij = await zoalsHetScherm(anna, g.id);
    expect(toonKlassementUitnodiging(rij, true)).toBe(false);
  }, TEST_TIMEOUT);

  it('gearchiveerd en automatisch gevormd: geen kaart, en de database weigert het aanzetten', async () => {
    const a = await nieuweGroep(anna, 'Uitn-archief');
    await uit(a.id);
    expect((await adminDb().from('groups').update({ status: 'archived' } as never).eq('id', a.id)).error).toBeNull();
    expect(toonKlassementUitnodiging(await zoalsHetScherm(anna, a.id), true)).toBe(false);
    expect(await sondering(anna, a.id)).not.toBe('not_confirmed');

    const b = await nieuweGroep(anna, 'Uitn-automatisch');
    await uit(b.id);
    expect((await adminDb().from('groups').update({ automatisch: true } as never).eq('id', b.id)).error).toBeNull();
    expect(toonKlassementUitnodiging(await zoalsHetScherm(anna, b.id), true)).toBe(false);
    expect(await sondering(anna, b.id)).not.toBe('not_confirmed');
  }, TEST_TIMEOUT);

  it('een teamgroep: geen kaart, en de database weigert het aanzetten', async () => {
    await laatOrganisatieAanmaken(anna);
    const o = await anna.db.rpc('maak_organisatie' as never, { p_naam: 'Uitn BV' } as never);
    const org = (o.data as unknown as { organization_id: string }).organization_id;
    const t = await anna.db.rpc('maak_teamgroep' as never, { p_organization_id: org, p_naam: 'Team Uitn' } as never);
    const team = (t.data as unknown as { group_id?: string } | null)?.group_id;
    expect(team, JSON.stringify(t.data)).toBeDefined();
    registreerGroep(team as string);
    // De organisatiebeheerder is geen lid en leest de rij zelf niet (RLS); de rij komt hier met de servicerol, zoals een
    // lid van de teamgroep hem zou lezen.
    const { data } = await adminDb().from('groups').select('*').eq('id', team as string).single();
    expect(toonKlassementUitnodiging(data as unknown as KlassementGroep, true)).toBe(false);
    expect(await sondering(anna, team as string)).not.toBe('not_confirmed');
  }, TEST_TIMEOUT);

  it('de keten: uit -> kaart voor de beheerder en niets voor het lid; na het aanzetten voor beiden de lijst', async () => {
    await uit(g.id);
    const leeg = { staat: 'ok', pagina: { rijen: [] } } as const;
    const klassement = async (wie: TestUser) => {
      const { data, error } = await wie.db.rpc('groep_klassement', { p_group_id: g.id, p_limit: 20, p_offset: 0 });
      expect(error).toBeNull();
      return { staat: 'ok', pagina: { rijen: (data ?? []) as unknown[] } } as const;
    };
    expect(await klassement(bram)).toEqual(leeg);
    expect(klassementPlek(await klassement(anna), await zoalsHetScherm(anna, g.id), true)).toBe('uitnodiging');
    expect(klassementPlek(await klassement(bram), await zoalsHetScherm(bram, g.id), false)).toBe('niets');

    const aan = await anna.db.rpc('zet_groepsklassement' as never, { p_group_id: g.id, p_aan: true, p_bevestigd: true } as never);
    expect((aan.data as { ok?: boolean } | null)?.ok).toBe(true);

    expect(klassementPlek(await klassement(anna), await zoalsHetScherm(anna, g.id), true)).toBe('lijst');
    expect(klassementPlek(await klassement(bram), await zoalsHetScherm(bram, g.id), false)).toBe('lijst');
    expect(toonKlassementUitnodiging(await zoalsHetScherm(anna, g.id), true)).toBe(false);
  }, TEST_TIMEOUT);
});
