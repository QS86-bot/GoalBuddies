import { describe, expect, it } from 'vitest';

import { invoerfout } from './index';

/**
 * De keuze die negenentwintig keer los genomen werd.
 *
 * ⚠️ De belofte is niet "hij pakt de eerste" maar **"er komt altijd een zin uit
 *    die je aan een mens kunt tonen"**. Dat is wat er misging als iemand ergens
 *    `?? ''` schreef: dan toont het scherm een lege foutbalk, en dan weet de
 *    gebruiker dat er iets mis is maar niet wát. Vandaar dat de terugval geen
 *    standaardwaarde heeft maar verplicht is.
 */
describe('invoerfout', () => {
  it('geeft de eerste melding als die er is', () => {
    // Zod geeft één issue per veld; het formulier springt naar het eerste
    // kapotte veld, dus de eerste melding hoort bij de plek waar de cursor staat.
    const uit = invoerfout(
      { issues: [{ message: 'Kies een dag.' }, { message: 'Vul een titel in.' }] },
      'terugval',
    );

    expect(uit).toBe('Kies een dag.');
  });

  it('valt terug als er geen enkel issue is', () => {
    // Kan gebeuren bij een `refine` die faalt zonder melding, of bij een fout
    // die van een andere laag komt.
    expect(invoerfout({ issues: [] }, 'Controleer je invoer.')).toBe('Controleer je invoer.');
  });

  it('geeft nooit een lege zin terug als er een terugval is', () => {
    // ⚠️ De eigenlijke belofte. Een lege foutbalk is erger dan een algemene:
    //    de gebruiker ziet dat er iets mis is en niet wát.
    for (const issues of [[], [{ message: '' }]]) {
      const uit = invoerfout({ issues }, 'Controleer je invoer.');
      expect(uit.length, JSON.stringify(issues)).toBeGreaterThan(0);
    }
  });
});
