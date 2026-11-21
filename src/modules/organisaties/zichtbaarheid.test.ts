import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ORGANISATIE_AANMAKEN_ZICHTBAAR } from './zichtbaarheid';

describe('Organisatie aanmaken is niet voor iedereen zichtbaar (besluit 33, QS8-663)', () => {
  it('staat uit zolang de juridische toets niet klaar is', () => {
    expect(ORGANISATIE_AANMAKEN_ZICHTBAAR).toBe(false);
  });

  // De belofte is dat er geen knop is, niet dat de constante bestaat: de ingang
  // in het profiel mag de route alleen achter de constante openen.
  it('de profielingang opent /organisatie/nieuw alleen achter de constante', () => {
    const bron = readFileSync('app/(tabs)/profiel.tsx', 'utf8');
    const regels = bron.split('\n');
    const i = regels.findIndex((r) => r.includes("router.push('/organisatie/nieuw')"));
    expect(i).toBeGreaterThan(0);
    expect(regels.slice(Math.max(0, i - 3), i).join('\n')).toContain(
      'ORGANISATIE_AANMAKEN_ZICHTBAAR',
    );
  });
});
