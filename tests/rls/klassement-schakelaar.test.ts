import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Het klassement hangt aan een schakelaar op de groep — QS8-666 (A57), migratie 0329, PR 1.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** het klassement staat alleen aan waar het aan
 *    hoort te staan, en geen enkele client kan het zelf aanzetten. Daarom toetst dit bestand de
 *    poort, het slot op de kolom, de beginstand, besluit 45 (openzetten zet het aan) en de teamgrens
 *    samen, op de database en niet op een scherm.
 *
 * ⚠️ **Beide kanten.** Aan geeft rijen; uit, gearchiveerd, niet-lid en teamgroep geven er nul.
 *
 * Met de hand gebroken (zie de PR): de teamvoorwaarde en de CHECK, de schakelaar uit
 * `groep_klassement()`, het archief uit `lid_van_levende_groep()`, de update in `zet_groepszichtbaarheid()`.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

interface Rij {
  readonly user_id: string;
}

async function maakGroep(eigenaar: TestUser, naam: string, zichtbaarheid: 'beschermd' | 'open'): Promise<{ id: string; code: string }> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam, zichtbaarheid });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  return { id: d.group.id, code: d.group.invite_code };
}

async function laatMeedoen(wie: TestUser, code: string): Promise<void> {
  const mee = await wie.db.rpc('join_group_with_code', { code });
  if ((mee.data as { ok?: boolean } | null)?.ok !== true) throw new Error(`lid worden: ${JSON.stringify(mee.data)}`);
}

async function klassement(wie: TestUser, groupId: string): Promise<Rij[]> {
  const { data, error } = await wie.db.rpc('groep_klassement', { p_group_id: groupId, p_limit: 50, p_offset: 0 });
  expect(error).toBeNull();
  return (data ?? []) as unknown as Rij[];
}

async function aan(groupId: string): Promise<boolean> {
  const { data } = await adminDb().from('groups').select('klassement_aan').eq('id', groupId).single();
  return (data as { klassement_aan: boolean } | null)?.klassement_aan === true;
}

describe.runIf(rlsTestsConfigured)('het klassement hangt aan een schakelaar (A57, 0329)', () => {
  let anna: TestUser; // beheerder van alles
  let bram: TestUser; // lid
  let cor: TestUser; // geen lid
  let dicht: { id: string; code: string };
  let open: { id: string; code: string };

  beforeAll(async () => {
    [anna, bram, cor] = await Promise.all([createTestUser('schak-anna'), createTestUser('schak-bram'), createTestUser('schak-cor')]);
    dicht = await maakGroep(anna, 'Schakel-dicht', 'beschermd');
    open = await maakGroep(anna, 'Schakel-open', 'open');
    await laatMeedoen(bram, dicht.code);
    await laatMeedoen(bram, open.code);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('de beginstand volgt de zichtbaarheid van een nieuwe groep (open aan, beschermd uit)', async () => {
    expect(await aan(open.id)).toBe(true);
    expect(await aan(dicht.id)).toBe(false);
  }, TEST_TIMEOUT);

  it('geeft in een beschermde groep met de schakelaar aan een rij per actief lid, en uit nul', async () => {
    expect(await klassement(bram, dicht.id)).toEqual([]);
    expect((await adminDb().from('groups').update({ klassement_aan: true } as never).eq('id', dicht.id)).error).toBeNull();
    const rijen = await klassement(bram, dicht.id);
    expect(rijen.map((r) => r.user_id).sort()).toEqual([anna.id, bram.id].sort());
    expect((await adminDb().from('groups').update({ klassement_aan: false } as never).eq('id', dicht.id)).error).toBeNull();
    expect(await klassement(bram, dicht.id)).toEqual([]);
  }, TEST_TIMEOUT);

  it('geeft een niet-lid nul rijen, ook als het klassement aan staat', async () => {
    expect((await klassement(cor, open.id)).length).toBe(0);
  }, TEST_TIMEOUT);

  it('geeft in een gearchiveerde groep nul rijen, ook als het klassement aan staat', async () => {
    const g = await maakGroep(anna, 'Schakel-archief', 'open');
    await laatMeedoen(bram, g.code);
    expect((await klassement(bram, g.id)).length).toBe(2);
    const arch = await adminDb().from('groups').update({ status: 'archived' } as never).eq('id', g.id);
    expect(arch.error).toBeNull();
    expect(await klassement(bram, g.id), 'een gearchiveerde groep deelt het klassement nog uit').toEqual([]);
  }, TEST_TIMEOUT);

  it('laat een client de schakelaar niet zelf zetten (update en insert)', async () => {
    const upd = await anna.db.from('groups').update({ klassement_aan: true } as never).eq('id', dicht.id).select();
    expect(upd.error, 'een beheerder kon de schakelaar zelf aanzetten').not.toBeNull();
    expect(await aan(dicht.id)).toBe(false);
    const ins = await anna.db.from('groups').insert({ name: 'Zelf aan', klassement_aan: true } as never);
    expect(ins.error, 'een client kon een groep met het klassement aan aanmaken').not.toBeNull();
  }, TEST_TIMEOUT);

  it('zet het klassement aan bij het openzetten (besluit 45), met een rij en een bericht, en houdt het aan bij beschermen', async () => {
    const g = await maakGroep(anna, 'Schakel-omzetten', 'beschermd');
    await laatMeedoen(bram, g.code);
    expect(await aan(g.id)).toBe(false);

    const o = await anna.db.rpc('zet_groepszichtbaarheid', { p_group_id: g.id, p_naar: 'open', p_bevestigd: true });
    expect((o.data as { ok?: boolean } | null)?.ok, JSON.stringify(o.data)).toBe(true);
    expect(await aan(g.id)).toBe(true);
    expect((await klassement(bram, g.id)).length).toBe(2);

    const ev = await adminDb().from('group_events').select('event_type, new_value').eq('group_id', g.id).eq('event_type', 'leaderboard_changed');
    expect((ev.data ?? []).length).toBe(1);
    expect(((ev.data ?? [])[0] as { new_value: { reden?: string } }).new_value.reden).toBe('opened');
    const bericht = await adminDb().from('chat_messages').select('system_event').eq('group_id', g.id).eq('system_event', 'leaderboard_enabled');
    expect((bericht.data ?? []).length, 'geen bericht dat het klassement aanging').toBe(1);

    // Beschermen: het klassement blijft staan (besluit van Quinten, 18-11-2026).
    const p = await anna.db.rpc('zet_groepszichtbaarheid', { p_group_id: g.id, p_naar: 'beschermd', p_bevestigd: true });
    expect((p.data as { ok?: boolean } | null)?.ok, JSON.stringify(p.data)).toBe(true);
    expect(await aan(g.id)).toBe(true);
    expect((await klassement(bram, g.id)).length).toBe(2);
  }, TEST_TIMEOUT);

  it('een teamgroep heeft nooit een klassement: de CHECK weigert, ook voor service_role', async () => {
    const o = await anna.db.rpc('maak_organisatie', { p_naam: 'Schakel BV' });
    const org = (o.data as { organization_id: string }).organization_id;
    try {
      const t = await anna.db.rpc('maak_teamgroep', { p_organization_id: org, p_naam: 'Team Schakel' });
      const team = (t.data as { group_id?: string } | null)?.group_id;
      expect(team, JSON.stringify(t.data)).toBeDefined();
      registreerGroep(team as string);
      expect(await aan(team as string)).toBe(false);
      const zet = await adminDb().from('groups').update({ klassement_aan: true } as never).eq('id', team as string);
      expect(zet.error, 'service_role kon een teamgroep een klassement geven').not.toBeNull();
      // Openzetten doet geen klassement in een teamgroep (besluit 45 geldt niet voor teams).
      await anna.db.rpc('zet_groepszichtbaarheid', { p_group_id: team as string, p_naar: 'open', p_bevestigd: true });
      expect(await aan(team as string)).toBe(false);
      expect((await klassement(anna, team as string)).length).toBe(0);
    } finally {
      await adminDb().from('groups').delete().eq('organization_id' as never, org as never);
      await adminDb().from('organization_members' as never).delete().eq('organization_id' as never, org as never);
      await adminDb().from('organizations' as never).delete().eq('id' as never, org as never);
    }
  }, TEST_TIMEOUT);
});
