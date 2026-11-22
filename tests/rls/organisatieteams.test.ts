import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';

/**
 * De teams van een organisatie — QS8-657, migratie 0324.
 *
 * Besluit van Quinten (18-11-2026): elk actief lid ziet de namen van de teams,
 * met alleen id en naam.
 *
 * - **Besluit 6.** De beheerder (geen teamlid, besluit 36), een lid dat in het
 *   team zit en een lid dat er niet in zit, krijgen exact dezelfde lijst.
 * - **Criterium 4 van QS8-652.** Een lid van een andere organisatie krijgt
 *   met de echte id precies wat een verzonnen id geeft: nul rijen.
 * - **Id en naam, en verder niets.**
 * - Gepagineerd op id, zonder iemand over te slaan.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

async function teams(wie: TestUser, org: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await wie.db.rpc('organisatieteams', { p_organization_id: org, ...extra } as never);
  expect(error).toBeNull();
  return data;
}

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('de teams van een organisatie (QS8-657)', () => {
  let anna: TestUser; // organisatiebeheerder, geen teamlid
  let bert: TestUser; // lid van team 1
  let cas: TestUser; // lid van de organisatie, in geen team
  let yara: TestUser; // lid van een andere organisatie
  let org: string;
  const team: string[] = [];

  beforeAll(async () => {
    [anna, bert, cas, yara] = await Promise.all([
      createTestUser('orgteams-anna'),
      createTestUser('orgteams-bert'),
      createTestUser('orgteams-cas'),
      createTestUser('orgteams-yara'),
    ]);
    await laatOrganisatieAanmaken(anna);
    const o = await anna.db.rpc('maak_organisatie', { p_naam: 'Teams BV' } as never);
    org = (o.data as unknown as { organization_id: string }).organization_id;
    organisaties.push(org);
    await laatOrganisatieAanmaken(yara);
    const ander = await yara.db.rpc('maak_organisatie', { p_naam: 'Ander BV' } as never);
    organisaties.push((ander.data as unknown as { organization_id: string }).organization_id);
    const code = (await anna.db.rpc('organisatie_uitnodigcode', { p_organization_id: org } as never)).data as unknown as {
      code: string;
    };
    for (const wie of [bert, cas]) {
      const w = await wie.db.rpc('word_organisatielid', { p_code: code.code } as never);
      expect((w.data as unknown as { ok: boolean }).ok).toBe(true);
    }
    for (const naam of ['Team Een', 'Team Twee', 'Team Drie']) {
      const t = await anna.db.rpc('maak_teamgroep', { p_organization_id: org, p_naam: naam } as never);
      expect(t.error).toBeNull();
      const id = (t.data as unknown as { group_id: string }).group_id;
      team.push(id);
      groepen.push(id);
      registreerGroep(id);
    }
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team[0]!).single();
    const j = await bert.db.rpc('join_group_with_code', { code: (g as { invite_code: string }).invite_code });
    expect((j.data as unknown as { ok: boolean }).ok).toBe(true);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    if (organisaties.length > 0) {
      await admin.from('organization_members').delete().in('organization_id', organisaties as never);
      await admin.from('organizations').delete().in('id', organisaties as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een beheerder, een teamlid en een lid buiten elk team krijgen dezelfde lijst (besluit 6)',
    async () => {
      const voorAnna = await teams(anna, org, { p_limit: 50 });
      expect(voorAnna).toEqual(await teams(bert, org, { p_limit: 50 }));
      expect(voorAnna).toEqual(await teams(cas, org, { p_limit: 50 }));
      const rijen = voorAnna as { id: string; name: string }[];
      expect(rijen.map((r) => r.id).sort()).toEqual([...team].sort());
      // Id en naam, en verder niets.
      expect(Object.keys(rijen[0]!).sort()).toEqual(['id', 'name']);
    },
    TEST_TIMEOUT,
  );

  it(
    'een lid van een andere organisatie krijgt precies wat een verzonnen id geeft',
    async () => {
      expect(await teams(yara, org)).toEqual([]);
      expect(await teams(yara, randomUUID())).toEqual([]);
      expect(await teams(anna, randomUUID())).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'bladert op id zonder iemand over te slaan, en null als cursor is de eerste pagina',
    async () => {
      const alles = (await teams(cas, org, { p_limit: 50 })) as { id: string }[];
      const gezien: string[] = [];
      let na: string | null = null;
      for (let i = 0; i < 10; i++) {
        const pagina = (await teams(cas, org, { p_limit: 1, p_na_id: na })) as { id: string }[];
        if (pagina.length === 0) break;
        gezien.push(pagina[0]!.id);
        na = pagina[0]!.id;
      }
      expect(gezien).toEqual(alles.map((r) => r.id));
      expect(gezien.length).toBe(alles.length);
    },
    TEST_TIMEOUT,
  );

  it(
    'een gearchiveerd team staat er niet in, voor niemand',
    async () => {
      // Een organisatiebeheerder mag een team archiveren (is_teambeheerder, 0317).
      const a = await anna.db.rpc('archiveer_groep', { p_group_id: team[2]!, p_bevestigd: true });
      expect(a.error).toBeNull();
      for (const wie of [anna, bert, cas]) {
        const rijen = (await teams(wie, org, { p_limit: 50 })) as { id: string }[];
        expect(rijen.map((r) => r.id).sort(), wie.email).toEqual([team[0]!, team[1]!].sort());
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'wie de organisatie verlaat, ziet de teams niet meer',
    async () => {
      const v = await cas.db.rpc('verlaat_organisatie', { p_organization_id: org } as never);
      expect((v.data as unknown as { ok: boolean }).ok).toBe(true);
      expect(await teams(cas, org)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'een gearchiveerde organisatie geeft niemand nog teams',
    async () => {
      // Er is nog geen archiveer-RPC voor een organisatie (keuze 7 van 0316);
      // service_role zet de stand, zoals een latere RPC dat zou doen.
      const z = await adminDb()
        .from('organizations')
        .update({ status: 'archived' } as never)
        .eq('id', org as never);
      expect(z.error).toBeNull();
      expect(await teams(anna, org)).toEqual([]);
      expect(await teams(bert, org)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
