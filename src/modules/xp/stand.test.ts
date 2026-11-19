import { describe, expect, it } from 'vitest';

import { leesXpStand } from './stand';

const rij = { totaal: 105, niveau: 3, drempel_huidig: 100, drempel_volgende: 180 };

describe('leesXpStand', () => {
  it('leest de ene rij van mijn_xp()', () => {
    expect(leesXpStand([rij])).toEqual({
      totaal: 105,
      niveau: 3,
      drempelHuidig: 100,
      drempelVolgende: 180,
    });
  });

  it('het hoogste niveau heeft geen volgende drempel', () => {
    expect(leesXpStand([{ ...rij, totaal: 2500, niveau: 10, drempel_huidig: 2500, drempel_volgende: null }])?.drempelVolgende).toBeNull();
  });

  it('weigert alles wat geen precies één geldige rij is', () => {
    expect(leesXpStand([])).toBeNull();
    expect(leesXpStand([rij, rij])).toBeNull();
    expect(leesXpStand(null)).toBeNull();
    expect(leesXpStand([{ ...rij, totaal: -1 }])).toBeNull();
    expect(leesXpStand([{ ...rij, niveau: 11 }])).toBeNull();
    expect(leesXpStand([{ ...rij, totaal: 1.5 }])).toBeNull();
  });
});
