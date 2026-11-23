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
 * IJKING — met de hand, 23-11-2026 (uitslagen in het beslisdocument; hier de mutatie en de test die omviel):
 *   A  `{...keuzeAria?.aria}` uit `Button` halen        -> alle stappen rood (wat main deed)
 *   B  `Platform.OS === 'web'` -> `false` in `Button`    -> idem
 *   C  `role="radio"` op Held                            -> 'geen radio' rood
 *   D  `role="group"` van Held halen                     -> 'precies één is ingedrukt' rood
 *   E  `aria-pressed` omkeren in `keuzeEigenschappen`    -> Focus, Valkuil, Gevoel, Held, 'niets gekozen' rood
 *   F  `accessibilityState` weg uit `keuzeEigenschappen` -> 'native' rood
 */
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { keuzeEigenschappen } = await import('@/shared/ui/keuze-aria');
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

describe('Held: één van zes, ook een wisselknop, in een groep met een naam', () => {
  const vraag = HELDVRAGEN[0]!;
  const opties = HELDVRAAGOPTIES[vraag];

  it('precies één is ingedrukt en de groep heet naar de vraag', async () => {
    await toon(createElement(Held, { vraag, waarde: opties[1]!, onKies: noop }));
    const pressed = knoppen().map((e) => attr(e, 'aria-pressed'));
    expect(pressed).toEqual(opties.map((_, i) => (i === 1 ? 'true' : 'false')));
    const groep = document.querySelector<HTMLElement>('[role="group"]');
    expect(groep).not.toBeNull();
    expect((attr(groep!, 'aria-label') ?? '').length).toBeGreaterThan(3);
    expect(groep!.querySelectorAll('[aria-pressed]')).toHaveLength(opties.length);
  });

  it('geen radio: die breekt de spatiebalk op web (react-native-web laat spatie alleen door op een knop)', async () => {
    await toon(createElement(Held, { vraag, waarde: opties[0]!, onKies: noop }));
    expect(document.querySelector('[role="radio"], [aria-checked]')).toBeNull();
    expect(knoppen().every((e) => e.tagName === 'BUTTON')).toBe(true);
  });

  it('een tik kiest (de spatiebalk niet te toetsen: jsdom maakt bij een spatie geen klik, een browser wel op een <button>)', async () => {
    const onKies = vi.fn();
    await toon(createElement(Held, { vraag, waarde: null, onKies }));
    await act(async () => knoppen()[2]!.click());
    expect(onKies).toHaveBeenLastCalledWith(opties[2]);
  });
});

describe('native: accessibilityState blijft, zonder aria-* ruis', () => {
  it('gekozen en niet gekozen', () => {
    expect(keuzeEigenschappen(true, false)).toEqual({ state: { selected: true }, aria: {} });
    expect(keuzeEigenschappen(false, false)).toEqual({ state: { selected: false }, aria: {} });
  });
  it('web draagt dezelfde state en daarbij aria-pressed', () => {
    expect(keuzeEigenschappen(true, true)).toEqual({
      state: { selected: true },
      aria: { 'aria-pressed': true },
    });
  });
});
