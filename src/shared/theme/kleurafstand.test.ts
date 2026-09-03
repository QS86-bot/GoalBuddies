import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { kleinsteAfstand, kleurafstand, KLEURENBLINDHEID, MIN_AFSTAND, simuleer } from './kleurafstand';
import {
  categoriekleurenNavy,
  categoriekleurenNavyLight,
  navy,
  navyLight,
  type Categoriekleuren,
  type Palette,
} from './tokens';

/**
 * Besluit A55: er passen precies drie categoriekleuren op navy.
 *
 * ⚠️ **Dit bestand is de grendel onder een zin die anders alleen in een
 *    beslisdocument staat.** "Gemeten en geen smaak" is een bewering; hier wordt
 *    hij bij elke run nagerekend. Wie een vierde kleur toevoegt of een bestaande
 *    verschuift, krijgt een rode test in plaats van een gebruiker die twee
 *    categorieën niet uit elkaar houdt.
 *
 * ⚠️ **Contrast stond al onder test, onderscheid niet.** Twee kleuren kunnen
 *    allebei ruim boven de contrastdrempel liggen en tóch op elkaar vallen bij
 *    deuteranopie. Dat is precies wat er met magenta en olijf gebeurt, en het is
 *    de reden dat `contrast.test.ts` deze vraag niet kon beantwoorden.
 */

const themas: [naam: string, palette: Palette, families: Categoriekleuren][] = [
  ['navy (donker)', navy, categoriekleurenNavy],
  ['navy-licht', navyLight, categoriekleurenNavyLight],
];

describe.each(themas)('de categoriekleuren — %s', (_naam, p, families) => {
  const kleuren = Object.values(families);

  it('zijn met z’n drieën, want vier passen er niet', () => {
    // ⚠️ Geen onderhoudspost maar de kern van A55: het aantal ís het besluit.
    //    Een vierde erbij hoort een gesprek te zijn, en dat gesprek begint hier.
    expect(kleuren).toHaveLength(3);
  });

  it('halen als UI-element de contrastdrempel op paneel en achtergrond', () => {
    for (const kleur of kleuren) {
      expect(contrastRatio(kleur, p.panel), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      expect(contrastRatio(kleur, p.bg), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
    }
  });

  /**
   * ⚠️ **De toets waar dit bestand voor bestaat.** Rood gemaakt door de olijf van
   *    het donkere thema op `#c07a3a` te zetten — een roest die het contrast
   *    ruim haalt en bij deuteranopie op de magenta valt. `contrast.test.ts`
   *    bleef daar groen bij.
   */
  it('blijven uit elkaar te houden, ook bij kleurenblindheid', () => {
    expect(kleinsteAfstand(kleuren)).toBeGreaterThanOrEqual(MIN_AFSTAND);
  });

  /**
   * ⚠️ Een categoriekleur die op een státuskleur valt, is erger dan twee
   *    categorieën die op elkaar vallen: dan leest "deze week is afgerond" als
   *    "dit doel gaat over sport". Groen, oranje, rood en goud zijn vergeven
   *    (`roles()`), en daarom is de band waarin A55 zocht zo smal.
   */
  it('vallen niet samen met een statuskleur', () => {
    for (const kleur of kleuren) {
      for (const status of [p.green, p.orange, p.red, p.accent]) {
        expect(kleurafstand(kleur, status), `${kleur} vs ${status}`).toBeGreaterThanOrEqual(
          MIN_AFSTAND,
        );
      }
    }
  });
});

/**
 * ⚠️ **De ijking van de simulatie zelf, en die hoort erbij.** Een simulatie die
 *    niets verandert, geeft altijd hetzelfde antwoord als gewoon kleurenzicht —
 *    en dan is de toets hierboven groen zonder ooit iets over kleurenblindheid
 *    gezegd te hebben. Dat is een controle die je niet kunt voeden, en die kun
 *    je dus ook niet ijken (CLAUDE.md, regel 18).
 */
describe('de simulatie doet daadwerkelijk iets', () => {
  it('verschuift rood en groen bij deuteranopie naar elkaar toe', () => {
    const rood = '#d02020';
    const groen = '#20a020';

    const voor = kleurafstand(rood, groen);
    const na = kleurafstand(simuleer(rood, 'deutan'), simuleer(groen, 'deutan'));

    expect(na).toBeLessThan(voor);
  });

  it('laat blauw en geel bij tritanopie dichter bij elkaar komen', () => {
    const blauw = '#2050d0';
    const geel = '#d0c020';

    expect(kleurafstand(simuleer(blauw, 'tritan'), simuleer(geel, 'tritan'))).toBeLessThan(
      kleurafstand(blauw, geel),
    );
  });

  it('geeft voor elke vorm een geldige kleur terug', () => {
    for (const soort of KLEURENBLINDHEID) {
      expect(simuleer('#4f97e8', soort), soort).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
