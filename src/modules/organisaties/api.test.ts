import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t, type Sleutel } from '../../shared/i18n';

/**
 * De organisatie-api tegen een nagebootste database — QS8-657.
 *
 * ⚠️ **De naad is de paginering.** `organisatieleden()` en `organisatieteams()`
 *    zijn elk correct, en het scherm is correct zolang het de cursor van de
 *    vorige pagina meestuurt. Alleen een test die drie pagina's achter elkaar
 *    ophaalt ziet dat een scherm dat de cursor vergeet de eerste pagina eindeloos
 *    herhaalt, en dat de lijst nooit ophoudt.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc, from }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

const api = await import('./api');

const ORG = '00000000-0000-4000-a000-0000000000aa';

function leden(aantal: number, vanaf: number) {
  return Array.from({ length: aantal }, (_, i) => ({
    user_id: `00000000-0000-4000-a000-${String(vanaf + i).padStart(12, '0')}`,
    display_name: `Lid ${vanaf + i}`,
    role: 'member',
  }));
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('maakOrganisatie', () => {
  it('stuurt precies één rpc met alleen de naam en geeft de id terug', async () => {
    rpc.mockResolvedValue({ data: { ok: true, organization_id: ORG }, error: null });

    const uitkomst = await api.maakOrganisatie('  Acme  ');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('maak_organisatie', { p_naam: 'Acme' });
    expect(from).not.toHaveBeenCalled();
    expect(uitkomst).toEqual({ ok: true, waarde: ORG });
  });

  it('stuurt niets als de naam leeg is', async () => {
    const uitkomst = await api.maakOrganisatie('   ');

    expect(uitkomst.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('redenen worden catalogustekst', () => {
  const gevallen: readonly [string, string, Sleutel][] = [
    ['maak_organisatie', 'ongeldige_naam', 'organisatie.naam_ongeldig'],
    ['maak_organisatie', 'rate_limited', 'organisatie.rate_limited_aanmaken'],
    ['maak_organisatie', 'te_veel_organisaties', 'organisatie.te_veel'],
    ['maak_organisatie', 'niet_toegelaten', 'organisatie.niet_toegelaten'],
    ['word_organisatielid', 'invalid', 'organisatie.code_ongeldig'],
    ['word_organisatielid', 'removed', 'organisatie.code_ongeldig'],
    ['word_organisatielid', 'rate_limited', 'organisatie.rate_limited_deelnemen'],
    ['word_organisatielid', 'te_veel_organisaties', 'organisatie.te_veel'],
    ['verlaat_organisatie', 'geen_lid', 'organisatie.geen_lid'],
    ['verlaat_organisatie', 'laatste_beheerder', 'organisatie.laatste_beheerder'],
    ['zet_organisatielid_uit', 'niet_toegestaan', 'organisatie.niet_toegestaan'],
    ['vernieuw_organisatiecode', 'niet_toegestaan', 'organisatie.niet_toegestaan'],
    ['vernieuw_organisatiecode', 'rate_limited', 'organisatie.rate_limited_code'],
    ['maak_teamgroep', 'niet_toegestaan', 'organisatie.niet_toegestaan'],
    ['maak_teamgroep', 'name_too_short', 'groep.naam_kort'],
    ['maak_teamgroep', 'daily_limit', 'groep.daglimiet'],
  ];

  async function roep(naam: string): Promise<string> {
    const code = 'VYHC2X9GSRVH';
    const uitkomst = await {
      maak_organisatie: () => api.maakOrganisatie('Acme'),
      word_organisatielid: () => api.wordOrganisatielid(code),
      verlaat_organisatie: () => api.verlaatOrganisatie(ORG),
      zet_organisatielid_uit: () => api.zetLidUit(ORG, ORG),
      vernieuw_organisatiecode: () => api.vernieuwOrganisatiecode(ORG, false),
      maak_teamgroep: () => api.maakTeam(ORG, 'Team Noord'),
    }[naam]!();
    if (uitkomst.ok) throw new Error('verwachtte een weigering');
    return uitkomst.melding;
  }

  it.each(gevallen)('%s met %s geeft de catalogustekst', async (rpcNaam, reden, sleutel) => {
    rpc.mockResolvedValue({ data: { ok: false, reason: reden }, error: null });

    expect(await roep(rpcNaam)).toBe(t(sleutel));
  });

  it.each(['maak_organisatie', 'word_organisatielid', 'verlaat_organisatie', 'maak_teamgroep'])(
    '%s met een onbekende reden geeft een terugvaltekst en nooit een lege',
    async (rpcNaam) => {
      rpc.mockResolvedValue({ data: { ok: false, reason: 'iets_nieuws' }, error: null });

      const tekst = await roep(rpcNaam);

      expect(tekst).not.toBe('');
      expect(tekst).not.toContain('iets_nieuws');
    },
  );

  it('geeft bij een technische fout een catalogustekst en geen servertekst', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } });

    const tekst = await roep('verlaat_organisatie');

    expect(tekst).toBe(t('organisatie.verlaten_mislukt'));
  });
});

describe('de paginering van leden en teams (de naad)', () => {
  it('haalt 45 leden op in drie rpc-aanroepen en geeft de cursor door', async () => {
    const eerste = leden(20, 1);
    const tweede = leden(20, 21);
    const derde = leden(5, 41);
    rpc
      .mockResolvedValueOnce({ data: eerste, error: null })
      .mockResolvedValueOnce({ data: tweede, error: null })
      .mockResolvedValueOnce({ data: derde, error: null });

    const p1 = await api.fetchOrganisatieleden(ORG);
    const p2 = await api.fetchOrganisatieleden(ORG, p1.volgende);
    const p3 = await api.fetchOrganisatieleden(ORG, p2.volgende);

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_na_user_id');
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_na_user_id: eerste.at(-1)?.user_id });
    expect(rpc.mock.calls[2]?.[1]).toMatchObject({ p_na_user_id: tweede.at(-1)?.user_id });
    expect(p1.rijen).toHaveLength(20);
    expect(p3.rijen).toHaveLength(5);
    expect(p3.volgende).toBeNull();
    expect([...p1.rijen, ...p2.rijen, ...p3.rijen]).toHaveLength(45);
  });

  it('vraagt nooit meer dan de paginagrootte en weet bij een lege lijst dat het klaar is', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const pagina = await api.fetchOrganisatieleden(ORG);

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_limit: 20 });
    expect(pagina).toEqual({ rijen: [], volgende: null });
  });

  it('doet hetzelfde voor teams, met p_na_id', async () => {
    const team = (n: number) => ({
      id: `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
      name: `Team ${n}`,
    });
    const eerste = Array.from({ length: 20 }, (_, i) => team(i + 1));
    rpc
      .mockResolvedValueOnce({ data: eerste, error: null })
      .mockResolvedValueOnce({ data: [team(21)], error: null });

    const p1 = await api.fetchOrganisatieteams(ORG);
    const p2 = await api.fetchOrganisatieteams(ORG, p1.volgende);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_na_id: eerste.at(-1)?.id });
    expect(p2.volgende).toBeNull();
  });
});

describe('fetchMijnOrganisaties', () => {
  it('doet precies twee verzoeken zonder * en voegt de rol samen', async () => {
    const selecties: string[] = [];
    const keten = (rijen: unknown) => ({
      select: (kolommen: string) => {
        selecties.push(kolommen);
        return {
          order: () => ({ limit: () => Promise.resolve({ data: rijen, error: null }) }),
          limit: () => Promise.resolve({ data: rijen, error: null }),
        };
      },
    });
    from.mockImplementation((tabel: string) =>
      tabel === 'organizations'
        ? keten([
            { id: 'a', name: 'Acme' },
            { id: 'b', name: 'Beta' },
          ])
        : keten([{ organization_id: 'a', role: 'admin' }]),
    );

    const lijst = await api.fetchMijnOrganisaties();

    expect(from).toHaveBeenCalledTimes(2);
    expect(rpc).not.toHaveBeenCalled();
    expect(selecties).toHaveLength(2);
    for (const kolommen of selecties) expect(kolommen).not.toContain('*');
    expect(lijst).toEqual([
      { id: 'a', naam: 'Acme', rol: 'admin' },
      { id: 'b', naam: 'Beta', rol: 'member' },
    ]);
  });
});
