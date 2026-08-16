import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { navy, navyLight, type Palette } from './tokens';

/**
 * Het design system belooft WCAG AA in beide modi. Deze test legt die belofte
 * vast, zodat een aanpassing aan het Q-Projects-stelsel meteen zichtbaar wordt
 * in plaats van pas bij een gebruiker met slechte ogen op een fel scherm.
 */

const themes: [naam: string, palette: Palette][] = [
  ['navy (donker)', navy],
  ['navy-licht', navyLight],
];

describe.each(themes)('contrast — %s', (_naam, p) => {
  it('lopende tekst haalt AAA op de achtergrond', () => {
    expect(contrastRatio(p.text, p.bg)).toBeGreaterThanOrEqual(WCAG.AAA_TEXT);
  });

  it('lopende tekst haalt AAA op een paneel', () => {
    expect(contrastRatio(p.text, p.panel)).toBeGreaterThanOrEqual(WCAG.AAA_TEXT);
    expect(contrastRatio(p.text, p.panelDark)).toBeGreaterThanOrEqual(WCAG.AAA_TEXT);
  });

  it('secundaire tekst haalt AA op achtergrond en paneel', () => {
    expect(contrastRatio(p.textSecondary, p.bg)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(contrastRatio(p.textSecondary, p.panel)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });

  it('de statuskleuren zijn bruikbaar als UI-element op een paneel', () => {
    for (const kleur of [p.green, p.orange, p.red, p.accent]) {
      expect(contrastRatio(kleur, p.panel)).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      expect(contrastRatio(kleur, p.bg)).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
    }
  });
});

/**
 * ⚠️ Vastgelegde beperkingen van het goud. Geen bug, en niet iets om met een
 *    zelfbedachte tint op te lossen — het stelsel is van Q-Projects.
 *
 * Het goud is een **accent**, geen tekstkleur en geen knopvlak voor lopende
 * tekst. Het haalt overal de drempel voor UI-elementen, randen, iconen en grote
 * tekst (3.0), maar nergens die voor lopende tekst (4.5).
 *
 * Gevolg voor de bouw:
 *   - Gebruik `accent` voor randen, iconen, actieve staten, koppen en accenten.
 *   - Zet géén lopende tekst in goud, en géén lopende tekst óp een goudvlak.
 *   - De primaire knop is in de donkere modus een goudvlak met donkere tekst
 *     (dat haalt het ruim), en in de lichte modus een navy vlak met witte tekst.
 */
describe('grenzen van het accent', () => {
  it('goud is nergens een kleur voor lopende tekst', () => {
    for (const [p, ondergrond] of [
      [navyLight, navyLight.bg],
      [navyLight, navyLight.panel],
    ] as const) {
      const ratio = contrastRatio(p.accent, ondergrond);
      expect(ratio).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      expect(ratio).toBeLessThan(WCAG.AA_TEXT);
    }
  });

  it('een goudvlak draagt in de donkere modus wél lopende tekst', () => {
    // Donkere modus: navy tekst op goud haalt AA ruim.
    expect(contrastRatio(navy.bg, navy.accent)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });

  it('een goudvlak draagt in de lichte modus GEEN lopende tekst', () => {
    // 4.27 — net onder AA. Daarom is de primaire knop daar navy, niet goud.
    expect(contrastRatio(navyLight.text, navyLight.accent)).toBeLessThan(WCAG.AA_TEXT);
    expect(contrastRatio(navyLight.text, navyLight.accent)).toBeGreaterThanOrEqual(
      WCAG.AA_LARGE,
    );
  });

  it('de navy primaire knop in de lichte modus is wél leesbaar', () => {
    // Wit op de donkerste navy uit het lichte thema: het alternatief voor goud.
    expect(contrastRatio('#ffffff', navyLight.text)).toBeGreaterThanOrEqual(
      WCAG.AAA_TEXT,
    );
  });
});

describe('de contrastberekening zelf', () => {
  it('kent de bekende uitersten', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('stelt een transparante voorgrond samen op de achtergrond', () => {
    // Volledig transparant wit op wit levert geen contrast op.
    expect(contrastRatio('rgba(255,255,255,0)', '#ffffff')).toBeCloseTo(1, 5);
    // Half doorzichtig zwart op wit zit ergens in het midden.
    const half = contrastRatio('rgba(0,0,0,0.5)', '#ffffff');
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(21);
  });

  it('begrijpt korte hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });
});
