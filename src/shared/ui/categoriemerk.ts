/**
 * Welk pictogram en welke familie bij welk gebied horen — QS8-255, besluit A55.
 *
 * ⚠️ **De ontwerpregel in één tabel: de kleur codeert de familie, het pictogram
 *    codeert het gebied.** Er passen precies drie kleuren op navy (zie
 *    `kleurafstand.test.ts`), en er zijn vijftien gebieden. Vijftien kleuren
 *    bestaan niet; vijftien pictogrammen wel. Zo doet Habit Huddle het ook.
 *
 * ⚠️ **Een kopie van `CATEGORIEEN` uit `modules/goals`, en met opzet geen
 *    import.** `shared` mag niet van een module afhangen. De prijs is een naad,
 *    en die staat onder test: `categoriemerk.test.ts` legt de sleutels hier
 *    naast `CATEGORIEEN` en wordt rood zodra er een gebied bijkomt dat geen
 *    pictogram heeft. Zelfde vorm en zelfde reden als `TIPSET_PER_CATEGORIE`.
 *
 * ⚠️ **De familie hier moet gelijk zijn aan `CATEGORIE_GROEPEN`**, en ook dát
 *    staat onder test. Twee indelingen van dezelfde vijftien woorden is precies
 *    de fout die dit bestand anders introduceert: de keuzelijst groepeert dan
 *    anders dan de kleur.
 *
 * ⚠️ **`business`, `study` en `other` hebben géén familie en dus geen kleur.**
 *    A55 meet drie kleuren voor twaalf gebieden en zegt over deze drie niets;
 *    een vierde kleur erbij verzinnen is precies wat `tokens.ts` verbiedt. Ze
 *    krijgen wél een pictogram — dat is de helft die er wel is.
 */

import type { Categoriekleuren } from '../theme/tokens';

export type Familie = keyof Categoriekleuren;

export interface Categoriemerk {
  /** Naam van een glyph uit MaterialCommunityIcons. */
  readonly icoon: string;
  /** De kleurfamilie, of `null` voor de drie die er geen hebben. */
  readonly familie: Familie | null;
}

export const CATEGORIEMERKEN: Readonly<Record<string, Categoriemerk>> = {
  fitness: { icoon: 'run', familie: 'lichaam' },
  nutrition: { icoon: 'food-apple', familie: 'lichaam' },
  self_care: { icoon: 'sleep', familie: 'lichaam' },
  mindfulness: { icoon: 'meditation', familie: 'lichaam' },

  connection: { icoon: 'account-group', familie: 'mensen' },
  helping: { icoon: 'hand-heart', familie: 'mensen' },
  creativity: { icoon: 'palette', familie: 'mensen' },

  productivity: { icoon: 'check-circle-outline', familie: 'werk' },
  organization: { icoon: 'folder-outline', familie: 'werk' },
  learning: { icoon: 'school-outline', familie: 'werk' },
  skills: { icoon: 'tools', familie: 'werk' },
  resilience: { icoon: 'shield-check-outline', familie: 'werk' },

  business: { icoon: 'briefcase-outline', familie: null },
  study: { icoon: 'book-open-variant', familie: null },
  other: { icoon: 'dots-horizontal', familie: null },
};

/**
 * Het merk van dit gebied, met een terugval op dat van `other`.
 *
 * ⚠️ Die terugval bestaat om dezelfde reden als bij `tipSetVoor()`:
 *    `Doel.category` is in de gegenereerde typen een `string`, dus de database
 *    kan er iets in hebben staan wat deze build niet kent. Een ontbrekend
 *    pictogram zou anders een lege plek in een rij zijn waar de andere rijen er
 *    wél een hebben, en dat leest als een defect.
 */
export function categoriemerk(categorie: string): Categoriemerk {
  return CATEGORIEMERKEN[categorie] ?? { icoon: 'dots-horizontal', familie: null };
}
