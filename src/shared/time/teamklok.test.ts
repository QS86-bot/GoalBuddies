import { describe, expect, it } from 'vitest';

import { groupPeriod, userCycle } from './cycle';
import type { GroupClock, UserClock } from './types';

/**
 * Criterium 7 van QS8-654, de `shared/time`-kant: een teamdoel volgt de klok van
 * de teamgroep, een aandeel die van zijn eigenaar (besluit 17). Er is geen derde
 * klok. De SQL-kant staat in `tests/rls/teamdoelen.test.ts`: daar weigert de
 * database een weekdoel op een aandeel dat op de huddledag begint in plaats van
 * op de week-startdag van de eigenaar.
 *
 * Het tijdstip is dinsdag 17-11-2026 03:30 UTC. In Amsterdam is dat dinsdag, in
 * New York nog maandagavond: precies de rand waar een klok in de verkeerde zone
 * een dag verschuift.
 */

const NU = new Date('2026-11-17T03:30:00Z');
const TEAM: GroupClock = { huddleDay: 3, tz: 'Europe/Amsterdam' };
const MAANDAG_AMS: UserClock = { weekStartDay: 1, tz: 'Europe/Amsterdam' };
const ZONDAG_AMS: UserClock = { weekStartDay: 0, tz: 'Europe/Amsterdam' };
const MAANDAG_NY: UserClock = { weekStartDay: 1, tz: 'America/New_York' };

describe('teamdoel en aandeel lopen op twee verschillende klokken (QS8-654)', () => {
  it('de teamperiode begint op de huddledag van de groep: woensdag 11-11', () => {
    expect(groupPeriod(TEAM, NU).startDate).toBe('2026-11-11');
  });

  it('elk aandeel begint op de eigen week-startdag in de eigen zone', () => {
    expect(userCycle(MAANDAG_AMS, NU).startDate).toBe('2026-11-16');
    expect(userCycle(ZONDAG_AMS, NU).startDate).toBe('2026-11-15');
    // In New York is het nog maandag 16-11, en die dag begint de cyclus net.
    expect(userCycle(MAANDAG_NY, NU).startDate).toBe('2026-11-16');
  });

  it('op zondagavond in New York valt die nog in de vorige week, Amsterdam al niet meer', () => {
    const zondagavondNY = new Date('2026-11-16T04:30:00Z'); // 23:30 zondag in New York
    expect(userCycle(MAANDAG_NY, zondagavondNY).startDate).toBe('2026-11-09');
    expect(userCycle(MAANDAG_AMS, zondagavondNY).startDate).toBe('2026-11-16');
  });

  it('geen van de drie aandeelcycli valt samen met de teamperiode', () => {
    const team = groupPeriod(TEAM, NU).startDate;
    for (const klok of [MAANDAG_AMS, ZONDAG_AMS, MAANDAG_NY]) {
      expect(userCycle(klok, NU).startDate).not.toBe(team);
    }
  });
});
