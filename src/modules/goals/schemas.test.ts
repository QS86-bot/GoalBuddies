import { describe, expect, it } from 'vitest';

import { toIsoDate } from '../../shared/time';

import {
  datumLigtInDeToekomst,
  doelPatchSchema,
  doelSchema,
  niveauUitDagen,
  RITMES,
} from './schemas';

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

describe('niveauUitDagen', () => {
  /**
   * QS8-253, besluit A53.
   *
   * ⚠️ **Deze functie is de tweede uitvoering van een regel die in de database
   *    staat.** `niveau_uit_dagen()` in migratie 0140 beslist wat er werkelijk in
   *    `completions` landt; deze functie bestaat alleen zodat het scherm kan
   *    tónen wat je gaat indienen.
   *
   *    Twee uitvoeringen van één regel is precies de naad waar onwrikbare regel
   *    18 over gaat, en de gevallen hieronder zijn daarom óók de gevallen die
   *    `tests/rls/ritme.test.ts` door de database voert. Lopen ze uiteen, dan
   *    ziet de gebruiker een ander woord dan er geboekt wordt.
   */
  it('geeft het plafond zodra je erop of erboven zit', () => {
    expect(niveauUitDagen(5, 3, 5)).toBe('ceiling');
    expect(niveauUitDagen(7, 3, 5)).toBe('ceiling');
  });

  it('geeft de vloer tussen vloer en plafond', () => {
    expect(niveauUitDagen(3, 3, 5)).toBe('floor');
    expect(niveauUitDagen(4, 3, 5)).toBe('floor');
  });

  it('geeft null onder de vloer — dat is de normale stand op woensdag', () => {
    expect(niveauUitDagen(0, 3, 5)).toBeNull();
    expect(niveauUitDagen(2, 3, 5)).toBeNull();
  });

  /**
   * ⚠️ Zonder vloer is het plafond de ondergrens. Dat is geen strengheid maar wat
   *    "geen vloer" betekent: er is één niveau, en dat haal je of niet. De vloer
   *    is optioneel gebleven bij de review van 15-08 en dat verandert hier niet.
   */
  it('behandelt een ontbrekende vloer als "het plafond of niets"', () => {
    expect(niveauUitDagen(4, null, 5)).toBeNull();
    expect(niveauUitDagen(5, null, 5)).toBe('ceiling');
  });

  /** Een dagelijks doel is `times_per_week` met plafond zeven, en geen tweede feature. */
  it('werkt voor een dagelijks doel zonder aparte behandeling', () => {
    expect(niveauUitDagen(7, 5, 7)).toBe('ceiling');
    expect(niveauUitDagen(6, 5, 7)).toBe('floor');
    expect(niveauUitDagen(4, 5, 7)).toBeNull();
  });
});

describe('het ritme op een doel', () => {
  it('is standaard weekly, zodat een bestaand doel niets verandert', () => {
    const zonder = doelSchema.parse({
      title: 'Een doel met een lange genoeg titel',
      description: null,
      category: 'other',
      target_date: '2030-01-01',
      identity_statement: null,
      available_hours_per_week: null,
    });
    expect(zonder.ritme).toBe('weekly');
  });

  it('accepteert elk ritme uit de lijst en niets daarbuiten', () => {
    for (const ritme of RITMES) {
      const uit = doelSchema.safeParse({
        ritme,
        title: 'Een doel met een lange genoeg titel',
        description: null,
        category: 'other',
        target_date: '2030-01-01',
        identity_statement: null,
        available_hours_per_week: null,
      });
      expect(uit.success).toBe(true);
    }

    const onbekend = doelSchema.safeParse({
      ritme: 'hourly',
      title: 'Een doel met een lange genoeg titel',
      description: null,
      category: 'other',
      target_date: '2030-01-01',
      identity_statement: null,
      available_hours_per_week: null,
    });
    expect(onbekend.success).toBe(false);
  });
});
