import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PROFIEL_RPC_KOLOMMEN } from '../../src/modules/buddies/profiel-kolommen';
import { profielTabs } from '../../src/modules/buddies/profiel-lezen';

/**
 * QS8-750, de naad tussen tab en data: een tab die voor een ander niet bestaat
 * mag ook geen data hebben die hij kan tonen. Wie een kolom over punten, reeks
 * of datum aan de RPC toevoegt, of een eigen tab aan de lijst van een ander,
 * maakt deze test rood.
 */
describe('het profiel van een ander', () => {
  it('heeft geen tab voor statistieken of prestaties', () => {
    expect(profielTabs(false)).not.toContain('statistieken');
    expect(profielTabs(false)).not.toContain('prestaties');
  });

  it('krijgt van de database geen kolom over punten, reeks, datum of week', () => {
    const alles = Object.values(PROFIEL_RPC_KOLOMMEN).flat().join(' ');
    expect(alles).not.toMatch(/punt|xp|niveau|badge|streak|reeks|datum|date|week|status|_at\b/i);
  });

  it('importeert de eigen schermen niet: ze zijn alleen een link', () => {
    const bron = readFileSync('app/mensen/[id].tsx', 'utf8');
    expect(bron).not.toMatch(/from '@\/modules\/(xp|completions|gamification)/);
    expect(bron).not.toMatch(/from '.*(statistiek|prestaties)'/);
  });
});
