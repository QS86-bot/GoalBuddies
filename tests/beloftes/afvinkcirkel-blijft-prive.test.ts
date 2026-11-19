import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * De actiekaart en de afvinkcirkel — QS8-727. Belofte als eigenschap van het
 * geheel (regel 18): ze staan alleen op eigen schermen (domeinregel 9, 7), er is
 * geen rood of kleurliteraal in, en er is geen getal of puntenwaarde in.
 */
const ROOT = join(__dirname, '..', '..');

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : /\.tsx?$/.test(naam) ? [pad] : [];
  });
}

const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, '/');
const NIEUW = ['Afvinkcirkel.tsx', 'Actiekaart.tsx', 'afvinkcirkel-vorm.ts'].map((f) =>
  zonderCommentaar(readFileSync(join(ROOT, 'src/shared/ui', f), 'utf8')),
);

describe('de afvinkcirkel blijft privé en neutraal', () => {
  it('wordt alleen op het Vandaag-scherm gebruikt', () => {
    const gebruikers = [...bestanden(join(ROOT, 'app')), ...bestanden(join(ROOT, 'src'))]
      .filter((p) => !p.includes('.test.'))
      .filter((p) => /\b(Afvinkcirkel|Actiekaart)\b/.test(zonderCommentaar(readFileSync(p, 'utf8'))))
      .map(rel)
      .filter((p) => !['Afvinkcirkel.tsx', 'Actiekaart.tsx'].some((f) => p.endsWith(`ui/${f}`)));
    expect(gebruikers.sort()).toEqual(['src/schermen/vandaag/WeekdoelKaart.tsx', 'src/shared/ui/index.ts']);
  });

  it('staat niet in een groepsscherm, en Ritmestrook ook niet', () => {
    const groepsschermen = bestanden(join(ROOT, 'app')).filter((p) => /groep|buddies|huddle/i.test(rel(p)));
    expect(groepsschermen.length).toBeGreaterThan(0);
    for (const p of groepsschermen) {
      expect(zonderCommentaar(readFileSync(p, 'utf8'))).not.toMatch(/Afvinkcirkel|Actiekaart|Ritmestrook|day_checkins|fetchAfvinkingen/);
    }
  });

  it('heeft geen kleurliteraal en geen rood of waarschuwing', () => {
    for (const bron of NIEUW) {
      expect(bron).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|'red'|colors\.red|roles\.atRisk|danger|colors\.(error|warning)|gemist|missed/i);
    }
  });

  it('leest geen groepsgegevens en kent geen punten', () => {
    for (const bron of NIEUW) {
      expect(bron).not.toMatch(/modules\/|group_id|points_ledger|punten|score/i);
    }
  });
});
