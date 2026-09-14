import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

import {
  held,
  HELDEN,
  HELDSLEUTELS,
  heldTekstSleutel,
  heldVoorTrigger,
  isHeldsleutel,
  isTrigger,
  TRIGGERS,
} from './helden';

/**
 * QS8-469.
 *
 * ⚠️ **De eerste twee toetsen gaan over het gehéél en niet over een held.** Dat
 *    elke held een trigger heeft, is een eigenschap van een rij en makkelijk te
 *    toetsen; dat élke trigger er precies één heeft, is een eigenschap van de
 *    tabel en precies wat de prioriteitsregel van QS8-475 aanneemt zonder het te
 *    controleren. Regel 18 vraag 1: daar knopen twee correcte onderdelen aan
 *    elkaar.
 */

describe('het rooster is compleet en eenduidig', () => {
  it('heeft voor elke trigger precies één held', () => {
    for (const trigger of TRIGGERS) {
      const passend = HELDEN.filter((h) => h.trigger === trigger);
      expect(passend, trigger).toHaveLength(1);
    }
  });

  it('heeft evenveel helden als sleutels, zonder duplicaat', () => {
    expect(HELDEN).toHaveLength(HELDSLEUTELS.length);
    expect(new Set(HELDEN.map((h) => h.sleutel)).size).toBe(HELDEN.length);
    expect(new Set(HELDEN.map((h) => h.trigger)).size).toBe(HELDEN.length);
  });

  it('kent elke sleutel uit HELDSLEUTELS', () => {
    for (const sleutel of HELDSLEUTELS) {
      expect(held(sleutel).sleutel).toBe(sleutel);
    }
  });
});

describe('opzoeken faalt dicht', () => {
  it('werpt bij een onbekende sleutel', () => {
    // ⚠️ Een stille `undefined` wordt in QS8-475 een melding zonder stem, en die
    //    komt pas bij een gebruiker boven. Zelfde keuze als `sleutelzetters()`.
    expect(() => held('rune' as never)).toThrow(/onbekende heldsleutel/);
  });

  it('werpt bij een onbekende trigger', () => {
    expect(() => heldVoorTrigger('weekafsluiting' as never)).toThrow(/onbekende trigger/);
  });

  it('herkent alleen echte sleutels en triggers', () => {
    expect(isHeldsleutel('strix')).toBe(true);
    expect(isHeldsleutel('Strix')).toBe(false);
    expect(isHeldsleutel(null)).toBe(false);
    expect(isTrigger('misser')).toBe(true);
    expect(isTrigger('gemist')).toBe(false);
  });
});

/**
 * ⚠️ **Dit is de naad die er echt toe doet.** De sleutels worden afgeleid uit de
 *    heldsleutel (`held.${sleutel}.naam`), dus TypeScript ziet niet of de
 *    catalogus ze kent — `t()` valt bij een onbekende sleutel terug op de
 *    sleutel zelf, en dan staat er letterlijk de sleutel zelf op het scherm.
 *    Dat is precies de fout die de groepschat zes uur lang toonde en waar de
 *    kop van `nl.ts` voor waarschuwt.
 */
describe('elke afgeleide sleutel bestaat in beide catalogi', () => {
  const catalogi = [
    ['nl', nl],
    ['en', en],
  ] as const;

  it('heeft naam, ondertitel en persoonlijkheid voor elke held', () => {
    for (const [taal, catalogus] of catalogi) {
      for (const sleutel of HELDSLEUTELS) {
        const afgeleid = [
          heldTekstSleutel(sleutel, 'naam'),
          heldTekstSleutel(sleutel, 'ondertitel'),
          heldTekstSleutel(sleutel, 'persoonlijkheid'),
        ];
        for (const s of afgeleid) {
          expect(Object.keys(catalogus), `${taal}:${s}`).toContain(s);
        }
      }
    }
  });

  it('houdt de naam gelijk in elke taal', () => {
    // ⚠️ Besluit 1: Strix blijft Strix. Een vertaalde personagenaam maakt er zes
    //    andere personages van, en dat valt pas op als iemand de app in het
    //    Engels opent.
    for (const sleutel of HELDSLEUTELS) {
      const s = heldTekstSleutel(sleutel, 'naam');
      expect(en[s], s).toBe(nl[s]);
    }
  });

  it('vertaalt de ondertitel wél', () => {
    for (const sleutel of HELDSLEUTELS) {
      const s = heldTekstSleutel(sleutel, 'ondertitel');
      expect(en[s], s).not.toBe(nl[s]);
    }
  });
});
