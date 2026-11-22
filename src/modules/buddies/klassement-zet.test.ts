import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  kanKlassementZetten,
  klassementMeldingen,
  toonKlassementUitnodiging,
  zetGroepsklassement,
  type KlassementGroep,
} from './klassement';

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: () => ({ rpc }) }));
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));

/**
 * De schakelaar van het klassement — QS8-666 (A57), deel 3a.
 *
 * ⚠️ **Wat hier getoetst wordt is de belofte en niet het lijstje:** een scherm biedt de schakelaar
 *    nooit aan voor een groep waar de database hem toch weigert (teamgroep, automatisch gevormd,
 *    gearchiveerd), en elke weigerreden komt als klassementtekst bij de beheerder aan, nooit als
 *    de tekst van een andere handeling. De database blijft de grens; dit is wat de beheerder leest.
 *
 * IJKING (met de hand, 22-11-2026): de `automatisch`-regel uit `kanKlassementZetten()` halen → de
 * twee 'automatisch'-gevallen hieronder vallen om; `unchanged` uit `klassementMeldingen()` halen →
 * 'geeft elke weigerreden een eigen tekst' valt om.
 */

function groep(extra: Partial<KlassementGroep> = {}): KlassementGroep {
  return { status: 'active', automatisch: false, klassement_aan: false, organization_id: null, ...extra };
}

beforeEach(() => rpc.mockReset());

describe('kanKlassementZetten', () => {
  it('biedt de schakelaar aan een beheerder van een gewone groep', () => {
    expect(kanKlassementZetten(groep(), true)).toBe(true);
    expect(kanKlassementZetten(groep({ klassement_aan: true }), true)).toBe(true);
  });

  it('biedt hem nooit aan een lid dat geen beheerder is', () => {
    expect(kanKlassementZetten(groep(), false)).toBe(false);
  });

  it('biedt hem nooit voor een teamgroep, ook niet aan een beheerder', () => {
    expect(kanKlassementZetten(groep({ organization_id: 'org-1' }), true)).toBe(false);
  });

  it('biedt hem nooit voor een automatisch gevormde groep', () => {
    expect(kanKlassementZetten(groep({ automatisch: true }), true)).toBe(false);
  });

  it('biedt hem nooit voor een gearchiveerde groep', () => {
    expect(kanKlassementZetten(groep({ status: 'archived' }), true)).toBe(false);
  });
});

describe('toonKlassementUitnodiging', () => {
  it('toont de kaart aan een beheerder zolang het klassement uit staat', () => {
    expect(toonKlassementUitnodiging(groep(), true)).toBe(true);
  });

  it('toont hem niet meer zodra het klassement aan staat', () => {
    expect(toonKlassementUitnodiging(groep({ klassement_aan: true }), true)).toBe(false);
  });

  it('toont hem nooit aan een lid dat geen beheerder is', () => {
    expect(toonKlassementUitnodiging(groep(), false)).toBe(false);
  });

  it.each([
    ['een teamgroep', { organization_id: 'org-1' }],
    ['een automatisch gevormde groep', { automatisch: true }],
    ['een gearchiveerde groep', { status: 'archived' }],
  ])('toont hem niet voor %s', (_naam, extra) => {
    expect(toonKlassementUitnodiging(groep(extra), true)).toBe(false);
  });
});

describe('zetGroepsklassement', () => {
  it('geeft de stand terug die de database meldt, en niet de gevraagde', async () => {
    rpc.mockResolvedValue({ data: { ok: true, klassement: false }, error: null });

    expect(await zetGroepsklassement('g1', true, true)).toEqual({ ok: true, waarde: false });
  });

  it('stuurt de bevestiging mee zoals ze gegeven is', async () => {
    rpc.mockResolvedValue({ data: { ok: true, klassement: true }, error: null });

    await zetGroepsklassement('g1', true, true);

    expect(rpc).toHaveBeenCalledWith('zet_groepsklassement', {
      p_group_id: 'g1',
      p_aan: true,
      p_bevestigd: true,
    });
  });

  it('geeft elke weigerreden een eigen tekst, nooit de tekst van de zichtbaarheid', async () => {
    const redenen = Object.keys(klassementMeldingen());
    const teksten = new Set<string>();

    for (const reden of redenen) {
      rpc.mockResolvedValue({ data: { ok: false, reason: reden }, error: null });
      const uit = await zetGroepsklassement('g1', true, true);

      expect(uit.ok).toBe(false);
      if (!uit.ok) teksten.add(uit.melding);
    }

    // Elke reden een eigen zin, behalve `unknown_state` die op de korte terugvaltekst valt.
    expect(teksten.size).toBeGreaterThanOrEqual(redenen.length - 1);
  });

  it('valt op de korte melding terug bij een reden die niet bekend is', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'nieuwe_reden' }, error: null });

    const uit = await zetGroepsklassement('g1', true, true);

    expect(uit).toEqual({ ok: false, melding: klassementMeldingen().unknown_state });
  });

  it('meldt een storing zonder de reden te raden', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('netwerk') });

    const uit = await zetGroepsklassement('g1', false, true);

    expect(uit.ok).toBe(false);
  });
});
