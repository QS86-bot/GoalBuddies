import { describe, expect, it } from 'vitest';

import {
  KLEURVARIANTEN,
  leesVoorkeur,
  normaliseerVoorkeur,
  STANDAARD_VOORKEUR,
  voorkeurSchema,
} from './voorkeur';

/**
 * De allowlist en de koppeling stijl-variant — QS8-729. De database-kant staat
 * in `tests/rls/gebruikersvoorkeuren.test.ts`, die de lijsten in beide
 * richtingen naast de CHECK's legt.
 *
 * IJKING (met de hand, 19-11-2026):
 *   A  de `refine` uit `voorkeurSchema` halen -> rood: 'B met koraal'
 *   B  `normaliseerVoorkeur` laat een variant staan bij stijl B -> rood: 'wisselen van C naar B'
 */
describe('voorkeurSchema', () => {
  it('neemt de standaard aan: B, donker, ruim, emoji aan', () => {
    expect(voorkeurSchema.safeParse(STANDAARD_VOORKEUR).success).toBe(true);
    expect(STANDAARD_VOORKEUR).toEqual({
      stijl: 'b',
      kleurvariant: 'geen',
      weergave: 'donker',
      dichtheid: 'ruim',
      emoji: true,
    });
  });

  it('weigert een onbekende waarde en een extra veld', () => {
    expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, stijl: 'd' })).toBeNull();
    expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, weergave: 'navy' })).toBeNull();
    expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, bijgewerkt_op: 'x' })).toBeNull();
    expect(leesVoorkeur(null)).toBeNull();
  });

  it('weigert B met koraal en C zonder variant', () => {
    expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, kleurvariant: 'koraal' })).toBeNull();
    expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, stijl: 'c' })).toBeNull();
  });

  it('kent elke variant voor C', () => {
    for (const v of KLEURVARIANTEN.filter((k) => k !== 'geen')) {
      expect(leesVoorkeur({ ...STANDAARD_VOORKEUR, stijl: 'c', kleurvariant: v })).not.toBeNull();
    }
  });
});

describe('normaliseerVoorkeur', () => {
  it('wisselen van C naar B laat geen variant over', () => {
    const uit = normaliseerVoorkeur({
      ...STANDAARD_VOORKEUR,
      stijl: 'b',
      kleurvariant: 'pruim',
    });
    expect(uit.kleurvariant).toBe('geen');
  });

  it('wisselen naar C zonder variant geeft baai en raakt de rest niet', () => {
    const uit = normaliseerVoorkeur({
      ...STANDAARD_VOORKEUR,
      stijl: 'c',
      weergave: 'licht',
      emoji: false,
    });
    expect(uit).toMatchObject({
      kleurvariant: 'baai',
      weergave: 'licht',
      emoji: false,
    });
  });
});
