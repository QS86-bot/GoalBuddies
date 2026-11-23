// @vitest-environment jsdom
import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STANDAARDTAAL, t, zetTaal, zetTaalUitApparaat } from '@/shared/i18n';

import { routeParams, ruimAllesOp } from './scherm';

/**
 * Een route volgt de taal, ook achter de muur van de navigator — QS8-796.
 *
 * ⚠️ **De naad is niet "rendert de route in de goede taal", maar "rendert hij opnieuw
 *    als de taal verandert terwijl er niets van bovenaf doorkomt".** De navigator
 *    verpakt elke route in een `StaticContainer` die een render van bovenaf
 *    tegenhoudt; daarom staat die hier tussen, de échte uit `expo-router`. Zonder
 *    die muur is elke route in een test vanzelf "goed", en bewaakt de test niets.
 *
 *    F1 (taalbron ↔ kop): een taalwissel moet de titel en het label van de
 *    terugknop van "Taal en tijd" meenemen. F2 (profiel ↔ eerste render): staat
 *    het apparaat op Engels en het profiel op Nederlands, dan moet een direct
 *    geladen route Nederlands worden zodra de échte `ProfielProvider` het profiel
 *    binnen heeft. Alleen de netwerkgrens (`fetchProfiel`) en de sessie zijn
 *    vervangen.
 *
 * IJKING — met de hand, 23-11-2026: `useVolgTaal()` uit
 *    `app/instellingen/[onderdeel].tsx` halen → F1 rood (de titel blijft
 *    "Taal en tijd"); uit `app/groep/nieuw.tsx` halen → F2 rood (de body blijft
 *    Engels). `meldWissel()` in `src/shared/i18n/index.ts` leeg maken → beide rood.
 */

const mocks = vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  return { locale: 'nl' as string | null, laat: null as null | (() => void) };
});

vi.mock('@/modules/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ userId: 'u1', session: { user: { id: 'u1' } }, loading: false }),
}));
vi.mock('@/modules/auth/profile', async (orig) => ({
  ...(await orig<object>()),
  // De netwerkgrens: het profiel komt pas binnen als de test dat zegt, zoals in
  // de browser na de eerste render.
  fetchProfiel: () =>
    new Promise((klaar) => {
      mocks.laat = () => klaar({ id: 'u1', locale: mocks.locale, onboarded_at: '2026-01-01T00:00:00Z' });
    }),
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@/modules/notifications/expo-bron', () => ({ expoPush: {} }));
// Wat de panelen van Instellingen onder jsdom nodig hebben; dezelfde grens als
// `instellingenpanelen.test.ts`.
vi.mock('@/lib/env', async (orig) => ({
  ...(await orig<object>()),
  clientEnv: () => ({ vapidPublicKey: undefined }),
}));
vi.mock('@/modules/auth/useAvatarKeuze', () => ({
  useAvatarKeuze: () => ({ bezig: false, fout: null, kies: async () => {}, weghalen: async () => {} }),
}));

const { StaticContainer } = (await import(
  // De échte muur van de navigator, niet een nagebouwde.
  'expo-router/build/react-navigation/core/StaticContainer'
)) as { StaticContainer: ComponentType<{ name: string; children: ReactNode }> };
const { ProfielProvider } = await import('@/modules/auth/ProfielProvider');
const { UiterlijkProvider } = await import('@/modules/uiterlijk/react');

const wortels: Root[] = [];

/** Rendert een route zoals de navigator dat doet: achter een `StaticContainer`. */
async function achterDeMuur(route: ComponentType, metProfiel = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const houder = document.createElement('div');
  document.body.appendChild(houder);
  const root = createRoot(houder);
  wortels.push(root);
  const muur = createElement(StaticContainer, { name: 'route' }, createElement(route));
  const boom = createElement(UiterlijkProvider, null, metProfiel ? createElement(ProfielProvider, null, muur) : muur);
  await act(async () => root.render(boom));
  await act(async () => {});
  return () => houder.textContent ?? '';
}

afterEach(() => {
  for (const r of wortels.splice(0)) act(() => r.unmount());
  ruimAllesOp();
  zetTaal(STANDAARDTAAL);
  mocks.laat = null;
});

describe('F1 — een taalwissel neemt de kop mee', () => {
  it('de titel en de terugknop van Taal en tijd wisselen zonder herladen', async () => {
    zetTaal('nl');
    routeParams.onderdeel = 'voorkeuren';
    const { default: Onderdeel } = await import('../../app/instellingen/[onderdeel]');
    const tekst = await achterDeMuur(Onderdeel);

    const kopNl = [t('instellingen.voorkeuren_titel'), t('instellingen.titel')];
    for (const stuk of kopNl) expect(tekst()).toContain(stuk);

    await act(async () => {
      zetTaal('en');
    });

    expect(tekst()).toContain(t('instellingen.voorkeuren_titel'));
    expect(tekst()).toContain(t('instellingen.titel'));
    // En de oude taal is echt weg, niet alleen de nieuwe erbij.
    for (const stuk of kopNl) expect(tekst()).not.toContain(stuk);
  });
});

describe('F2 — bij direct laden wint het profiel van het apparaat', () => {
  it('een Engels apparaat met een Nederlands profiel toont Nederlands zodra het profiel er is', async () => {
    zetTaalUitApparaat(['en-US']);
    mocks.locale = 'nl';
    const { default: NieuweGroep } = await import('../../app/groep/nieuw');
    const tekst = await achterDeMuur(NieuweGroep, true);

    // Vóór het profiel: de apparaattaal. Dat is de toegestane tussenstand.
    expect(tekst()).toContain('New group');

    await act(async () => {
      mocks.laat?.();
    });

    expect(tekst()).toContain('Nieuwe groep');
    expect(tekst()).not.toContain('New group');
  });

  it('en andersom: een Nederlands apparaat met een Engels profiel', async () => {
    zetTaalUitApparaat(['nl-NL']);
    mocks.locale = 'en';
    const { default: NieuweGroep } = await import('../../app/groep/nieuw');
    const tekst = await achterDeMuur(NieuweGroep, true);
    expect(tekst()).toContain('Nieuwe groep');

    await act(async () => {
      mocks.laat?.();
    });

    expect(tekst()).toContain('New group');
    expect(tekst()).not.toContain('Nieuwe groep');
  });
});
