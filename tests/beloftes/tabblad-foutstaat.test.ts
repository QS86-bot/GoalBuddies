import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { reportError } from '../../src/lib/observability';

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
 *   de zonetoets vooraf (`isGeldigeTijdzone`) uit `isHuddledagOp()` halen
 *      -> TWEE rood (📏 gemeten 18-11-2026): 'een groep met een onbekende tijdzone
 *         is geen renderfout' en 'meldt een onbekende zone precies één keer'
 *   `BREED_VANAF` naar 700
 *      -> rood: 'het breekpunt ligt op de kolombreedte plus de inhoud'
 *   een uitgecommentarieerde export in een tabbladbestand, met `//` én met
 *   `/* … *\/` (de gedeelde knip uit `scripts/zonder-commentaar.mjs`)
 *      -> rood: 'exporteert elk tabblad de foutstaat'
 *   de `action` uit `empty` in `app/(tabs)/groep.tsx` halen, of `action={empty.action}`
 *   uit `AsyncView.tsx`
 *      -> rood: 'de lege groepentab biedt de stap die erbij hoort' (twee toetsen)
 *   `aria-current`, `role="navigation"` of `minHeight: 44` uit `Taakbalk.tsx` halen
 *      -> rood in `tabbalk-bovenaan.test.ts`, 'het menu is een landmark …'
 *   `meldOnbekendeZoneEenmaal` weghalen of per render laten melden
 *      -> rood: 'meldt een onbekende zone precies één keer'
 */

const TABS = join(__dirname, '..', '..', 'app', '(tabs)');

function tabbladen(): string[] {
  return readdirSync(TABS).filter((f) => f.endsWith('.tsx') && !f.startsWith('_'));
}

const EXPORT = /export\s*\{\s*TabFout\s+as\s+ErrorBoundary\s*\}/;

/** Buiten de tabbladen met een eigen vanger: de knop "Naar mijn groepen" staat hier. */
const BUITEN_TABS = [join('..', 'groep', '[id].tsx')];

describe('geen wit scherm op een tabblad', () => {
  it('de map bevat precies de vijf tabbladen van het menu', () => {
    // Zonder deze regel is "elk tabblad" een lege lus als de map verhuist.
    expect(tabbladen()).toHaveLength(TABBLADEN.length);
  });

  it.each(tabbladen())('exporteert elk tabblad de foutstaat (%s)', (bestand) => {
    const bron = readFileSync(join(TABS, bestand), 'utf8');
    expect(zonderCommentaar(bron)).toMatch(EXPORT);
  });

  it.each(BUITEN_TABS)('exporteert ook %s de foutstaat', (bestand) => {
    const bron = readFileSync(join(TABS, bestand), 'utf8');
    expect(zonderCommentaar(bron)).toMatch(EXPORT);
  });

  it('een groep met een onbekende tijdzone is geen renderfout', () => {
    // ⚠️ De database weigert zo'n zone (0119); dit is de vorm van "een zone die
    //    dít toestel niet kent", waarvan de database er meer kent dan `Intl`.
    const groep = { huddle_day: 0, tz: 'Mars/Olympus' };
    const moment = new Date('2026-11-18T12:00:00Z');
    expect(() => isHuddledagOp(groep, moment)).not.toThrow();
    expect(isHuddledagOp(groep, moment)).toBe(false);
  });

  it('meldt een onbekende zone precies één keer, ook als er vaak getekend wordt', () => {
    const groep = { huddle_day: 0, tz: 'Mars/Phobos' };
    const moment = new Date('2026-11-18T12:00:00Z');
    for (let i = 0; i < 5; i++) isHuddledagOp(groep, moment);
    const meldingen = vi.mocked(reportError).mock.calls.filter(([, , extra]) => extra?.['tz'] === 'Mars/Phobos');
    expect(meldingen).toHaveLength(1);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'groep.huddledag', {
      tz: 'Mars/Phobos',
    });
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
  it('het breekpunt ligt op de kolombreedte plus de inhoud', () => {
    expect(taakbalkVorm(BREED_VANAF - 1)).toBe('bovenrand');
    expect(taakbalkVorm(BREED_VANAF)).toBe('zijkant');
    expect(BREED_VANAF).toBeGreaterThanOrEqual(620 + 220);
  });
});

describe('de lege groepentab biedt de stap die erbij hoort (QS8-705)', () => {
  /**
   * ⚠️ **Dit is de naad uit regel 18, vraag 1:** `AsyncView` geeft door, de tab
   *    vult in, en geen van de twee kan kapot zijn terwijl de ander werkt. 📏
   *    Gemeten door de code-critic: de `action` uit `empty` halen, of
   *    `action={empty.action}` uit `AsyncView`, liet de hele suite groen.
   */
  const groepTab = zonderCommentaar(readFileSync(join(TABS, 'groep.tsx'), 'utf8'));
  const asyncView = zonderCommentaar(
    readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'ui', 'AsyncView.tsx'), 'utf8'),
  );

  it('vult de groepentab de lege staat met de knop "Groep aanmaken"', () => {
    expect(groepTab).toMatch(
      /empty=\{\{[\s\S]*?action:\s*\{\s*label:\s*t\('groepen\.aanmaken'\)[\s\S]*?\/groep\/nieuw/,
    );
  });

  it('geeft AsyncView die actie door aan de lege staat', () => {
    expect(asyncView).toMatch(/<EmptyState[^>]*action=\{empty\.action\}/);
  });

  it('toont de knop onder de lijst alleen als de lijst niet leeg is, nooit tweemaal', () => {
    // Leeg: de knop zit in de lege staat. Gevuld: de knop zit onder de lijst.
    expect(groepTab).toContain('<Groepsacties toonAanmaken={groepen?.length !== 0} />');
  });
});

