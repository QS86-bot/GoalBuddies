// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, ruimAllesOp } from './scherm';

/**
 * De stip op de tab Profiel — QS8-777 (besluit Quinten 20-11-2026, optie A).
 *
 * ⚠️ **De belofte is dat de stip alleen verschijnt als er een melding wacht, en alleen op Profiel.** Een stip op
 *    een ander tabblad wijst de beheerder de verkeerde kant op; een stip zonder melding is een valse alarmmelding
 *    voor iedereen. Gemeten aan wat een schermlezer te horen krijgt (het label van de link), want de stip zelf is
 *    verborgen voor hulpmiddelen.
 *
 * IJKING — met de hand, 20-11-2026:
 *   A  `stip={meldingWacht && tab.sleutel === 'tab.profiel'}` -> `stip={meldingWacht}` -> rood: 'alleen op Profiel'
 *   B  `zetMeldingWacht(false)` laten staan op `true` in de store -> rood: 'zonder melding'
 *   D  `stip={meldingWacht}` van `MenuKop` weghalen -> rood: 'dicht menu'
 *   C  het label zonder `tab.melding_wacht` -> rood: 'met een melding'
 */
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { UiterlijkProvider } = await import('@/modules/uiterlijk/react');
const { Taakbalk, zetMeldingWacht } = await import('@/shared/ui');

const toon = () =>
  renderScherm(() => createElement(UiterlijkProvider, null, createElement(Taakbalk)));
/** Smal is het menu dicht; een tik op de kop opent het (dat is ook wat een gebruiker doet). */
const opendMenu = async () => {
  const kop = document.querySelector<HTMLElement>('button[aria-expanded]');
  if (kop?.getAttribute('aria-expanded') === 'false') await act(async () => kop.click());
};
const links = () => [...document.querySelectorAll<HTMLElement>('a, [role="link"]')];
const labelsMetMelding = () =>
  links().filter((e) => (e.getAttribute('aria-label') ?? '').includes(t('tab.melding_wacht')));

afterEach(() => {
  act(() => zetMeldingWacht(false));
  ruimAllesOp();
});

describe('Taakbalk: de stip op Profiel', () => {
  it('zonder melding heeft geen enkel tabblad hem', async () => {
    await toon();
    await opendMenu();
    expect(links().length).toBeGreaterThanOrEqual(5);
    expect(labelsMetMelding()).toHaveLength(0);
  });

  it('met een melding heeft alleen Profiel hem, en het label zegt het', async () => {
    await toon();
    await act(async () => zetMeldingWacht(true));
    await opendMenu();
    const metStip = labelsMetMelding();
    expect(metStip).toHaveLength(1);
    expect(metStip[0]?.getAttribute('aria-label')).toBe(`${t('tab.profiel')}, ${t('tab.melding_wacht')}`);
  });

  it('dicht menu: de kop zelf zegt het, want daar kijkt de beheerder als eerste', async () => {
    await toon();
    const kop = () => document.querySelector<HTMLElement>('button[aria-expanded]');
    expect(kop()?.getAttribute('aria-label')).not.toContain(t('tab.melding_wacht'));
    await act(async () => zetMeldingWacht(true));
    expect(kop()?.getAttribute('aria-label')).toContain(t('tab.melding_wacht'));
  });

  it('en hij gaat weer uit als de melding is afgehandeld', async () => {
    await toon();
    await act(async () => zetMeldingWacht(true));
    await opendMenu();
    expect(labelsMetMelding()).toHaveLength(1);
    await act(async () => zetMeldingWacht(false));
    expect(labelsMetMelding()).toHaveLength(0);
  });
});
