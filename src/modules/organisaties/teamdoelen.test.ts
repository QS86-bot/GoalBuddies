import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t, type Sleutel } from '../../shared/i18n';
import { localDateIn, type IsoDate, type TimeZone } from '../../shared/time';

import type { Teambalk } from './teamdoelen';

/**
 * De teamdoelen tegen een nagebootste database — QS8-658.
 *
 * ⚠️ **De belofte is dat de balk van de server komt.** `laadTeamdoel()` is
 *    correct, het scherm is correct zolang het herlaadt, en een balk die lokaal
 *    meetelt zou allebei laten staan. Alleen een test die twee uitkomsten
 *    achter elkaar vraagt, ziet een `max()` of een cache. De typetest staat in
 *    de eerste `it` hieronder: tsc leest dit testbestand ook.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc, from }),
}));
vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

const teamdoelen = await import('./teamdoelen');
const { reportError } = await import('../../lib/observability');

const GROEP = '00000000-0000-4000-a000-0000000000aa';
const DOEL = '00000000-0000-4000-a000-0000000000bb';
const GEBRUIKER = '00000000-0000-4000-a000-0000000000cc';
const AANDEEL = '00000000-0000-4000-a000-0000000000dd';

function sleutel(n: number): string {
  return `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
}

function rij(n: number) {
  return {
    id: sleutel(n),
    group_id: GROEP,
    title: `Teamdoel ${n}`,
    description: null,
    target_date: '2026-12-31',
    status: 'active',
    created_at: '2026-11-18T10:00:00Z',
  };
}

/** Een query-keten die de aanroepen onthoudt en bij `await` een uitkomst geeft. */
function keten(uitkomst: () => unknown) {
  const calls: { methode: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = {};
  for (const methode of ['select', 'eq', 'order', 'gt', 'limit', 'maybeSingle']) {
    proxy[methode] = (...args: unknown[]) => {
      calls.push({ methode, args });
      return methode === 'maybeSingle' || methode === 'limit' ? Promise.resolve(uitkomst()) : proxy;
    };
  }
  return { proxy, calls };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  vi.mocked(reportError).mockReset();
});

describe('Teambalk is een merktype', () => {
  it('is niet samen te stellen uit een los getal (de toets is de @ts-expect-error: `npm run typecheck`)', () => {
    // @ts-expect-error een balk zonder merk is geen `Teambalk`: alleen `laadTeamdoel()` maakt er een
    const balk: Teambalk = { aantal: 1 };

    expect(balk.aantal).toBe(1);
  });
});

describe('fetchTeamdoelen', () => {
  it('geeft 45 teamdoelen in drie pagina\'s van 20, 20 en 5 met de cursor van de laatste rij', async () => {
    const alle = Array.from({ length: 45 }, (_, i) => rij(i + 1));
    const selects: string[] = [];
    from.mockImplementation(() => {
      const state: { na: string | null } = { na: null };
      const k = keten(() => ({
        data: alle.filter((r) => state.na === null || r.id > state.na).slice(0, 20),
        error: null,
      }));
      const gt = k.proxy['gt'] as (...a: unknown[]) => unknown;
      k.proxy['gt'] = (kolom: string, waarde: string) => {
        state.na = waarde;
        return gt(kolom, waarde);
      };
      const select = k.proxy['select'] as (...a: unknown[]) => unknown;
      k.proxy['select'] = (kolommen: string) => {
        selects.push(kolommen);
        return select(kolommen);
      };
      return k.proxy;
    });

    const een = await teamdoelen.fetchTeamdoelen(GROEP);
    const twee = await teamdoelen.fetchTeamdoelen(GROEP, een.volgende);
    const drie = await teamdoelen.fetchTeamdoelen(GROEP, twee.volgende);

    expect([een.rijen.length, twee.rijen.length, drie.rijen.length]).toEqual([20, 20, 5]);
    expect(een.volgende).toBe(sleutel(20));
    expect(twee.volgende).toBe(sleutel(40));
    expect(drie.volgende).toBeNull();
    expect(twee.rijen[0]?.id).toBe(sleutel(21));
    for (const kolommen of selects) {
      expect(kolommen).not.toContain('*');
      expect(kolommen).not.toContain('created_by');
    }
  });
});

describe('laadTeamdoel', () => {
  function stel(balk: number | null, teamdoel: unknown = rij(1), aandeel: unknown = null) {
    from.mockImplementation((tabel: string) =>
      tabel === 'team_goals'
        ? keten(() => ({ data: teamdoel, error: null })).proxy
        : keten(() => ({ data: aandeel, error: null })).proxy,
    );
    rpc.mockResolvedValueOnce({ data: balk, error: null });
  }

  it('roept teambalk precies één keer aan, met alleen het teamdoel', async () => {
    stel(4);

    await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('teambalk', { p_team_goal_id: DOEL });
  });

  it('geeft bij elke aanroep de balk van de server: 5 en daarna 3 is 3 (geen max, geen cache)', async () => {
    stel(5);
    const eerste = await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER);
    stel(3);
    const tweede = await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER);

    expect(eerste?.balk.aantal).toBe(5);
    expect(tweede?.balk.aantal).toBe(3);
  });

  it('geeft null als het teamdoel niet leesbaar is', async () => {
    stel(2, null);
    expect(await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER)).toBeNull();
  });

  it('geeft null als teambalk null geeft', async () => {
    stel(null);
    expect(await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER)).toBeNull();
  });

  it('geeft null voor een id dat geen uuid is, zonder verzoek', async () => {
    expect(await teamdoelen.laadTeamdoel('geen-uuid', GEBRUIKER)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('neemt jouw aandeel mee, en laat het weg als je er geen hebt', async () => {
    stel(1, rij(1), { goal_id: AANDEEL });
    expect((await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER))?.aandeelDoelId).toBe(AANDEEL);
    stel(1);
    expect((await teamdoelen.laadTeamdoel(DOEL, GEBRUIKER))?.aandeelDoelId).toBeNull();
  });

  it('meldt een technische fout en gooit een catalogusmelding', async () => {
    from.mockImplementation(() => keten(() => ({ data: null, error: { code: '42501' } })).proxy);
    rpc.mockResolvedValueOnce({ data: 1, error: null });

    await expect(teamdoelen.laadTeamdoel(DOEL, GEBRUIKER)).rejects.toThrow(
      t('teamdoel.laden_mislukt'),
    );
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('neemAandeel', () => {
  it('geeft het doel terug en nooit een balkgetal', async () => {
    rpc.mockResolvedValue({ data: { ok: true, goal_id: AANDEEL }, error: null });

    const uitkomst = await teamdoelen.neemAandeel(DOEL);

    expect(uitkomst).toEqual({ ok: true, waarde: AANDEEL });
    expect(JSON.stringify(uitkomst)).not.toMatch(/balk|aantal/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('neem_aandeel', { p_team_goal_id: DOEL });
  });
});

describe('redenen worden catalogustekst', () => {
  const gevallen: readonly [string, string, Sleutel][] = [
    ['maak_teamdoel', 'niet_toegestaan', 'teamdoel.niet_toegestaan'],
    ['maak_teamdoel', 'ongeldige_titel', 'teamdoel.titel_ongeldig'],
    ['maak_teamdoel', 'ongeldige_beschrijving', 'teamdoel.beschrijving_lang'],
    ['maak_teamdoel', 'ongeldige_streefdatum', 'teamdoel.datum_voorbij'],
    ['maak_teamdoel', 'ongeldige_tekst', 'teamdoel.tekst_ongeldig'],
    ['maak_teamdoel', 'daily_limit', 'teamdoel.daglimiet'],
    ['neem_aandeel', 'niet_toegestaan', 'teamdoel.niet_toegestaan'],
    ['neem_aandeel', 'niet_actief', 'teamdoel.niet_actief'],
    ['neem_aandeel', 'al_aandeel', 'teamdoel.al_aandeel'],
    ['neem_aandeel', 'streefdatum_verstreken', 'teamdoel.streefdatum_verstreken'],
  ];

  async function aanroep(functie: string) {
    return functie === 'maak_teamdoel'
      ? teamdoelen.maakTeamdoel(GROEP, 'Titel', '2026-12-31', '')
      : teamdoelen.neemAandeel(DOEL);
  }

  it.each(gevallen)('%s met reden %s geeft de catalogustekst', async (functie, reden, sleutelnaam) => {
    rpc.mockResolvedValue({ data: { ok: false, reason: reden }, error: null });

    expect(await aanroep(functie)).toEqual({ ok: false, melding: t(sleutelnaam) });
  });

  it('een onbekende reden geeft de terugvaltekst en nooit de rauwe reden', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'iets_nieuws' }, error: null });

    expect(await aanroep('maak_teamdoel')).toEqual({
      ok: false,
      melding: t('teamdoel.aanmaken_mislukt'),
    });
    expect(await aanroep('neem_aandeel')).toEqual({
      ok: false,
      melding: t('teamdoel.aandeel_mislukt'),
    });
  });

  it('een technische fout wordt gemeld en geeft de terugvaltekst', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });

    expect(await aanroep('maak_teamdoel')).toEqual({
      ok: false,
      melding: t('teamdoel.aanmaken_mislukt'),
    });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('maakTeamdoel', () => {
  it('stuurt precies één rpc met de gestrijkte argumenten en geeft de id terug', async () => {
    rpc.mockResolvedValue({ data: { ok: true, team_goal_id: DOEL }, error: null });

    const uitkomst = await teamdoelen.maakTeamdoel(
      GROEP,
      '  Samen de release halen \n',
      '2026-12-31',
      '  Alle mijlpalen af  ',
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('maak_teamdoel', {
      p_group_id: GROEP,
      p_titel: 'Samen de release halen',
      p_streefdatum: '2026-12-31',
      p_beschrijving: 'Alle mijlpalen af',
    });
    expect(from).not.toHaveBeenCalled();
    expect(uitkomst).toEqual({ ok: true, waarde: DOEL });
  });

  it('stuurt niets bij een lege titel, een te lange titel of een onzindatum', async () => {
    const gevallen = [
      teamdoelen.maakTeamdoel(GROEP, '   ', '2026-12-31', ''),
      teamdoelen.maakTeamdoel(GROEP, 'x'.repeat(201), '2026-12-31', ''),
      teamdoelen.maakTeamdoel(GROEP, 'Titel', 'morgen', ''),
      teamdoelen.maakTeamdoel(GROEP, 'Titel', '2026-12-31', 'x'.repeat(2001)),
    ];

    for (const uitkomst of await Promise.all(gevallen)) expect(uitkomst.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('telt codepunten: 200 emoji is een geldige titel', async () => {
    rpc.mockResolvedValue({ data: { ok: true, team_goal_id: DOEL }, error: null });

    const uitkomst = await teamdoelen.maakTeamdoel(GROEP, '😀'.repeat(200), '2026-12-31', '');

    expect(uitkomst.ok).toBe(true);
  });
});

describe('fetchIsTeamgroep', () => {
  it('is waar bij een organisatie en onwaar zonder of zonder groep', async () => {
    for (const [data, verwacht] of [
      [{ organization_id: GROEP }, true],
      [{ organization_id: null }, false],
      [null, false],
    ] as const) {
      from.mockReturnValue(keten(() => ({ data, error: null })).proxy);
      expect(await teamdoelen.fetchIsTeamgroep(GROEP)).toBe(verwacht);
    }
  });
});

describe('V15-A: wat een teamdoel over de tijd zegt (besluit van Quinten, 20-11-2026)', () => {
  const { datumregel, kanAandeelNemen } = teamdoelen;
  const basis = {
    id: DOEL,
    groepId: GROEP,
    titel: 'Nieuwe website live',
    beschrijving: null,
    streefdatum: '2026-11-15',
    status: 'active',
  } as const;

  it('noemt de streefdatum zolang hij nog komt, de dag zelf inbegrepen (zoals mijn_datum() in 0319)', () => {
    expect(datumregel(basis, '2026-11-14' as IsoDate)).toEqual({ soort: 'streefdatum', datum: '2026-11-15' });
    expect(datumregel(basis, '2026-11-15' as IsoDate)).toEqual({ soort: 'streefdatum', datum: '2026-11-15' });
    expect(kanAandeelNemen(basis, '2026-11-15' as IsoDate)).toBe(true);
  });

  it('noemt een verstreken streefdatum nergens: "loopt nog", en geen knop voor een aandeel', () => {
    const regel = datumregel(basis, '2026-11-16' as IsoDate);
    expect(regel).toEqual({ soort: 'loopt_nog' });
    expect(JSON.stringify(regel)).not.toContain('2026-11-15');
    expect(kanAandeelNemen(basis, '2026-11-16' as IsoDate)).toBe(false);
  });

  it('rekent "vandaag" in de tijdzone van de gebruiker: hetzelfde moment, twee antwoorden', () => {
    // 22:30 UTC op de 15e: in Amsterdam 23:30 op de 15e, in Auckland al de 16e.
    const moment = new Date('2026-11-15T22:30:00Z');
    const amsterdam = localDateIn('Europe/Amsterdam' as TimeZone, moment);
    const auckland = localDateIn('Pacific/Auckland' as TimeZone, moment);
    expect(datumregel(basis, amsterdam).soort).toBe('streefdatum');
    expect(datumregel(basis, auckland).soort).toBe('loopt_nog');
  });

  it('zegt bij een afgerond teamdoel "afgerond" en bij een gearchiveerd niets, en biedt geen aandeel', () => {
    expect(datumregel({ ...basis, status: 'completed' }, '2026-11-20' as IsoDate)).toEqual({ soort: 'afgerond' });
    expect(datumregel({ ...basis, status: 'completed' }, '2026-11-01' as IsoDate)).toEqual({ soort: 'afgerond' });
    expect(datumregel({ ...basis, status: 'archived' }, '2026-11-01' as IsoDate)).toEqual({ soort: 'geen' });
    expect(kanAandeelNemen({ ...basis, status: 'completed' }, '2026-11-01' as IsoDate)).toBe(false);
  });

  it('heeft een tekst in de catalogus voor elke regel die iets zegt', () => {
    for (const s of ['teamdoel.loopt_nog', 'teamdoel.afgerond'] as const) {
      expect(t(s as Sleutel)).not.toBe(s);
    }
  });
});
