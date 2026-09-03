import { describe, expect, it } from 'vitest';

import { dagIsTeKiezen, eersteVanDeMaand, maandErbij, maandraster } from './maandraster';
import { weekdayOf } from './zoned';

import type { IsoDate, Weekday } from './types';

const iso = (s: string): IsoDate => s as IsoDate;

describe('eersteVanDeMaand', () => {
  it('gaat terug naar de eerste', () => {
    expect(eersteVanDeMaand(iso('2026-09-17'))).toBe('2026-09-01');
  });

  it('laat de eerste met rust', () => {
    expect(eersteVanDeMaand(iso('2026-09-01'))).toBe('2026-09-01');
  });
});

describe('maandErbij', () => {
  it('stapt vooruit en achteruit', () => {
    expect(maandErbij(iso('2026-09-17'), 1)).toBe('2026-10-01');
    expect(maandErbij(iso('2026-09-17'), -1)).toBe('2026-08-01');
  });

  it('stapt over de jaargrens, beide kanten op', () => {
    expect(maandErbij(iso('2026-12-05'), 1)).toBe('2027-01-01');
    expect(maandErbij(iso('2026-01-05'), -1)).toBe('2025-12-01');
    expect(maandErbij(iso('2026-01-05'), -13)).toBe('2024-12-01');
  });

  /**
   * ⚠️ **De maandfout, en de reden dat deze functie in maanden rekent.** Zou hij
   *    31 dagen optellen bij 31 januari, dan was het antwoord 3 maart. Dat is
   *    geen theoretisch geval: het is de standaardmanier waarop iemand dit met
   *    `addDays` zou bouwen.
   */
  it('maakt van 31 januari geen 3 maart', () => {
    expect(maandErbij(iso('2026-01-31'), 1)).toBe('2026-02-01');
  });
});

describe('maandraster', () => {
  it('geeft altijd zes rijen van zeven, ook in februari', () => {
    for (const maand of ['2026-02-01', '2026-09-01', '2027-05-01']) {
      const raster = maandraster(iso(maand), 1);
      expect(raster.weken).toHaveLength(6);
      for (const week of raster.weken) expect(week).toHaveLength(7);
    }
  });

  /**
   * ⚠️ Vier rijen zou genoeg zijn voor februari 2027 (28 dagen die op maandag
   *    beginnen). Zes rijen is met opzet: een raster dat meebeweegt laat de
   *    knoppen eronder verspringen zodra je bladert.
   */
  it('vult ook een maand die precies in vier weken past aan tot zes rijen', () => {
    const raster = maandraster(iso('2027-02-01'), 1);
    expect(weekdayOf(iso('2027-02-01'))).toBe(1);
    expect(raster.weken).toHaveLength(6);
    expect(raster.weken[0]![0]!.datum).toBe('2027-02-01');
  });

  it('begint de eerste rij op de week-startdag van de gebruiker', () => {
    for (const startDag of [0, 1, 2, 3, 4, 5, 6] as const) {
      const raster = maandraster(iso('2026-09-17'), startDag);
      expect(weekdayOf(raster.weken[0]![0]!.datum)).toBe(startDag);
      expect(raster.kolommen[0]).toBe(startDag);
    }
  });

  /**
   * ⚠️ **De belofte van domeinregel 1 op dit raster.** Een kalender die altijd op
   *    maandag begint, laat iemand met een zondagweek elke keer een kolom
   *    verkeerd lezen. Zonder deze test zou een vaste `1` in de component nooit
   *    rood worden.
   */
  it('schuift het hele raster mee met de startdag, en niet alleen de kop', () => {
    const maandag = maandraster(iso('2026-09-01'), 1);
    const zondag = maandraster(iso('2026-09-01'), 0);

    expect(maandag.weken[0]![0]!.datum).not.toBe(zondag.weken[0]![0]!.datum);
    expect(zondag.kolommen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(maandag.kolommen).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('merkt de dagen van de buurmaand als opvulling', () => {
    // 1 september 2026 is een dinsdag; met maandag als start staat er één dag voor.
    const raster = maandraster(iso('2026-09-01'), 1);
    expect(raster.weken[0]![0]).toEqual({ datum: '2026-08-31', inMaand: false });
    expect(raster.weken[0]![1]).toEqual({ datum: '2026-09-01', inMaand: true });

    const inMaand = raster.weken.flat().filter((d) => d.inMaand);
    expect(inMaand).toHaveLength(30);
  });

  it('telt de dagen van een schrikkelmaand goed', () => {
    const raster = maandraster(iso('2028-02-10'), 1);
    expect(raster.weken.flat().filter((d) => d.inMaand)).toHaveLength(29);
    expect(raster.maand).toBe('2028-02-01');
  });

  it('loopt door zonder gaten of dubbele dagen', () => {
    const dagen = maandraster(iso('2026-09-17'), 3).weken.flat().map((d) => d.datum);

    expect(new Set(dagen).size).toBe(42);
    for (let i = 1; i < dagen.length; i += 1) {
      const vorige = new Date(`${dagen[i - 1]}T00:00:00Z`).getTime();
      const deze = new Date(`${dagen[i]}T00:00:00Z`).getTime();
      expect(deze - vorige).toBe(86_400_000);
    }
  });

  it('werkt met elke startdag zonder de maand te verschuiven', () => {
    for (const startDag of [0, 1, 2, 3, 4, 5, 6] as Weekday[]) {
      const raster = maandraster(iso('2026-09-17'), startDag);
      expect(raster.maand).toBe('2026-09-01');
      expect(raster.weken.flat().filter((d) => d.inMaand)).toHaveLength(30);
    }
  });
});

describe('dagIsTeKiezen', () => {
  it('laat alles door zonder grenzen', () => {
    expect(dagIsTeKiezen(iso('2020-01-01'), {})).toBe(true);
  });

  it('sluit de dag vóór het minimum uit en het minimum zelf niet', () => {
    expect(dagIsTeKiezen(iso('2026-09-16'), { min: iso('2026-09-17') })).toBe(false);
    expect(dagIsTeKiezen(iso('2026-09-17'), { min: iso('2026-09-17') })).toBe(true);
  });

  it('sluit de dag ná het maximum uit en het maximum zelf niet', () => {
    expect(dagIsTeKiezen(iso('2026-09-18'), { max: iso('2026-09-17') })).toBe(false);
    expect(dagIsTeKiezen(iso('2026-09-17'), { max: iso('2026-09-17') })).toBe(true);
  });

  it('houdt beide grenzen tegelijk aan', () => {
    const grenzen = { min: iso('2026-09-10'), max: iso('2026-09-20') };
    expect(dagIsTeKiezen(iso('2026-09-09'), grenzen)).toBe(false);
    expect(dagIsTeKiezen(iso('2026-09-15'), grenzen)).toBe(true);
    expect(dagIsTeKiezen(iso('2026-09-21'), grenzen)).toBe(false);
  });

  /**
   * ⚠️ Over de jaargrens en de maandgrens, want daar zou een vergelijking op
   *    dag- of maandnummer omvallen.
   */
  it('vergelijkt over een maand- en jaargrens heen', () => {
    expect(dagIsTeKiezen(iso('2026-12-31'), { min: iso('2027-01-01') })).toBe(false);
    expect(dagIsTeKiezen(iso('2027-01-01'), { min: iso('2026-12-31') })).toBe(true);
    expect(dagIsTeKiezen(iso('2026-10-01'), { min: iso('2026-09-30') })).toBe(true);
  });
});
