import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isDoelstraf, wordtZichtbaarBijUitstelverzoek } from '../../src/modules/commitments/stand';

/**
 * Een weekbelofte is geen straf van het doel — QS8-760.
 *
 * Een weekbelofte is een `penalty` mét `periode_start` (0312). QS8-758 vond drie
 * plekken in `app/doel/[id].tsx` die elke `penalty` als doelstraf lazen: de
 * Straf-kaart, de `heeftStraf` van `Herplannen`, en `fetchCommitments()` die de
 * kolom niet opvroeg. Met de eerste schrijfweg (0314) zou een belofte daar
 * verschijnen als "de straf van dit doel", met de streefdatum als moment.
 *
 * ⚠️ **De belofte is niet "het scherm roept `isDoelstraf` aan".** Dat is een
 *    plek (regel 18 vraag 4). De belofte is: **nergens in de app wordt een
 *    commitment nog rauw op `type === 'penalty'` gelezen**, behalve in de twee
 *    functies die de weekbelofte uitdrukkelijk scheiden. Die toets verhuist mee
 *    met elke nieuwe plek.
 *
 * Ijking (regel 18 vraag 3): `bestaand={commitments.find(isDoelstraf)}` met de
 * hand teruggezet naar `(c) => c.type === 'penalty'` maakt de laatste toets rood
 * met `app/doel/[id].tsx` in de melding; `periode_start === null` in
 * `isDoelstraf` weggehaald maakt de tweede rood.
 */

const WORTEL = join(import.meta.dirname, '..', '..');

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

/** De twee functies die de weekbelofte uitdrukkelijk scheiden. */
const SCHEIDERS = new Set(['src/modules/commitments/stand.ts']);

describe('een weekbelofte is geen straf van het doel', () => {
  it('een doelstraf is een penalty zonder periode', () => {
    expect(isDoelstraf({ type: 'penalty', periode_start: null })).toBe(true);
  });

  it('een weekbelofte is geen doelstraf', () => {
    expect(isDoelstraf({ type: 'penalty', periode_start: '2026-11-16' })).toBe(false);
  });

  it('een beloning is geen doelstraf', () => {
    expect(isDoelstraf({ type: 'reward', periode_start: null })).toBe(false);
  });

  it('dezelfde rij: geen kaart én geen uitstelwaarschuwing voor een belofte', () => {
    const belofte = { type: 'penalty', status: 'set', periode_start: '2026-11-16' } as const;
    expect(isDoelstraf(belofte)).toBe(false);
    expect(wordtZichtbaarBijUitstelverzoek(belofte)).toBe(false);
  });

  it('nergens in app/ of src/ wordt een commitment nog rauw op penalty vergeleken', () => {
    const treffers = [...bestanden(join(WORTEL, 'app')), ...bestanden(join(WORTEL, 'src'))]
      .map((pad) => relative(WORTEL, pad).split('\\').join('/'))
      .filter((pad) => !SCHEIDERS.has(pad) && !pad.endsWith('database.types.ts'))
      .filter((pad) => /\.type\s*===?\s*['"]penalty['"]/.test(readFileSync(join(WORTEL, pad), 'utf8')));
    expect(treffers).toEqual([]);
  });
});
