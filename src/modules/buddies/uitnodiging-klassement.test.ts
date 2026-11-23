import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wat de client doet met `klassement_aan` uit `invite_preview()` — 0341, QS8-801.
 *
 * ⚠️ **De databasekant staat in `tests/rls/uitnodiging-klassement.test.ts`**: die
 *    toetst dat de functie de echte stand teruggeeft en anon niets meer. Dit
 *    bestand toetst de náád erachter — dat `fetchUitnodiging()` de stand
 *    doorgeeft en dat het scherm daaruit de juiste zin kiest, en dat een server
 *    van vóór 0341 op de standaardtekst van QS8-798 uitkomt en niet op "uit".
 */

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

vi.mock('../../shared/i18n', () => ({
  t: (sleutel: string) => sleutel,
  weekdagNaam: (dag: number) => String(dag),
}));

const { fetchUitnodiging } = await import('./api');
const { uitnodigingKlassementTekst } = await import('./schemas');

function groep(extra: Record<string, unknown> = {}) {
  return {
    group_id: '00000000-0000-4000-a000-000000000001',
    group_name: 'De Vroege Vogels',
    icon: null,
    huddle_day: 1,
    zichtbaarheid: 'beschermd',
    member_count: 3,
    detailed: false,
    members: [{ display_name: 'Anna', avatar_url: null, goal_title: null }],
    ...extra,
  };
}

async function zinVoor(data: Record<string, unknown>): Promise<string> {
  rpc.mockResolvedValue({ data, error: null });
  const uit = await fetchUitnodiging('KLASSEMENT01');
  if (uit === null) throw new Error('geen uitnodiging');
  return uitnodigingKlassementTekst(uit.klassement_aan);
}

describe('de uitnodiging noemt de echte stand van het klassement (0341)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('staat het aan, dan de zin voor aan', async () => {
    expect(await zinVoor(groep({ klassement_aan: true }))).toBe('uitnodiging.klassement_aan');
  });

  it('staat het uit, dan de zin voor uit', async () => {
    expect(await zinVoor(groep({ klassement_aan: false }))).toBe('uitnodiging.klassement_uit');
  });

  it('noemt de server het niet (vóór 0341), dan de standaard en niet "uit"', async () => {
    expect(await zinVoor(groep())).toBe('uitnodiging.klassement_standaard');
  });

  it('is het geen boolean, dan ook de standaard: geen stand verzinnen', async () => {
    for (const waarde of ['true', 1, null, 'aan']) {
      expect(await zinVoor(groep({ klassement_aan: waarde })), String(waarde)).toBe(
        'uitnodiging.klassement_standaard',
      );
    }
  });
});
