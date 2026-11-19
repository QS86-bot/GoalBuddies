import { describe, expect, it } from 'vitest';

import type { UserClock } from '@/shared/time';

import { eersteWeek } from './periode-vorm';
import { weekkalender, oudsteWeek, MAX_WEKEN } from './weekkalender-vorm';
import { userCycle } from '@/shared/time';

/**
 * Elke periode met twee week-starts (domeinregel 1) en rond een dagwisseling (domeinregel 2) — QS8-749.
 * 'Nu' is woensdag 2026-11-18 12:00 UTC.
 */
const NU = new Date('2026-11-18T12:00:00Z');
const maandag: UserClock = { weekStartDay: 1, tz: 'Europe/Amsterdam' };
const zondag: UserClock = { weekStartDay: 0, tz: 'Europe/Amsterdam' };

describe('eersteWeek', () => {
  const verwacht: Record<string, [string, string]> = {
    // dag N terug, en de weekstart waar die in valt: [maandag, zondag]
    '30': ['2026-10-19', '2026-10-18'], // 2026-10-19 is een maandag
    '90': ['2026-08-17', '2026-08-16'], // 2026-08-19 woensdag
    jaar: ['2025-11-17', '2025-11-16'], // 2025-11-18 dinsdag
  };

  for (const periode of ['30', '90', 'jaar'] as const) {
    it(`${periode}: begint op de week-start van de gebruiker, bij beide week-starts`, () => {
      expect(eersteWeek(periode, maandag, NU)?.startDate).toBe(verwacht[periode]?.[0]);
      expect(eersteWeek(periode, zondag, NU)?.startDate).toBe(verwacht[periode]?.[1]);
    });
  }

  it('alles heeft geen vast begin: de gegevens bepalen het', () => {
    expect(eersteWeek('alles', maandag, NU)).toBeNull();
  });

  it('rond middernacht telt de tijdzone van de gebruiker, niet UTC', () => {
    // Dezelfde dag, 22:30 en 23:30 UTC: in Amsterdam (UTC+1) is dat 23:30 en 00:30 lokaal.
    const voor = eersteWeek('30', maandag, new Date('2026-11-18T22:30:00Z'));
    const na = eersteWeek('30', maandag, new Date('2026-11-18T23:30:00Z')); // 19-11 00:30 lokaal
    expect(voor?.startDate).toBe('2026-10-19');
    expect(na?.startDate).toBe('2026-10-19'); // 20-10 valt nog steeds in de week van 19-10
    // Een lokale dagwisseling die de eerste week wél verschuift: 24-11 23:30 -> 25-11 00:30, dertig dagen terug is 25-10 -> 26-10.
    const voorWissel = eersteWeek('30', maandag, new Date('2026-11-24T22:30:00Z'));
    const naWissel = eersteWeek('30', maandag, new Date('2026-11-24T23:30:00Z'));
    expect(voorWissel?.startDate).toBe('2026-10-19');
    expect(naWissel?.startDate).toBe('2026-10-26');
  });
});

describe('weekkalender', () => {
  const huidige = userCycle(maandag, NU);

  it('loopt van de eerste tot en met de huidige week, ook zonder voltooiingen', () => {
    const eerste = eersteWeek('30', maandag, NU);
    if (eerste === null) throw new Error('verwacht een week');
    const cellen = weekkalender(maandag, eerste, huidige, []);
    expect(cellen[0]?.start).toBe('2026-10-19');
    expect(cellen.at(-1)?.start).toBe('2026-11-16');
    expect(cellen).toHaveLength(5);
    expect(cellen.every((c) => !c.actief)).toBe(true);
    expect(cellen.filter((c) => c.isHuidig)).toHaveLength(1);
  });

  it('zet een voltooiing in de week van zijn cyclus, op het raster van de huidige week-start', () => {
    const eerste = eersteWeek('30', zondag, NU);
    const nuZondag = userCycle(zondag, NU);
    if (eerste === null) throw new Error('verwacht een week');
    // opgeslagen onder een maandag-week (2026-11-09); op het zondagraster valt die in de week van 2026-11-08
    const cellen = weekkalender(zondag, eerste, nuZondag, ['2026-11-09']);
    expect(cellen.filter((c) => c.actief).map((c) => c.start)).toEqual(['2026-11-08']);
  });

  it('kent geen gemist-staat: een cel is actief of niet', () => {
    const cel = weekkalender(maandag, huidige, huidige, [])[0];
    expect(Object.keys(cel ?? {}).sort()).toEqual(['actief', 'isHuidig', 'start']);
  });

  it('alles begint bij de oudste voltooiing, en zonder voltooiingen bij de huidige week', () => {
    expect(oudsteWeek(maandag, huidige, []).startDate).toBe(huidige.startDate);
    expect(oudsteWeek(maandag, huidige, ['2026-09-02', '2026-10-14']).startDate).toBe('2026-08-31');
  });

  it('tekent nooit meer dan MAX_WEKEN cellen, en eindigt dan nog steeds bij de huidige week', () => {
    const oud = oudsteWeek(maandag, huidige, ['2010-01-06']);
    const cellen = weekkalender(maandag, oud, huidige, []);
    expect(cellen).toHaveLength(MAX_WEKEN);
    expect(cellen.at(-1)?.isHuidig).toBe(true);
  });
});
