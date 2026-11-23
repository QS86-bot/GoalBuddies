import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepeerKlassementen, naarKlassementenRij, type KlassementenRij } from '../../src/modules/buddies/klassementen-vorm';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De keten van het scherm "Alle klassementen": RPC, parser en kaart geven dezelfde plekken als `groep_klassement()` — QS8-666 (A57b), 3c-ui, AC 12.
 *
 * ⚠️ **De belofte is dat wat het scherm toont gelijk is aan wat de groepspagina toont.** De RPC, de parser (`naarKlassementenRij`) en de groepering
 *    (`groepeerKlassementen`) zijn elk apart correct getoetst; deze toets legt ze achter elkaar, op de database, naast `groep_klassement()`: dezelfde plek,
 *    dezelfde punten, dezelfde naam, en de eigen regel is precies de rij die `groep_klassement()` aan de kijker geeft.
 *
 * IJKING (met de hand): in `groepeerKlassementen` `positie` als `index + 1` tonen -> rood bij de gelijke stand; de parser een kolom laten missen -> rood.
 */
const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

interface Standrij {
  readonly user_id: string;
  readonly display_name: string;
  readonly punten: number;
  readonly positie: number;
}

async function maakGroep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam, zichtbaarheid: 'beschermd' });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  return { id: d.group.id, code: d.group.invite_code };
}

async function geefPunten(wie: TestUser, groupId: string, delta: number): Promise<void> {
  const r = await adminDb().from('points_ledger').insert({ user_id: wie.id, group_id: groupId, delta, reason: 'correction' } as never);
  if (r.error) throw new Error(`punten boeken: ${r.error.message}`);
}

describe.runIf(rlsTestsConfigured)('Alle klassementen: de keten naast groep_klassement() (QS8-666, 3c-ui)', () => {
  let anna: TestUser;
  let groot: { id: string; code: string };
  let klein: { id: string; code: string };

  beforeAll(async () => {
    const namen = ['anna', 'bram', 'cor', 'dirk', 'eva', 'fien', 'gijs'];
    const gebruikers = await Promise.all(namen.map((n) => createTestUser(`ak-${n}`)));
    const [a, ...rest] = gebruikers;
    if (a === undefined) throw new Error('geen gebruiker');
    anna = a;
    groot = await maakGroep(anna, 'AK-groot');
    for (const lid of rest) {
      const mee = await lid.db.rpc('join_group_with_code', { code: groot.code });
      expect((mee.data as { ok?: boolean } | null)?.ok).toBe(true);
    }
    // Drie gelijk op de vierde plek over de grens van vijf heen; Anna als zevende.
    const punten = [2, 7, 7, 7, 8, 9, 10];
    for (const [i, lid] of gebruikers.entries()) await geefPunten(lid, groot.id, punten[i] ?? 0);

    klein = await maakGroep(anna, 'AK-klein');
    const bram = gebruikers[1];
    if (bram === undefined) throw new Error('geen bram');
    await bram.db.rpc('join_group_with_code', { code: klein.code });
    await geefPunten(anna, klein.id, 4);
    await geefPunten(bram, klein.id, 1);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function viaScherm(): Promise<ReturnType<typeof groepeerKlassementen>> {
    const { data, error } = await anna.db.rpc('mijn_klassementen' as never, {} as never);
    expect(error).toBeNull();
    const rijen = ((data ?? []) as unknown[]).map((r) => naarKlassementenRij(r as never)).filter((r): r is KlassementenRij => r !== null);
    expect(rijen.length, 'de parser liet rijen vallen').toBe(((data ?? []) as unknown[]).length);
    return groepeerKlassementen(rijen, anna.id);
  }

  async function viaGroep(groupId: string): Promise<Standrij[]> {
    const { data, error } = await anna.db.rpc('groep_klassement', { p_group_id: groupId, p_limit: 50, p_offset: 0 });
    expect(error).toBeNull();
    return (data ?? []) as unknown as Standrij[];
  }

  it('dezelfde groepen als waar groep_klassement() rijen voor geeft', async () => {
    const kaarten = await viaScherm();
    expect(kaarten.map((k) => k.groupId).sort()).toEqual([groot.id, klein.id].sort());
  }, TEST_TIMEOUT);

  it('per kaart dezelfde plek, punten en naam als de eerste vijf van groep_klassement(), en de eigen regel is Anna\'s rij', async () => {
    const kaarten = await viaScherm();
    for (const g of [groot, klein]) {
      const kaart = kaarten.find((k) => k.groupId === g.id);
      expect(kaart, g.id).toBeDefined();
      const volledig = await viaGroep(g.id);
      const verwacht = volledig.slice(0, 5).map((r) => ({ userId: r.user_id, naam: r.display_name, punten: r.punten, positie: Number(r.positie) }));
      expect(kaart?.bovenste.map(({ userId, naam, punten, positie }) => ({ userId, naam, punten, positie }))).toEqual(verwacht);
      const eigen = volledig.find((r) => r.user_id === anna.id);
      if (volledig.slice(0, 5).some((r) => r.user_id === anna.id)) {
        expect(kaart?.eigen).toBeNull();
      } else {
        expect(kaart?.eigen).toMatchObject({ userId: anna.id, punten: eigen?.punten, positie: Number(eigen?.positie), jij: true });
      }
      expect(kaart?.ledental).toBe(volledig.length);
    }
  }, TEST_TIMEOUT);

  it('bij de gelijke stand over de grens toont de kaart de plek van de database, niet het volgnummer', async () => {
    const kaart = (await viaScherm()).find((k) => k.groupId === groot.id);
    expect(kaart?.bovenste.map((r) => r.positie)).toEqual([1, 2, 3, 4, 4]);
    expect(kaart?.eigen?.positie).toBe(7);
  }, TEST_TIMEOUT);
});
