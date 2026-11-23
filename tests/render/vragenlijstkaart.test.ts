// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, router, ruimAllesOp } from './scherm';

/**
 * De kaart "Zodat de app je kent" op Vandaag — QS8-805, besluit Quinten (variant B).
 *
 * ⚠️ **De belofte is het geheel, en daarom rendert deze test het echte component met de
 *    echte opslag** (een `Map` in plaats van AsyncStorage) en de echte
 *    `heeftVragenlijstAntwoord()`. Alleen sessie en profiel zijn vervangen. De grens die
 *    de orchestrator vroeg te toetsen: 0 antwoorden geeft een kaart, 1 antwoord niet.
 */

const A = '00000000-0000-4000-8000-0000000008a5';
const B = '00000000-0000-4000-8000-0000000008b5';

const mocks = vi.hoisted(() => ({
  userId: '' as string,
  profiel: null as Record<string, unknown> | null,
  opslag: new Map<string, string>(),
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

vi.mock('@/modules/auth', () => ({
  useSession: () => ({ userId: mocks.userId, session: { user: { id: mocks.userId } }, loading: false }),
  useProfiel: () => ({ profiel: mocks.profiel }),
}));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const { Vragenlijstkaart } = await import('@/schermen/vandaag/Vragenlijstkaart');

/** Een profiel zonder een enkel vragenlijstantwoord, zoals een nieuw account dat oversloeg. */
function leeg(id: string): Record<string, unknown> {
  return {
    id,
    focus_areas: [],
    minutes_per_day: null,
    when_i_do_it: null,
    what_breaks_it: [],
    feeling: null,
    feeling_own: null,
  };
}

const toon = () => renderScherm(() => createElement(Vragenlijstkaart));
const titel = () => t('vandaag.vragenlijst_kaart_titel');

beforeEach(() => {
  mocks.opslag.clear();
  mocks.userId = A;
  mocks.profiel = leeg(A);
});

afterEach(() => {
  ruimAllesOp();
});

describe('de vragenlijstkaart op Vandaag', () => {
  it('staat er bij 0 antwoorden, en de knop opent de vragenlijst', async () => {
    const s = await toon();
    expect(s.tekst()).toContain(titel());

    await s.klik(t('vandaag.vragenlijst_kaart_knop'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/vragenlijst');
  });

  /** Eén antwoord, op welke van de vijf vragen ook, is genoeg om de kaart weg te laten. */
  it.each([
    ['focus', { focus_areas: ['fitness'] }],
    ['tijd', { minutes_per_day: 15 }],
    ['moment', { when_i_do_it: 'evening' }],
    ['valkuil', { what_breaks_it: ['forget'] }],
    ['gevoel', { feeling: 'calm' }],
    ['eigen gevoel', { feeling_own: 'Rustig' }],
  ])('staat er niet bij 1 antwoord (%s)', async (_naam, antwoord) => {
    mocks.profiel = { ...leeg(A), ...antwoord };
    const s = await toon();
    expect(s.tekst()).not.toContain(titel());
  });

  it('een eigen gevoel van alleen spaties is geen antwoord', async () => {
    mocks.profiel = { ...leeg(A), feeling_own: '   ' };
    const s = await toon();
    expect(s.tekst()).toContain(titel());
  });

  it('is weg na Niet nu, ook na een nieuwe start op dit apparaat', async () => {
    const s = await toon();
    await s.klik(t('vandaag.vragenlijst_kaart_niet_nu'));
    expect(s.tekst()).not.toContain(titel());

    ruimAllesOp();
    const opnieuw = await toon();
    expect(opnieuw.tekst()).not.toContain(titel());
  });

  it('Niet nu van het ene account geldt niet voor een ander account op hetzelfde apparaat', async () => {
    const s = await toon();
    await s.klik(t('vandaag.vragenlijst_kaart_niet_nu'));
    ruimAllesOp();

    mocks.userId = B;
    mocks.profiel = leeg(B);
    const ander = await toon();
    expect(ander.tekst()).toContain(titel());
  });

  it('zonder profiel nog niets', async () => {
    mocks.profiel = null;
    const s = await toon();
    expect(s.tekst()).toBe('');
  });
});
