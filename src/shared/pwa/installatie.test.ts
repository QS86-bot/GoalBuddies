import { describe, expect, it } from 'vitest';

import { installatieadvies, type Omgeving } from './installatie';

/**
 * De drie voorwaarden uit QS8-117, elk met hun tegenhanger. Een test die alleen
 * "wordt getoond" bewijst niets — het risico zit in de gevallen waar hij níét
 * getoond mag worden.
 */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/604.1';
const IPAD_OS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC_SAFARI = IPAD_OS;
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

const basis: Omgeving = {
  userAgent: IPHONE_SAFARI,
  navigatorStandalone: false,
  displayModeStandalone: false,
  maxTouchPoints: 5,
};

describe('installatieadvies — waar het wél hoort', () => {
  it('legt op iPhone in Safari het beginscherm uit', () => {
    expect(installatieadvies(basis)).toBe('toon-beginscherm-uitleg');
  });

  /**
   * ⚠️ Een iPad meldt zich sinds iPadOS 13 als Macintosh. Zonder de controle op
   *    aanraakpunten valt elke iPad buiten de detectie en hoort de eigenaar
   *    nooit waarom hij geen meldingen krijgt.
   */
  it('herkent een iPad die zich als Macintosh voordoet', () => {
    expect(installatieadvies({ ...basis, userAgent: IPAD_OS, maxTouchPoints: 5 })).toBe(
      'toon-beginscherm-uitleg',
    );
  });

  it('stuurt Chrome op iOS door naar Safari', () => {
    expect(installatieadvies({ ...basis, userAgent: IPHONE_CHROME })).toBe('toon-open-in-safari');
  });

  it('stuurt Firefox op iOS door naar Safari', () => {
    expect(installatieadvies({ ...basis, userAgent: IPHONE_FIREFOX })).toBe('toon-open-in-safari');
  });
});

describe('installatieadvies — waar het níét hoort', () => {
  /**
   * ⚠️ De duurste fout van de drie: een Android-gebruiker uitleg geven over een
   *    deelmenu dat hij niet heeft.
   */
  it('zwijgt op Android', () => {
    expect(installatieadvies({ ...basis, userAgent: ANDROID_CHROME })).toBe('verbergen');
  });

  it('zwijgt op een gewone Mac zonder aanraakscherm', () => {
    expect(installatieadvies({ ...basis, userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(
      'verbergen',
    );
  });

  it('zwijgt zodra de app al vanaf het beginscherm draait', () => {
    expect(installatieadvies({ ...basis, navigatorStandalone: true })).toBe('verbergen');
  });

  it('zwijgt ook als alleen de media query standalone meldt', () => {
    expect(installatieadvies({ ...basis, displayModeStandalone: true })).toBe('verbergen');
  });

  it('zwijgt in Chrome op iOS zodra die zelfstandig draait', () => {
    expect(
      installatieadvies({ ...basis, userAgent: IPHONE_CHROME, navigatorStandalone: true }),
    ).toBe('verbergen');
  });

  /** `navigator.standalone` bestaat niet buiten iOS; undefined is geen ja. */
  it('leest een ontbrekende navigator.standalone niet als geïnstalleerd', () => {
    expect(installatieadvies({ ...basis, navigatorStandalone: undefined })).toBe(
      'toon-beginscherm-uitleg',
    );
  });
});
