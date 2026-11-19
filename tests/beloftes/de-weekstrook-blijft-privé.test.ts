import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * De weekstrook is privé en leest geen groepsgegevens — QS8-746.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel** (regel 18): de strook mag
 *    nergens op een groepsscherm staan, mag niets uit `modules/buddies` lezen,
 *    en mag geen woord of kleur hebben die een lege dag tot falen maakt
 *    (domeinregel 7 en 9). Een test op het onderdeel ziet geen van drieën.
 */
const ROOT = join(__dirname, '..', '..');

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : /\.tsx?$/.test(naam) ? [pad] : [];
  });
}

const STROOK = ['Weekstrook.tsx', 'weekstrook-vorm.ts'].map((f) =>
  zonderCommentaar(readFileSync(join(ROOT, 'src/schermen/vandaag', f), 'utf8')),
);

describe('de weekstrook blijft privé', () => {
  it('komt alleen op het Vandaag-scherm voor', () => {
    const gebruikers = [...bestanden(join(ROOT, 'app')), ...bestanden(join(ROOT, 'src'))]
      .filter((p) => !p.includes('.test.'))
      .filter((p) => /WeekstrookBlok|weekstrook-vorm/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1));
    expect(gebruikers.sort()).toEqual([
      'app/(tabs)/index.tsx',
      'src/schermen/vandaag/Weekstrook.tsx',
      'src/schermen/vandaag/index.ts',
    ]);
  });

  it('staat niet in een groepsscherm', () => {
    const groepsschermen = bestanden(join(ROOT, 'app')).filter((p) => /groep|buddies|huddle/i.test(p.slice(ROOT.length)));
    expect(groepsschermen.length).toBeGreaterThan(0);
    for (const p of groepsschermen) expect(readFileSync(p, 'utf8')).not.toMatch(/WeekstrookBlok/);
  });

  it('leest geen groepsgegevens', () => {
    for (const bron of STROOK) {
      expect(bron).not.toMatch(/modules\/buddies|group_id|groepsgenoot|fetchGroep/i);
    }
  });

  it('kent geen gemist-staat of foutkleur voor een lege dag', () => {
    for (const bron of STROOK) {
      expect(bron).not.toMatch(/gemist|missed|missing|danger|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
    const nl = readFileSync(join(ROOT, 'src/shared/i18n/nl.ts'), 'utf8');
    const en = readFileSync(join(ROOT, 'src/shared/i18n/en.ts'), 'utf8');
    for (const cat of [nl, en]) {
      const regels = cat.split('\n').filter((r) => r.includes("'weekstrook."));
      expect(regels.length).toBe(6);
      for (const r of regels) expect(r).not.toMatch(/gemist|missed|miss|mislukt|achter|behind/i);
    }
  });
});
