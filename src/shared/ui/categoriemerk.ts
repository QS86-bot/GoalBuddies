/**
 * Welk pictogram en welke familie bij welk gebied horen — QS8-255, besluit A55.
 *
 * ⚠️ **De ontwerpregel in één tabel: de kleur codeert de familie, het pictogram
 *    codeert het gebied.** Er passen precies drie kleuren op navy (zie
 *    `kleurafstand.test.ts`), en er zijn twaalf gebieden. Twaalf kleuren
 *    bestaan niet; twaalf pictogrammen wel. Zo doet Habit Huddle het ook.
 *
 * ⚠️ **Een kopie van `CATEGORIEEN` uit `modules/goals`, en met opzet geen
 *    import.** `shared` mag niet van een module afhangen. De prijs is een naad,
 *    en die staat onder test: `categoriemerk.test.ts` legt de sleutels hier
 *    naast `CATEGORIEEN` en wordt rood zodra er een gebied bijkomt dat geen
 *    pictogram heeft. Zelfde vorm en zelfde reden als `TIPSET_PER_CATEGORIE`.
 *
 * ⚠️ **De familie hier moet gelijk zijn aan `CATEGORIE_GROEPEN`**, en ook dát
 *    staat onder test. Twee indelingen van dezelfde twaalf woorden is precies
 *    de fout die dit bestand anders introduceert: de keuzelijst groepeert dan
 *    anders dan de kleur.
 *
 * ⚠️ **Sinds besluit A58 heeft élk gebied een familie.** Er waren vier groepen
 *    waarvan de vierde — `business`, `study`, `other` — geen kleur had, en dat
 *    was geen ontwerp maar een restje: wat er overbleef nadat A55 drie kleuren
 *    had gevonden. Nu zijn het drie families van vier.
 *
 * ⚠️ **`familie` blijft toch `null` kunnen zijn, en dat is geen restant.**
 *    `Doel.category` is in de gegenereerde typen een `string`: de database kan
 *    een waarde bevatten die deze build niet kent, en dan is "geen familie" het
 *    eerlijke antwoord. Een terugval op een wíllekeurige familie zou zo'n doel in
 *    de verkeerde kleur zetten.

 *    ⚠️ Deze redenering stond ook in `categorieGroep()` in `modules/goals`, een
 *    derde plek die de indeling categorie-naar-familie kende. Die functie is bij
 *    QS8-301 weggehaald omdat geen enkel scherm hem aanriep; `categoriemerk()`
 *    hieronder en `CATEGORIE_GROEPEN` zijn wat overblijft.
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
  fitness: { icoon: 'run', familie: 'gezondheid' },
  nutrition: { icoon: 'food-apple', familie: 'gezondheid' },
  self_care: { icoon: 'sleep', familie: 'gezondheid' },
  mindfulness: { icoon: 'meditation', familie: 'gezondheid' },

  creativity: { icoon: 'palette', familie: 'softskills' },
  productivity: { icoon: 'check-circle-outline', familie: 'softskills' },
  connection: { icoon: 'account-group', familie: 'softskills' },
  other: { icoon: 'dots-horizontal', familie: 'softskills' },

  business: { icoon: 'briefcase-outline', familie: 'ambitie' },
  study: { icoon: 'book-open-variant', familie: 'ambitie' },
  building: { icoon: 'hammer-wrench', familie: 'ambitie' },
  skills: { icoon: 'tools', familie: 'ambitie' },
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
