import { describe, expect, it } from 'vitest';

import { CATEGORIE_GROEPEN, CATEGORIEEN } from '@/modules/goals/schemas';

// ⚠️ Uit het bronbestand en niet uit de barrel: `shared/theme/index.ts` trekt
//    `ThemeProvider` mee en dus react-native, en dat is Flow-syntax die vitest
//    niet leest. Dezelfde reden als bij `doorloop.test.ts`.
import { categoriekleurenNavy } from '../theme/tokens';

import { CATEGORIEMERKEN, categoriemerk } from './categoriemerk';

/**
 * De naad tussen drie lijsten die hetzelfde beweren — onwrikbare regel 18.
 *
 * ⚠️ **Er staan nu drie indelingen van dezelfde vijftien woorden in deze
 *    codebase:** `CATEGORIEEN` met `CATEGORIE_GROEPEN` in `modules/goals`,
 *    `TIPSET_PER_CATEGORIE` in `tips.ts`, en `CATEGORIEMERKEN` hier. Elk met een
 *    goede reden — `shared` mag niet van een module afhangen — en elk met
 *    dezelfde prijs: ze lopen uit elkaar zodra niemand ze vergelijkt.
 *
 *    Dat is letterlijk wat er met 0032 en 0034 gebeurde. Deze tests zijn de
 *    enige plek waar de kanten elkaar zien.
 */

describe('het categoriemerk', () => {
  it('heeft een pictogram voor elk gebied dat een doel kan hebben', () => {
    expect(Object.keys(CATEGORIEMERKEN).sort()).toEqual([...CATEGORIEEN].sort());
  });

  /**
   * ⚠️ **De belangrijkste toets hier.** Zou de keuzelijst anders groeperen dan de
   *    kleur, dan ziet een gebruiker twee indelingen van dezelfde vijftien
   *    woorden — en dan codeert de kleur niet de familie maar iets anders.
   */
  it('kent dezelfde families als de keuzelijst', () => {
    for (const groep of CATEGORIE_GROEPEN) {
      for (const lid of groep.leden) {
        const verwacht = groep.sleutel === 'rest' ? null : groep.sleutel;

        expect(categoriemerk(lid).familie, lid).toBe(verwacht);
      }
    }
  });

  it('gebruikt alleen families die een kleur hebben', () => {
    const kleuren = Object.keys(categoriekleurenNavy);

    for (const [categorie, merk] of Object.entries(CATEGORIEMERKEN)) {
      if (merk.familie === null) continue;
      expect(kleuren, categorie).toContain(merk.familie);
    }
  });

  /**
   * ⚠️ Anders is het pictogram geen code maar versiering: twee gebieden met
   *    hetzelfde plaatje in dezelfde kleur zijn niet uit elkaar te houden, en
   *    dat is precies wat de kleur al niet kon.
   */
  it('geeft geen twee gebieden hetzelfde pictogram', () => {
    const iconen = Object.values(CATEGORIEMERKEN).map((m) => m.icoon);

    expect(new Set(iconen).size).toBe(iconen.length);
  });

  it('valt bij een onbekend gebied terug op een neutraal merk', () => {
    // De database kan een waarde bevatten die deze build niet kent; een lege
    // plek in een rij waar de andere rijen wél een pictogram hebben, leest als
    // een defect.
    const merk = categoriemerk('een-gebied-uit-de-toekomst');

    expect(merk.familie).toBeNull();
    expect(merk.icoon.length).toBeGreaterThan(0);
  });
});
