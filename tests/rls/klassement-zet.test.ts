import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een beheerder zet het klassement aan of uit — QS8-666 (A57), migratie 0330, PR 2.
 *
 * ⚠️ **De belofte is dat dit de enige weg is en dat hij niets stilzwijgend doet:** een beheerder, een bevestiging, een
 *    rij in `group_events` en een bericht, in beide richtingen. Geen lid, geen niet-bevestigde aanroep, geen teamgroep,
 *    geen automatisch gevormde groep en geen gearchiveerde groep komt erlangs.
 *
 * ⚠️ **Beide kanten:** elke weigering laat de schakelaar en het spoor ongewijzigd, en een geslaagde wissel laat precies
 *    één rij en één bericht achter.
 *
 * Met de hand gebroken: de beheerderstoets, de bevestiging, de `for update`-volgorde is niet toetsbaar zonder twee sessies.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

interface Antwoord {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly klassement?: boolean;
}

async function rpc(wie: TestUser, groupId: string, aan: boolean | null, bevestigd?: boolean): Promise<Antwoord> {
  const args: Record<string, unknown> = { p_group_id: groupId, p_aan: aan };
  if (bevestigd !== undefined) args.p_bevestigd = bevestigd;
  const { data, error } = await wie.db.rpc('zet_groepsklassement' as never, args as never);
  expect(error).toBeNull();
  return (data ?? {}) as Antwoord;
}

async function groep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  return { id: d.group.id, code: d.group.invite_code };
}

async function aan(groupId: string): Promise<boolean> {
  const { data } = await adminDb().from('groups').select('klassement_aan').eq('id', groupId).single();
  return (data as { klassement_aan: boolean } | null)?.klassement_aan === true;
}

async function sporen(groupId: string): Promise<{ events: number; berichten: number }> {
  const e = await adminDb().from('group_events').select('id').eq('group_id', groupId).eq('event_type', 'leaderboard_changed');
  const m = await adminDb()
    .from('chat_messages')
    .select('id')
    .eq('group_id', groupId)
    .in('system_event', ['leaderboard_enabled', 'leaderboard_disabled']);
  return { events: (e.data ?? []).length, berichten: (m.data ?? []).length };
}

describe.runIf(rlsTestsConfigured)('een beheerder zet het klassement aan of uit (0330)', () => {
  let anna: TestUser; // beheerder
  let bram: TestUser; // lid
  let cor: TestUser; // buitenstaander
  let g: { id: string; code: string };

  beforeAll(async () => {
    [anna, bram, cor] = await Promise.all([createTestUser('zet-anna'), createTestUser('zet-bram'), createTestUser('zet-cor')]);
    g = await groep(anna, 'Zet-klassement');
    const mee = await bram.db.rpc('join_group_with_code', { code: g.code });
    expect((mee.data as { ok?: boolean } | null)?.ok).toBe(true);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('zet uit en weer aan, elke keer met één rij en één bericht, zonder wachttijd (P2)', async () => {
    expect(await aan(g.id)).toBe(true); // een nieuwe groep begint aan
    const uit = await rpc(anna, g.id, false, true);
    expect(uit).toMatchObject({ ok: true, klassement: false });
    expect(await aan(g.id)).toBe(false);
    expect(await sporen(g.id)).toEqual({ events: 1, berichten: 1 });

    const weer = await rpc(anna, g.id, true, true);
    expect(weer).toMatchObject({ ok: true, klassement: true });
    expect(await aan(g.id)).toBe(true);
    expect(await sporen(g.id)).toEqual({ events: 2, berichten: 2 });
  }, TEST_TIMEOUT);

  it('weigert een lid, een niet-bevestigde aanroep en een ongewijzigde stand, zonder gevolg', async () => {
    const voor = await sporen(g.id);
    expect((await rpc(bram, g.id, false, true)).reason).toBe('not_admin');
    expect((await rpc(anna, g.id, false)).reason).toBe('not_confirmed');
    expect((await rpc(anna, g.id, false, false)).reason).toBe('not_confirmed');
    expect((await rpc(anna, g.id, true, true)).reason).toBe('unchanged');
    expect((await rpc(anna, g.id, null, true)).reason).toBe('unknown_state');
    expect(await aan(g.id)).toBe(true);
    expect(await sporen(g.id)).toEqual(voor);
  }, TEST_TIMEOUT);

  it('geeft een buitenstaander `not_admin`, ook voor een gearchiveerde, een team- of een automatisch gevormde groep', async () => {
    const voor = await sporen(g.id);
    expect((await rpc(cor, g.id, false, true)).reason).toBe('not_admin');
    expect((await rpc(cor, '00000000-0000-4000-8000-000000000000', false, true)).reason).toBe('not_admin');
    const a = await groep(anna, 'Zet-buitenstaander');
    expect((await adminDb().from('groups').update({ status: 'archived' } as never).eq('id', a.id)).error).toBeNull();
    expect((await rpc(cor, a.id, false, true)).reason, 'een buitenstaander leert dat de groep gearchiveerd is').toBe('not_admin');
    const b = await groep(anna, 'Zet-buitenstaander-auto');
    expect((await adminDb().from('groups').update({ klassement_aan: false } as never).eq('id', b.id)).error).toBeNull();
    expect((await adminDb().from('groups').update({ automatisch: true } as never).eq('id', b.id)).error).toBeNull();
    expect((await rpc(cor, b.id, true, true)).reason, 'een buitenstaander leert dat de groep automatisch gevormd is').toBe('not_admin');
    expect(await sporen(g.id)).toEqual(voor);
  }, TEST_TIMEOUT);

  it('weigert een gearchiveerde groep (P6)', async () => {
    const a = await groep(anna, 'Zet-archief');
    expect((await adminDb().from('groups').update({ status: 'archived' } as never).eq('id', a.id)).error).toBeNull();
    expect((await rpc(anna, a.id, false, true)).reason).toBe('archived');
    expect(await aan(a.id)).toBe(true);
  }, TEST_TIMEOUT);

  it('weigert een automatisch gevormde groep, ook als de aanroeper beheerder lijkt (P1)', async () => {
    const a = await groep(anna, 'Zet-automatisch');
    expect((await adminDb().from('groups').update({ klassement_aan: false } as never).eq('id', a.id)).error).toBeNull();
    expect((await adminDb().from('groups').update({ automatisch: true } as never).eq('id', a.id)).error).toBeNull();
    expect((await rpc(anna, a.id, true, true)).reason).toBe('automatisch');
    expect(await aan(a.id)).toBe(false);
  }, TEST_TIMEOUT);

  it('weigert een teamgroep, ook voor de organisatiebeheerder', async () => {
    const o = await anna.db.rpc('maak_organisatie' as never, { p_naam: 'Zet BV' } as never);
    const org = (o.data as unknown as { organization_id: string }).organization_id;
    try {
      const t = await anna.db.rpc('maak_teamgroep' as never, { p_organization_id: org, p_naam: 'Team Zet' } as never);
      const team = (t.data as unknown as { group_id?: string } | null)?.group_id;
      expect(team, JSON.stringify(t.data)).toBeDefined();
      registreerGroep(team as string);
      expect((await rpc(anna, team as string, true, true)).reason).toBe('teamgroep');
      expect(await aan(team as string)).toBe(false);
      // Een buitenstaander leert niets over het soort groep.
      expect((await rpc(cor, team as string, true, true)).reason).toBe('not_admin');
    } finally {
      await adminDb().from('groups').delete().eq('organization_id' as never, org as never);
      await adminDb().from('organization_members' as never).delete().eq('organization_id' as never, org as never);
      await adminDb().from('organizations' as never).delete().eq('id' as never, org as never);
    }
  }, TEST_TIMEOUT);

  it('vindbaar maken zet het klassement uit, met één rij en één bericht; weer onvindbaar zet het niet terug (besluit Quinten 21-11)', async () => {
    const v = await groep(anna, 'Zet-vindbaar');
    const gezet = await anna.db.from('groups').update({ categorie: 'fitness' } as never).eq('id', v.id);
    expect(gezet.error).toBeNull();
    expect(await aan(v.id)).toBe(true);

    const vind = await anna.db.rpc('zet_groepsontdekbaarheid', { p_group_id: v.id, p_naar: true, p_bevestigd: true });
    expect(vind.error).toBeNull();
    expect(vind.data).toMatchObject({ ok: true, ontdekbaar: true, klassement: false });
    expect(await aan(v.id)).toBe(false);
    expect(await sporen(v.id)).toEqual({ events: 1, berichten: 1 });

    // Een beheerder kan het daarna apart weer aanzetten (zet_groepsklassement), en dan staat het aan in een vindbare groep.
    expect((await rpc(anna, v.id, true, true)).ok).toBe(true);
    expect(await aan(v.id)).toBe(true);
    // Onvindbaar maken laat het klassement zoals het is.
    const weg = await anna.db.rpc('zet_groepsontdekbaarheid', { p_group_id: v.id, p_naar: false, p_bevestigd: true });
    expect(weg.data).toMatchObject({ ok: true, ontdekbaar: false });
    expect(await aan(v.id)).toBe(true);
  }, TEST_TIMEOUT);

  it('vindbaar maken laat geen extra spoor achter als het klassement al uit stond', async () => {
    const v = await groep(anna, 'Zet-vindbaar-uit');
    expect((await anna.db.from('groups').update({ categorie: 'fitness' } as never).eq('id', v.id)).error).toBeNull();
    expect((await rpc(anna, v.id, false, true)).ok).toBe(true);
    const voor = await sporen(v.id);
    const vind = await anna.db.rpc('zet_groepsontdekbaarheid', { p_group_id: v.id, p_naar: true, p_bevestigd: true });
    expect(vind.data).toMatchObject({ ok: true, klassement: false });
    expect(await sporen(v.id)).toEqual(voor);
  }, TEST_TIMEOUT);
});
