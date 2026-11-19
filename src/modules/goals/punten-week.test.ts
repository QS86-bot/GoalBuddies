import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow, userCycle } from '../../shared/time';

import { fetchPuntenDezeWeek, PUNTEN_WEEK_GRENS, somPunten } from './punten-week';

/**
 * De punten van deze week — QS8-747.
 *
 * ⚠️ **De belofte is dat het venster de cyclus van de gebruiker volgt** (domeinregel
 *    1) en niet een week die deze functie zelf bedenkt. Daarom twee week-starts op
 *    dezelfde dag: een maandag-gebruiker en een zondag-gebruiker krijgen een ander
 *    venster, en dat venster is precies `userCycle()`.
 *
 * ⚠️ Een stub en niet de lokale stack, om dezelfde reden als in
 *    `src/modules/todos/api.test.ts`. Dat een ánder deze waarden niet kan
 *    ophalen is geen eigenschap van deze functie maar van RLS, en staat in
 *    `tests/rls/punten-deze-week.test.ts`.
 */
interface Aanroep {
  readonly naam: string;
  readonly args: readonly unknown[];
}
let aanroepen: Aanroep[] = [];
let antwoord: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    from: (tabel: string) => {
      aanroepen.push({ naam: 'from', args: [tabel] });
      const schil: Record<string, unknown> = {
        then: (los: (w: typeof antwoord) => unknown) => Promise.resolve(antwoord).then(los),
      };
      for (const naam of ['select', 'eq', 'gte', 'lt', 'neq', 'order', 'limit']) {
        schil[naam] = (...args: unknown[]) => {
          aanroepen.push({ naam, args });
          return schil;
        };
      }
      return schil;
    },
  }),
}));
vi.mock('../../lib/observability', () => ({ reportError: () => undefined }));

const arg = (naam: string, kolom?: string) =>
  aanroepen.find((a) => a.naam === naam && (kolom === undefined || a.args[0] === kolom))?.args;

beforeEach(() => {
  aanroepen = [];
  antwoord = { data: [], error: null };
  freezeNow(new Date('2026-11-18T12:00:00Z')); // een woensdag
});
afterEach(() => unfreezeNow());

describe('fetchPuntenDezeWeek()', () => {
  it.each([
    ['maandag', 1],
    ['zondag', 0],
  ] as const)('het venster is de cyclus van een gebruiker met week-start %s', async (_naam, dag) => {
    const cyclus = userCycle({ weekStartDay: dag, tz: 'Europe/Amsterdam' }, new Date('2026-11-18T12:00:00Z'));
    await fetchPuntenDezeWeek('u1', cyclus);
    expect(arg('gte', 'created_at')).toEqual(['created_at', cyclus.startsAt.toISOString()]);
    expect(arg('lt', 'created_at')).toEqual(['created_at', cyclus.endsAt.toISOString()]);
  });

  it('twee week-starts geven twee verschillende vensters', async () => {
    const op = new Date('2026-11-18T12:00:00Z');
    const ma = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, op);
    const zo = userCycle({ weekStartDay: 0, tz: 'Europe/Amsterdam' }, op);
    expect(ma.startsAt.toISOString()).not.toBe(zo.startsAt.toISOString());
  });

  it('leest alleen de eigen rijen en laat de boeking van een gemiste week buiten deze week', async () => {
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date('2026-11-18T12:00:00Z'));
    await fetchPuntenDezeWeek('u1', cyclus);
    expect(arg('from')).toEqual(['points_ledger']);
    expect(arg('eq', 'user_id')).toEqual(['user_id', 'u1']);
    expect(arg('neq', 'reason')).toEqual(['reason', 'cycle_missed']);
    expect(arg('limit')).toEqual([PUNTEN_WEEK_GRENS]);
  });

  it('een lege week is nul en geen ontbrekend antwoord', async () => {
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date('2026-11-18T12:00:00Z'));
    antwoord = { data: [], error: null };
    await expect(fetchPuntenDezeWeek('u1', cyclus)).resolves.toBe(0);
    antwoord = { data: null, error: null };
    await expect(fetchPuntenDezeWeek('u1', cyclus)).resolves.toBe(0);
  });

  it('telt de boekingen op, ook als een correctie ze onder nul brengt', async () => {
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date('2026-11-18T12:00:00Z'));
    antwoord = { data: [{ delta: 2 }, { delta: 1 }], error: null };
    await expect(fetchPuntenDezeWeek('u1', cyclus)).resolves.toBe(3);
    expect(somPunten([{ delta: 1 }, { delta: -3 }])).toBe(-2);
  });

  it('een fout is een fout en geen nul', async () => {
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date('2026-11-18T12:00:00Z'));
    antwoord = { data: null, error: { code: '500' } };
    await expect(fetchPuntenDezeWeek('u1', cyclus)).rejects.toThrow();
  });
});
