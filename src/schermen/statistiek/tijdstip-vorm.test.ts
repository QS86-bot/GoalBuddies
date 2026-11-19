import { describe, expect, it } from 'vitest';

import { dagdeelVanUur, tijdstippen } from './tijdstip-vorm';

const rij = (submitted_at: string, superseded_by: string | null = null) => ({ submitted_at, superseded_by });
const telling = (tz: string, rijen: ReturnType<typeof rij>[]) =>
  Object.fromEntries(tijdstippen(tz, rijen).map((d) => [d.dagdeel, d.aantal]));

describe('dagdeelVanUur', () => {
  it('kent vier dagdelen met vaste grenzen', () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(dagdeelVanUur)).toEqual([
      'nacht', 'nacht', 'ochtend', 'ochtend', 'middag', 'middag', 'avond', 'avond',
    ]);
  });
});

describe('tijdstippen', () => {
  it('rekent in de tijdzone van de gebruiker, niet van het toestel', () => {
    const r = [rij('2026-03-28T21:30:00Z')]; // 22:30 CET in Amsterdam, 13:30 PDT... 14:30 in Los Angeles
    expect(telling('Europe/Amsterdam', r)).toEqual({ nacht: 0, ochtend: 0, middag: 0, avond: 1 });
    expect(telling('America/Los_Angeles', r)).toEqual({ nacht: 0, ochtend: 0, middag: 1, avond: 0 });
  });

  it('volgt de wissel naar zomertijd: hetzelfde UTC-uur valt na de wissel in een ander dagdeel', () => {
    // 21:30 UTC: 22:30 CET (avond) voor de wissel, 23:30 CEST (avond) erna; 22:30 UTC wordt 23:30 -> 00:30
    expect(telling('Europe/Amsterdam', [rij('2026-03-28T22:30:00Z')]).avond).toBe(1);
    expect(telling('Europe/Amsterdam', [rij('2026-03-29T22:30:00Z')]).nacht).toBe(1);
  });

  it('telt een vervangen indiening niet mee', () => {
    const r = [rij('2026-03-10T08:00:00Z'), rij('2026-03-10T09:00:00Z', 'x')];
    expect(telling('Europe/Amsterdam', r)).toEqual({ nacht: 0, ochtend: 1, middag: 0, avond: 0 });
  });

  it('geeft altijd vier dagdelen, ook zonder rijen', () => {
    expect(tijdstippen('Europe/Amsterdam', [])).toHaveLength(4);
  });
});
