import { afterEach, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `schemas` en niet uit de barrel van de module. De barrel
//    trekt react-native mee en die parseert niet onder vitest; bovendien is deze
//    test geen module-communicatie maar een vergelijking van twee lijsten.
import { CATEGORIEEN } from '@/modules/goals/schemas';

import { STANDAARDTAAL, zetTaal } from '../i18n';

import {
  noemtTegenvaller,
  TIP_CATEGORIEEN,
  TIPS_PER_CATEGORIE,
  tipVoorWeek,
  weektip,
  ZEEF_IJKING,
} from './tips';

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
    // ⚠️ Uit `TEGENVALLER_WOORDEN` en niet meer als losse regex hier. Sinds
    //    QS8-137 is diezelfde lijst een échte zeef in de database
    //    (`tegenvaller_woorden()`, migratie 0103), en twee handgeschreven
    //    kopieën van dezelfde regel lopen uit elkaar zodra niemand ze
    //    vergelijkt.

    const weken = Array.from({ length: TIPS_PER_CATEGORIE * 3 }, (_, i) =>
      `2026-01-${String(i + 1).padStart(2, '0')}`,
    );

    for (const taal of ['nl', 'en'] as const) {
      zetTaal(taal);
      for (const categorie of TIP_CATEGORIEEN) {
        for (const week of weken) {
          expect(
            noemtTegenvaller(weektip(categorie, week)),
            `${categorie}/${taal}/${week}: ${weektip(categorie, week)}`,
          ).toBe(false);
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

/**
 * De zeef op de gegenereerde tip — QS8-137.
 *
 * ⚠️ Dit is de TypeScript-helft. De SQL-helft staat onder test in
 *    `tests/rls/mijlpaaltip.test.ts`, met hetzelfde corpus, en die test is de
 *    naad: twee correcte zeven en het gehéél lekt zodra ze uit elkaar lopen.
 */
describe('de zeef op een gegenereerde tip', () => {
  it('weigert elke zin uit de weiger-helft van het ijkcorpus', () => {
    for (const zin of ZEEF_IJKING.weigeren) {
      expect(noemtTegenvaller(zin), zin).toBe(true);
    }
  });

  it('laat elke zin uit de doorlaat-helft met rust', () => {
    // ⚠️ Deze helft is even belangrijk als de andere: een zeef die alles
    //    weigert, laat de feature stil doodbloeden en niemand die dat merkt.
    for (const zin of ZEEF_IJKING.doorlaten) {
      expect(noemtTegenvaller(zin), zin).toBe(false);
    }
  });
});

describe('tipVoorWeek', () => {
  const vast = () => weektip('other', '2026-08-24');

  const goed = {
    body: 'Begin met het stuk dat het meeste uitzoekwerk vraagt; de rest volgt sneller.',
    locale: 'nl',
  };

  it('toont de gegenereerde tip als alles klopt', () => {
    zetTaal('nl');
    expect(
      tipVoorWeek({ gegenereerd: goed, taal: 'nl', categorie: 'other', cycleStart: '2026-08-24' }),
    ).toBe(goed.body);
  });

  /**
   * ⚠️ **Vier routes terug naar de vaste set, elk apart.** Dat is
   *    acceptatiecriterium 2 van QS8-137, en het is de reden dat de gefaseerde
   *    volgorde uit besluit A48 klopt: wie geen mijlpaal heeft krijgt bij
   *    variant 2 alleen niets, en dat is élke nieuwe gebruiker in zijn eerste
   *    week.
   */
  it('valt terug op de vaste set zonder gegenereerde tip', () => {
    zetTaal('nl');
    expect(
      tipVoorWeek({ gegenereerd: null, taal: 'nl', categorie: 'other', cycleStart: '2026-08-24' }),
    ).toBe(vast());
  });

  it('valt terug als de tip in een andere taal bedacht is', () => {
    zetTaal('nl');
    expect(
      tipVoorWeek({
        gegenereerd: { ...goed, locale: 'en' },
        taal: 'nl',
        categorie: 'other',
        cycleStart: '2026-08-24',
      }),
    ).toBe(vast());
  });

  it('valt terug als de tip alsnog een tegenvaller noemt', () => {
    zetTaal('nl');
    expect(
      tipVoorWeek({
        gegenereerd: { body: 'Je bent achter op schema, pak het groter aan.', locale: 'nl' },
        taal: 'nl',
        categorie: 'other',
        cycleStart: '2026-08-24',
      }),
    ).toBe(vast());
  });

  it('valt terug bij een tip buiten de lengtegrenzen van de database', () => {
    zetTaal('nl');
    for (const body of ['Kort.', 'x'.repeat(301)]) {
      expect(
        tipVoorWeek({
          gegenereerd: { body, locale: 'nl' },
          taal: 'nl',
          categorie: 'other',
          cycleStart: '2026-08-24',
        }),
        body.slice(0, 20),
      ).toBe(vast());
    }
  });
});
