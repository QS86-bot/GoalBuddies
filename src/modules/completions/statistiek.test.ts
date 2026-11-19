import { beforeEach, describe, expect, it, vi } from 'vitest';

/** De grens van de statistiekquery — QS8-749: pagineert, kapt af, en meldt een fout zonder rauwe tekst. */
const range = vi.fn();
const eq = vi.fn();
const gte = vi.fn();

vi.mock('../../lib/supabase', () => {
  const keten: Record<string, unknown> = {};
  keten.select = () => keten;
  keten.eq = (...a: unknown[]) => (eq(...a), keten);
  keten.gte = (...a: unknown[]) => (gte(...a), keten);
  keten.order = () => keten;
  keten.range = (...a: unknown[]) => range(...a);
  return { supabase: () => ({ from: () => keten }) };
});
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('../../shared/i18n', () => ({ t: (s: string) => s }));

const { fetchEigenVoltooiingsmomenten, STATISTIEK_PAGINA, STATISTIEK_MAX_PAGINAS } = await import('./statistiek');

const volle = () =>
  Array.from({ length: STATISTIEK_PAGINA }, () => ({
    cycle_start_date: '2026-01-05',
    submitted_at: '2026-01-06T10:00:00Z',
    superseded_by: null,
  }));

beforeEach(() => {
  range.mockReset();
  eq.mockReset();
  gte.mockReset();
});

describe('fetchEigenVoltooiingsmomenten', () => {
  it('filtert op de meegegeven eigenaar en op het begin van de periode', async () => {
    range.mockResolvedValue({ data: [], error: null });
    await fetchEigenVoltooiingsmomenten('u1', '2026-10-19T00:00:00Z');
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(gte).toHaveBeenCalledWith('submitted_at', '2026-10-19T00:00:00Z');
  });

  it('stopt op een korte pagina en meldt niet afgekapt', async () => {
    range.mockResolvedValueOnce({ data: volle(), error: null }).mockResolvedValueOnce({ data: volle().slice(0, 3), error: null });
    const uit = await fetchEigenVoltooiingsmomenten('u1', null);
    expect(uit.rijen).toHaveLength(STATISTIEK_PAGINA + 3);
    expect(uit.afgekapt).toBe(false);
    expect(gte).not.toHaveBeenCalled();
  });

  it('kapt af na de maximale pagina en zegt dat', async () => {
    range.mockResolvedValue({ data: volle(), error: null });
    const uit = await fetchEigenVoltooiingsmomenten('u1', null);
    expect(range).toHaveBeenCalledTimes(STATISTIEK_MAX_PAGINAS);
    expect(uit.afgekapt).toBe(true);
    expect(uit.rijen).toHaveLength(STATISTIEK_PAGINA * STATISTIEK_MAX_PAGINAS);
  });

  it('gooit een gewone melding en nooit de rauwe fout', async () => {
    range.mockResolvedValue({ data: null, error: { message: 'duplicate key value 4f2a' } });
    await expect(fetchEigenVoltooiingsmomenten('u1', null)).rejects.toThrow('statistiek.laden_mislukt');
  });
});
