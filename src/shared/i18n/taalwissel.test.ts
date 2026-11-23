import { afterEach, describe, expect, it, vi } from 'vitest';

import { abonneerOpTaal, STANDAARDTAAL, zetTaal, zetTaalUitApparaat } from './index';

/**
 * Het bericht bij een taalwissel — QS8-796.
 *
 * ⚠️ Alleen een wíssel meldt. Het profiel zet bij elke lading dezelfde taal nog
 *    eens; meldde dat ook, dan renderde elke route opnieuw voor niets.
 *
 * IJKING — met de hand, 23-11-2026: de `return` bij gelijke taal uit
 *    `meldWissel()` halen → "dezelfde taal meldt niets" rood; de aanroep uit
 *    `zetTaalUitApparaat()` halen → "ook het apparaat meldt" rood; `taalstand()`
 *    alleen `huidig` laten geven → "alleen de datumnotatie" rood.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('abonneerOpTaal()', () => {
  it('een wissel via zetTaal meldt één keer', () => {
    zetTaal('nl');
    const luisteraar = vi.fn();
    const opzeggen = abonneerOpTaal(luisteraar);
    zetTaal('en');
    expect(luisteraar).toHaveBeenCalledTimes(1);
    opzeggen();
  });

  it('dezelfde taal nog eens zetten meldt niets', () => {
    zetTaal('en');
    const luisteraar = vi.fn();
    const opzeggen = abonneerOpTaal(luisteraar);
    zetTaal('en');
    expect(luisteraar).not.toHaveBeenCalled();
    opzeggen();
  });

  it('ook het apparaat meldt een wissel', () => {
    zetTaal('nl');
    const luisteraar = vi.fn();
    const opzeggen = abonneerOpTaal(luisteraar);
    zetTaalUitApparaat(['en-GB']);
    expect(luisteraar).toHaveBeenCalledTimes(1);
    opzeggen();
  });

  it('een wissel van alleen de datumnotatie meldt ook', () => {
    zetTaalUitApparaat(['en-GB']);
    const luisteraar = vi.fn();
    const opzeggen = abonneerOpTaal(luisteraar);
    // Dezelfde taal, maar de notatie van het toestel valt weg (`opmaaktaal()`).
    zetTaal('en');
    // Alleen zinvol als het toestel hier een andere notatie dan `en` geeft.
    if (Intl.DateTimeFormat().resolvedOptions().locale !== 'en') {
      expect(luisteraar).toHaveBeenCalledTimes(1);
    }
    opzeggen();
  });

  it('na opzeggen komt er niets meer binnen', () => {
    zetTaal('nl');
    const luisteraar = vi.fn();
    abonneerOpTaal(luisteraar)();
    zetTaal('en');
    expect(luisteraar).not.toHaveBeenCalled();
  });
});
