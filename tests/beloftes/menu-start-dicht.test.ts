import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import {
  abonneerMenu,
  leesMenuOpen,
  menuBijNavigatie,
  wisselMenu,
} from '../../src/shared/ui/menustand';

/**
 * Het menu op een telefoon begint na elke navigatie dicht — QS8-795.
 *
 * ⚠️ **De belofte is een eigenschap van de volgorde**, niet van één stand: een
 *    tabblad dat al eerder open stond mocht die stand niet meer terugkrijgen. De
 *    test speelt de volgorde van de gebruiker na: open, naar Groep, open, naar
 *    Doelen. `navigeer()` is wat de `Taakbalk` bij een padwissel doet.
 *
 * IJKING — met de hand, 23-11-2026, één mutatie per grendel:
 *   A  `menuBijNavigatie` zet niets dicht            -> rood: 'echte volgorde' en 'elke navigatie'
 *   B  `Taakbalk` zonder `useEffect(... [pad])`       -> rood: 'het component sluit bij een padwissel'
 *   C  `Taakbalk` terug naar `useState(...)` per balk -> rood: 'het component leest de gedeelde stand'
 */

const bron = (...pad: string[]): string =>
  zonderCommentaar(readFileSync(join(__dirname, '..', '..', ...pad), 'utf8'));

function navigeer(): void {
  menuBijNavigatie();
}

beforeEach(() => navigeer());

describe('de menustand over navigaties heen', () => {
  it('echte volgorde: open -> Groep -> open -> Doelen -> Groep is steeds dicht bij aankomst', () => {
    wisselMenu(); // open op Doelen
    expect(leesMenuOpen()).toBe(true);
    navigeer(); // naar Groep
    expect(leesMenuOpen()).toBe(false);
    wisselMenu(); // open op Groep
    navigeer(); // terug naar Doelen, dat al eerder open stond
    expect(leesMenuOpen()).toBe(false);
    navigeer(); // en weer naar Groep
    expect(leesMenuOpen()).toBe(false);
  });

  it('elke navigatie begint dicht, ook na meerdere keren openen en sluiten', () => {
    for (let i = 0; i < 4; i++) {
      wisselMenu();
      navigeer();
      expect(leesMenuOpen()).toBe(false);
    }
  });

  it('een tik wisselt nog steeds open en dicht', () => {
    wisselMenu();
    expect(leesMenuOpen()).toBe(true);
    wisselMenu();
    expect(leesMenuOpen()).toBe(false);
  });

  it('meldt luisteraars bij een wijziging en niet bij een gelijke stand', () => {
    let n = 0;
    const af = abonneerMenu(() => n++);
    navigeer(); // al dicht
    expect(n).toBe(0);
    wisselMenu();
    navigeer();
    expect(n).toBe(2);
    af();
    wisselMenu();
    expect(n).toBe(2);
  });
});

describe('de naad tussen de stand en het component', () => {
  const menu = bron('src', 'shared', 'ui', 'Taakbalk.tsx');

  it('het component leest de gedeelde stand en heeft er geen eigen kopie van', () => {
    expect(menu).toMatch(/useSyncExternalStore\(abonneerMenu,\s*leesMenuOpen/);
    expect(menu).not.toMatch(/\[open,\s*setOpen\]/);
    expect(menu).toMatch(/onWissel=\{wisselMenu\}/);
  });

  it('het pad komt uit usePathname, de pagina van de hele app', () => {
    expect(menu).toMatch(/const pad = usePathname\(\)/);
  });

  it('het component sluit bij een padwissel', () => {
    expect(menu).toMatch(/useLayoutEffect\(\(\)\s*=>\s*\{\s*menuBijNavigatie\(\);\s*\},\s*\[pad\]\)/);
  });
});
