import { describe, expect, it } from 'vitest';

import type { IsoDate } from '../time';

import { DAGEN_IN_STROOK, ritmestrook } from './ritmestrook';

const iso = (s: string) => s as IsoDate;

/**
 * ⚠️ **De belofte is niet "de vakjes kloppen".** Het is: *de strook toont de
 *    week van deze gebruiker, en wat erin staat is precies wat er afgevinkt is.*
 *    Twee helften, en de eerste is degene die stil kan breken — een strook die
 *    op maandag begint terwijl jouw week op woensdag begint, ziet er volstrekt
 *    normaal uit en staat twee dagen scheef (domeinregel 1).
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel, en elke
 * bewerking eerst met een grep nagekeken of hij er stáát:
 *
 *   A  `addDays(startDatum, i)` → `addDays(startDatum, i - 2)`
 *      → 1 rood: 'begint op de startdag van de cyclus en niet op maandag'
 *   B  de lus tot `afgevinkt.length` in plaats van tot zeven
 *      → 5 rood, waaronder 'heeft altijd zeven dagen'
 */
describe('ritmestrook', () => {
  it('begint op de startdag van de cyclus en niet op maandag', () => {
    // ⚠️ 09-09-2026 is een woensdag. Een strook die hier op maandag begint,
    //    schuift elke afvinking twee vakjes op zonder dat er iets misstaat.
    const strook = ritmestrook(iso('2026-09-09'), []);

    expect(strook[0]?.datum).toBe('2026-09-09');
    expect(strook[strook.length - 1]?.datum).toBe('2026-09-15');
  });

  it('heeft altijd zeven dagen, ook zonder een enkele afvinking', () => {
    // ⚠️ Een rij die krimpt naarmate je minder afvinkt, zegt niet hoeveel er nog
    //    kan — en leest als een aanklacht in plaats van als een rooster.
    expect(ritmestrook(iso('2026-09-07'), [])).toHaveLength(DAGEN_IN_STROOK);
    expect(ritmestrook(iso('2026-09-07'), []).every((d) => !d.afgevinkt)).toBe(true);
  });

  it('markeert precies de dagen die afgevinkt zijn', () => {
    const strook = ritmestrook(iso('2026-09-07'), ['2026-09-08', '2026-09-11']);

    expect(strook.filter((d) => d.afgevinkt).map((d) => d.datum)).toEqual([
      '2026-09-08',
      '2026-09-11',
    ]);
  });

  it('laat een dag buiten de week niet meetellen en verandert de lengte niet', () => {
    // ⚠️ De query levert alleen rijen binnen de cyclus, dus dit kan vandaag niet
    //    gebeuren. De strook toont een wéék en geen verzameling: zou een ruimere
    //    lijst hem laten groeien, dan is de vorm afhankelijk van wat de
    //    aanroeper toevallig meestuurt.
    const strook = ritmestrook(iso('2026-09-07'), ['2026-09-08', '2026-10-01']);

    expect(strook).toHaveLength(DAGEN_IN_STROOK);
    expect(strook.filter((d) => d.afgevinkt)).toHaveLength(1);
  });

  it('telt hetzelfde als de teller ernaast', () => {
    // ⚠️ **De naad, en de reden dat deze test bestaat.** Het scherm zet twee
    //    dingen naast elkaar die uit dezelfde lijst komen: "3 van 5 dagen"
    //    (`afgevinkteDagen.length`) en de gevulde vakjes. Lopen die uiteen, dan
    //    is er niets kapot — beide onderdelen kloppen — en leest de gebruiker
    //    twee verschillende antwoorden op dezelfde vraag.
    const dagen = ['2026-09-07', '2026-09-08', '2026-09-11'];
    const strook = ritmestrook(iso('2026-09-07'), dagen);

    expect(strook.filter((d) => d.afgevinkt)).toHaveLength(dagen.length);
  });
});
