import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHROMIUM_VLAGGEN } from '../browser/lettertype';

/**
 * Elke browsertest start Chromium met `CHROMIUM_VLAGGEN`. QS8-812.
 *
 * ⚠️ **Waarom dit een belofte is.** Zonder `--font-render-hinting=none` rondt Chromium tekstbreedtes af op
 *    hele pixels, en of dat gebeurt verschilt per machine. 📏 Op de runner mat de stijltoets `Optie A`
 *    80 px tegen 79,94 in de cloudsessie (run 45187664320). Een nieuwe browsertest die Chromium kaal
 *    start, is dan lokaal groen en 's nachts rood, of omgekeerd. Deze toets draait in `unit`, dus bij
 *    elke push, en niet pas in de nachtrun.
 *
 * ⚠️ **Wat hij leest.** Elke `.launch…(` in `tests/browser/`, en wat er tussen de haakjes staat. Een launch
 *    zonder `CHROMIUM_VLAGGEN` daartussen is rood, ook `launch()` zonder argumenten en
 *    `launchPersistentContext(…)`. Een launch die de vlaggen via een tussenvariabele krijgt, ziet hij niet;
 *    die vorm staat nergens, en wie hem invoert, maakt deze toets rood en moet hem dan aanpassen.
 *
 * IJKING: met de hand, 23-11-2026. Zie `docs/decisions/2026-11-23-browsertests-starten-met-hinting-uit.md`.
 */

const MAP = join(import.meta.dirname, '..', 'browser');

/** Elke `.launch…(…)` in een bron, met de tekst tussen de haakjes. Geëxporteerd om los te ijken. */
export function launches(bron: string): string[] {
  const uit: string[] = [];
  const re = /\.launch\w*\(/g;
  for (let m = re.exec(bron); m !== null; m = re.exec(bron)) {
    let diepte = 1;
    let i = m.index + m[0].length;
    const begin = i;
    while (i < bron.length && diepte > 0) {
      if (bron[i] === '(') diepte++;
      else if (bron[i] === ')') diepte--;
      i++;
    }
    uit.push(bron.slice(begin, i - 1));
  }
  return uit;
}

function bronnen(): { pad: string; bron: string }[] {
  return readdirSync(MAP, { recursive: true, encoding: 'utf8' })
    .filter((n) => n.endsWith('.ts') && !n.endsWith('lettertype.ts'))
    .map((n) => ({ pad: relative(MAP, join(MAP, n)), bron: readFileSync(join(MAP, n), 'utf8') }));
}

describe('browsertests starten Chromium met vaste vlaggen', () => {
  it('de constante zet font-hinting uit', () => {
    expect(CHROMIUM_VLAGGEN).toContain('--font-render-hinting=none');
  });

  const alle = bronnen().flatMap(({ pad, bron }) => launches(bron).map((args) => ({ pad, args })));

  it('er is minstens één launch, anders toetst dit niets', () => {
    expect(alle.length).toBeGreaterThan(0);
  });

  it.each(alle)('$pad: launch($args) gebruikt CHROMIUM_VLAGGEN', ({ args }) => {
    expect(args).toMatch(/\bCHROMIUM_VLAGGEN\b/);
  });

  it('launches() vindt ook een kale launch en een launchPersistentContext', () => {
    expect(launches('pw.chromium.launch(); x.launchPersistentContext(dir, { a: f(1) })')).toStrictEqual([
      '',
      'dir, { a: f(1) }',
    ]);
  });
});
