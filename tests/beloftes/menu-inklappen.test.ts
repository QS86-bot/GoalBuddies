import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { t } from '../../src/shared/i18n';
import {
  BREED_VANAF,
  kopSleutel,
  MENU_BEGINSTAND_OPEN,
  menuKlaptIn,
  TABBLADEN,
  taakbalkVorm,
  toonMenuknoppen,
} from '../../src/shared/ui/tabbladen';

/**
 * Het menu klapt op een telefoon in en blijft op een breed scherm een kolom — QS8-728 punt 2.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** op de breedte van een telefoon
 *    begint het menu als één regel; wie tikt ziet de vijf knoppen; op 900 en breder
 *    verandert er niets. De logica staat in pure functies (er is geen renderer in dit
 *    project); de naad tussen die functies en het component wordt in de bron
 *    gelezen, zodat een component dat ze niet meer gebruikt rood wordt.
 *
 * IJKING — met de hand, 20-11-2026, één mutatie per grendel:
 *   A  `MENU_BEGINSTAND_OPEN` naar `true`       -> rood: 'begint dicht'
 *   B  `toonMenuknoppen` geeft altijd `false`   -> rood: 'opent met een tik' en 'is ongewijzigd'
 *   C  `menuKlaptIn` ook voor 'zijkant'          -> rood: 'is ongewijzigd'
 *   D  `let open = MENU_BEGINSTAND_OPEN` -> `let open = true` in menustand (QS8-795: was `useState` in Taakbalk) -> rood: 'het component leest de beginstand'
 *   E  `aria-expanded` uit MenuKop               -> rood: 'de kop meldt de stand'
 */

const bron = (...pad: string[]): string =>
  zonderCommentaar(readFileSync(join(__dirname, '..', '..', ...pad), 'utf8'));

const TELEFOON = taakbalkVorm(390);
const BREED = taakbalkVorm(BREED_VANAF);

describe('het menu op een telefoon', () => {
  it('is een telefoon-vorm op 390 en een kolom op 900', () => {
    expect(TELEFOON).toBe('bovenrand');
    expect(BREED).toBe('zijkant');
  });

  it('begint dicht: één regel en geen knoppen', () => {
    expect(MENU_BEGINSTAND_OPEN).toBe(false);
    expect(toonMenuknoppen(TELEFOON, MENU_BEGINSTAND_OPEN)).toBe(false);
  });

  it('opent met een tik en sluit met nog een', () => {
    expect(toonMenuknoppen(TELEFOON, true)).toBe(true);
    expect(toonMenuknoppen(TELEFOON, false)).toBe(false);
  });
});

describe('het menu op een breed scherm', () => {
  it('is ongewijzigd: geen kop, altijd alle knoppen, welke stand er ook is', () => {
    expect(menuKlaptIn(BREED)).toBe(false);
    expect(toonMenuknoppen(BREED, false)).toBe(true);
    expect(toonMenuknoppen(BREED, true)).toBe(true);
  });
});

describe('de ingeklapte kop', () => {
  it('toont de huidige pagina, ook in de dichte stand', () => {
    for (const tab of TABBLADEN) expect(kopSleutel(tab.pad)).toBe(tab.sleutel);
  });

  it('valt terug op de naam van het menu op een scherm zonder tabblad', () => {
    expect(kopSleutel(null)).toBe('tab.navigatie');
    expect(t(kopSleutel(null)).length).toBeGreaterThan(0);
  });
});

describe('de naad tussen de functies en het component', () => {
  const menu = bron('src', 'shared', 'ui', 'Taakbalk.tsx');

  it('het component leest de beginstand uit de export, via de gedeelde stand (QS8-795)', () => {
    expect(menu).toMatch(/\(\)\s*=>\s*MENU_BEGINSTAND_OPEN\)/);
    expect(bron('src', 'shared', 'ui', 'menustand.ts')).toMatch(/let open = MENU_BEGINSTAND_OPEN/);
  });

  it('het component beslist met menuKlaptIn en toonMenuknoppen, niet met een eigen vergelijking', () => {
    expect(menu).toMatch(/menuKlaptIn\(vorm\)/);
    expect(menu).toMatch(/toonMenuknoppen\(vorm,\s*open\)/);
  });

  it('de kop meldt de stand aan schermlezer en browser', () => {
    expect(menu).toMatch(/accessibilityState=\{\{\s*expanded:\s*open\s*\}\}/);
    expect(menu).toMatch(/aria-expanded=\{open\}/);
    expect(menu).toMatch(/accessibilityRole="button"/);
  });
});
