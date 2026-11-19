// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Resultaat } from '../../shared/api';

import type { ToetredenUitvoer } from './uitnodiging-toetreden';
import { useAutomatischToetreden } from './useAutomatischToetreden';

/**
 * De naad van QS8-712/714: het effect dat na aanmelden vanzelf toetreedt, gerenderd
 * zoals het scherm het rendert. `verwerkToetreding()` heeft zijn eigen toetsen; wat
 * hier bewaakt wordt is dat een wisselende dep terwijl `neemDeel` loopt de uitkomst
 * niet meer wegneemt — en dat een tweede effectronde niet nog een keer toetreedt.
 */

type Props = Parameters<typeof useAutomatischToetreden>[0];

function Probe(props: Props) {
  useAutomatischToetreden(props);
  return null;
}

function uitgesteld() {
  let los!: (u: Resultaat<string>) => void;
  let af!: (e: Error) => void;
  const belofte = new Promise<Resultaat<string>>((a, b) => {
    los = a;
    af = b;
  });
  return { belofte, los, af };
}

function nieuweUitvoer(): { uit: ToetredenUitvoer; gebeurd: string[] } {
  const gebeurd: string[] = [];
  const uit: ToetredenUitvoer = {
    gemount: () => true,
    onboarded: () => true,
    vergeetCode: () => gebeurd.push('vergeet'),
    zetFout: (m) => gebeurd.push(`fout:${m}`),
    zetBinnen: (id) => gebeurd.push(`binnen:${id}`),
    naarGroep: (id) => gebeurd.push(`groep:${id}`),
  };
  return { uit, gebeurd };
}

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

function render(props: Props) {
  act(() => root.render(createElement(Probe, props)));
}

const basis = { sessieLaadt: false, code: 'ABC123', magToetreden: true };

describe('useAutomatischToetreden', () => {
  it('treedt toe zodra er een sessie verschijnt die er bij binnenkomst niet was', async () => {
    const { uit, gebeurd } = nieuweUitvoer();
    const toetreden = vi.fn().mockResolvedValue({ ok: true, waarde: 'g-1' });

    render({ ...basis, ingelogd: false, magToetreden: false, uitvoer: uit, toetreden });
    render({ ...basis, ingelogd: true, uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).toHaveBeenCalledTimes(1);
    expect(toetreden).toHaveBeenCalledWith('ABC123');
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1', 'groep:g-1']);
  });

  // ⚠️ Elke dep die in productie echt kan wisselen terwijl `neemDeel` loopt, apart:
  //    de opruimfunctie van een effect draait bij ÉLKE wisseling, dus een test die er
  //    maar één wisselt is blind voor dezelfde fout met die ene dep uit de lijst
  //    gehaald. `uitvoer` is in het scherm bovendien stabiel (`useMemo` op `[router]`).
  //    `magToetreden` wordt onwaar zodra het lidmaatschap binnen is, `sessieLaadt`
  //    kan tijdens een token-verversing weer even waar zijn, en `code` kan wisselen.
  const wissels: readonly [string, (p: Props, u: ToetredenUitvoer) => Props][] = [
    ['uitvoer', (p, u) => ({ ...p, uitvoer: u })],
    ['magToetreden', (p) => ({ ...p, magToetreden: false })],
    ['sessieLaadt', (p) => ({ ...p, sessieLaadt: true })],
    ['code', (p) => ({ ...p, code: 'ANDERE1' })],
    ['toetreden', (p) => ({ ...p, toetreden: vi.fn() })],
  ];

  it.each(wissels)(
    'een wisselende %s terwijl neemDeel loopt neemt de uitkomst niet weg',
    async (_naam, wissel) => {
      const eerste = nieuweUitvoer();
      const tweede = nieuweUitvoer();
      const wacht = uitgesteld();
      const toetreden = vi.fn().mockReturnValue(wacht.belofte);
      const begin: Props = { ...basis, ingelogd: true, uitvoer: eerste.uit, toetreden };

      render({ ...begin, ingelogd: false, magToetreden: false });
      render(begin);
      render(wissel(begin, tweede.uit));

      await act(async () => wacht.los({ ok: true, waarde: 'g-1' }));

      expect(toetreden).toHaveBeenCalledTimes(1);
      expect(eerste.gebeurd).toEqual(['vergeet', 'binnen:g-1', 'groep:g-1']);
    },
  );

  it('zonder sessie treedt niets toe, ook niet als de rest zegt dat het mag', async () => {
    const { uit } = nieuweUitvoer();
    const toetreden = vi.fn();

    render({ ...basis, ingelogd: false, uitvoer: uit, toetreden });
    render({ ...basis, ingelogd: false, uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).not.toHaveBeenCalled();
  });

  it('een tweede effectronde na afloop treedt niet nog een keer toe', async () => {
    const { uit } = nieuweUitvoer();
    const toetreden = vi.fn().mockResolvedValue({ ok: true, waarde: 'g-1' });

    render({ ...basis, ingelogd: false, magToetreden: false, uitvoer: uit, toetreden });
    render({ ...basis, ingelogd: true, uitvoer: uit, toetreden });
    await act(async () => {});
    render({ ...basis, ingelogd: true, code: 'ANDERE1', uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).toHaveBeenCalledTimes(1);
  });

  it('wie al ingelogd was bij binnenkomst treedt niet vanzelf toe', async () => {
    const { uit, gebeurd } = nieuweUitvoer();
    const toetreden = vi.fn();

    render({ ...basis, ingelogd: true, uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).not.toHaveBeenCalled();
    expect(gebeurd).toEqual([]);
  });

  it('een sessie die na het laden al bleek te bestaan is een koude start en geen aanmelding', async () => {
    const { uit } = nieuweUitvoer();
    const toetreden = vi.fn();

    render({ ...basis, sessieLaadt: true, ingelogd: false, uitvoer: uit, toetreden });
    render({ ...basis, sessieLaadt: false, ingelogd: true, uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).not.toHaveBeenCalled();
  });

  it('zolang magToetreden onwaar is (lid, ongeldig, nog laden) treedt niets toe', async () => {
    const { uit } = nieuweUitvoer();
    const toetreden = vi.fn();

    render({ ...basis, ingelogd: false, magToetreden: false, uitvoer: uit, toetreden });
    render({ ...basis, ingelogd: true, magToetreden: false, uitvoer: uit, toetreden });
    await act(async () => {});

    expect(toetreden).not.toHaveBeenCalled();
  });

  it('een mislukte aanroep toont de melding, maar alleen als het scherm er nog is', async () => {
    const { uit, gebeurd } = nieuweUitvoer();
    const weg = nieuweUitvoer();
    const weg2: ToetredenUitvoer = { ...weg.uit, gemount: () => false };
    const wacht = uitgesteld();
    const toetreden = vi.fn().mockReturnValue(wacht.belofte);

    render({ ...basis, ingelogd: false, magToetreden: false, uitvoer: uit, toetreden });
    render({ ...basis, ingelogd: true, uitvoer: uit, toetreden });
    await act(async () => wacht.af(new Error('netwerk')));
    expect(gebeurd.some((g) => g.startsWith('fout:'))).toBe(true);

    const wacht2 = uitgesteld();
    const toetreden2 = vi.fn().mockReturnValue(wacht2.belofte);
    act(() => root.unmount());
    root = createRoot(container);
    render({
      ...basis,
      ingelogd: false,
      magToetreden: false,
      uitvoer: weg2,
      toetreden: toetreden2,
    });
    render({ ...basis, ingelogd: true, uitvoer: weg2, toetreden: toetreden2 });
    await act(async () => wacht2.af(new Error('netwerk')));
    expect(weg.gebeurd).toEqual([]);
  });
});
