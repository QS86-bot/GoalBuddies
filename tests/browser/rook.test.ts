import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM_VLAGGEN } from './lettertype';

/**
 * Rooktest van de browserbaan: start Chromium, drukt een spatie en ziet de klik. QS8-808.
 *
 * ⚠️ **Wat deze test bewaakt, is de baan en niet een component.** Hij bewijst dat
 *    `.github/workflows/browsertest.yml` een browser installeert die Playwright kan starten, en dat
 *    de groep `browser` in `vitest.config.mts` iets draait. De belofte van QS8-804 (de spatiebalk
 *    op een radio, schakelaar en vinkje) toetst de spatiebalktest van dat issue, in deze map.
 *
 * ⚠️ **Waarom een `<button>` en een spatie.** Dit is het kleinste geval waarin een echte browser
 *    iets doet wat jsdom niet doet: bij een spatie op een gefocuste knop maakt Chromium een klik,
 *    en jsdom niet. Wordt deze test groen in jsdom, dan meet hij niets meer.
 *
 * ⚠️ **Zonder Playwright is deze test ongemeten en niet groen.** Met `BROWSER_TEST=1`, zoals in
 *    `npm run test:browser` en in de workflow, faalt hij dan. Zonder die variabele slaat hij zich
 *    luid over. Dat is dezelfde vorm als in de spatiebalktest van QS8-804 en `stackBeschikbaarOfFaal()`
 *    (QS8-270).
 *
 * IJKING: met de hand, 23-11-2026. Zie `docs/decisions/2026-11-23-de-echte-browsertest-draait-s-nachts.md`,
 *   tabel "IJking".
 */

type Pagina = {
  setContent: (html: string) => Promise<void>;
  focus: (sel: string) => Promise<void>;
  keyboard: { press: (toets: string) => Promise<void> };
  evaluate: <T>(f: () => T) => Promise<T>;
};
type Browser = { newPage: () => Promise<Pagina>; close: () => Promise<void> };
type Pw = { chromium: { launch: (o?: { args?: string[] }) => Promise<Browser> } };

function laadPlaywright(): Pw | null {
  try {
    return createRequire(import.meta.url)('playwright') as Pw;
  } catch (fout) {
    if (process.env.BROWSER_TEST === '1') {
      throw new Error('BROWSER_TEST=1 maar `playwright` is niet te laden', { cause: fout });
    }
    console.warn('⚠ tests/browser/rook: ONGEMETEN, `playwright` is hier niet te laden');
    return null;
  }
}

const pw = laadPlaywright();

describe.skipIf(pw === null)('de browserbaan', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await pw!.chromium.launch({ args: CHROMIUM_VLAGGEN });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('een spatie op een gefocuste knop is in Chromium een klik', async () => {
    const pagina = await browser.newPage();
    await pagina.setContent(
      '<button id="k" onclick="window.__kliks = (window.__kliks || 0) + 1">Knop</button>',
    );
    await pagina.focus('#k');
    await pagina.keyboard.press('Space');
    const kliks = await pagina.evaluate(() => (window as unknown as { __kliks?: number }).__kliks ?? 0);
    expect(kliks).toBe(1);
  });
});
