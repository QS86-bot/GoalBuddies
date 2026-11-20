import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * De verwijzing naar de weekbelofte schrijft niets — QS8-762, criterium 3 (naad).
 *
 * ⚠️ Zusje van `vragenlijst-maakt-geen-belofte.test.ts`, dat de keten vanaf
 *    `app/onboarding/` volgt. Die dekt de vragenlijst; dit dekt de verwijzing die
 *    ernaast is gekomen en die wél `commitments` raakt (lezen, via
 *    `fetchBelofteBegunstigden`). Een verwijzing die morgen zelf een belofte
 *    aangaat, is precies wat besluit 3 van de poort QS8-744 verbiedt.
 *
 * Ijking (regel 18 vraag 3), met de hand: `zetStraf` of `gaWeekbelofteAan` in
 * `Belofteverwijzing.tsx` → rood; `from('commitments')` in `verwijzing.ts` → rood;
 * `Belofteverwijzing` geïmporteerd in een bestand van de vragenlijst → rood.
 */
const WORTEL = join(import.meta.dirname, '..', '..');
const VERBODEN = [/\.from\(\s*['"]commitments['"]\s*\)/, /\bgaWeekbelofteAan\b/, /\bzetStraf\b/, /\btrekIn\b/];
const lees = (pad: string) => zonderCommentaar(readFileSync(join(WORTEL, pad), 'utf8'));

describe('de verwijzing naar de weekbelofte schrijft niets', () => {
  for (const pad of ['src/schermen/belofte/Belofteverwijzing.tsx', 'src/schermen/belofte/verwijzing.ts']) {
    it(`${pad} maakt, wijzigt en trekt geen commitment`, () => {
      const code = lees(pad);
      expect(code.length).toBeGreaterThan(100);
      expect(VERBODEN.filter((r) => r.test(code)).map(String)).toEqual([]);
    });
  }

  it('de verwijzing beslist met toonBelofteverwijzing en haalt de lijst uit het beloftescherm-bron', () => {
    const code = lees('src/schermen/belofte/Belofteverwijzing.tsx');
    expect(code).toMatch(/toonBelofteverwijzing\(/);
    expect(code).toMatch(/fetchBelofteBegunstigden/);
  });

  it('niets in de vragenlijst importeert de verwijzing (hij hoort bij de doelenlijst)', () => {
    for (const pad of [
      'src/schermen/vragenlijst/useVragenlijst.ts',
      'src/schermen/vragenlijst/bewaar.ts',
      'src/schermen/vragenlijst/Vragenlijstscherm.tsx',
      'app/onboarding/vragenlijst.tsx',
    ]) {
      expect(lees(pad), pad).not.toMatch(/Belofteverwijzing|verwijzingsdoel/);
    }
  });
});
