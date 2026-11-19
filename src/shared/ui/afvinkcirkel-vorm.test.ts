import { describe, expect, it } from 'vitest';

import { AANRAAK_MIN, afvinkcirkel, vormSleutel, type CirkelInvoer } from './afvinkcirkel-vorm';

const GEVALLEN: readonly CirkelInvoer[] = [
  { niveau: null, vandaagAfgevinkt: false },
  { niveau: null, vandaagAfgevinkt: true },
  { niveau: 'floor', vandaagAfgevinkt: false },
  { niveau: 'floor', vandaagAfgevinkt: true },
  { niveau: 'ceiling', vandaagAfgevinkt: true },
  { niveau: null, vandaagAfgevinkt: false, uitgeschakeld: true },
];

describe('afvinkcirkel — vorm zonder kleur (QS8-727)', () => {
  it('leeg, vloer, plafond en uitgeschakeld hebben vier verschillende vormen', () => {
    const vormen = [
      afvinkcirkel({ niveau: null, vandaagAfgevinkt: false }),
      afvinkcirkel({ niveau: 'floor', vandaagAfgevinkt: false }),
      afvinkcirkel({ niveau: 'ceiling', vandaagAfgevinkt: false }),
      afvinkcirkel({ niveau: null, vandaagAfgevinkt: false, uitgeschakeld: true }),
    ];
    expect(new Set(vormen.map(vormSleutel)).size).toBe(4);
  });

  it('vloer is half gevuld, plafond vol mét een tweede ring', () => {
    expect(afvinkcirkel({ niveau: 'floor', vandaagAfgevinkt: false })).toMatchObject({ vulling: 'half', buitenring: false });
    expect(afvinkcirkel({ niveau: 'ceiling', vandaagAfgevinkt: false })).toMatchObject({ vulling: 'vol', buitenring: true });
  });

  it('de ring is wat plafond van vloer onderscheidt, ook als de vulling gelijk zou zijn', () => {
    const plafond = afvinkcirkel({ niveau: 'ceiling', vandaagAfgevinkt: false });
    expect(vormSleutel({ ...plafond, buitenring: false })).not.toBe(vormSleutel(plafond));
  });

  it('vandaag afgevinkt onder de vloer is een eigen vorm: open ring met vinkje', () => {
    const v = afvinkcirkel({ niveau: null, vandaagAfgevinkt: true });
    expect(v).toMatchObject({ toestand: 'leeg', vulling: 'geen', vinkje: true });
    expect(vormSleutel(v)).not.toBe(vormSleutel(afvinkcirkel({ niveau: null, vandaagAfgevinkt: false })));
  });

  it('een vloer telt volledig: dezelfde toestand ongeacht of vandaag is afgevinkt', () => {
    expect(afvinkcirkel({ niveau: 'floor', vandaagAfgevinkt: true }).toestand).toBe('vloer');
  });

  it('elk aanraakdoel is minstens 44 bij 44', () => {
    for (const g of GEVALLEN) expect(afvinkcirkel(g).aanraak).toBeGreaterThanOrEqual(AANRAAK_MIN);
  });

  it('kent geen toestand voor gemist en draagt geen getal', () => {
    for (const g of GEVALLEN) {
      const v = afvinkcirkel(g);
      expect(Object.keys(v).join()).not.toMatch(/gemist|missed|punten|points|score|aantal/i);
      expect(['leeg', 'vloer', 'plafond', 'uitgeschakeld']).toContain(v.toestand);
    }
  });
});
