import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../i18n';

import { groepskaartTeksten } from './groepskaart';

/**
 * De Groepskaart — QS8-751.
 *
 * ⚠️ De belofte is dat de kaart nooit tegenslag toont en in elke groep hetzelfde
 *    zegt. De invoer kent daarom alleen drie getallen; deze toets legt vast wat
 *    daar ook bij een rommelig antwoord uit komt.
 */

afterEach(() => zetTaal(STANDAARDTAAL));

const VERDACHT = /niet|mist|gemist|achter|onaf|verbroken|nog \d|not|miss|behind|broken|incomplete/i;

describe('groepskaartTeksten', () => {
  it('geeft de waarden uit de datalaag ongewijzigd door', () => {
    const k = groepskaartTeksten({ weken: 7, mijlpalen: 3, leden: 4 });
    expect(k.teller).toContain('7');
    expect(k.mijlpalen).toContain('3');
    expect(k.leden).toContain('4');
  });

  it('laat een tellerstand nooit lezen als verlies, ook niet op nul', () => {
    const gevallen = [0, 1, 2, 52].flatMap((weken) =>
      [0, 1, 9].flatMap((mijlpalen) => [1, 2, 12].map((leden) => ({ weken, mijlpalen, leden }))),
    );
    for (const taal of ['nl', 'en'] as const) {
      zetTaal(taal);
      for (const g of gevallen) {
        const k = groepskaartTeksten(g);
        const alles = [k.teller, k.mijlpalen ?? '', k.leden, k.uitnodiging ?? '', k.a11y].join(' ');
        expect(alles, `${taal} ${JSON.stringify(g)}`).not.toMatch(VERDACHT);
      }
    }
  });

  it('zwijgt bij nul over "0 weken" en nodigt uit in plaats daarvan', () => {
    const k = groepskaartTeksten({ weken: 0, mijlpalen: 0, leden: 3 });
    expect(k.nogNiets).toBe(true);
    expect(k.teller).not.toMatch(/\b0\b/);
    expect(k.mijlpalen).toBeNull();
  });

  it('leest een groep van één lid uitnodigend en niet leeg', () => {
    const een = groepskaartTeksten({ weken: 0, mijlpalen: 0, leden: 1 });
    expect(een.uitnodiging).not.toBeNull();
    expect(een.leden).toMatch(/1/);
    expect(groepskaartTeksten({ weken: 0, mijlpalen: 0, leden: 2 }).uitnodiging).toBeNull();
  });

  it('toont nooit "0 leden" en nooit NaN bij een defect antwoord', () => {
    const k = groepskaartTeksten({
      weken: Number.NaN,
      mijlpalen: -4,
      leden: 0,
    });
    expect(k.leden).toMatch(/1/);
    expect(JSON.stringify(k)).not.toMatch(/NaN|-4|undefined/);
  });

  it('volgt de taal', () => {
    zetTaal('nl');
    const nl = groepskaartTeksten({ weken: 2, mijlpalen: 1, leden: 2 });
    zetTaal('en');
    const en = groepskaartTeksten({ weken: 2, mijlpalen: 1, leden: 2 });
    expect(en.teller).not.toBe(nl.teller);
    expect(en.leden).not.toBe(nl.leden);
  });
});
