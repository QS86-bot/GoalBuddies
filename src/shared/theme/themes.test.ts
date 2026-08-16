import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { navyLightTheme, navyTheme, parsePreference, themeForPreference } from './themes';

/**
 * QS8-89. Twee dingen worden hier vastgelegd: dat de handmatige keuze de
 * systeeminstelling overschrijft, en dat de knoplabels in béide modi leesbaar
 * blijven — dat laatste is de plek waar het goud het snelst misgaat.
 */

describe('themevoorkeur', () => {
  it('volgt het systeem als de gebruiker niets gekozen heeft', () => {
    expect(themeForPreference('systeem', 'light').name).toBe('navy-licht');
    expect(themeForPreference('systeem', 'dark').name).toBe('navy');
  });

  it('valt terug op donker als het systeem niets zegt', () => {
    // Donker is de primaire modus van dit stelsel, niet de uitzondering.
    expect(themeForPreference('systeem', 'unspecified').name).toBe('navy');
  });

  it('laat een handmatige keuze het systeem overrulen, beide kanten op', () => {
    expect(themeForPreference('navy', 'light').name).toBe('navy');
    expect(themeForPreference('navy-licht', 'dark').name).toBe('navy-licht');
  });

  it('valt terug op systeem bij een onbekende opgeslagen waarde', () => {
    // Een oude of beschadigde waarde in AsyncStorage mag de app niet blokkeren.
    expect(parsePreference('emerald')).toBe('systeem');
    expect(parsePreference(null)).toBe('systeem');
    expect(parsePreference('navy-licht')).toBe('navy-licht');
  });
});

describe('knoplabels blijven leesbaar in beide modi', () => {
  /**
   * ⚠️ Dit is de plek waar het stelsel het makkelijkst breekt. Goud draagt geen
   *    lopende tekst, maar de primaire knop is een goudvlak mét tekst.
   *
   *    De twee modi gebruiken daarom een verschillende goudtint. Wit op het
   *    lichte goud (`accent`, #a87a22) komt op 3,84 en zakt dus door AA heen;
   *    op `accentDim` haalt wit 5,25. In de donkere modus is het goud licht en
   *    draagt het juist de donkere navy-tekst.
   *
   *    Deze test is de reden dat dat ontdekt is, en de reden dat het zo blijft.
   */
  const gevallen = [
    ['navy (donker)', navyTheme, navyTheme.colors.accent, '#141e3c'],
    ['navy-licht', navyLightTheme, navyLightTheme.colors.accentDim, '#ffffff'],
  ] as const;

  it.each(gevallen)('%s: label op de primaire knop haalt AA', (_naam, _theme, vlak, label) => {
    expect(contrastRatio(label, vlak)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });

  it.each(gevallen)('%s: label op de secundaire knop haalt AA', (_naam, theme) => {
    expect(contrastRatio(theme.colors.text, theme.colors.panel)).toBeGreaterThanOrEqual(
      WCAG.AA_TEXT,
    );
  });

  it.each(gevallen)('%s: de focusring is zichtbaar op elk vlak', (_naam, theme) => {
    // Een focusring die je niet ziet, is geen focusring. Drempel voor
    // UI-elementen is 3.0.
    for (const ondergrond of [theme.colors.bg, theme.colors.panel, theme.colors.panelDark]) {
      expect(contrastRatio(theme.colors.accent, ondergrond)).toBeGreaterThanOrEqual(
        WCAG.AA_LARGE,
      );
    }
  });

  it.each(gevallen)('%s: de voortgangsbalk is te onderscheiden van zijn spoor', (_naam, theme) => {
    expect(contrastRatio(theme.roles.progress, theme.colors.panelDark)).toBeGreaterThanOrEqual(
      WCAG.AA_LARGE,
    );
    expect(contrastRatio(theme.roles.pending, theme.colors.panelDark)).toBeGreaterThanOrEqual(
      WCAG.AA_LARGE,
    );
  });
});
