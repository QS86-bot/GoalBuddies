import { describe, expect, it } from 'vitest';

import { toIsoDate } from '../../shared/time';

import { datumLigtInDeToekomst, doelPatchSchema, doelSchema } from './schemas';

const vandaag = toIsoDate(2026, 8, 16);

const geldig = {
  title: 'Mijn boek afmaken',
  description: null,
  category: 'other' as const,
  target_date: '2026-12-31',
  identity_statement: null,
  available_hours_per_week: null,
};

describe('doelSchema', () => {
  it('accepteert een minimaal ingevuld doel', () => {
    expect(doelSchema.safeParse(geldig).success).toBe(true);
  });

  it('eist een titel van betekenis', () => {
    expect(doelSchema.safeParse({ ...geldig, title: 'ab' }).success).toBe(false);
    expect(doelSchema.safeParse({ ...geldig, title: '   ' }).success).toBe(false);
  });

  it('knipt spaties van de titel', () => {
    const uitkomst = doelSchema.safeParse({ ...geldig, title: '  Boek afmaken  ' });
    expect(uitkomst.success).toBe(true);
    if (uitkomst.success) expect(uitkomst.data.title).toBe('Boek afmaken');
  });

  it('weigert een onbekende categorie', () => {
    expect(doelSchema.safeParse({ ...geldig, category: 'hobby' }).success).toBe(false);
  });

  it('weigert een datum in een ander formaat', () => {
    expect(doelSchema.safeParse({ ...geldig, target_date: '31-12-2026' }).success).toBe(false);
  });

  it('houdt de identiteitszin kort', () => {
    // Eén zin. Een alinea is geen identiteit maar een plan.
    expect(
      doelSchema.safeParse({ ...geldig, identity_statement: 'a'.repeat(201) }).success,
    ).toBe(false);
    expect(
      doelSchema.safeParse({ ...geldig, identity_statement: 'Iemand die schrijft' }).success,
    ).toBe(true);
  });

  it('weigert meer uren dan een week heeft', () => {
    expect(doelSchema.safeParse({ ...geldig, available_hours_per_week: 200 }).success).toBe(false);
    expect(doelSchema.safeParse({ ...geldig, available_hours_per_week: 8 }).success).toBe(true);
  });
});

describe('datumLigtInDeToekomst', () => {
  it('accepteert morgen', () => {
    expect(datumLigtInDeToekomst('2026-08-17', vandaag)).toBe(true);
  });

  it('weigert gisteren en vandaag', () => {
    // Vandaag mag niet: een doel dat vandaag al af moet zijn, is geen doel maar
    // een verstreken deadline — en zou een straf meteen laten afgaan.
    expect(datumLigtInDeToekomst('2026-08-15', vandaag)).toBe(false);
    expect(datumLigtInDeToekomst('2026-08-16', vandaag)).toBe(false);
  });

  it('vergelijkt op kalenderdatum en niet op tekstlengte', () => {
    expect(datumLigtInDeToekomst('2027-01-01', vandaag)).toBe(true);
    expect(datumLigtInDeToekomst('2025-12-31', vandaag)).toBe(false);
  });
});

describe('doelPatchSchema', () => {
  it('laat losse velden toe', () => {
    expect(doelPatchSchema.safeParse({ target_date: '2027-01-01' }).success).toBe(true);
    expect(doelPatchSchema.safeParse({}).success).toBe(true);
  });

  it('blijft dezelfde eisen stellen aan wat er wél in staat', () => {
    expect(doelPatchSchema.safeParse({ title: 'ab' }).success).toBe(false);
  });
});
