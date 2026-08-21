import { describe, expect, it } from 'vitest';

import { mijlpalenUit } from './uitvoer';

/**
 * ⚠️ Dit is modeluitvoer, en dat is de reden dat deze tests bestaan. De Edge
 *    Function valideert met Zod vóór opslag, maar `mijlpalenUit()` is de laatste
 *    plek vóór het scherm — en op de dag dat het formaat verschuift, is een lege
 *    lijst een beter antwoord dan een scherm vol `undefined`.
 */
describe('mijlpalenUit', () => {
  it('leest de vorm die de Doelcoach vandaag teruggeeft', () => {
    // Deze vorm is op 21-08-2026 echt uit de keten gekomen, niet bedacht.
    const uitkomst = mijlpalenUit({
      milestones: [
        {
          title: 'Outline afronden en vastzetten',
          description: 'Werk je ruwe outline uit tot een plan per hoofdstuk.',
          target_date: '2026-09-15',
        },
        { title: 'Hoofdstuk 1 af', description: null, target_date: '2026-10-01' },
      ],
    });

    expect(uitkomst).toHaveLength(2);
    expect(uitkomst[0]?.title).toBe('Outline afronden en vastzetten');
    expect(uitkomst[1]?.target_date).toBe('2026-10-01');
  });

  it('accepteert een kale array en een Nederlandse sleutel', () => {
    expect(mijlpalenUit([{ title: 'Eén' }])).toHaveLength(1);
    expect(mijlpalenUit({ mijlpalen: [{ titel: 'Twee' }] })).toHaveLength(1);
    expect(mijlpalenUit({ mijlpalen: [{ titel: 'Twee' }] })[0]?.title).toBe('Twee');
  });

  it('geeft een lege lijst bij onzin in plaats van te crashen', () => {
    for (const onzin of [null, undefined, 42, 'tekst', {}, { milestones: 'geen array' }]) {
      expect(mijlpalenUit(onzin), String(onzin)).toEqual([]);
    }
  });

  it('gooit rijen zonder titel weg', () => {
    const uitkomst = mijlpalenUit({
      milestones: [{ title: 'Goed' }, { description: 'geen titel' }, { title: '   ' }],
    });

    expect(uitkomst).toHaveLength(1);
    expect(uitkomst[0]?.title).toBe('Goed');
  });

  it('laat nooit undefined in een veld staan', () => {
    const uitkomst = mijlpalenUit({ milestones: [{ title: 'Kaal' }] });

    expect(uitkomst[0]?.description).toBeNull();
    expect(uitkomst[0]?.target_date).toBeNull();
  });
});
