import { describe, expect, it } from 'vitest';

import type { TimeZone, UserClock } from '../../shared/time';

import {
  belofteaanbod,
  belofteperiode,
  belofteweek,
  heeftOpenDoelstraf,
  nieuwsteBeslist,
  vorigeVerschuldigd,
  wachtOpBeslissing,
} from './weekbelofte';

/**
 * De pure kern van het beloftescherm — QS8-761.
 *
 * De databasekant van `belofteperiode()` (criterium 4) staat in
 * `tests/rls/weekbelofte-scherm.test.ts`; hier de vorm, met twee week-starts
 * (domeinregel 1) en over de DST-wissel van 25-10-2026.
 */

const klok = (weekStartDay: 0 | 1, tz: string): UserClock => ({ weekStartDay, tz: tz as TimeZone });

describe('belofteperiode()', () => {
  it('maandag als startdag: woensdag 18-11 valt in de week van ma 16-11 t/m zo 22-11', () => {
    expect(belofteperiode(klok(1, 'Europe/Amsterdam'), new Date('2026-11-18T12:00:00Z'))).toEqual({
      start: '2026-11-16',
      laatsteDag: '2026-11-22',
    });
  });

  it('zondag als startdag: dezelfde woensdag valt in de week van zo 15-11 t/m za 21-11', () => {
    expect(belofteperiode(klok(0, 'Europe/Amsterdam'), new Date('2026-11-18T12:00:00Z'))).toEqual({
      start: '2026-11-15',
      laatsteDag: '2026-11-21',
    });
  });

  it('de dag in de zone van de gebruiker telt, niet die in UTC (Auckland, zondag 22:30 UTC: in Auckland maandag, in Amsterdam nog zondag)', () => {
    expect(belofteperiode(klok(1, 'Pacific/Auckland'), new Date('2026-11-15T22:30:00Z')).start).toBe('2026-11-16');
    expect(belofteperiode(klok(1, 'Europe/Amsterdam'), new Date('2026-11-15T22:30:00Z')).start).toBe('2026-11-09');
  });

  it('over de DST-wissel van 25-10-2026 blijft de week zeven dagen', () => {
    expect(belofteperiode(klok(1, 'Europe/Amsterdam'), new Date('2026-10-25T12:00:00Z'))).toEqual({
      start: '2026-10-19',
      laatsteDag: '2026-10-25',
    });
  });
});

describe('belofteweek()', () => {
  it('geeft de week van een bestaande belofte, en null bij onzin', () => {
    expect(belofteweek(klok(1, 'Europe/Amsterdam'), '2026-11-16')).toEqual({
      start: '2026-11-16',
      laatsteDag: '2026-11-22',
    });
    expect(belofteweek(klok(1, 'Europe/Amsterdam'), 'geen datum')).toBeNull();
  });
});

const BASIS = {
  beloftes: [],
  doelstrafOpen: false,
  doelStatus: 'active',
  streefdatum: '2026-12-31',
  vandaag: '2026-11-18',
  dezeWeek: '2026-11-16',
  heeftGetuige: true,
} as const;

const belofte = (status: string, periode_start = '2026-11-16') =>
  ({ type: 'penalty', status, periode_start }) as const;

describe('belofteaanbod()', () => {
  it('met een getuige en niets in de weg: kan', () => {
    expect(belofteaanbod(BASIS).soort).toBe('kan');
  });

  it('criterium 1: zonder getuige en zonder belofte is het aanbod leeg', () => {
    expect(belofteaanbod({ ...BASIS, heeftGetuige: false }).soort).toBe('geen_getuige');
  });

  it('een lopende belofte gaat vóór alles, ook zonder getuige: intrekken blijft bereikbaar', () => {
    const b = belofte('set', '2026-11-09');
    expect(belofteaanbod({ ...BASIS, beloftes: [b], heeftGetuige: false, doelStatus: 'completed' })).toEqual({
      soort: 'loopt',
      belofte: b,
    });
  });

  it('een verschuldigde belofte van deze week: deze_week_al; van een vorige week: niet', () => {
    expect(belofteaanbod({ ...BASIS, beloftes: [belofte('due')] }).soort).toBe('deze_week_al');
    expect(belofteaanbod({ ...BASIS, beloftes: [belofte('due', '2026-11-09')] }).soort).toBe('kan');
  });

  it('een ingetrokken belofte van deze week houdt een nieuwe niet tegen (de index van 0312 telt haar niet)', () => {
    expect(belofteaanbod({ ...BASIS, beloftes: [belofte('cancelled')] }).soort).toBe('kan');
  });

  it('een doelstraf in de lijst is geen belofte', () => {
    const straf = { type: 'penalty', status: 'set', periode_start: null } as const;
    expect(belofteaanbod({ ...BASIS, beloftes: [straf] }).soort).toBe('kan');
  });

  it('de weigeringen van de database als uitleg, in volgorde', () => {
    expect(belofteaanbod({ ...BASIS, doelStatus: 'completed' }).soort).toBe('doel_niet_actief');
    expect(belofteaanbod({ ...BASIS, streefdatum: '2026-11-17' }).soort).toBe('datum_voorbij');
    expect(belofteaanbod({ ...BASIS, streefdatum: '2026-11-18' }).soort).toBe('kan');
    expect(belofteaanbod({ ...BASIS, doelstrafOpen: true }).soort).toBe('doelstraf');
  });

  it('zonder vandaag (profiel laadt) beslist de server over de streefdatum', () => {
    expect(belofteaanbod({ ...BASIS, vandaag: null, streefdatum: '2000-01-01' }).soort).toBe('kan');
  });
});

describe('heeftOpenDoelstraf()', () => {
  it('alleen een doelstraf op set of due, geen belofte en geen ingetrokken straf', () => {
    expect(heeftOpenDoelstraf([{ type: 'penalty', status: 'set', periode_start: null }])).toBe(true);
    expect(heeftOpenDoelstraf([{ type: 'penalty', status: 'due', periode_start: null }])).toBe(true);
    expect(heeftOpenDoelstraf([{ type: 'penalty', status: 'cancelled', periode_start: null }])).toBe(false);
    expect(heeftOpenDoelstraf([{ type: 'penalty', status: 'set', periode_start: '2026-11-16' }])).toBe(false);
    expect(heeftOpenDoelstraf([{ type: 'reward', status: 'set', periode_start: null }])).toBe(false);
  });
});

describe('de uitkomst van een vorige week (critical-user)', () => {
  it('vorigeVerschuldigd(): de nieuwste belofte, als die due is en van vóór deze week; geen doelstraf', () => {
    const oud = belofte('due', '2026-11-09');
    expect(vorigeVerschuldigd([oud, belofte('cancelled', '2026-11-02')], '2026-11-16')).toBe(oud);
    // QS8-815, V2 = A: een oudere due achter een nieuwere besliste week verdwijnt.
    expect(vorigeVerschuldigd([belofte('cancelled', '2026-11-09'), belofte('due', '2026-11-02')], '2026-11-16')).toBeUndefined();
    expect(vorigeVerschuldigd([belofte('set', '2026-11-16'), oud], '2026-11-16')).toBeUndefined();
    expect(vorigeVerschuldigd([belofte('due')], '2026-11-16')).toBeUndefined();
    expect(vorigeVerschuldigd([{ type: 'penalty', status: 'due', periode_start: null }], '2026-11-16')).toBeUndefined();
  });

  it('nieuwsteBeslist(): de nieuwste weekbelofte als die due of cancelled is, anders niets', () => {
    const gehouden = belofte('cancelled', '2026-11-09');
    expect(nieuwsteBeslist([gehouden, belofte('due', '2026-11-02')])).toBe(gehouden);
    expect(nieuwsteBeslist([belofte('set'), gehouden])).toBeUndefined();
    expect(nieuwsteBeslist([belofte('resolved', '2026-11-09'), gehouden])).toBeUndefined();
    expect(nieuwsteBeslist([{ type: 'penalty', status: 'due', periode_start: null }, gehouden])).toBe(gehouden);
    expect(nieuwsteBeslist([])).toBeUndefined();
  });

  it('wachtOpBeslissing(): set en de week is voorbij', () => {
    expect(wachtOpBeslissing(belofte('set', '2026-11-09'), '2026-11-16')).toBe(true);
    expect(wachtOpBeslissing(belofte('set'), '2026-11-16')).toBe(false);
    expect(wachtOpBeslissing(belofte('due', '2026-11-09'), '2026-11-16')).toBe(false);
  });
});
