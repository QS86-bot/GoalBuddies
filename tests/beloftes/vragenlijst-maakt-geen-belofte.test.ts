import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * De vragenlijst maakt geen commitment — QS8-761, criterium 3 (besluit 3 van de
 * poort QS8-744: *geen commitment tijdens de onboarding*).
 *
 * ⚠️⚠️ **Transitief, want de vragenlijst staat niet onder `app/onboarding/`.**
 *    `app/onboarding/vragenlijst.tsx` is een dun routebestand; het opslaan staat
 *    in `src/schermen/vragenlijst/bewaar.ts` (QS8-733). Een scan die alleen
 *    `app/onboarding/` leest, blijft groen als `bewaar.ts` morgen `zetStraf()`
 *    aanroept. Deze test volgt elke relatieve en `@/`-import vanaf de
 *    onboardingroutes en kijkt in álles wat zo bereikbaar is.
 *
 * ⚠️ **Wat hij zoekt:** een `from('commitments')`, en een verwijzing naar
 *    `gaWeekbelofteAan` of `zetStraf`. Een import van de module
 *    `commitments` zelf is breder dan nodig en mag (bijv. voor een tekst).
 *
 * Ijking (regel 18 vraag 3), met de hand: `import { zetStraf } from
 * '@/modules/commitments'` plus een aanroep in `src/schermen/vragenlijst/bewaar.ts`
 * → rood met dat bestand in de melding; dezelfde regel in
 * `app/onboarding/vragenlijst.tsx` → rood.
 */

const WORTEL = join(import.meta.dirname, '..', '..');
const VERBODEN = [/\.from\(\s*['"]commitments['"]\s*\)/, /\bgaWeekbelofteAan\b/, /\bzetStraf\b/];

function bestandVoor(van: string, spec: string): string | null {
  let basis: string;
  if (spec.startsWith('@/')) basis = join(WORTEL, 'src', spec.slice(2));
  else if (spec.startsWith('.')) basis = resolve(dirname(van), spec);
  else return null;
  for (const kandidaat of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, 'index.ts'), join(basis, 'index.tsx')]) {
    if (existsSync(kandidaat) && statSync(kandidaat).isFile()) return kandidaat;
  }
  return null;
}

/** Alles wat vanaf de gegeven bestanden bereikbaar is, behalve de module commitments zelf. */
function bereikbaar(start: readonly string[]): string[] {
  const gezien = new Set<string>();
  const rij = [...start];
  while (rij.length > 0) {
    const pad = rij.pop() as string;
    if (gezien.has(pad)) continue;
    gezien.add(pad);
    const code = zonderCommentaar(readFileSync(pad, 'utf8'));
    for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const doel = bestandVoor(pad, m[1] ?? '');
      if (doel !== null && !doel.includes(join('src', 'modules', 'commitments'))) rij.push(doel);
    }
  }
  return [...gezien];
}

describe('de vragenlijst maakt geen weekbelofte en geen straf', () => {
  const map = join(WORTEL, 'app', 'onboarding');
  const routes = readdirSync(map).filter((n) => /\.tsx?$/.test(n)).map((n) => join(map, n));
  const alles = bereikbaar(routes);

  it('de scan bereikt de opslag van de vragenlijst echt (anders bewijst hij niets)', () => {
    expect(alles.map((p) => relative(WORTEL, p).replaceAll('\\', '/'))).toContain(
      'src/schermen/vragenlijst/bewaar.ts',
    );
  });

  it('geen bereikbaar bestand doet from(commitments) of verwijst naar gaWeekbelofteAan of zetStraf', () => {
    const treffers = alles.flatMap((pad) => {
      const code = zonderCommentaar(readFileSync(pad, 'utf8'));
      return VERBODEN.filter((r) => r.test(code)).map((r) => `${relative(WORTEL, pad)}: ${r.source}`);
    });
    expect(treffers).toEqual([]);
  });
});
