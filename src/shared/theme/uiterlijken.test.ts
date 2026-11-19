import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { kleinsteAfstand, kleurafstand, MIN_AFSTAND } from './kleurafstand';
import { navy, navyLight, PALETSLEUTELS, roles, type Palette } from './tokens';
import { allePaletten, UITERLIJK_IDS, UITERLIJKEN, uiterlijk } from './uiterlijken';

/**
 * De belofte van QS8-723: **elk uiterlijk is een volledig palet dat contrast en onderscheid haalt, per palet gemeten.**
 *
 * ⚠️ Dit bestand loopt over `allePaletten()` en niet over een vaste lijst: een uiterlijk dat QS8-724
 *    toevoegt, valt hier vanzelf onder dezelfde toetsen. Een palet dat een toets overslaat omdat niemand
 *    hem in de lijst zette, is de fout die dit bestand wil voorkomen.
 */

const paletten = allePaletten();

describe.each(paletten)('palet %s', (_naam, u) => {
  const p = u.colors;

  it('draagt elke sleutel, en alleen die (criterium 1)', () => {
    expect(Object.keys(p).sort()).toEqual([...PALETSLEUTELS].sort());
    for (const sleutel of PALETSLEUTELS) expect(p[sleutel], sleutel).toMatch(/\S/);
  });

  it('haalt 4,5:1 voor tekst op achtergrond en paneel (criterium 5)', () => {
    for (const vlak of [p.bg, p.panel, p.panelDark]) {
      expect(contrastRatio(p.text, vlak)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      expect(contrastRatio(p.textSecondary, vlak)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });

  it('haalt 3:1 voor merk- en statuskleuren als bedieningselement (criterium 5)', () => {
    for (const kleur of [p.accent, p.green, p.orange, p.red]) {
      expect(contrastRatio(kleur, p.bg), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      expect(contrastRatio(kleur, p.panel), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
    }
  });

  it('draagt de knoptekst op de knopvulling met 4,5:1 (criterium 5)', () => {
    expect(contrastRatio(p.knopTekst, p.knop)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });

  it('houdt de categoriekleuren uit elkaar en van de statuskleuren en het accent van dit palet (criterium 6)', () => {
    const kleuren = Object.values(u.families);
    expect(kleinsteAfstand(kleuren)).toBeGreaterThanOrEqual(MIN_AFSTAND);
    for (const kleur of kleuren) {
      for (const status of [p.green, p.orange, p.red, p.accent]) {
        expect(kleurafstand(kleur, status), `${kleur} vs ${status}`).toBeGreaterThanOrEqual(MIN_AFSTAND);
      }
    }
  });

  /**
   * Criterium 7 (domeinregel 7): `red` is deadline-risico en niets anders. De rol voor "geen activiteit" is
   * neutraal en dus nooit dezelfde kleur als `red`, in elk palet.
   */
  it('houdt rood uitsluitend voor risico: de neutrale rol is nooit rood (criterium 7)', () => {
    const r = roles(p);
    expect(r.atRisk).toBe(p.red);
    expect(r.neutral).toBe(p.grey);
    expect(r.neutral).not.toBe(r.atRisk);
    expect(kleurafstand(p.grey, p.red)).toBeGreaterThanOrEqual(MIN_AFSTAND);
  });
});

describe('de uiterlijken', () => {
  it('heeft B als het huidige stelsel, ongewijzigd (criterium 2)', () => {
    expect(UITERLIJKEN.B.donker.colors).toBe(navy);
    expect(UITERLIJKEN.B.licht.colors).toBe(navyLight);
  });

  it('heeft A met een blauwgroen accent en niet emerald (criterium 2)', () => {
    for (const modus of ['donker', 'licht'] as const) {
      const a = uiterlijk('A', modus).colors;
      expect(a.accent.toLowerCase()).not.toBe('#10b981');
      // Gewone afstand tot het statusgroen: 'gehaald' en 'merk' vallen niet samen.
      expect(kleurafstand(a.accent, a.green), modus).toBeGreaterThanOrEqual(MIN_AFSTAND);
    }
  });

  it('kent twee uiterlijken in twee modi: vier paletten', () => {
    expect(UITERLIJK_IDS).toEqual(['A', 'B']);
    expect(paletten).toHaveLength(4);
  });

  it('heeft in elk uiterlijk dezelfde helden en categoriekleuren per modus (A en B delen ze)', () => {
    for (const modus of ['donker', 'licht'] as const) {
      expect(UITERLIJKEN.A[modus].helden).toBe(UITERLIJKEN.B[modus].helden);
      expect(UITERLIJKEN.A[modus].families).toBe(UITERLIJKEN.B[modus].families);
    }
  });
});

/** Een controle die je niet kunt voeden, kun je niet ijken: de volledigheidstoets krijgt hier een kapot palet. */
describe('de volledigheidstoets ziet een kapot palet', () => {
  const sleutelsVan = (p: Partial<Palette>) => Object.keys(p).sort();

  it('ziet een ontbrekende sleutel', () => {
    const { knop: _weg, ...zonder } = navy;
    expect(sleutelsVan(zonder)).not.toEqual([...PALETSLEUTELS].sort());
  });

  it('ziet een extra sleutel', () => {
    expect(sleutelsVan({ ...navy, extra: '#000000' } as Partial<Palette>)).not.toEqual(
      [...PALETSLEUTELS].sort(),
    );
  });
});
