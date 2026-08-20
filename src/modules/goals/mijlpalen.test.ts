import { describe, expect, it } from 'vitest';

import { mijlpaalSchema, verplaats } from './mijlpaal-schemas';

describe('verplaats', () => {
  const lijst = ['a', 'b', 'c', 'd'];

  it('schuift een mijlpaal een plek omhoog', () => {
    expect(verplaats(lijst, 'c', 'omhoog')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('schuift een mijlpaal een plek omlaag', () => {
    expect(verplaats(lijst, 'b', 'omlaag')).toEqual(['a', 'c', 'b', 'd']);
  });

  /**
   * ⚠️ De randen zijn hier het hele punt. Zou de eerste omhoog kunnen, dan valt
   *    hij met een negatieve index uit de lijst en verdwijnt er stilletjes een
   *    mijlpaal — en `herorden_mijlpalen()` weigert de lijst daarna, want hij
   *    eist de volledige verzameling.
   */
  it('laat de eerste met rust bij omhoog en de laatste bij omlaag', () => {
    expect(verplaats(lijst, 'a', 'omhoog')).toEqual(lijst);
    expect(verplaats(lijst, 'd', 'omlaag')).toEqual(lijst);
  });

  it('doet niets met een id dat er niet in staat', () => {
    expect(verplaats(lijst, 'x', 'omhoog')).toEqual(lijst);
  });

  it('houdt de verzameling gelijk, wat je ook schuift', () => {
    // De eigenschap die ertoe doet: schuiven mag nooit iets toevoegen of
    // weghalen. `herorden_mijlpalen()` toetst precies dat aan de serverkant.
    for (const id of lijst) {
      for (const richting of ['omhoog', 'omlaag'] as const) {
        const na = verplaats(lijst, id, richting);
        expect([...na].sort()).toEqual([...lijst].sort());
        expect(na).toHaveLength(lijst.length);
      }
    }
  });

  it('werkt op een lijst van één', () => {
    expect(verplaats(['a'], 'a', 'omhoog')).toEqual(['a']);
    expect(verplaats(['a'], 'a', 'omlaag')).toEqual(['a']);
  });
});

describe('mijlpaalSchema', () => {
  it('eist een titel van minstens drie tekens', () => {
    const uitkomst = mijlpaalSchema.safeParse({
      title: 'ab',
      description: null,
      target_date: null,
    });
    expect(uitkomst.success).toBe(false);
  });

  it('laat omschrijving en datum leeg', () => {
    const uitkomst = mijlpaalSchema.safeParse({
      title: 'Eerste tienduizend woorden',
      description: null,
      target_date: null,
    });
    expect(uitkomst.success).toBe(true);
  });

  it('trimt de titel', () => {
    const uitkomst = mijlpaalSchema.safeParse({
      title: '  Hoofdstuk drie af  ',
      description: null,
      target_date: null,
    });
    expect(uitkomst.success && uitkomst.data.title).toBe('Hoofdstuk drie af');
  });
});
