import { describe, expect, it, vi } from 'vitest';

/**
 * QS8-702 — een mislukte accountverwijdering maakt de suite rood.
 *
 * De naad: `removeTestUsers()` krijgt van `verwijderAuthGebruiker()` een fout
 * terug. Voorheen werd dat een `console.warn` en bleef de run groen, terwijl de
 * accounts achterbleven (QS8-692). Geen database nodig: de client is een nep
 * waarvan alleen de verwijdering faalt.
 */
vi.hoisted(() => {
  process.env.RLS_DOEL = 'lokaal';
});

let verwijderFout: { message: string } | null = null;

vi.mock('@supabase/supabase-js', () => {
  const leeg = { data: [], error: null, count: 0 };
  const bouwer: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_doel, naam) => {
        if (naam === 'then') return (klaar: (v: unknown) => unknown) => klaar(leeg);
        return () => bouwer;
      },
    },
  );
  const client = {
    from: () => bouwer,
    rpc: (naam: string) => {
      if (naam === 'shim_maak_gebruiker') return Promise.resolve({ data: crypto.randomUUID(), error: null });
      if (naam === 'shim_verwijder_gebruiker') return Promise.resolve({ error: verwijderFout });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { createClient: () => client };
});

describe('removeTestUsers eindigt rood bij een mislukte verwijdering', () => {
  it('gooit met het aantal achtergebleven accounts', async () => {
    const { createTestProfile, removeTestUsers } = await import('./harness');
    verwijderFout = { message: 'Database error deleting user' };

    await createTestProfile('een');
    await createTestProfile('twee');

    await expect(removeTestUsers()).rejects.toThrow(/2 van de 2 testaccounts zijn achtergebleven/);
  });

  it('blijft groen als alles weg is (tegenproef)', async () => {
    const { createTestProfile, removeTestUsers } = await import('./harness');
    verwijderFout = null;

    await createTestProfile('drie');

    await expect(removeTestUsers()).resolves.toBeUndefined();
  });
});
