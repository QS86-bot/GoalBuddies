import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * De lege groepentab draagt de knop "Groep aanmaken", en het menu is
 * toegankelijke knoppen — QS8-705.
 *
 * ⚠️ **Wat dit wel en niet is.** Er is geen renderer in dit project; deze toetsen
 *    lezen de bron (zonder commentaar, met de gedeelde knip) en leggen de
 *    aansluiting vast. Dat de knop er in een echte browser staat en 44 punten
 *    hoog is, is met Playwright op een lokale webexport gemeten (18-11-2026) en
 *    staat niet in CI. Een test die een letterlijke zin zoekt verhuist niet mee
 *    als die zin verhuist (regel 18, vraag 4); daarom toetsen deze de
 *    *eigenschap* (rol, attribuut, maat, bestemming) en niet de opmaak.
 *
 * IJKING — met de hand, 18-11-2026, vooraf en achteraf 7 groen:
 *
 *   A  de `action` uit `empty` in `app/(tabs)/groep.tsx` halen
 *      -> rood: 'de lege staat draagt de knop naar /groep/nieuw'
 *   B  `empty.action` niet doorgeven aan `EmptyState` in `AsyncView.tsx`
 *      -> rood: 'AsyncView geeft de actie van de lege staat door'
 *   C  de knop onderaan altijd tonen (`toonAanmaken` weg)
 *      -> rood: 'de knop onderaan verdwijnt alleen als de lijst geladen is en leeg'
 *   D  `aria-current` weghalen
 *      -> rood: 'het actieve tabblad draagt aria-current'
 *   E  `role="navigation"` weghalen
 *      -> rood: 'het menu is een navigatielandmark met een label'
 *   F  `minHeight: 44` naar 30
 *      -> rood: 'elke menuknop is minstens 44 punten hoog'
 *   G  de bestemming van de knop in `empty` naar een andere pagina (`/groep/deelnemen`)
 *      -> rood: 'de lege staat draagt de knop naar /groep/nieuw' (📏 gemeten 19-11-2026;
 *         daarvoor bleef hij groen: de zoekterm liep door tot de knop in `Groepsacties`)
 */

const WORTEL = join(__dirname, '..', '..');
const bron = (...pad: string[]): string =>
  zonderCommentaar(readFileSync(join(WORTEL, ...pad), 'utf8'));

describe('de lege groepentab', () => {
  const tab = bron('app', '(tabs)', 'groep.tsx');

  it('de lege staat draagt de knop naar /groep/nieuw', () => {
    // ⚠️ Binnen het `action`-object blijven: `[\s\S]*?` liep door tot de tweede
    //    `/groep/nieuw` in `Groepsacties`, dus een knop naar een verkeerde pagina
    //    bleef groen (📏 gemeten door de code-critic).
    expect(tab).toMatch(
      /action:\s*\{[^}]*t\('groepen\.aanmaken'\)[^}]*router\.push\('\/groep\/nieuw'\)/,
    );
  });

  it('AsyncView geeft de actie van de lege staat door', () => {
    expect(bron('src', 'shared', 'ui', 'AsyncView.tsx')).toMatch(/<EmptyState[^>]*action=\{empty\.action\}/);
  });

  it('de knop onderaan verdwijnt alleen als de lijst geladen is en leeg', () => {
    // `undefined` (laden of fout) is niet gelijk aan `0`: dan blijft de knop staan.
    expect(tab).toMatch(/toonAanmaken=\{groepen\?\.length !== 0\}/);
  });
});

describe('het menu', () => {
  const menu = bron('src', 'shared', 'ui', 'Taakbalk.tsx');

  it('het menu is een navigatielandmark met een label', () => {
    expect(menu).toMatch(/role="navigation"/);
    expect(menu).toMatch(/accessibilityLabel=\{t\('tab\.navigatie'\)\}/);
  });

  it('het actieve tabblad draagt aria-current', () => {
    expect(menu).toMatch(/aria-current=\{actief \? 'page' : undefined\}/);
  });

  it('elke menuknop is minstens 44 punten hoog', () => {
    const maat = /minHeight:\s*(\d+)/.exec(menu)?.[1];
    expect(Number(maat)).toBeGreaterThanOrEqual(44);
  });

  it('elke menuknop is een link naar een bestemming van het menu', () => {
    expect(menu).toMatch(/accessibilityRole="link"/);
  });
});
