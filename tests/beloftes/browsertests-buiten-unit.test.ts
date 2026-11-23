import { readdirSync } from 'node:fs';
import { join, matchesGlob, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import config from '../../vitest.config.mjs';

/**
 * Een echte-browsertest draait nooit in de groep `unit`, en altijd in de groep `browser`. QS8-808.
 *
 * ⚠️ **Waarom dit een belofte is.** `playwright` staat sinds QS8-808 in `package.json`, dus de
 *    `require` slaagt ook in de push-CI. Daar installeert niemand een browser. Valt een bestand uit
 *    `tests/browser/` weer in `unit`, dan faalt `chromium.launch()` en wordt `npm test` rood op
 *    elke push. Valt het buiten `browser`, dan draait de nachtelijke workflow
 *    (`.github/workflows/browsertest.yml`) het niet, en is de belofte ongemeten zonder dat iets
 *    rood wordt. Die tweede kant is de gevaarlijke.
 *
 * ⚠️ **De toets leest de echte config en de echte bestanden, geen kopie van de glob.** Hij vraagt
 *    per bestand in `tests/browser/` wat vitest zelf zou vragen: valt het in `include` en niet in
 *    `exclude`? Een toets op de letterlijke tekst `'tests/browser/**'` blijft groen als iemand de
 *    `include` van `unit` verruimt of die van `browser` versmalt.
 *
 * IJKING: met de hand, 23-11-2026, één mutatie per grendel. Zie
 *   `docs/decisions/2026-11-23-de-echte-browsertest-draait-s-nachts.md`, tabel "IJking".
 */

type Groep = { test?: { name?: string; include?: string[]; exclude?: string[] } };

const WORTEL = join(import.meta.dirname, '..', '..');
const MAP = join(WORTEL, 'tests', 'browser');

function groep(naam: string): { include: string[]; exclude: string[] } {
  const projecten = (config.test?.projects ?? []) as Groep[];
  const g = projecten.find((p) => p.test?.name === naam);
  if (!g?.test) throw new Error(`vitest.config.mts heeft geen groep '${naam}'`);
  return { include: g.test.include ?? [], exclude: g.test.exclude ?? [] };
}

function valtIn(bestand: string, g: { include: string[]; exclude: string[] }): boolean {
  return (
    g.include.some((glob) => matchesGlob(bestand, glob)) &&
    !g.exclude.some((glob) => matchesGlob(bestand, glob))
  );
}

function browsertests(): string[] {
  return readdirSync(MAP, { recursive: true, encoding: 'utf8' })
    .filter((n) => n.endsWith('.test.ts'))
    .map((n) => relative(WORTEL, join(MAP, n)).split('\\').join('/'));
}

describe('tests/browser/ en de vitest-groepen', () => {
  const bestanden = browsertests();

  it('er is minstens één browsertest, anders toetst dit niets', () => {
    expect(bestanden.length).toBeGreaterThan(0);
  });

  it.each(bestanden)('%s valt niet in de groep unit', (bestand) => {
    expect(valtIn(bestand, groep('unit'))).toBe(false);
  });

  it.each(bestanden)('%s valt in de groep browser', (bestand) => {
    expect(valtIn(bestand, groep('browser'))).toBe(true);
  });
});
