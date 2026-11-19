import { describe, expect, it } from 'vitest';

import { localDateIn, toIsoDate, userCycle, type UserClock, type Weekday } from '@/shared/time';

import { actieveDagen, DAGEN_IN_WEEKSTROOK, weekstrook } from './weekstrook-vorm';

const AMS = 'Europe/Amsterdam';
const NYC = 'America/New_York';

// Donderdag 19 november 2026, 12:00 UTC.
const MIDDAG = new Date('2026-11-19T12:00:00Z');

function strookVoor(startDay: Weekday, tz: string, at: Date, actief = new Set<string>()) {
  const klok: UserClock = { weekStartDay: startDay, tz };
  const cyclus = userCycle(klok, at);
  return weekstrook(cyclus.startDate, localDateIn(tz, at), actief);
}

describe('weekstrook — de week met de eigen startdag', () => {
  it('heeft zeven dagen', () => {
    expect(strookVoor(1, AMS, MIDDAG)).toHaveLength(DAGEN_IN_WEEKSTROOK);
  });

  it.each([
    [1, '2026-11-16'], // maandag
    [0, '2026-11-15'], // zondag
    [4, '2026-11-19'], // donderdag: vandaag is de eerste dag
    [5, '2026-11-13'], // vrijdag
  ] as const)('begint bij startdag %i op %s', (startDay, verwacht) => {
    const dagen = strookVoor(startDay as Weekday, AMS, MIDDAG);
    expect(dagen[0]?.datum).toBe(verwacht);
    expect(dagen[0]?.weekdag).toBe(startDay);
    expect(dagen[6]?.weekdag).toBe(((startDay + 6) % 7) as Weekday);
  });

  it('markeert precies één dag als vandaag, op een andere plek per startdag', () => {
    const maandag = strookVoor(1, AMS, MIDDAG);
    const zaterdag = strookVoor(6, AMS, MIDDAG);
    expect(maandag.filter((d) => d.isVandaag)).toHaveLength(1);
    expect(zaterdag.filter((d) => d.isVandaag)).toHaveLength(1);
    expect(maandag.findIndex((d) => d.isVandaag)).toBe(3);
    expect(zaterdag.findIndex((d) => d.isVandaag)).toBe(5);
  });

  it('volgt de dagwisseling in de tijdzone van de gebruiker, niet die van UTC', () => {
    // 23:30 UTC op donderdag: in Amsterdam al vrijdag 20e, in New York nog donderdag 19e.
    const rond = new Date('2026-11-19T23:30:00Z');
    const ams = strookVoor(1, AMS, rond);
    const nyc = strookVoor(1, NYC, rond);
    expect(ams.find((d) => d.isVandaag)?.datum).toBe('2026-11-20');
    expect(nyc.find((d) => d.isVandaag)?.datum).toBe('2026-11-19');
  });

  it('schuift naar een nieuwe week op de startdag-wissel (zondag 22:59 → 23:00 UTC, Amsterdam)', () => {
    const voor = strookVoor(1, AMS, new Date('2026-11-22T22:59:00Z'));
    const na = strookVoor(1, AMS, new Date('2026-11-22T23:00:00Z'));
    expect(voor[0]?.datum).toBe('2026-11-16');
    expect(voor[6]?.isVandaag).toBe(true);
    expect(na[0]?.datum).toBe('2026-11-23');
    expect(na[0]?.isVandaag).toBe(true);
  });

  it('markeert niets als vandaag nog onbekend is', () => {
    const dagen = weekstrook(toIsoDate(2026, 11, 16), null, new Set());
    expect(dagen.some((d) => d.isVandaag)).toBe(false);
  });

  it('kent alleen actief en niet-actief: een lege dag draagt geen andere staat', () => {
    const dagen = strookVoor(1, AMS, MIDDAG, new Set(['2026-11-17']));
    expect(dagen.map((d) => d.actief)).toEqual([false, true, false, false, false, false, false]);
    expect(Object.keys(dagen[0] ?? {}).sort()).toEqual(['actief', 'datum', 'isVandaag', 'weekdag']);
  });

  it('telt activiteit buiten de week niet mee', () => {
    const dagen = strookVoor(1, AMS, MIDDAG, new Set(['2026-11-10', '2026-11-30']));
    expect(dagen.some((d) => d.actief)).toBe(false);
  });
});

describe('actieveDagen — alleen eigen afvinkingen en Dagzetten', () => {
  it('voegt afvinkingen van alle weekdoelen en Dagzetten samen', () => {
    const afvinkingen = new Map([
      ['a', ['2026-11-16', '2026-11-17']],
      ['b', ['2026-11-17']],
    ]);
    const dagen = actieveDagen(afvinkingen, [{ local_date: '2026-11-19' }]);
    expect([...dagen].sort()).toEqual(['2026-11-16', '2026-11-17', '2026-11-19']);
  });

  it('geeft een lege verzameling zolang er niets is', () => {
    expect(actieveDagen(undefined, []).size).toBe(0);
  });
});
