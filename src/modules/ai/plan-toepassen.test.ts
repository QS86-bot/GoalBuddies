import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De schrijfkant van de naad — QS8-201.
 *
 * ⚠️ **De belofte is niet "het schrijven lukt" maar "wat de uitkomst zegt, staat
 *    er ook".** Er is geen transactie: doel, mijlpalen en weekdoel gaan elk via
 *    een eigen PostgREST-aanroep. Een halve uitkomst is dus een geldige toestand
 *    — een doel zonder mijlpalen bestaat al sinds EPIC 2. Wat níét mag, is doen
 *    alsof alles gelukt is.
 *
 * ⚠️ Daarom telt `PlanUitkomst` en vlagt hij niet. Zou hier `ok: true` staan bij
 *    een doel zonder mijlpalen, dan stuurt het scherm de gebruiker naar een
 *    hoofdscherm dat leger is dan wat hij net bevestigd heeft — zonder dat
 *    iemand kan zien waarom.
 */

const maakDoel = vi.fn();
const maakWeekdoel = vi.fn();
const insert = vi.fn();

vi.mock('../goals', () => ({ maakDoel, maakWeekdoel }));
vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ from: () => ({ insert }) }),
}));
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('../../shared/i18n', () => ({ t: (sleutel: string) => sleutel }));
vi.mock('../../shared/time', () => ({
  localDateIn: () => '2026-08-31',
  now: () => new Date('2026-08-31T12:00:00Z'),
}));

const { onvolledigMelding, pasPlanToe } = await import('./plan-toepassen');

const KLOK = { weekStartDay: 1, tz: 'Europe/Amsterdam' } as never;

function rijen(over: Record<string, unknown> = {}) {
  return {
    doel: {
      title: '20 kg afvallen',
      category: 'other' as const,
      identity_statement: null,
      target_date: '2027-06-01',
    },
    mijlpalen: [
      { title: 'Eerste 5 kg', description: null, target_date: null, order_index: 1 },
      { title: 'Volgende 10 kg', description: null, target_date: null, order_index: 2 },
    ],
    weekdoel: {
      title: 'Drie keer wandelen',
      floor_text: 'Eén keer',
      ceiling_text: 'Drie keer',
      milestone_index: 0,
    },
    ...over,
  } as never;
}

/** PostgREST geeft de rijen in willekeurige volgorde terug. */
function insertGeeft(rijen: { id: string; order_index: number }[]) {
  insert.mockReturnValue({ select: () => Promise.resolve({ data: rijen, error: null }) });
}

beforeEach(() => {
  maakDoel.mockReset();
  maakWeekdoel.mockReset();
  insert.mockReset();
  maakDoel.mockResolvedValue({ ok: true, waarde: { id: 'doel-1' } });
  maakWeekdoel.mockResolvedValue({ ok: true, waarde: {} });
  insertGeeft([
    { id: 'm-1', order_index: 1 },
    { id: 'm-2', order_index: 2 },
  ]);
});

describe('pasPlanToe — alles lukt', () => {
  it('telt wat er staat en noemt het volledig', async () => {
    const uit = await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.waarde).toEqual({
      goalId: 'doel-1',
      mijlpalen: 2,
      weekdoel: true,
      onvolledig: false,
    });
  });

  it('schrijft alle mijlpalen in één aanroep en niet één per stuk', async () => {
    // ⚠️ maakMijlpaal() leest per mijlpaal eerst de hoogste order_index en
    //    schrijft dan — twee rondes per stuk. Bij twaalf mijlpalen zijn dat er
    //    vierentwintig op het moment dat de gebruiker net bevestigd heeft. Dat is
    //    de N+1 uit schaalbaarheidsregel 12, precies waar hij het meest opvalt.
    await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('hangt het weekdoel aan de mijlpaal met order_index 1, ook als PostgREST omdraait', async () => {
    // ⚠️ PostgREST belooft de volgorde van teruggegeven rijen niet. Pak je de
    //    verkeerde, dan staat de eerste week onder een stap die pas over drie
    //    maanden komt — en dat ziet er op het scherm volstrekt normaal uit.
    insertGeeft([
      { id: 'm-2', order_index: 2 },
      { id: 'm-1', order_index: 1 },
    ]);

    await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(maakWeekdoel.mock.calls[0]?.[1]).toMatchObject({ milestone_id: 'm-1' });
  });
});

describe('pasPlanToe — het gaat halverwege mis', () => {
  it('geeft de fout van het doel door en schrijft niets anders', async () => {
    maakDoel.mockResolvedValue({ ok: false, melding: 'doel.opslaan_mislukt' });

    const uit = await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(uit).toEqual({ ok: false, melding: 'doel.opslaan_mislukt' });
    expect(insert).not.toHaveBeenCalled();
    expect(maakWeekdoel).not.toHaveBeenCalled();
  });

  it('houdt het doel als de mijlpalen falen, en noemt het onvolledig', async () => {
    insert.mockReturnValue({
      select: () => Promise.resolve({ data: null, error: { code: '42501' } }),
    });

    const uit = await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.waarde.goalId).toBe('doel-1');
    expect(uit.waarde.mijlpalen).toBe(0);
    expect(uit.waarde.onvolledig).toBe(true);
  });

  it('slaat het weekdoel over als er geen mijlpaal is om het onder te hangen', async () => {
    insert.mockReturnValue({
      select: () => Promise.resolve({ data: null, error: { code: '42501' } }),
    });

    await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(maakWeekdoel).not.toHaveBeenCalled();
  });

  it('noemt het onvolledig als alleen het weekdoel faalt', async () => {
    maakWeekdoel.mockResolvedValue({ ok: false, melding: 'weekdoel.mislukt' });

    const uit = await pasPlanToe('gebruiker-1', rijen(), KLOK, null);

    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.waarde).toMatchObject({ mijlpalen: 2, weekdoel: false, onvolledig: true });
  });

  it('is niet onvolledig als het plan zelf geen weekdoel had', async () => {
    // ⚠️ Het verschil tussen "er was niets voorgesteld" en "het is niet gelukt".
    //    Zonder dat onderscheid krijgt elke gebruiker zonder eerste week een
    //    foutmelding over iets dat nooit beloofd is.
    const uit = await pasPlanToe('gebruiker-1', rijen({ weekdoel: null }), KLOK, null);

    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.waarde.onvolledig).toBe(false);
    expect(maakWeekdoel).not.toHaveBeenCalled();
  });

  it('doet geen insert als het plan geen mijlpalen had', async () => {
    const uit = await pasPlanToe('gebruiker-1', rijen({ mijlpalen: [], weekdoel: null }), KLOK, null);

    expect(insert).not.toHaveBeenCalled();
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.waarde.onvolledig).toBe(false);
  });
});

describe('onvolledigMelding', () => {
  it('zwijgt als alles gelukt is', () => {
    expect(
      onvolledigMelding({ goalId: 'x', mijlpalen: 2, weekdoel: true, onvolledig: false }),
    ).toBeNull();
  });

  it('noemt de mijlpalen als die ontbreken', () => {
    expect(
      onvolledigMelding({ goalId: 'x', mijlpalen: 0, weekdoel: false, onvolledig: true }),
    ).toBe('coach.plan_zonder_mijlpalen');
  });

  it('noemt het weekdoel als alleen dat ontbreekt', () => {
    expect(
      onvolledigMelding({ goalId: 'x', mijlpalen: 2, weekdoel: false, onvolledig: true }),
    ).toBe('coach.plan_zonder_weekdoel');
  });
});
