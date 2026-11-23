// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from './scherm';

/**
 * De spatiebalk op een radio, schakelaar en vinkje — QS8-804, de helft die in CI draait.
 *
 * ⚠️ **Dit is niet de belofte zelf.** jsdom scrolt niet en maakt van een spatie geen klik; of de pagina stil
 *    blijft staan en de stand echt wisselt, toetst `tests/browser/spatiebalk.test.ts` in Chromium. Wat hier wél
 *    te toetsen is: de helper los (ook de vormen die hij met rust moet laten), en dat elk van de drie
 *    componenten hem draagt op het element dat de rol heeft. Dat laatste is de naad tussen helper en component,
 *    en die draait zo ook op een machine zonder browser.
 *
 * IJKING: zie `docs/decisions/2026-11-23-de-spatiebalk-op-een-rol-die-geen-knop-is.md`, tabel "IJking".
 */
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { isSpatie, spatieActiveert } = await import('@/shared/ui/keuze-aria');
const { Choice, Schakelaar, Afvinkcirkel } = await import('@/shared/ui');

afterEach(() => ruimAllesOp());

function aanslag(key: string, extra: Record<string, unknown> = {}) {
  return { key, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
}

describe('helper: spatieActiveert', () => {
  it('op native: niets', () => {
    expect(spatieActiveert(vi.fn(), false, false)).toStrictEqual({});
  });

  it('spatie: activeert één keer en houdt de pagina stil', () => {
    const onPress = vi.fn();
    const e = aanslag(' ');
    spatieActiveert(onPress, false, true).onKeyDown!(e);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('Enter en andere toetsen: met rust gelaten (react-native-web doet Enter zelf)', () => {
    const onPress = vi.fn();
    for (const key of ['Enter', 'a', 'Tab', 'ArrowDown']) {
      const e = aanslag(key);
      spatieActiveert(onPress, false, true).onKeyDown!(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(onPress).not.toHaveBeenCalled();
  });

  it('herhaling en uitgeschakeld: geen activering, wel geen scroll', () => {
    const onPress = vi.fn();
    const herhaald = aanslag(' ', { repeat: true });
    spatieActiveert(onPress, false, true).onKeyDown!(herhaald);
    const uit = aanslag(' ');
    spatieActiveert(onPress, true, true).onKeyDown!(uit);
    expect(onPress).not.toHaveBeenCalled();
    expect([herhaald.preventDefault, uit.preventDefault].map((f) => f.mock.calls.length)).toStrictEqual([1, 1]);
  });

  it('isSpatie: Spacebar en Shift wel; Ctrl, Alt, Meta en IME niet', () => {
    const ja = [aanslag(' '), aanslag('Spacebar'), aanslag(' ', { shiftKey: true })];
    const nee = [
      aanslag(' ', { ctrlKey: true }),
      aanslag(' ', { altKey: true }),
      aanslag(' ', { metaKey: true }),
      aanslag(' ', { nativeEvent: { isComposing: true } }),
      aanslag('Enter'),
    ];
    expect(ja.map(isSpatie)).toStrictEqual([true, true, true]);
    expect(nee.map(isSpatie)).toStrictEqual([false, false, false, false, false]);
  });
});

/** Een spatie als echte DOM-keydown op het element met de rol; React levert hem aan de `onKeyDown` van de Pressable. */
async function spatieOp(sel: string): Promise<KeyboardEvent> {
  const doel = document.querySelector<HTMLElement>(sel);
  expect(doel).not.toBeNull();
  const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  await act(async () => {
    doel!.dispatchEvent(e);
  });
  return e;
}

describe('componenten dragen de helper', () => {
  it('Choice: spatie kiest die optie', async () => {
    const onKies = vi.fn();
    const opties = [
      { waarde: 'a', label: 'A' },
      { waarde: 'b', label: 'B' },
    ];
    await renderScherm(() => createElement(Choice<string>, { label: 'K', opties, waarde: 'a', onKies }));
    const e = await spatieOp('[role=radio]:nth-of-type(2)');
    expect(onKies.mock.calls).toStrictEqual([['b']]);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Schakelaar: spatie meldt de wens, uitgeschakeld niet', async () => {
    const aan = vi.fn();
    const uit = vi.fn();
    await renderScherm(() => createElement(Schakelaar, { aan: false, onPress: aan, label: 'S' }));
    await renderScherm(() => createElement(Schakelaar, { aan: false, onPress: uit, label: 'U', disabled: true }));
    await spatieOp('[role=switch][aria-label="S"]');
    await spatieOp('[role=switch][aria-label="U"]');
    expect([aan.mock.calls.length, uit.mock.calls.length]).toStrictEqual([1, 0]);
  });

  it('Afvinkcirkel: spatie vinkt af, bezig niet', async () => {
    const vrij = vi.fn();
    const bezig = vi.fn();
    const basis = { niveau: 'ceiling' as const, vandaagAfgevinkt: false };
    await renderScherm(() => createElement(Afvinkcirkel, { ...basis, label: 'V', onPress: vrij }));
    await renderScherm(() => createElement(Afvinkcirkel, { ...basis, label: 'B', onPress: bezig, busy: true }));
    await spatieOp('[role=checkbox][aria-label^="V."]');
    await spatieOp('[role=checkbox][aria-label^="B."]');
    expect([vrij.mock.calls.length, bezig.mock.calls.length]).toStrictEqual([1, 0]);
  });
});
