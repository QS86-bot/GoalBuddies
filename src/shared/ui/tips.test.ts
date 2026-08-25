import { afterEach, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `schemas` en niet uit de barrel van de module. De barrel
//    trekt react-native mee en die parseert niet onder vitest; bovendien is deze
//    test geen module-communicatie maar een vergelijking van twee lijsten.
import { CATEGORIEEN } from '@/modules/goals/schemas';

import { STANDAARDTAAL, zetTaal } from '../i18n';

import { TIP_CATEGORIEEN, TIPS_PER_CATEGORIE, weektip } from './tips';

/**
 * Besluit A48, variant 3 (QS8-110) — de weektip.
 *
 * ⚠️ De belangrijkste test is de laatste: geen enkele regel mag een tegenvaller
 *    noemen. Domeinregel 7 gaat over wat de groep ziet, maar de toon geldt ook
 *    voor tekst die alleen jij leest — een app die je bij een gehááld weekdoel
 *    vertelt dat je achterloopt, is de app die deze regel had moeten voorkomen.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de weektip', () => {
  it('geeft voor elke categorie een echte zin', () => {
    for (const categorie of TIP_CATEGORIEEN) {
      const tip = weektip(categorie, '2026-08-24');

      // Geen kale catalogussleutel: `t()` valt daar bij een ontbrekende sleutel
      // op terug, en dat is precies hoe `chain_milestone` een halve dag lang
      // "systeembericht.chain_milestone" op het scherm zette.
      expect(tip, categorie).not.toMatch(/^weektip\./);
      expect(tip.length, categorie).toBeGreaterThan(20);
    }
  });

  it('geeft dezelfde week altijd dezelfde regel', () => {
    // ⚠️ Anders flikkert de tekst tijdens de animatie van het feestmoment, en
    //    spreken twee schermen die hetzelfde moment tonen elkaar tegen.
    const eerste = weektip('business', '2026-08-24');

    for (let i = 0; i < 10; i += 1) {
      expect(weektip('business', '2026-08-24')).toBe(eerste);
    }
  });

  it('rouleert over de weken heen', () => {
    // Vijf opeenvolgende maandagen horen niet vijf keer hetzelfde te geven.
    const weken = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];
    const gezien = new Set(weken.map((week) => weektip('other', week)));

    expect(gezien.size).toBeGreaterThan(1);
  });

  it('is per categorie anders', () => {
    const zelfdeWeek = TIP_CATEGORIEEN.map((c) => weektip(c, '2026-08-24'));

    expect(new Set(zelfdeWeek).size).toBe(TIP_CATEGORIEEN.length);
  });

  it('bestaat in beide talen', () => {
    for (const categorie of TIP_CATEGORIEEN) {
      for (const taal of ['nl', 'en'] as const) {
        zetTaal(taal);
        expect(weektip(categorie, '2026-08-24'), `${categorie}/${taal}`).not.toMatch(/^weektip\./);
      }
    }
  });

  it('noemt in geen enkele taal een tegenvaller', () => {
    // ⚠️ Elke regel van elke categorie, in beide talen — niet alleen de regel die
    //    deze week toevallig gekozen wordt. Anders bewaakt deze test één op de
    //    vijftien zinnen.
    const verboden =
      /achter|gemist|mislukt|helaas|jammer|volgende keer beter|niet gehaald|behind|missed|failed|unfortunately|better luck/i;

    const weken = Array.from({ length: TIPS_PER_CATEGORIE * 3 }, (_, i) =>
      `2026-01-${String(i + 1).padStart(2, '0')}`,
    );

    for (const taal of ['nl', 'en'] as const) {
      zetTaal(taal);
      for (const categorie of TIP_CATEGORIEEN) {
        for (const week of weken) {
          expect(weektip(categorie, week), `${categorie}/${taal}/${week}`).not.toMatch(verboden);
        }
      }
    }
  });

  /**
   * De naad tussen twee lijsten die elkaar spiegelen — onwrikbare regel 18.
   *
   * ⚠️ `TIP_CATEGORIEEN` is een kopie van `CATEGORIEEN`, want `shared` mag niet
   *    van een module afhangen. Elke andere test hierboven loopt over de kópie,
   *    dus die blijven allemaal groen als er een categorie bijkomt waar geen
   *    regels voor bestaan — precies de vorm "elk onderdeel klopt en het geheel
   *    lekt". Deze test is de enige die beide kanten ziet.
   */
  it('heeft regels voor elke categorie die een doel kan hebben', () => {
    expect([...TIP_CATEGORIEEN].sort()).toEqual([...CATEGORIEEN].sort());
  });

  /**
   * ⚠️ En dit is wat er gebeurt als die naad tóch scheurt: er staat een regel,
   *    geen sleutel. `t()` geeft bij een ontbrekende sleutel de sleutel zelf
   *    terug, en dat is deze maand al twee keer als tekst op het scherm beland.
   */
  it('valt bij een onbekende categorie terug op een echte zin', () => {
    const tip = weektip('een-categorie-die-niet-bestaat', '2026-08-24');

    expect(tip).not.toMatch(/^weektip\./);
    expect(tip).toBe(weektip('other', '2026-08-24'));
  });
});
