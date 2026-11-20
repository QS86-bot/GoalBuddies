// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, ruimAllesOp } from './scherm';

/**
 * De panelen van Instellingen, gerenderd zoals een gebruiker ze op een breed scherm ziet — QS8-754 AC4.
 *
 * ⚠️ **AC4 is de belofte dat een paneel nooit een leeg of wit vlak toont:** wachten op het profiel laat de
 *    laadstaat zien, een mislukte lading de foutstaat met een herstelknop, en een ontbrekend profiel de lege staat.
 *    `AsyncView` levert ze alle drie; deze test toetst dat elk paneel ze ook echt door `AsyncView` laat lopen.
 *    Uiterlijk wacht met opzet niet op het profiel (de keuze leeft op het apparaat) en heeft dus geen drie staten.
 *
 * IJKING — met de hand, 20-11-2026: de `AsyncView` uit `ProfielPaneel` halen -> rood op alle drie de staten.
 */

const mocks = vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  return { profiel: undefined as unknown, loading: false, error: null as unknown, herlaad: vi.fn() };
});

vi.mock('@/modules/notifications/expo-bron', () => ({ expoPush: {} }));
vi.mock('@/lib/env', async (orig) => ({
  ...(await orig<object>()),
  clientEnv: () => ({ vapidPublicKey: undefined }),
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@/modules/auth/useAvatarKeuze', () => ({
  useAvatarKeuze: () => ({ bezig: false, fout: null, kies: async () => {}, weghalen: async () => {} }),
}));
vi.mock('@/modules/auth', async (orig) => ({
  ...(await orig<object>()),
  useProfiel: () => ({
    profiel: mocks.profiel,
    loading: mocks.loading,
    error: mocks.error,
    zetProfiel: () => {},
    herlaad: mocks.herlaad,
  }),
}));
vi.mock('@/modules/buddies', async (orig) => ({
  ...(await orig<object>()),
  fetchBlokkades: async () => [],
  deblokkeer: async () => {},
}));
vi.mock('@/modules/completions', async (orig) => ({
  ...(await orig<object>()),
  fetchBuddyBijdrage: async () => null,
}));
vi.mock('@/modules/organisaties', async (orig) => ({
  ...(await orig<object>()),
  fetchMijnOrganisaties: async () => [],
}));
vi.mock('@/shared/ui/Button', async (orig) => {
  const m = await orig<typeof import('@/shared/ui/Button')>();
  return {
    ...m,
    Button: (props: { variant?: string }) =>
      createElement(
        'span',
        { 'data-variant': props.variant ?? 'secundair' },
        createElement(m.Button, props as never),
      ),
  };
});

const { Instellingenscherm } = await import('@/schermen/instellingen/Instellingenscherm');
const { UiterlijkProvider } = await import('@/modules/uiterlijk/react');
const { ONDERDEEL_IDS } = await import('@/schermen/instellingen/onderdelen');

const PROFIEL = {
  id: 'u1',
  display_name: 'Jan',
  avatar_url: null,
  locale: 'nl',
  tz: 'Europe/Amsterdam',
  week_start_day: 1,
  reminder_enabled: false,
  reminder_time: '09:00',
  reminder_tone: 'gentle',
  notify_approval_received: true,
  notify_approval_request: true,
  notify_commitment_witness: true,
  notify_cycle_summary: true,
  quiet_from: null,
  quiet_to: null,
  vindbaar: false,
  share_moves_by_default: false,
  platform_beheerder: false,
  onboarded_at: '2026-01-01',
  feeling_own: null,
};

/** Alle panelen die op het profiel wachten; Uiterlijk niet (zie boven). */
const MET_PROFIEL = ONDERDEEL_IDS.filter((id) => id !== 'uiterlijk');

/** Met de echte `UiterlijkProvider`: het paneel Uiterlijk leest zijn keuze uit de context, net als in de app. */
const toon = (id: string) =>
  renderScherm(() =>
    createElement(UiterlijkProvider, null, createElement(Instellingenscherm, { onderdeel: id })),
  );

beforeEach(() => {
  mocks.profiel = PROFIEL;
  mocks.loading = false;
  mocks.error = null;
  mocks.herlaad.mockReset();
});
afterEach(ruimAllesOp);

describe('Instellingen: elk paneel kent zijn drie staten (QS8-754 AC4)', () => {
  it.each(MET_PROFIEL)('%s: laden toont de laadstaat en geen inhoud', async (id) => {
    mocks.profiel = undefined;
    mocks.loading = true;
    await toon(id);
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(t('laden.mislukt'));
  });

  it.each(MET_PROFIEL)('%s: een fout toont de foutstaat met een werkende herstelknop', async (id) => {
    mocks.profiel = undefined;
    mocks.error = new Error('postgres: duplicate key value violates "geheim"');
    const s = await toon(id);
    expect(s.tekst()).toContain(t('laden.mislukt'));
    // Nooit de rauwe foutmelding (regel 16, AsyncView).
    expect(s.tekst()).not.toContain('geheim');
    await s.klik(t('laden.opnieuw'));
    expect(mocks.herlaad).toHaveBeenCalledTimes(1);
  });

  it.each(MET_PROFIEL)('%s: een ontbrekend profiel toont de lege staat', async (id) => {
    mocks.profiel = undefined;
    const s = await toon(id);
    expect(s.tekst()).toContain(t('profiel.leeg_titel'));
    expect(s.tekst()).toContain(t('profiel.leeg_tekst'));
  });

  it('uiterlijk wacht niet op het profiel: ook zonder profiel en met een fout staat het paneel er', async () => {
    mocks.profiel = undefined;
    mocks.error = new Error('netwerk');
    const s = await toon('uiterlijk');
    expect(s.tekst()).not.toContain(t('laden.mislukt'));
    expect(s.tekst()).toContain(t('instellingen.uiterlijk_titel'));
  });
});
