import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import {
  BREED_VANAF,
  MAX_INHOUDSBREEDTE,
  MENU_KOLOMBREEDTE,
  taakbalkVorm,
} from '../../src/shared/ui/tabbladen';
import { afstand } from '../../src/shared/theme/tokens';

/**
 * De maten van het menu komen uit één bron — QS8-728.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** op het smalste scherm waar
 *    het menu een kolom is, past kolom + inhoud + marges nog. Een test met losse
 *    getallen is blind voor een stijlwijziging; deze rekent met de exports die de
 *    stijl zelf gebruikt.
 *
 * IJKING — met de hand, 20-11-2026:
 *   A  `MENU_KOLOMBREEDTE` naar 400 -> rood: 'past de kolom naast de inhoud'
 *   B  `maxWidth: MAX_INHOUDSBREEDTE` in Screen.tsx terug naar `620` -> rood: 'Screen leest'
 *   C  `width: MENU_KOLOMBREEDTE` in Taakbalk.tsx terug naar `220` -> rood: 'Taakbalk leest'
 *   D  een `#`-kleur in Taakbalk.tsx -> rood: 'geen kleurliteraal'
 */

const bron = (...pad: string[]): string =>
  zonderCommentaar(readFileSync(join(__dirname, '..', '..', ...pad), 'utf8'));

describe('de maten van het menu', () => {
  it('past de kolom naast de inhoud op het smalste brede scherm', () => {
    const marges = 2 * afstand.m;
    expect(MENU_KOLOMBREEDTE + MAX_INHOUDSBREEDTE + marges).toBeLessThanOrEqual(
      BREED_VANAF,
    );
  });

  it('kiest taakbalkVorm de kolom precies op BREED_VANAF', () => {
    expect(taakbalkVorm(BREED_VANAF)).toBe('zijkant');
    expect(taakbalkVorm(BREED_VANAF - 1)).toBe('bovenrand');
  });

  it('Screen leest de maximale inhoudsbreedte uit de export', () => {
    expect(bron('src', 'shared', 'ui', 'Screen.tsx')).toMatch(
      /maxWidth:\s*MAX_INHOUDSBREEDTE\b/,
    );
  });

  it('Taakbalk leest de kolombreedte uit de export', () => {
    expect(bron('src', 'shared', 'ui', 'Taakbalk.tsx')).toMatch(
      /width:\s*MENU_KOLOMBREEDTE\b/,
    );
  });

  it('Taakbalk bevat geen kleurliteraal', () => {
    const menu = bron('src', 'shared', 'ui', 'Taakbalk.tsx');
    expect(menu).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(menu).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});
