import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { groepInhoud } from '../../src/schermen/groep/inhoud';
import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';

/**
 * De rij "Op deze pagina" en de kop "Jouw groep" — QS8-778 (besluit Quinten 20-11-2026, optie A).
 *
 * ⚠️ **De belofte is dat de rij niets noemt wat er niet staat, en niets weglaat wat er wel staat.** Een rij die in
 *    een beschermde groep het klassement noemt, belooft een onderdeel dat een lid daar nooit krijgt (A41, A54:
 *    `groep_klassement()` en `groep_helden()` geven er nul rijen). De rij, de kop en de onderdelen staan in één
 *    scherm en in één helper; deze test legt ze naast elkaar.
 *
 * IJKING — met de hand, 20-11-2026:
 *   A  `...(stand.open ? ... : [])` in `inhoud.ts` altijd laten tonen -> rood: 'beschermd'
 *   B  `open: s.groep.zichtbaarheid === 'open'` in de pagina op `true` -> rood: 'de pagina geeft open door'
 *   C  `'groepdetail.gesprek'` uit de helper halen -> rood: 'elk genoemd onderdeel staat op de pagina' (volledigheid)
 *   D  `groepdetail.titel_naam` uit de kop halen -> rood: 'kop'
 */
const pagina = zonderCommentaar(readFileSync(join(__dirname, '../../app/groep/[id].tsx'), 'utf8'));

describe('Groepspagina: de rij noemt wat er in deze groep staat', () => {
  it('beschermd: geen klassement en geen helden', () => {
    const rij = groepInhoud({ open: false, kanUitnodigen: true });
    expect(rij).not.toContain('klassement.kop');
    expect(rij).not.toContain('groepshelden.kop');
    expect(rij).toEqual(['ketting.kop', 'groepscherm.wie_meedoen', 'groepdetail.gesprek', 'groepdetail.inhoud_uitnodigen']);
  });

  it('open: klassement en helden staan er, in paginavolgorde', () => {
    expect(groepInhoud({ open: true, kanUitnodigen: true })).toEqual([
      'ketting.kop',
      'groepscherm.wie_meedoen',
      'klassement.kop',
      'groepshelden.kop',
      'groepdetail.gesprek',
      'groepdetail.inhoud_uitnodigen',
    ]);
  });

  it('zonder deelbare uitnodiging staat Uitnodigen er niet', () => {
    expect(groepInhoud({ open: true, kanUitnodigen: false })).not.toContain('groepdetail.inhoud_uitnodigen');
  });

  it('elk genoemd onderdeel is een kop op de pagina zelf, en elke kop heeft zijn plek in de rij', () => {
    const alle = groepInhoud({ open: true, kanUitnodigen: true });
    for (const sleutel of alle) {
      // Geen eigen kop op de pagina: Uitnodigen staat in de Ketting-kaart, en de kop van de Ketting tekent `Ketting`.
      if (sleutel === 'groepdetail.inhoud_uitnodigen' || sleutel === 'ketting.kop') continue;
      expect(pagina, sleutel).toMatch(new RegExp(`t\\('${sleutel.replace('.', '\\.')}'\\)`));
    }
    // Volledigheid: de koppen die de pagina zelf tekent staan alle in de rij.
    for (const kop of ['groepscherm.wie_meedoen', 'groepdetail.gesprek', 'klassement.kop', 'groepshelden.kop']) {
      expect(alle, kop).toContain(kop);
    }
  });

  it('de Ketting-kaart tekent zijn eigen kop met dezelfde sleutel', () => {
    const ketting = zonderCommentaar(readFileSync(join(__dirname, '../../src/shared/ui/Ketting.tsx'), 'utf8'));
    expect(ketting).toMatch(/t\('ketting\.kop'\)/);
  });

  it('de pagina geeft open en deelbaar door en niet iets vasts', () => {
    expect(pagina).toMatch(/open: s\.groep\.zichtbaarheid === 'open'/);
    expect(pagina).toMatch(/kanUitnodigen:\s*deelbaarBericht\([\s\S]*?\) !== null/);
  });

  it('kop: "Jouw groep" met de naam van de groep, en "Jouw groep" zolang hij laadt', () => {
    expect(pagina).toMatch(/t\('groepdetail\.titel_naam', \{ naam: stand\.groep\.name \}\)/);
    expect(pagina).toMatch(/: t\('groepdetail\.titel'\)/);
    expect(nl['groepdetail.titel_naam']).toContain('{naam}');
    expect(nl['groepdetail.titel']).toBe('Jouw groep');
    expect(en['groepdetail.titel']).toBe('Your group');
    expect(Object.keys(en)).toContain('groepdetail.inhoud');
  });
});
