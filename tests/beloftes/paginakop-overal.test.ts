import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { alsVoortgang, streepProcent } from '../../src/shared/ui/paginakop-vorm';

/**
 * Elk hoofdscherm heeft dezelfde kop — QS8-726.
 *
 * ⚠️ **De belofte is "de vijf hoofdschermen", en dat is een eigenschap van het
 *    geheel.** Het component kan kloppen terwijl een scherm hem niet gebruikt;
 *    daarom leest deze test de échte routes in `app/(tabs)` en `TABBLADEN` en niet
 *    een lijst die hier met de hand staat. Een zesde tabblad zonder kop is rood.
 *
 * ⚠️⚠️ **De twee typegrendels (domeinregel 7 en 10) zijn teksttoetsen op de
 *    bron**, omdat het type zelf niet te schenden is zonder dat `tsc` het
 *    weigert: geen punten-prop, geen prop met een gebruikerssleutel.
 */
const ROOT = join(__dirname, '..', '..');
const lees = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SCHERMEN = ['index', 'doelen', 'groep', 'lijst', 'profiel'] as const;

describe('de paginakop staat op de vijf hoofdschermen', () => {
  for (const naam of SCHERMEN) {
    it(`${naam} geeft Screen een Paginakop`, () => {
      const bron = lees(`app/(tabs)/${naam}.tsx`);
      expect(bron).toMatch(/<Paginakop\b/);
      expect(bron).toMatch(/kop=\{\s*<Paginakop\b/);
    });
  }

  it('de lijst hierboven is de inhoud van TABBLADEN', async () => {
    const { TABBLADEN } = await import('../../src/shared/ui/tabbladen');
    const namen = TABBLADEN.map((t) => (t.pad === '/' ? 'index' : String(t.pad).slice(1)));
    expect([...namen].sort()).toEqual([...SCHERMEN].sort());
  });

  it('Screen laat de eigen titel weg zodra er een kop is', () => {
    expect(lees('src/shared/ui/Screen.tsx')).toMatch(/kop \?\? \(/);
  });
});

describe('voortgang is een waarde van 0 tot 1 en geen score', () => {
  it('weigert alles buiten 0..1 en niet-getallen', () => {
    for (const x of [-0.01, 1.01, 42, Number.NaN, Infinity]) expect(alsVoortgang(x)).toBeNull();
  });

  it('laat de randen en het midden door', () => {
    for (const x of [0, 0.5, 1]) expect(alsVoortgang(x)).toBe(x);
    expect(streepProcent(alsVoortgang(0.456)!)).toBe(46);
  });

  it('het component kent geen punten en geen gebruiker', () => {
    const bron = zonderCommentaar(lees('src/shared/ui/Paginakop.tsx'));
    expect(bron).not.toMatch(/\b(punten|score|userId|lid|member)\b/i);
    expect(bron).toMatch(/voortgang\?: Voortgang/);
  });
});
