// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from './scherm';

/**
 * Een gekozen keuzeknop zegt het tegen een schermlezer — QS8-794.
 *
 * ⚠️ **De belofte is wat er in de DOM staat, niet wat er in de props staat.** react-native-web 0.21 negeert
 *    `accessibilityState`; `Button` zette alleen dat, dus een test op de props bleef groen terwijl een
 *    schermlezer nooit hoorde wat gekozen was. Daarom leest deze test `document`, via de echte vragenstappen
 *    (Focus, Valkuil, Gevoel, Held) en niet via een losse `Button`: ook de keuze welke vorm waar hoort is de belofte.
 *
 * IJKING — met de hand, 23-11-2026, één mutatie per grendel, en gelezen welke test omviel:
 *   A  `{...keuzeAria?.aria}` uit `Button` halen        -> 6 van 7 rood (wat main deed): alle vier de stappen
 *   B  `Platform.OS === 'web'` -> `false` in `Button`    -> 6 van 7 rood, zelfde zes als A
 *   C  Held terug naar `vorm: 'wissel'`                  -> 2 rood: 'één radio is gechecked…' en 'een tik kiest…'
 *   D  `role="radiogroup"` van Held halen                -> 1 rood: 'één radio is gechecked…' (alleen de groepsregel)
 *   E  `aria-pressed` omkeren in `keuzeEigenschappen`    -> 4 rood: Focus, Valkuil, Gevoel en 'niets gekozen'
 *   Schoon: 7 van 7 groen. 'zonder antwoord is geen enkele radio gechecked' viel bij geen mutatie om en dekt
 *   alleen de omkering van `aria-checked`, die niet apart geijkt is.
 */
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { UiterlijkProvider } = await import('@/modules/uiterlijk/react');
const { Focus } = await import('@/schermen/vragenlijst/vragen/Focus');
const { Valkuil } = await import('@/schermen/vragenlijst/vragen/Valkuil');
const { Gevoel } = await import('@/schermen/vragenlijst/vragen/Gevoel');
const { Held } = await import('@/schermen/vragenlijst/vragen/Held');
const { HELDVRAGEN, HELDVRAAGOPTIES } = await import('@/modules/helden');
const { CATEGORIE_GROEPEN } = await import('@/modules/goals');

const toon = (kind: ReturnType<typeof createElement>) =>
  renderScherm(() => createElement(UiterlijkProvider, null, kind));
const knoppen = () => [...document.querySelectorAll<HTMLElement>('button, [role="radio"]')];
const attr = (e: HTMLElement, naam: string) => e.getAttribute(naam);
const noop = () => {};

afterEach(() => ruimAllesOp());

describe('wisselknoppen: aria-pressed op web', () => {
  it('Focus: de gekozen gebieden zijn ingedrukt, de rest niet', async () => {
    await toon(createElement(Focus, { gekozen: [CATEGORIE_GROEPEN[0]!.leden[0]!], onWissel: noop }));
    const pressed = knoppen().map((e) => attr(e, 'aria-pressed'));
    expect(pressed.filter((p) => p === 'true')).toHaveLength(1);
    expect(pressed.filter((p) => p === 'false').length).toBeGreaterThan(3);
    expect(pressed.includes(null)).toBe(false);
    expect(knoppen().some((e) => attr(e, 'role') === 'radio')).toBe(false);
  });

  it('Valkuil: meer antwoorden tegelijk, dus een wisselknop per antwoord', async () => {
    await toon(createElement(Valkuil, { gekozen: ['forget', 'motivation_drops'], onWissel: noop }));
    const pressed = knoppen().map((e) => attr(e, 'aria-pressed'));
    expect(pressed.filter((p) => p === 'true')).toHaveLength(2);
    expect(pressed.includes(null)).toBe(false);
  });

  it('Gevoel: een tweede tik haalt de keuze weg, dus een wisselknop en geen radio', async () => {
    await toon(
      createElement(Gevoel, { gevoel: 'calm', eigen: null, onKies: noop, onEigen: noop }),
    );
    const keuzes = knoppen().filter((e) => attr(e, 'aria-pressed') !== null);
    expect(keuzes.length).toBeGreaterThanOrEqual(5);
    expect(keuzes.filter((e) => attr(e, 'aria-pressed') === 'true')).toHaveLength(1);
    expect(knoppen().some((e) => attr(e, 'role') === 'radio')).toBe(false);
  });

  it('niets gekozen: alles expliciet false, geen ontbrekend attribuut', async () => {
    await toon(createElement(Focus, { gekozen: [], onWissel: noop }));
    expect(knoppen().every((e) => attr(e, 'aria-pressed') === 'false')).toBe(true);
  });
});

describe('Held is een radiogroep: role=radio met aria-checked', () => {
  const vraag = HELDVRAGEN[0]!;
  const opties = HELDVRAAGOPTIES[vraag];

  it('één radio is gechecked, de rest niet, en ze staan in een radiogroup met een naam', async () => {
    await toon(createElement(Held, { vraag, waarde: opties[1]!, onKies: noop }));
    const radios = [...document.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios).toHaveLength(opties.length);
    expect(radios.map((e) => attr(e, 'aria-checked'))).toEqual(
      opties.map((_, i) => (i === 1 ? 'true' : 'false')),
    );
    const groep = document.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(groep).not.toBeNull();
    expect((attr(groep!, 'aria-label') ?? '').length).toBeGreaterThan(3);
    expect(groep!.querySelectorAll('[role="radio"]')).toHaveLength(opties.length);
    expect(radios.some((e) => attr(e, 'aria-pressed') !== null)).toBe(false);
  });

  it('zonder antwoord is geen enkele radio gechecked', async () => {
    await toon(createElement(Held, { vraag, waarde: null, onKies: noop }));
    const radios = [...document.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.every((e) => attr(e, 'aria-checked') === 'false')).toBe(true);
  });

  it('een tik kiest nog steeds (de rol verandert het gedrag niet)', async () => {
    const onKies = vi.fn();
    await toon(createElement(Held, { vraag, waarde: null, onKies }));
    await act(async () => document.querySelectorAll<HTMLElement>('[role="radio"]')[2]!.click());
    expect(onKies).toHaveBeenCalledWith(opties[2]);
  });
});
