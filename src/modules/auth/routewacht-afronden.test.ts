// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zonderCommentaar } from '../../../scripts/zonder-commentaar.mjs';

import type { Profiel } from './profile';
import { ProfielProvider, useProfiel } from './ProfielProvider';
import type { Bestemming } from './routewacht';
import { useRoutebestemming } from './useRoutebestemming';

/**
 * De naad tussen het profielscherm en de routewacht — QS8-793.
 *
 * ⚠️ **Wat er misging, en waarom de bestaande toetsen groen bleven.**
 *    `routewacht.test.ts` toetst de beslissing per stand, en
 *    `tests/beloftes/onboarding-eindigt-ergens.test.ts` toetst dat de wacht de
 *    vragenlijst met rust laat zodra je er bént. Beide klopten. Wat niemand
 *    toetste is de render daartussen: het scherm zette het afgeronde profiel en
 *    navigeerde daarna, en 📏 op de web-export kwam de navigatie één render ná
 *    het profiel binnen. In die render stond de route nog op `profiel`, zag de
 *    wacht een afgerond profiel, en stuurde naar `/`. 3 van 3 keer.
 *
 * ⚠️ **Daarom houdt deze test de segmenten met opzet op `profiel` nadat het
 *    profiel afgerond is.** Dat is de gemeten vertraging, en de stand waarin de
 *    oude volgorde omviel. Een test die de segmenten tegelijk met het profiel
 *    omzet, is groen op de oude code en bewaakt niets.
 *
 * ⚠️ Echt: `ProfielProvider`, `useRoutebestemming()` en `bestemmingVoor()`.
 *    Vervangen: alleen de netwerkgrens (`fetchProfiel`) en de sessie. `app/_layout.tsx`
 *    en `app/onboarding/profiel.tsx` laden niet onder jsdom (`tests/render/scherm.ts`);
 *    dat de schermen deze twee functies aanroepen, toetst het laatste blok hieronder
 *    in de bron.
 */

const GEBRUIKER = '00000000-0000-4000-8000-000000000793';

// Zoals `tests/render/scherm.ts`: de keten via `lib/supabase` trekt `react-native`
// mee, en dat laadt alleen als `react-native-web`.
const { RN_WEB } = vi.hoisted(() => ({ RN_WEB: 'react-native-web' }));
vi.mock('react-native', async () => await import(/* @vite-ignore */ RN_WEB));

const ANDER = '00000000-0000-4000-8000-000000000794';

const mocks = vi.hoisted(() => ({
  profiel: null as unknown,
  gebruiker: '00000000-0000-4000-8000-000000000793',
}));

vi.mock('./SessionProvider', () => ({
  useSession: () => ({
    session: { user: { id: mocks.gebruiker } },
    userId: mocks.gebruiker,
    loading: false,
  }),
}));

vi.mock('./profile', async () => {
  const echt = await vi.importActual<typeof import('./profile')>('./profile');
  return { ...echt, fetchProfiel: async () => mocks.profiel };
});

vi.mock('../../lib/observability', () => ({ reportError: () => undefined }));

function profiel(onboarded: boolean, id = GEBRUIKER): Profiel {
  return {
    id,
    display_name: 'Nina',
    onboarded_at: onboarded ? '2026-11-23T05:00:00Z' : null,
    locale: null,
  } as unknown as Profiel;
}

type Context = ReturnType<typeof useProfiel>;

let segmenten: readonly string[];
let bestemmingen: Bestemming[];
/** Wat de probe in zijn laatste render zag; een houder, want render mag geen variabele toewijzen. */
const gezien = {} as { context: Context };
let root: Root;

function Probe() {
  const context = useProfiel();
  useEffect(() => {
    gezien.context = context;
  });
  bestemmingen.push(useRoutebestemming(segmenten));
  return null;
}

async function render() {
  await act(async () => root.render(createElement(ProfielProvider, null, createElement(Probe))));
  await act(async () => {});
}

/** De route verandert: wat `useSegments()` na een navigatie teruggeeft. */
async function naar(...nieuw: string[]) {
  segmenten = nieuw;
  await render();
}

const laatste = () => bestemmingen[bestemmingen.length - 1];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.gebruiker = GEBRUIKER;
  bestemmingen = [];
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('een nieuw account na Klaar op het profiel', () => {
  beforeEach(async () => {
    mocks.profiel = profiel(false);
    segmenten = ['onboarding', 'profiel'];
    await render();
  });

  it('staat vóór Klaar op het profielscherm zonder dat de wacht iets doet', () => {
    expect(laatste()).toBeNull();
  });

  /**
   * ⚠️ De kern. Na `zetAfgerondProfiel()` mag er geen enkele render zijn waarin de
   *    wacht naar `/` stuurt, ook niet terwijl de route nog op `profiel` staat.
   */
  it('gaat naar de vragenlijst, ook terwijl de route nog op profiel staat', async () => {
    const vanaf = bestemmingen.length;
    await act(async () => gezien.context.zetAfgerondProfiel(profiel(true)));

    const erna = bestemmingen.slice(vanaf);
    expect(erna).not.toContain('/');
    expect(laatste()).toBe('/onboarding/vragenlijst');
  });

  it('blijft daarna op de vragenlijst staan, en ruimt de vlag op', async () => {
    await act(async () => gezien.context.zetAfgerondProfiel(profiel(true)));
    await naar('onboarding', 'vragenlijst');

    expect(laatste()).toBeNull();
    expect(gezien.context.netAfgerond).toBe(false);
  });

  /** Criterium 2: wie de vragenlijst gezien heeft, krijgt hem niet nog eens. */
  it('stuurt na de vragenlijst niet opnieuw naar de vragenlijst', async () => {
    await act(async () => gezien.context.zetAfgerondProfiel(profiel(true)));
    await naar('onboarding', 'vragenlijst');
    await naar('onboarding', 'profiel');

    expect(laatste()).toBe('/');
  });

  /**
   * ⚠️ Wie met een openstaande uitnodiging of werkcode afrondt, wordt door een andere
   *    wacht de onboarding uit gestuurd en ziet de vragenlijst niet. Dan mag de vlag
   *    niet blijven hangen (code-critic QS8-793).
   */
  it('ruimt de vlag op als een andere wacht de gebruiker de onboarding uit stuurt', async () => {
    await act(async () => gezien.context.zetAfgerondProfiel(profiel(true)));
    await naar('organisatie', 'deelnemen');
    expect(gezien.context.netAfgerond).toBe(false);

    await naar('onboarding', 'profiel');
    expect(laatste()).toBe('/');
  });

  /** De kop van `ProfielProvider` belooft dat de vlag niet naar een volgend account lekt. */
  it('geeft de vlag niet door aan een ander account op hetzelfde apparaat', async () => {
    await act(async () => gezien.context.zetAfgerondProfiel(profiel(true)));
    mocks.gebruiker = ANDER;
    mocks.profiel = profiel(true, ANDER);
    await render();

    expect(gezien.context.netAfgerond).toBe(false);
    expect(laatste()).toBe('/');
  });

  /**
   * ⚠️ **De oude volgorde, en waarom die stuk was.** `zetProfiel()` alleen zet geen
   *    vlag; met de route nog op `profiel` stuurt de wacht dan naar `/`. Dat is
   *    precies wat de web-export liet zien. Dit geval staat er zodat de reden voor
   *    `zetAfgerondProfiel()` getoetst is en niet alleen beschreven.
   */
  it('met alleen zetProfiel() stuurt de wacht naar Vandaag, zoals vóór QS8-793', async () => {
    await act(async () => gezien.context.zetProfiel(profiel(true)));
    expect(laatste()).toBe('/');
  });
});

/** Criterium 2: een bestaand account werkt zoals voorheen. */
describe('een bestaand account, in een nieuwe sessie', () => {
  beforeEach(() => {
    mocks.profiel = profiel(true);
  });

  it('wordt van het profielscherm naar Vandaag gestuurd, niet naar de vragenlijst', async () => {
    await naar('onboarding', 'profiel');
    expect(laatste()).toBe('/');
    expect(bestemmingen).not.toContain('/onboarding/vragenlijst');
  });

  it('wordt op Vandaag met rust gelaten', async () => {
    await naar('(tabs)');
    expect(laatste()).toBeNull();
  });

  it('mag de vragenlijst zelf nog openen (QS8-266)', async () => {
    await naar('onboarding', 'vragenlijst');
    expect(laatste()).toBeNull();
  });
});

/**
 * ⚠️ **De andere helft van de naad: dat de schermen deze twee functies ook
 *    gebruiken.** De twee bestanden laden niet onder jsdom, dus hier in de bron.
 *    Commentaar eruit, anders telt de uitleg die de oude volgorde beschrijft mee.
 */
describe('de schermen gebruiken deze naad', () => {
  const WORTEL = join(__dirname, '..', '..', '..');
  const code = (pad: string) => zonderCommentaar(readFileSync(join(WORTEL, pad), 'utf8'));

  /**
   * ⚠️ Alleen het stuk ná `rondOnboardingAf()` tot het einde van `bewaar()`: daar
   *    racete de oude navigatie. Een terechte link elders op het scherm hoort deze
   *    toets niet rood te maken.
   */
  it('het profielscherm rondt af met zetAfgerondProfiel() en navigeert daarna niet zelf', () => {
    const bron = code('app/onboarding/profiel.tsx');
    const begin = bron.indexOf('await rondOnboardingAf(');
    const eind = bron.indexOf('return (', begin);
    expect(begin, 'rondOnboardingAf() niet gevonden in het profielscherm').toBeGreaterThan(-1);
    const naAfronden = bron.slice(begin, eind);

    expect(naAfronden).toContain('zetAfgerondProfiel(afgerond.profiel)');
    expect(naAfronden).not.toContain('zetProfiel(afgerond.profiel)');
    expect(naAfronden).not.toMatch(/router\.(replace|push|navigate)\(/);
  });

  it('de routewacht in de layout leest useRoutebestemming()', () => {
    expect(code('app/_layout.tsx')).toMatch(/useRoutebestemming\(\s*segments/);
  });
});
