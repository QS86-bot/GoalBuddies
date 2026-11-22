import { describe, expect, it, vi } from 'vitest';

import { klassementPlek, type KlassementUitkomstVorm } from './klassement';

vi.mock('../../lib/supabase', () => ({ supabase: () => ({}) }));
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));

/**
 * Wat er op de plek van het klassement staat — QS8-666 (A57), deel 3b.
 *
 * IJKING (met de hand, 22-11-2026): in `klassementPlek` de uitnodiging vóór de lijst zetten -> 'data wint van een
 * verouderde vlag' valt om; `groep !== null &&` weghalen -> 'zonder groep' valt om.
 */
const groep = { status: 'active', automatisch: false, klassement_aan: false, organization_id: null };
const leeg: KlassementUitkomstVorm = { staat: 'ok', pagina: { rijen: [] } };
const met: KlassementUitkomstVorm = { staat: 'ok', pagina: { rijen: [{}, {}] } };

describe('klassementPlek', () => {
  it('toont de lijst als de RPC rijen geeft', () => {
    expect(klassementPlek(met, { ...groep, klassement_aan: true }, false)).toBe('lijst');
  });

  it('data wint van een verouderde vlag: rijen terwijl klassement_aan nog false zegt, is een lijst en geen kaart', () => {
    expect(klassementPlek(met, groep, true)).toBe('lijst');
  });

  it('een fout blijft een fout, ook voor een beheerder die de uitnodiging had gekregen', () => {
    expect(klassementPlek({ staat: 'fout' }, groep, true)).toBe('fout');
  });

  it('nul rijen, klassement uit, beheerder: de uitnodiging', () => {
    expect(klassementPlek(leeg, groep, true)).toBe('uitnodiging');
  });

  it('nul rijen, klassement uit, gewoon lid: niets', () => {
    expect(klassementPlek(leeg, groep, false)).toBe('niets');
  });

  it('nul rijen terwijl het klassement aan staat (niet-lid, storing): niets, geen kaart', () => {
    expect(klassementPlek(leeg, { ...groep, klassement_aan: true }, true)).toBe('niets');
  });

  it.each([
    ['een teamgroep', { organization_id: 'org-1' }],
    ['een automatisch gevormde groep', { automatisch: true }],
    ['een gearchiveerde groep', { status: 'archived' }],
  ])('geen uitnodiging voor %s', (_naam, extra) => {
    expect(klassementPlek(leeg, { ...groep, ...extra }, true)).toBe('niets');
  });

  it('zonder groep: niets', () => {
    expect(klassementPlek(leeg, null, true)).toBe('niets');
  });
});
