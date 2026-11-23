// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProfielProvider,
  useProfiel,
  useRoutebestemming,
  type Bestemming,
  type Profiel,
} from '@/modules/auth';
import {
  bewaarOpenstaandeUitnodiging,
  bewaarToegetredenGroep,
  maakToetredenSlot,
  toegetredenGroep,
  toetredenMetSlot,
} from '@/modules/buddies';
import { bewaarWerkcode } from '@/modules/organisaties';
import { freezeNow, unfreezeNow } from '@/shared/time';

import { afrondenMetInstap } from './instap';
import { useInstapwacht } from './useInstapwacht';

/**
 * De naad tussen Klaar op het profiel, de routewacht en de instapwacht — QS8-805.
 *
 * ⚠️ **Wat hier getoetst wordt is het geheel, niet een onderdeel.** `instapNa()` kan
 *    kloppen, de wacht kan kloppen en de routewacht kan kloppen, terwijl de gebruiker
 *    toch eerst op de vragenlijst en dan op de groep belandt. 📏 Dat is gemeten op de
 *    web-export met alleen QS8-793: `/onboarding/vragenlijst` en 0,1 s later
 *    `/groep/…`. Per geval legt deze test vast wélke bestemmingen de routewacht gaf en
 *    wélke navigaties de instapwacht deed, en dus of de vragenlijst ooit in beeld kwam.
 *
 * ⚠️ Echt: `ProfielProvider`, `useRoutebestemming()`, `useInstapwacht()`,
 *    `afrondenMetInstap()`, de opslag (`pending.ts` van buddies en organisaties) en
 *    `verwerkToetreding()`. Vervangen: AsyncStorage (een `Map`), de sessie,
 *    `fetchProfiel`, en de twee netwerkaanroepen `neemDeel` en `fetchUitnodiging`.
 *
 * ⚠️ De segmenten blijven op `onboarding/profiel` na Klaar, zoals in
 *    `src/modules/auth/routewacht-afronden.test.ts`: de gemeten vertraging.
 */

const GEBRUIKER = '00000000-0000-4000-8000-000000000805';
const ANDER = '00000000-0000-4000-8000-000000000806';
const CODE = 'VYHC2X9GSRVH';
const WERKCODE = 'AWAYSSRXQ9RM';
const GROEP = 'e621c795-b576-4fcd-ac51-efcc96c135dc';

const { RN_WEB } = vi.hoisted(() => ({ RN_WEB: 'react-native-web' }));
vi.mock('react-native', async () => await import(/* @vite-ignore */ RN_WEB));

const mocks = vi.hoisted(() => ({
  profiel: null as unknown,
  opslag: new Map<string, string>(),
  zichtbaarheid: 'beschermd' as 'beschermd' | 'open',
  neemDeel: [] as string[],
  fetchUitnodiging: [] as string[],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (s: string) => Promise.resolve(mocks.opslag.get(s) ?? null),
    setItem: (s: string, w: string) => {
      mocks.opslag.set(s, w);
      return Promise.resolve();
    },
    removeItem: (s: string) => {
      mocks.opslag.delete(s);
      return Promise.resolve();
    },
  },
}));

vi.mock('@/modules/auth/SessionProvider', () => ({
  useSession: () => ({
    session: { user: { id: '00000000-0000-4000-8000-000000000805' } },
    userId: '00000000-0000-4000-8000-000000000805',
    loading: false,
  }),
}));

vi.mock('@/modules/auth/profile', async () => {
  const echt = await vi.importActual<typeof import('@/modules/auth/profile')>('@/modules/auth/profile');
  return { ...echt, fetchProfiel: async () => mocks.profiel };
});

vi.mock('@/modules/buddies/api', async () => {
  const echt = await vi.importActual<typeof import('@/modules/buddies/api')>('@/modules/buddies/api');
  return {
    ...echt,
    neemDeel: async (code: string) => {
      mocks.neemDeel.push(code);
      return { ok: true, waarde: GROEP };
    },
    fetchUitnodiging: async (code: string) => {
      mocks.fetchUitnodiging.push(code);
      return { group_id: GROEP, zichtbaarheid: mocks.zichtbaarheid };
    },
  };
});

vi.mock('@/lib/observability', () => ({ reportError: () => undefined }));

function profiel(onboarded: boolean): Profiel {
  return {
    id: GEBRUIKER,
    display_name: 'Nina',
    onboarded_at: onboarded ? '2026-11-23T07:00:00Z' : null,
    locale: null,
  } as unknown as Profiel;
}

type Context = ReturnType<typeof useProfiel>;

let bestemmingen: Bestemming[];
let navigaties: string[];
const gezien = {} as { context: Context };
let root: Root;

const naar = (pad: string) => navigaties.push(pad);
/** Bij `true` krijgt de wacht elke render een nieuwe `naar`: een nieuwe effectronde. */
let onstabiel = false;

function Probe() {
  const context = useProfiel();
  useEffect(() => {
    gezien.context = context;
  });
  bestemmingen.push(useRoutebestemming(['onboarding', 'profiel']));
  useInstapwacht(onstabiel ? (pad: string) => naar(pad) : naar);
  return null;
}

async function render() {
  await act(async () => root.render(createElement(ProfielProvider, null, createElement(Probe))));
  await act(async () => {});
}

/** Klaar op het profiel: wat `app/onboarding/profiel.tsx` na `rondOnboardingAf()` doet. */
async function klaar() {
  mocks.profiel = profiel(true);
  await act(async () => afrondenMetInstap(profiel(true), gezien.context.zetAfgerondProfiel));
  for (let i = 0; i < 5; i++) await act(async () => {});
}

/** Wat de gebruiker te zien kreeg: kwam de vragenlijst in beeld, en waar eindigde hij? */
function uitkomst() {
  return {
    vragenlijst: bestemmingen.includes('/onboarding/vragenlijst'),
    laatsteNavigatie: navigaties[navigaties.length - 1] ?? null,
    vlag: gezien.context.netAfgerond,
  };
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.opslag.clear();
  mocks.neemDeel = [];
  mocks.fetchUitnodiging = [];
  mocks.zichtbaarheid = 'beschermd';
  mocks.profiel = profiel(false);
  bestemmingen = [];
  navigaties = [];
  onstabiel = false;
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  unfreezeNow();
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('na Klaar op het profiel — QS8-805', () => {
  it('een gewone aanmelding gaat naar de vragenlijst, en de instapwacht doet niets', async () => {
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: true, laatsteNavigatie: null, vlag: true });
  });

  it('een uitnodiging voor een beschermde groep gaat naar de groep, nooit naar de vragenlijst', async () => {
    await bewaarOpenstaandeUitnodiging(CODE);
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: false, laatsteNavigatie: `/groep/${GROEP}`, vlag: false });
    expect(mocks.neemDeel).toEqual([CODE]);
  });

  it('een uitnodiging voor een open groep toont het uitnodigingsscherm en treedt niet vanzelf toe (A49)', async () => {
    mocks.zichtbaarheid = 'open';
    await bewaarOpenstaandeUitnodiging(CODE);
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: false, laatsteNavigatie: `/uitnodiging/${CODE}`, vlag: false });
    expect(mocks.neemDeel).toEqual([]);
  });

  it('een verlopen uitnodiging toont het uitnodigingsscherm, zonder ophalen en zonder toetreden (A49)', async () => {
    freezeNow(new Date('2026-11-20T07:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);
    freezeNow(new Date('2026-11-23T07:00:00Z'));
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: false, laatsteNavigatie: `/uitnodiging/${CODE}`, vlag: false });
    expect(mocks.fetchUitnodiging).toEqual([]);
    expect(mocks.neemDeel).toEqual([]);
  });

  it('een werkcode gaat naar het lid-worden-scherm, nooit naar de vragenlijst', async () => {
    expect(await bewaarWerkcode(WERKCODE)).toBe(true);
    await render();
    await klaar();

    expect(uitkomst()).toEqual({
      vragenlijst: false,
      laatsteNavigatie: `/organisatie/deelnemen?code=${WERKCODE}`,
      vlag: false,
    });
  });

  /**
   * ⚠️ De bijvangst. Zonder e-mailbevestiging trad het uitnodigingsscherm al toe vóór
   *    de onboarding en wiste het de code; 📏 op de web-export landde zo iemand na
   *    Klaar nooit op zijn groep. Hier loopt de échte `verwerkToetreding()` met de
   *    échte opslag, zoals `app/uitnodiging/[code].tsx` hem invult.
   */
  it('wie al vóór de onboarding toetrad, landt na Klaar op zijn groep, en de opslag is daarna leeg', async () => {
    await toetredenMetSlot(CODE, {
      slot: maakToetredenSlot(() => undefined),
      toetreden: async () => ({ ok: true, waarde: GROEP }),
      uitvoer: {
        gemount: () => true,
        onboarded: () => false,
        vergeetCode: () => undefined,
        onthoudGroep: (id) => void bewaarToegetredenGroep(GEBRUIKER, id),
        zetFout: () => undefined,
        zetBinnen: () => undefined,
        naarGroep: () => {
          throw new Error('zonder onboarding hoort het scherm niet te navigeren');
        },
      },
    });
    await act(async () => {});

    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: false, laatsteNavigatie: `/groep/${GROEP}`, vlag: false });
    expect(await toegetredenGroep(GEBRUIKER)).toBeNull();
    expect(mocks.neemDeel).toEqual([]);
  });

  it('een toegetreden groep van een ander account op dit apparaat telt niet: gewone aanmelding', async () => {
    await bewaarToegetredenGroep(ANDER, GROEP);
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: true, laatsteNavigatie: null, vlag: true });
  });

  it('een toegetreden groep van meer dan 24 uur geleden telt niet: gewone aanmelding', async () => {
    freezeNow(new Date('2026-11-21T07:00:00Z'));
    await bewaarToegetredenGroep(GEBRUIKER, GROEP);
    freezeNow(new Date('2026-11-23T07:00:00Z'));
    await render();
    await klaar();

    expect(uitkomst()).toEqual({ vragenlijst: true, laatsteNavigatie: null, vlag: true });
  });

  /**
   * Elke toetreding kost een poging uit de twintig per dag; de wacht probeert één keer
   * per start. ⚠️ Een nieuwe effectronde is hier het gevaar, niet een herlaad van het
   * profiel (dat zet `loading` niet terug). Een `naar` die elke render een nieuwe
   * functie is, geeft die rondes — en zonder de poging-ref treedt hij dan opnieuw toe.
   */
  it('treedt één keer toe, ook bij een nieuwe effectronde in dezelfde start', async () => {
    await bewaarOpenstaandeUitnodiging(CODE);
    await render();
    await klaar();
    expect(mocks.neemDeel).toEqual([CODE]);

    await bewaarOpenstaandeUitnodiging(CODE);
    onstabiel = true;
    await render();
    await render();
    for (let i = 0; i < 3; i++) await act(async () => {});

    expect(mocks.neemDeel).toEqual([CODE]);
  });
});
