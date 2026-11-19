import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * De drie tellers zijn privé, staan niet naast een voortgangsbalk en tonen geen
 * gemist — QS8-747.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel** (regel 18): het blok mag nergens
 *    anders dan op Vandaag staan, mag geen groepsgegevens lezen, mag geen balk
 *    bevatten (domeinregel 10: score en voortgang nooit samen), en mag geen
 *    woord of kleur dragen dat een lege week tot falen maakt (domeinregel 7).
 */
const ROOT = join(__dirname, '..', '..');

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : /\.tsx?$/.test(naam) ? [pad] : [];
  });
}

const BLOK = ['Tellers.tsx', 'tellers-vorm.ts'].map((f) =>
  zonderCommentaar(readFileSync(join(ROOT, 'src/schermen/vandaag', f), 'utf8')),
);

describe('de drie tellers blijven privé', () => {
  it('komen alleen op het Vandaag-scherm voor', () => {
    const gebruikers = [...bestanden(join(ROOT, 'app')), ...bestanden(join(ROOT, 'src'))]
      .filter((p) => !p.includes('.test.'))
      .filter((p) => /TellersBlok|tellers-vorm|fetchPuntenDezeWeek/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1));
    expect(gebruikers.sort()).toEqual([
      'app/(tabs)/index.tsx',
      'src/modules/goals/index.ts',
      'src/modules/goals/punten-week.ts',
      'src/schermen/vandaag/Tellers.tsx',
      'src/schermen/vandaag/index.ts',
      'src/schermen/vandaag/tellers-vorm.ts',
      'src/schermen/vandaag/useVandaag.ts',
    ]);
  });

  it('staan niet in een groepsscherm', () => {
    const groepsschermen = bestanden(join(ROOT, 'app')).filter((p) => /groep|buddies|huddle/i.test(p.slice(ROOT.length)));
    expect(groepsschermen.length).toBeGreaterThan(0);
    for (const p of groepsschermen) expect(readFileSync(p, 'utf8')).not.toMatch(/TellersBlok|fetchPuntenDezeWeek/);
  });

  it('lezen geen groepsgegevens', () => {
    for (const bron of BLOK) expect(bron).not.toMatch(/modules\/buddies|group_id|groepsgenoot|fetchGroep/i);
  });

  it('bevatten geen voortgangsbalk of grafiek: het puntental staat nergens naast een balk', () => {
    for (const bron of BLOK) {
      expect(bron).not.toMatch(/MilestoneProgress|Voortgang|ProgressBar|progressbar|Weekbalken|<svg|Svg/i);
    }
    const scherm = zonderCommentaar(readFileSync(join(ROOT, 'app/(tabs)/index.tsx'), 'utf8'));
    expect(scherm).not.toMatch(/MilestoneProgress|ProgressBar/);
  });

  it('kennen geen gemist-staat, foutkleur of kleurliteraal', () => {
    for (const bron of BLOK) {
      expect(bron).not.toMatch(/gemist|missed|danger|colors\.(red|error|warning)|'red'|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
    const nl = readFileSync(join(ROOT, 'src/shared/i18n/nl.ts'), 'utf8');
    const en = readFileSync(join(ROOT, 'src/shared/i18n/en.ts'), 'utf8');
    for (const cat of [nl, en]) {
      const regels = cat.split('\n').filter((r) => r.includes("'tellers."));
      expect(regels.length).toBe(13);
      for (const r of regels) expect(r).not.toMatch(/gemist|missed|miss|mislukt|achter|behind|XP/i);
    }
  });

  it('zeggen dat een weekpas de reeks beschermt en niet de punten', () => {
    const nl = readFileSync(join(ROOT, 'src/shared/i18n/nl.ts'), 'utf8');
    expect(nl).toMatch(/'tellers\.label_vangnet'.*beschermt je reeks, niet je punten/);
  });
});
