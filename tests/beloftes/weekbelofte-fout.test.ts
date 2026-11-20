import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BELOFTE_WEIGERINGEN,
  belofteFoutsleutel,
  STRAF_NAAST_BELOFTE,
  strafFoutsleutel,
} from '../../src/modules/commitments/weekbelofte';

/**
 * De foutvertaling van het beloftescherm leest de tekst van een `raise` — QS8-761.
 *
 * ⚠️ **De naad, en ze is van niemand.** De weigeringen van
 *    `bevries_belofteperiode()` (0314) delen allemaal code 23514; het scherm
 *    herkent ze aan een fragment van de melding. Herformuleert een latere
 *    migratie die melding, dan valt het scherm stil terug op "vastleggen lukte
 *    niet" en is elke eigen zin weg. Deze test zoekt elk fragment in de
 *    migraties en wordt dan rood.
 *
 * Ijking (regel 18 vraag 3): het fragment `'staat een straf'` veranderd in
 * `'staat een doelstraf'` maakt de eerste toets rood; de volgorde van
 * `BELOFTE_WEIGERINGEN` omgedraaid (verlopen week vóór plafond) maakt de
 * plafondtoets rood.
 */

const MAP = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const migraties = readdirSync(MAP)
  .filter((naam) => naam.endsWith('.sql'))
  .map((naam) => readFileSync(join(MAP, naam), 'utf8'))
  .join('\n');

describe('de weigeringen van een weekbelofte', () => {
  it.each(BELOFTE_WEIGERINGEN)('het fragment "$fragment" staat in een raise van de migraties', ({ fragment }) => {
    expect(migraties).toMatch(new RegExp(`raise exception '[^']*${fragment}`));
  });

  it('elke melding uit 0314 komt op zijn eigen sleutel uit', () => {
    const geval = (message: string) => belofteFoutsleutel({ code: '23514', message });
    expect(geval('Een weekbelofte begint op je eigen week-startdag')).toBe('belofte.fout.startdag');
    expect(geval('Een weekbelofte geldt voor je lopende week')).toBe('belofte.fout.week_voorbij');
    expect(geval('Op dit doel staat een straf; een weekbelofte erbij kan niet')).toBe('belofte.fout.doelstraf');
    expect(geval('Je hebt al 3 lopende weekbeloftes')).toBe('belofte.fout.plafond');
  });

  it('23505 en 42501 hebben een eigen zin; al het andere is de terugval', () => {
    expect(belofteFoutsleutel({ code: '23505' })).toBe('belofte.fout.al_deze_week');
    expect(belofteFoutsleutel({ code: '42501' })).toBe('belofte.fout.geweigerd');
    expect(belofteFoutsleutel({ code: '23514', message: 'iets anders' })).toBe('commitment.fout.vastleggen');
    expect(belofteFoutsleutel({ code: 'PGRST301' })).toBe('commitment.fout.vastleggen');
  });

  it('een doelstraf naast een lopende belofte krijgt een eigen zin, en het fragment staat in de migraties', () => {
    expect(migraties).toMatch(new RegExp(`raise exception '[^']*${STRAF_NAAST_BELOFTE}`));
    expect(
      strafFoutsleutel({ code: '23514', message: 'Op dit doel loopt een weekbelofte; een straf erbij kan niet' }),
    ).toBe('straf.belofte_loopt');
    expect(strafFoutsleutel({ code: '23514', message: 'iets anders' })).toBe('commitment.fout.vastleggen');
  });
});
