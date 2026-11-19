import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { afstand, afstandVoor } from './tokens';
import { UITERLIJK_IDS, UITERLIJKEN } from './uiterlijken';
import {
  navyLightTheme,
  navyTheme,
  STANDAARD_THEMAKEUZE,
  themeVoorKeuze,
  uiterlijkIdVoor,
} from './themes';

/**
 * QS8-89. Twee dingen worden hier vastgelegd: dat de handmatige keuze de
 * systeeminstelling overschrijft, en dat de knoplabels in béide modi leesbaar
 * blijven — dat laatste is de plek waar het goud het snelst misgaat.
 */

describe('themevoorkeur', () => {
  const b = STANDAARD_THEMAKEUZE;

  it('volgt het systeem bij weergave systeem', () => {
    expect(themeVoorKeuze({ ...b, weergave: 'systeem' }, 'light').name).toBe('navy-licht');
    expect(themeVoorKeuze({ ...b, weergave: 'systeem' }, 'dark').name).toBe('navy');
  });

  it('valt terug op donker als het systeem niets zegt', () => {
    // Donker is de primaire modus van dit stelsel, niet de uitzondering.
    expect(themeVoorKeuze({ ...b, weergave: 'systeem' }, 'unspecified').name).toBe('navy');
  });

  it('laat een handmatige keuze het systeem overrulen, beide kanten op', () => {
    expect(themeVoorKeuze({ ...b, weergave: 'donker' }, 'light').dark).toBe(true);
    expect(themeVoorKeuze({ ...b, weergave: 'licht' }, 'dark').dark).toBe(false);
  });

  it('zonder keuze geldt B, donker, ruim en emoji aan', () => {
    const t = themeVoorKeuze(STANDAARD_THEMAKEUZE, 'light');
    expect(t.uiterlijk).toBe('B');
    expect(t.dark).toBe(true);
    expect(t.afstand).toEqual(afstand);
    expect(t.emoji).toBe(true);
  });
});

describe('elke keuze levert een bestaand palet (QS8-731, criterium 8)', () => {
  const stijlen = ['a', 'b', 'c'] as const;
  const varianten = ['geen', 'baai', 'avondgloed', 'bosrand', 'pruim', 'koraal'] as const;
  const weergaven = ['donker', 'licht', 'systeem'] as const;

  it('stijl x variant x weergave x dichtheid: palet, verloop en afstand kloppen', () => {
    const alle = stijlen.flatMap((stijl) =>
      varianten.flatMap((kleurvariant) =>
        weergaven.flatMap((weergave) =>
          (['ruim', 'compact'] as const).map((dichtheid) => ({ stijl, kleurvariant, weergave, dichtheid, emoji: true })),
        ),
      ),
    );
    expect(alle).toHaveLength(3 * 6 * 3 * 2);
    for (const keuze of alle) {
      const th = themeVoorKeuze(keuze, 'light');
      const verwacht = UITERLIJKEN[th.uiterlijk][th.dark ? 'donker' : 'licht'];
      expect(th.colors).toBe(verwacht.colors);
      expect(th.verloop === null).toBe(keuze.stijl !== 'c');
      expect(th.afstand).toEqual(afstandVoor(keuze.dichtheid));
    }
  });

  it('elke variant die de module kent wijst op een uiterlijk C-<variant>, en andersom', () => {
    const uitC = UITERLIJK_IDS.filter((id) => id.startsWith('C-')).map((id) => id.slice(2));
    expect([...uitC].sort()).toEqual(varianten.filter((v) => v !== 'geen').sort());
  });

  it('stijl C met een variant is precies dat uiterlijk', () => {
    for (const v of varianten.filter((x) => x !== 'geen')) expect(uiterlijkIdVoor('c', v)).toBe(`C-${v}`);
  });

  it('A en B kennen geen variant en negeren hem', () => {
    expect(uiterlijkIdVoor('a', 'pruim')).toBe('A');
    expect(uiterlijkIdVoor('b', 'koraal')).toBe('B');
    expect(uiterlijkIdVoor('c', 'geen')).toBe('C-baai');
  });

  it('compact is overal kleiner dan ruim en zakt nergens onder 3', () => {
    const ruim = afstandVoor('ruim');
    const compact = afstandVoor('compact');
    for (const k of Object.keys(ruim) as (keyof typeof ruim)[]) {
      expect(compact[k]).toBeLessThanOrEqual(ruim[k]);
      expect(compact[k]).toBeGreaterThanOrEqual(3);
    }
    expect(compact.xl).toBeLessThan(ruim.xl);
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
    ['navy (donker)', navyTheme],
    ['navy-licht', navyLightTheme],
  ] as const;

  // ⚠️ Toetst wat `Button` rendert: `knop` en `knopTekst` uit het palet (QS8-723).
  it.each(gevallen)('%s: label op de primaire knop haalt AA', (_naam, theme) => {
    expect(contrastRatio(theme.colors.knopTekst, theme.colors.knop)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
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
