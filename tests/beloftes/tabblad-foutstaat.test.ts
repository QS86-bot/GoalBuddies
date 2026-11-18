import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isHuddledagOp } from '../../src/modules/buddies/periods';
import { BREED_VANAF, taakbalkVorm, TABBLADEN } from '../../src/shared/ui/tabbladen';

vi.mock('../../src/lib/observability', () => ({ reportError: vi.fn() }));

/**
 * Op een tabblad kan geen wit scherm ontstaan, en het menu is een rij knoppen — QS8-705.
 *
 * ⚠️ **De belofte is "geen wit scherm op élk tabblad", en dat is een uitspraak
 *    over het geheel.** Een test op de groepentab alleen bewaakt het scherm waar
 *    het gemeld werd; het wordt weer wit op het zesde tabblad dat iemand
 *    toevoegt. Daarom leest deze test de échte bestanden in `app/(tabs)/` en
 *    eist dat elk ervan de foutstaat exporteert.
 *
 * ⚠️ **Wat dit niet bewijst, staat erbij.** Er is geen renderer in dit project,
 *    dus dat expo-router de geëxporteerde `ErrorBoundary` ook daadwerkelijk om de
 *    route zet is gemeten met Playwright op een lokale webexport (18-11-2026) en
 *    niet in CI. Deze test bewaakt de aansluiting; de werking is een meting.
 *
 * IJKING — met de hand gedraaid op 18-11-2026, één mutatie per grendel:
 *
 *   de `export { TabFout as ErrorBoundary }` uit `app/(tabs)/lijst.tsx` halen
 *      -> rood: 'exporteert elk tabblad de foutstaat' (lijst.tsx)
 *   de try/catch in `isHuddledagOp()` weghalen
 *      -> rood: 'een groep met een onbekende tijdzone is geen renderfout'
 *   `BREED_VANAF` naar 700
 *      -> rood: 'het breekpunt ligt op 900'
 */

const TABS = join(__dirname, '..', '..', 'app', '(tabs)');

function tabbladen(): string[] {
  return readdirSync(TABS).filter((f) => f.endsWith('.tsx') && !f.startsWith('_'));
}

describe('geen wit scherm op een tabblad', () => {
  it('de map bevat precies de vijf tabbladen van het menu', () => {
    // Zonder deze regel is "elk tabblad" een lege lus als de map verhuist.
    expect(tabbladen()).toHaveLength(TABBLADEN.length);
  });

  it.each(tabbladen())('exporteert elk tabblad de foutstaat (%s)', (bestand) => {
    const bron = readFileSync(join(TABS, bestand), 'utf8');
    expect(bron).toMatch(/export\s*\{\s*TabFout\s+as\s+ErrorBoundary\s*\}/);
  });

  it('een groep met een onbekende tijdzone is geen renderfout', () => {
    const groep = { huddle_day: 0, tz: 'Mars/Olympus' };
    expect(() => isHuddledagOp(groep, new Date('2026-11-18T12:00:00Z'))).not.toThrow();
    expect(isHuddledagOp(groep, new Date('2026-11-18T12:00:00Z'))).toBe(false);
  });

  it('een geldige zone rekent nog steeds', () => {
    // MUST-ALLOW: de terugval mag een goede groep niet "nee" laten zeggen.
    // 2026-11-22 is een zondag, en `huddle_day` 0 is zondag.
    const groep = { huddle_day: 0, tz: 'Europe/Amsterdam' };
    expect(isHuddledagOp(groep, new Date('2026-11-22T12:00:00Z'))).toBe(true);
    expect(isHuddledagOp(groep, new Date('2026-11-18T12:00:00Z'))).toBe(false);
  });
});

describe('het menu', () => {
  it('het breekpunt ligt op 900', () => {
    expect(BREED_VANAF).toBe(900);
    expect(taakbalkVorm(899)).toBe('bovenrand');
    expect(taakbalkVorm(900)).toBe('zijkant');
  });

  it('heeft vijf bestemmingen, elk met een eigen pad', () => {
    expect(TABBLADEN.map((t) => t.pad)).toEqual(['/', '/doelen', '/groep', '/lijst', '/profiel']);
  });
});
