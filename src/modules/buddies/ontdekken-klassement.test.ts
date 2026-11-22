import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nl } from '../../shared/i18n/nl';
import { en } from '../../shared/i18n/en';
import { zetOntdekbaar } from './ontdekken';

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: () => ({ rpc }) }));
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));

/**
 * Vindbaar maken zet het klassement uit — QS8-666 (A57, 0336), besluit Quinten 22-11-2026.
 *
 * ⚠️ **De belofte is dat de schakelaar nooit iets anders toont dan de database deed.** `zetOntdekbaar()` geeft de
 *    stand van het klassement uit het antwoord van de RPC terug en verzint er geen: ontbreekt hij (`null`), dan
 *    laat het scherm zijn eigen stand staan. En de bevestigingstekst zegt vooraf dat het klassement uitgaat en door
 *    een beheerder apart weer aangezet kan worden, in beide talen.
 *
 * IJKING (met de hand, 22-11-2026): `klassement: uit.klassement ?? null` in `zetOntdekbaar()` vervangen door
 * `klassement: naar` → 'geeft de stand van de database en niet de gevraagde' valt om; de zin uit nl.ts halen →
 * de tekst-toets valt om.
 */
beforeEach(() => rpc.mockReset());

describe('zetOntdekbaar', () => {
  it('geeft de klassementstand uit het antwoord van de database terug', async () => {
    rpc.mockResolvedValue({ data: { ok: true, ontdekbaar: true, klassement: false }, error: null });
    expect(await zetOntdekbaar('g1', true, true)).toEqual({
      ok: true,
      waarde: { ontdekbaar: true, klassement: false },
    });
  });

  it('geeft null als de database geen klassementstand meldt', async () => {
    rpc.mockResolvedValue({ data: { ok: true, ontdekbaar: false }, error: null });
    expect(await zetOntdekbaar('g1', false, true)).toEqual({
      ok: true,
      waarde: { ontdekbaar: false, klassement: null },
    });
  });

  it('geeft de stand van de database en niet de gevraagde', async () => {
    rpc.mockResolvedValue({ data: { ok: true, ontdekbaar: true, klassement: true }, error: null });
    const uit = await zetOntdekbaar('g1', true, true);
    expect(uit.ok && uit.waarde.klassement).toBe(true);
  });
});

describe('bevestigingstekst bij vindbaar maken', () => {
  it('noemt in het Nederlands dat het klassement uitgaat en apart weer aan kan', () => {
    const tekst = nl['bevestiging.groep_ontdekbaar_maken.uitleg'];
    expect(tekst).toContain('klassement');
    expect(tekst).toMatch(/gaat het uit/);
    expect(tekst).toMatch(/apart weer aanzetten/);
  });

  it('noemt het in het Engels ook', () => {
    const tekst = en['bevestiging.groep_ontdekbaar_maken.uitleg'];
    expect(tekst).toContain('leaderboard');
    expect(tekst).toMatch(/turns off/);
    expect(tekst).toMatch(/back on separately/);
  });
});

describe('bevestigingstekst bij het klassement aanzetten', () => {
  it('belooft alleen de gemiste week en noemt de punten van vóór vandaag', () => {
    const tekst = nl['bevestiging.klassement_aanzetten.uitleg'];
    expect(tekst).toMatch(/ook die van vóór vandaag/);
    expect(tekst).toMatch(/gemiste week komt er nooit in voor/);
    expect(tekst).not.toMatch(/verlies/);
  });
});
