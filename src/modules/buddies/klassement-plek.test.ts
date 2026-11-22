import { describe, expect, it } from 'vitest';

import { klassementPlek, type KlassementUitkomstVorm } from './klassement-poort';

/**
 * Wat er op de plek van het klassement staat — QS8-666 (A57), deel 3b-1.
 *
 * IJKING (met de hand, 22-11-2026): in `klassementPlek` de lengtetoets omdraaien -> 'rijen geven een lijst' valt om; de
 * fouttak weghalen -> 'een fout blijft een fout' valt om.
 */
const leeg: KlassementUitkomstVorm = { staat: 'ok', pagina: { rijen: [] } };
const met: KlassementUitkomstVorm = { staat: 'ok', pagina: { rijen: [{}, {}] } };

describe('klassementPlek', () => {
  it('rijen uit de RPC geven een lijst, ook voor een beschermde groep (A57)', () => {
    expect(klassementPlek(met)).toBe('lijst');
  });

  it('nul rijen: niets (geen lege kaart met een kop erboven)', () => {
    expect(klassementPlek(leeg)).toBe('niets');
  });

  it('een fout blijft een fout', () => {
    expect(klassementPlek({ staat: 'fout' })).toBe('fout');
  });
});
