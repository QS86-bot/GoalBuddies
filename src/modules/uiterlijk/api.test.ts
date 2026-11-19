import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bewaarAccountVoorkeur } from './api';
import { STANDAARD_VOORKEUR } from './voorkeur';

const antwoorden: { insert: unknown; update: unknown } = {
  insert: null,
  update: null,
};
const gezien: { eq: [string, string][]; payload: unknown[] } = {
  eq: [],
  payload: [],
};

vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('../../lib/supabase', () => {
  const bouwer = (soort: 'insert' | 'update') => {
    const b: Record<string, unknown> = {
      eq: (k: string, v: string) => {
        gezien.eq.push([k, v]);
        return b;
      },
      select: () => b,
      single: () => b,
      then: (ok: (v: unknown) => unknown) => Promise.resolve(antwoorden[soort]).then(ok),
    };
    return b;
  };
  return {
    supabase: () => ({
      from: () => ({
        insert: (rij: unknown) => {
          gezien.payload.push(rij);
          return bouwer('insert');
        },
        update: (rij: unknown) => {
          gezien.payload.push(rij);
          return bouwer('update');
        },
      }),
    }),
  };
});

/**
 * De naad van "de server bepaalt wat de laatste keuze is" — QS8-729.
 *
 * IJKING (met de hand, 19-11-2026, één mutatie per grendel):
 *   A  de `.eq('bijgewerkt_op', basis)` uit de update halen => rood: 'stuurt de basis mee'
 *   B  `rijen.length === 0` -> `false`                       => rood: 'nul rijen is een conflict'
 *   C  23505 als `netwerk` melden                            => rood: 'iemand was eerder'
 */
const T1 = '2026-11-19T10:00:00.123456+00:00';
const T2 = '2026-11-19T11:00:00.654321+00:00';

beforeEach(() => {
  gezien.eq = [];
  gezien.payload = [];
});

describe('bewaarAccountVoorkeur', () => {
  it('zonder basis is het een insert en geeft het de tijd van de server terug', async () => {
    antwoorden.insert = { data: { bijgewerkt_op: T1 }, error: null };
    const uit = await bewaarAccountVoorkeur('u1', STANDAARD_VOORKEUR, null);
    expect(uit).toEqual({
      ok: true,
      voorkeur: STANDAARD_VOORKEUR,
      bijgewerktOp: T1,
    });
    expect(gezien.payload[0]).toMatchObject({ user_id: 'u1', stijl: 'b' });
    expect(gezien.payload[0]).not.toHaveProperty('bijgewerkt_op');
  });

  it('een rij die er al was (23505) is een conflict', async () => {
    antwoorden.insert = {
      data: null,
      error: { message: 'dup', code: '23505' },
    };
    expect(await bewaarAccountVoorkeur('u1', STANDAARD_VOORKEUR, null)).toEqual({
      ok: false,
      reden: 'conflict',
    });
  });

  it('stuurt de basis mee als voorwaarde en geeft de nieuwe tijd terug', async () => {
    antwoorden.update = { data: [{ bijgewerkt_op: T2 }], error: null };
    const uit = await bewaarAccountVoorkeur('u1', STANDAARD_VOORKEUR, T1);
    expect(uit).toMatchObject({ ok: true, bijgewerktOp: T2 });
    expect(gezien.eq).toEqual([
      ['user_id', 'u1'],
      ['bijgewerkt_op', T1],
    ]);
  });

  it('een update die nul rijen raakte is een conflict en geen succes', async () => {
    antwoorden.update = { data: [], error: null };
    expect(await bewaarAccountVoorkeur('u1', STANDAARD_VOORKEUR, T1)).toEqual({
      ok: false,
      reden: 'conflict',
    });
  });

  it('een andere fout is netwerk, en een niet-passende combinatie wordt hersteld vóór het schrijven', async () => {
    antwoorden.update = {
      data: null,
      error: { message: 'stuk', code: '57014' },
    };
    expect(await bewaarAccountVoorkeur('u1', STANDAARD_VOORKEUR, T1)).toEqual({
      ok: false,
      reden: 'netwerk',
    });

    antwoorden.insert = { data: { bijgewerkt_op: T1 }, error: null };
    await bewaarAccountVoorkeur(
      'u1',
      { ...STANDAARD_VOORKEUR, stijl: 'b', kleurvariant: 'koraal' },
      null,
    );
    expect(gezien.payload.at(-1)).toMatchObject({
      stijl: 'b',
      kleurvariant: 'geen',
    });
  });
});
