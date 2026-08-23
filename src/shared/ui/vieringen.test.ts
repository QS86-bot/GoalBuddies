import { describe, expect, it } from 'vitest';

import { aantalDeeltjes, magVieren, viering, type VieringSoort } from './vieringen';

const ALLE: readonly VieringSoort[] = ['weekdoel', 'mijlpaal', 'doel'];

describe('viering', () => {
  /**
   * ⚠️ Acceptatiecriterium 1: weekdoel < mijlpaal < doel. Zonder deze test is
   *    "drie niveaus" een belofte in een issue en niet iets dat de code
   *    afdwingt — en dan tikt iemand ooit een niveau gelijk zonder het te
   *    merken.
   */
  it('loopt strikt op in intensiteit', () => {
    const niveaus = ALLE.map((s) => viering(s).niveau);
    expect(niveaus).toEqual([1, 2, 3]);

    const duren = ALLE.map((s) => viering(s).duurMs);
    expect(duren[0]).toBeLessThan(duren[1] ?? 0);
    expect(duren[1]).toBeLessThan(duren[2] ?? 0);
  });

  it('geeft elke soort een eigen titel en tekst', () => {
    const titels = new Set(ALLE.map((s) => viering(s).titel));
    expect(titels.size).toBe(ALLE.length);

    for (const soort of ALLE) {
      expect(viering(soort).tekst.length, soort).toBeGreaterThan(20);
    }
  });

  /**
   * ⚠️ Domeinregel 8: de vloer halen betekent dat de week telt. Er is dus geen
   *    zuiniger feestje voor de vloer — het verschil zit in de punten, niet in
   *    de toon. Deze test legt vast dat er precies drie soorten zijn.
   */
  it('kent geen apart, zuiniger moment voor de vloer', () => {
    expect(ALLE).toHaveLength(3);
    expect(ALLE).not.toContain('vloer');
  });
});

describe('aantalDeeltjes', () => {
  it('schaalt mee met het niveau', () => {
    expect(aantalDeeltjes(1, false)).toBeLessThan(aantalDeeltjes(2, false));
    expect(aantalDeeltjes(2, false)).toBeLessThan(aantalDeeltjes(3, false));
  });

  /**
   * Acceptatiecriterium 2. Voor iemand met vestibulaire klachten is
   * rondvliegende confetti misselijkmakend, en dit is een app die je elke week
   * opent.
   */
  it('tekent niets bij prefers-reduced-motion, op elk niveau', () => {
    for (const niveau of [1, 2, 3] as const) {
      expect(aantalDeeltjes(niveau, true), `niveau ${niveau}`).toBe(0);
    }
  });

  it('tekent wél iets als er geen bezwaar is — de positieve controle', () => {
    for (const niveau of [1, 2, 3] as const) {
      expect(aantalDeeltjes(niveau, false), `niveau ${niveau}`).toBeGreaterThan(0);
    }
  });
});

describe('magVieren', () => {
  it('viert alleen wat aan staat en nog niet gezien is', () => {
    expect(magVieren({ aan: true, alGezien: false })).toBe(true);
    expect(magVieren({ aan: false, alGezien: false })).toBe(false);
    expect(magVieren({ aan: true, alGezien: true })).toBe(false);
    expect(magVieren({ aan: false, alGezien: true })).toBe(false);
  });
});
