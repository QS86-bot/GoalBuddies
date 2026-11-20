import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `zetWeekStartdag()` toont de weigering `weekbelofte_loopt` op het scherm —
 * QS8-759, migratie 0313.
 *
 * Alle andere weigeringen van `zet_week_startdag()` zijn toestanden die een
 * gebruiker niet kan veroorzaken; die gaan naar Sentry met een algemene
 * melding. Deze kan hij wél veroorzaken en zelf oplossen (wachten tot de week
 * van zijn belofte voorbij is), dus hij hoort een eigen zin en is geen fout.
 *
 * De serverkant van dezelfde reden staat onder test in
 * `tests/rls/weekbelofte-beslissing.test.ts` (criterium 7).
 */

const rpc = vi.fn();
const reportError = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

vi.mock('../../shared/i18n', async (echt) => ({
  ...(await echt<typeof import('../../shared/i18n')>()),
  t: (sleutel: string) => sleutel,
}));

const { zetWeekStartdag } = await import('./profile');

const KLOK = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' };

describe('zetWeekStartdag() bij een lopende weekbelofte', () => {
  beforeEach(() => {
    rpc.mockReset();
    reportError.mockReset();
  });

  it('`weekbelofte_loopt` geeft de eigen melding en meldt niets aan Sentry', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'weekbelofte_loopt' }, error: null });

    const uit = await zetWeekStartdag('u1', KLOK, 0);

    expect(uit).toEqual({ ok: false, melding: 'profiel.weekbelofte_loopt' });
    expect(reportError).not.toHaveBeenCalled();
  });

  // Controle: dezelfde opzet met een andere reden blijft de algemene melding
  // geven én meldt het. Zonder dit geval is "geen Sentry" niet te onderscheiden
  // van een mock die nooit aangeroepen wordt.
  it('een andere weigering blijft `opslaan_mislukt` en gaat naar Sentry', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'cyclus_bevat_vandaag_niet' }, error: null });

    const uit = await zetWeekStartdag('u1', KLOK, 0);

    expect(uit).toEqual({ ok: false, melding: 'profiel.opslaan_mislukt' });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
