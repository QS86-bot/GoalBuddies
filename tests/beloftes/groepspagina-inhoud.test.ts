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
 * IJKING — met de hand, 20-11-2026 (en voor het klassement 22-11-2026, A57):
 *   A  `...(stand.helden ? ... : [])` in `inhoud.ts` altijd laten tonen -> rood: 'geen helden zonder open groep'
 *   B  `helden: s.groep.zichtbaarheid === 'open'` in de pagina op `true` -> rood: 'de pagina geeft open door'
 *   F  `klassement:` in de pagina weer aan `s.groep.zichtbaarheid === 'open'` hangen -> rood: 'klassement hangt aan de lijst'
 *   C  `'groepdetail.gesprek'` uit de helper halen -> rood: 'elk genoemd onderdeel staat op de pagina' (volledigheid)
 *   D  `groepdetail.titel_naam` uit de kop halen -> rood: 'kop'
 *   E  `&& !isTeamgroep(s.groep)` bij de rij weg -> rood: 'een teamgroep is nooit open'
 */
const pagina = zonderCommentaar(readFileSync(join(__dirname, '../../app/groep/[id].tsx'), 'utf8'));

describe('Groepspagina: de rij noemt wat er in deze groep staat', () => {
  it('beschermd zonder klassement: geen klassement en geen helden', () => {
    const rij = groepInhoud({ klassement: false, helden: false, kanUitnodigen: true });
    expect(rij).not.toContain('klassement.kop');
    expect(rij).not.toContain('groepshelden.kop');
    expect(rij).toEqual(['ketting.kop', 'groepskaart.uitnodigen', 'groepscherm.wie_meedoen', 'groepdetail.gesprek']);
  });

  it('beschermd mét klassement (A57): het klassement staat er en de helden niet', () => {
    expect(groepInhoud({ klassement: true, helden: false, kanUitnodigen: true })).toEqual([
      'ketting.kop',
      'groepskaart.uitnodigen',
      'groepscherm.wie_meedoen',
      'klassement.kop',
      'groepdetail.gesprek',
    ]);
  });

  it('open zonder klassement: de helden staan er en het klassement niet', () => {
    const rij = groepInhoud({ klassement: false, helden: true, kanUitnodigen: true });
    expect(rij).toContain('groepshelden.kop');
    expect(rij).not.toContain('klassement.kop');
  });

  it('open met klassement: beide staan er, in de volgorde waarin de kaarten op de pagina staan', () => {
    expect(groepInhoud({ klassement: true, helden: true, kanUitnodigen: true })).toEqual([
      'ketting.kop',
      'groepskaart.uitnodigen',
      'groepscherm.wie_meedoen',
      'klassement.kop',
      'groepshelden.kop',
      'groepdetail.gesprek',
    ]);
  });

  it('zonder deelbare uitnodiging staat Uitnodigen er niet', () => {
    expect(groepInhoud({ klassement: true, helden: true, kanUitnodigen: false })).not.toContain('groepskaart.uitnodigen');
  });

  it('elk genoemd onderdeel is een kop op de pagina zelf, en elke kop heeft zijn plek in de rij', () => {
    const alle = groepInhoud({ klassement: true, helden: true, kanUitnodigen: true });
    for (const sleutel of alle) {
      // Geen eigen kop op de pagina: Uitnodigen is de knop in de Groepskaart (een andere component), en de kop van
      // de Ketting tekent `Ketting`.
      if (sleutel === 'groepskaart.uitnodigen' || sleutel === 'ketting.kop') continue;
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

  it('klassement hangt aan de lijst en niet aan de zichtbaarheid (A57)', () => {
    expect(pagina).toMatch(/klassement: klassementPlek\(s\.klassement\) === 'lijst'/);
    // De kaart tekent zijn eigen kop met dezelfde sleutel als de rij.
    expect(pagina).toMatch(/t\('klassement\.kop'\)/);
  });

  it('een teamgroep is nooit open voor de heldenrij: daar is nooit een heldenlijst (besluit 22)', () => {
    expect(pagina).toMatch(/helden: s\.groep\.zichtbaarheid === 'open' && !isTeamgroep\(s\.groep\)/);
    // De heldenkaart krijgt dezelfde beslissing als de rij: één regel, niet twee.
    expect(pagina).toMatch(/<HeldenKaart[\s\S]*?open=\{s\.groep\?\.zichtbaarheid === 'open' && !isTeamgroep\(s\.groep\)\}/);
  });

  it('de pagina geeft deelbaar door en niet iets vasts', () => {
    expect(pagina).toMatch(/kanUitnodigen:\s*deelbaarBericht\([\s\S]*?\) !== null/);
  });

  it('kop: "Jouw groep" met de naam, "Jouw groep" zolang hij laadt, neutraal als er geen groep is', () => {
    expect(pagina).toMatch(/t\('groepdetail\.titel_naam', \{ naam: stand\.groep\.name \}\)/);
    expect(pagina).toMatch(/stand === undefined\) return t\('groepdetail\.titel'\)/);
    expect(pagina).toMatch(/stand\.groep === null\s*\?\s*t\('groepdetail\.titel_zonder_groep'\)/);
    expect(nl['groepdetail.titel_zonder_groep']).toBe('Groep');
    expect(nl['groepdetail.titel_naam']).toContain('{naam}');
    expect(nl['groepdetail.titel']).toBe('Jouw groep');
    expect(en['groepdetail.titel']).toBe('Your group');
    expect(Object.keys(en)).toContain('groepdetail.inhoud');
  });
});
