import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { roeptAan, zonderCommentaar } from './roept-aan';

/**
 * Een weekbelofte gaat alleen aan vanuit de aparte bevestigstap — QS8-761, criterium 2.
 *
 * ⚠️ **De belofte is niet "de knop staat in `BelofteBevestigen`".** Dat is een
 *    plek (regel 18 vraag 4). De belofte is: **nergens in de app wordt
 *    `gaWeekbelofteAan()` aangeroepen behalve in de bevestigstap, en daar met
 *    de week die die stap toonde.** Een tweede aanroeper, waar dan ook, maakt dit
 *    rood; dat verhuist mee.
 *
 * ⚠️ En de functie zelf stuurt niets als de bevestigde week niet meer de
 *    lopende is, en nooit een kolom die de client niet mag zetten.
 *
 * Ijking (regel 18 vraag 3), met de hand: `gaWeekbelofteAan(…)` in
 * `BelofteFormulier.tsx` bij "Verder" gezet → grendel 1 rood met dat bestand in
 * de melding; `stap.periode.start` vervangen door `belofteperiode(klok, now()).start`
 * → grendel 2 rood; de weekvergelijking in `gaWeekbelofteAan()` weggehaald →
 * grendel 4 rood.
 */

const WORTEL = join(import.meta.dirname, '..', '..');
const DEFINITIE = 'src/modules/commitments/api.ts';
const BEVESTIGSTAP = 'src/schermen/belofte/BelofteBevestigen.tsx';

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return naam === 'node_modules' ? [] : bestanden(pad);
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

const bron = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

describe('de bevestigstap is de enige weg naar gaWeekbelofteAan()', () => {
  it('grendel 1: geen enkel ander bestand in app/ of src/ roept haar aan', () => {
    const aanroepers = ['app', 'src']
      .flatMap((map) => bestanden(join(WORTEL, map)))
      .map((pad) => relative(WORTEL, pad).replaceAll('\\', '/'))
      .filter((pad) => pad !== DEFINITIE && roeptAan(readFileSync(join(WORTEL, pad), 'utf8'), 'gaWeekbelofteAan'));
    expect(aanroepers).toEqual([BEVESTIGSTAP]);
  });

  it('grendel 2: de bevestigstap stuurt de week die ze toont', () => {
    const code = zonderCommentaar(bron(BEVESTIGSTAP));
    expect(code).toMatch(/gaWeekbelofteAan\([^)]*stap\.periode\.start\s*\)/);
    expect(code).not.toMatch(/belofteperiode\s*\(/);
  });

  it('grendel 3: het beloftescherm kent de stille enige kandidaat van Straf niet', () => {
    const map = join(WORTEL, 'src', 'schermen', 'belofte');
    for (const pad of bestanden(map)) {
      expect(zonderCommentaar(readFileSync(pad, 'utf8')), relative(WORTEL, pad)).not.toMatch(/enigeOfGekozen/);
    }
  });
});

const insert = vi.fn();
const from = vi.fn();

vi.mock('../../src/lib/supabase', () => ({ supabase: () => ({ from }) }));
vi.mock('../../src/lib/observability', () => ({ reportError: () => undefined }));

const { belofteperiode, gaWeekbelofteAan } = await import('../../src/modules/commitments');
const { now } = await import('../../src/shared/time');

const KLOK = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' };
const INVOER = { body: 'Ik trakteer op koffie', image_url: null };

describe('gaWeekbelofteAan() zelf', () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockReset();
    const single = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null });
    insert.mockReturnValue({ select: () => ({ single }) });
    from.mockReturnValue({ insert });
  });

  it('grendel 4: een week die niet meer de lopende is, gaat de deur niet uit', async () => {
    const uitkomst = await gaWeekbelofteAan('d1', INVOER, { soort: 'groep', id: 'g1' }, KLOK, '2000-01-03');
    expect(uitkomst.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('grendel 5: precies deze kolommen, met de start uit belofteperiode() en zonder einde, stand of zone', async () => {
    const start = belofteperiode(KLOK, now()).start;
    const uitkomst = await gaWeekbelofteAan('d1', INVOER, { soort: 'persoon', id: 'p1' }, KLOK, start);
    expect(uitkomst.ok).toBe(true);
    expect(from).toHaveBeenCalledWith('commitments');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toEqual({
      goal_id: 'd1',
      type: 'penalty',
      body: 'Ik trakteer op koffie',
      image_url: null,
      beneficiary_group_id: null,
      beneficiary_user_id: 'p1',
      confirmed_at: 'now',
      periode_start: start,
    });
  });

  it('zonder getuige gaat er niets de deur uit', async () => {
    const start = belofteperiode(KLOK, now()).start;
    const uitkomst = await gaWeekbelofteAan('d1', INVOER, { soort: 'groep', id: '' }, KLOK, start);
    expect(uitkomst.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
