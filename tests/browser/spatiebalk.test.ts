import { createRequire } from 'node:module';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bundelHarnas } from './bundel';
import { CHROMIUM_VLAGGEN, LETTERTYPE, lettertypeStijl, wachtOpLettertype } from './lettertype';

/**
 * De spatiebalk op een radio, schakelaar en vinkje, in een échte browser — QS8-804.
 *
 * ⚠️ **Waarom een echte browser en geen jsdom.** De belofte is "een spatie activeert de knop en de pagina scrolt
 *    niet". jsdom scrolt niet en maakt van een spatie geen klik; een test daar bewijst alleen dat een handler
 *    bestaat. Hier drukt Playwright de toets in Chromium in, en leest de test `aria-checked`, `scrollY` en een
 *    teller per `onPress` terug.
 *
 * ⚠️ **Zonder Playwright is deze suite ongemeten, niet groen.** `playwright` is geen dependency van dit project
 *    (de cloudsessie heeft hem voorgeïnstalleerd, CI niet). Ontbreekt hij, dan slaat de suite zich over met een
 *    luide melding; met `BROWSER_TEST=1` faalt hij dan, zodat wie beweert te meten niet stil overgeslagen wordt
 *    (zelfde vorm als `stackBeschikbaarOfFaal()`, QS8-270).
 *
 * ⚠️ **De stijlmeting is een momentopname met een vast lettertype** (QS8-811). De breedte van een
 *    `Choice`-knop volgt het lettertype. Zonder geladen lettertype viel dat op elke machine anders uit:
 *    📏 78,09 px in de cloudsessie, 77,27 px op de runner (run 45179652334), en de nachtrun werd rood. Nu
 *    laadt de pagina het lettertype uit `tests/browser/lettertype.ts` en zet het met `!important` op elk
 *    element. Lettergrootte, gewicht en spatiëring blijven van de component, en die zitten in de breedte.
 *    📏 De waarden zijn met dat lettertype gemeten op de componenten van vóór de reparatie (`659d84ab`,
 *    main vóór de merge van 804) en waren gelijk aan die van na de reparatie.
 *
 * IJKING — met de hand, 23-11-2026, één mutatie tegelijk. De uitslag is wat er werkelijk omviel:
 *   zie `docs/decisions/2026-11-23-de-spatiebalk-op-een-rol-die-geen-knop-is.md`, tabel "IJking".
 */

const SPATIE_WACHT_MS = 300;

type Pw = {
  chromium: { launch: (o?: { args?: string[] }) => Promise<Browser> };
};
type Browser = { newPage: () => Promise<Page>; close: () => Promise<void> };
type Page = {
  setContent: (html: string) => Promise<void>;
  addScriptTag: (o: { content: string }) => Promise<unknown>;
  waitForSelector: (s: string) => Promise<unknown>;
  focus: (s: string) => Promise<void>;
  getAttribute: (s: string, naam: string) => Promise<string | null>;
  evaluate: <T, A = undefined>(f: (arg: A) => T, arg?: A) => Promise<Awaited<T>>;
  $$eval: <T>(s: string, f: (els: Element[]) => T) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
  close: () => Promise<void>;
  keyboard: {
    press: (k: string) => Promise<void>;
    down: (k: string) => Promise<void>;
    up: (k: string) => Promise<void>;
  };
};

function laadPlaywright(): Pw | null {
  try {
    return createRequire(import.meta.url)('playwright') as Pw;
  } catch {
    if (process.env.BROWSER_TEST === '1') throw new Error('BROWSER_TEST=1 maar `playwright` is niet te laden');
    console.warn('⚠ tests/browser/spatiebalk: ONGEMETEN — `playwright` is hier niet te laden');
    return null;
  }
}

const pw = laadPlaywright();

const SEL = {
  optieB: '[role=radio]:nth-of-type(2)',
  schakelaar: '[role=switch][aria-label="Schakelaar"]',
  uit: '[role=switch][aria-label="Uitgeschakeld"]',
  cirkel: '[role=checkbox][aria-label^="Afvinken"]',
  bezig: '[role=checkbox][aria-label^="Bezig"]',
} as const;

/** Per knop: welke selector en welke teller in `window.__drukken`. */
const ACTIEF = [
  { naam: 'Choice', sel: SEL.optieB, teller: 'choice' },
  { naam: 'Schakelaar', sel: SEL.schakelaar, teller: 'schakelaar' },
  { naam: 'Afvinkcirkel', sel: SEL.cirkel, teller: 'cirkel' },
] as const;

/** Gemeten vóór de reparatie (stijl-voor, `659d84ab`, met het vaste lettertype), zie de kop. tag | x,y,b,h | display | padding | rand | radius | font | cursor | achtergrond */
const STIJL_VOOR = [
  'Optie A | DIV | 16,44,79.94,40 | flex | 8px 12px | 2px | 8px | 16px Harnaslettertype | pointer | rgb(255, 255, 255)',
  'Optie B | DIV | 102.94,44,77.95,40 | flex | 8px 12px | 1px | 8px | 16px Harnaslettertype | pointer | rgba(0, 0, 0, 0)',
  'Schakelaar | DIV | 16,100,52,30 | flex | 0px | 1px | 999px | 16px Harnaslettertype | pointer | rgb(238, 240, 245)',
  'Uitgeschakeld | DIV | 16,146,52,30 | flex | 0px | 1px | 999px | 16px Harnaslettertype | auto | rgb(238, 240, 245)',
  'Afvinken. Plafond gehaald. | DIV | 16,192,52,52 | flex | 0px | 2px | 999px | 16px Harnaslettertype | pointer | rgba(0, 0, 0, 0)',
  'Bezig. Plafond gehaald. | DIV | 16,260,52,52 | flex | 0px | 2px | 999px | 16px Harnaslettertype | auto | rgba(0, 0, 0, 0)',
];

describe.skipIf(pw === null)('spatiebalk in een echte browser (QS8-804)', () => {
  let script = '';
  let browser: Browser;
  let page: Page;
  let geladen = false;

  const drukken = () => page.evaluate(() => ({ ...(window as unknown as { __drukken: Record<string, number> }).__drukken }));
  const scrollY = () => page.evaluate(() => window.scrollY);
  const druk = async (toets: string) => {
    await page.keyboard.press(toets);
    await page.waitForTimeout(SPATIE_WACHT_MS);
  };

  beforeAll(async () => {
    script = await bundelHarnas('spatiebalk');
    browser = await pw!.chromium.launch({ args: CHROMIUM_VLAGGEN });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head>${lettertypeStijl()}</head><body style="margin:0"><div id="root"></div></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await page.waitForSelector(SEL.schakelaar);
    geladen = await page.evaluate(wachtOpLettertype, LETTERTYPE);
  });

  for (const { naam, sel, teller } of ACTIEF) {
    it(`spatie: ${naam} wisselt van stand, één keer, en de pagina scrolt niet`, async () => {
      const voor = await page.getAttribute(sel, 'aria-checked');
      await page.focus(sel);
      await druk(' ');
      expect(await page.getAttribute(sel, 'aria-checked')).toBe(voor === 'true' ? 'false' : 'true');
      expect((await drukken())[teller]).toBe(1);
      expect(await scrollY()).toBe(0);
    });

    it(`enter: ${naam} wisselt nog steeds, en niet dubbel`, async () => {
      const voor = await page.getAttribute(sel, 'aria-checked');
      await page.focus(sel);
      await druk('Enter');
      expect(await page.getAttribute(sel, 'aria-checked')).toBe(voor === 'true' ? 'false' : 'true');
      expect((await drukken())[teller]).toBe(1);
    });

    it(`ingedrukt gehouden spatie: ${naam} activeert één keer en scrolt niet`, async () => {
      await page.focus(sel);
      await page.keyboard.down(' ');
      await page.keyboard.down(' ');
      await page.keyboard.down(' ');
      await page.keyboard.up(' ');
      await page.waitForTimeout(SPATIE_WACHT_MS);
      expect((await drukken())[teller]).toBe(1);
      expect(await scrollY()).toBe(0);
    });
  }

  it('Ctrl+spatie is een sneltoets en activeert niets', async () => {
    await page.focus(SEL.schakelaar);
    await druk('Control+Space');
    expect((await drukken()).schakelaar).toBe(0);
  });

  it('uitgeschakelde Schakelaar en bezige Afvinkcirkel: spatie activeert niets en scrolt niet', async () => {
    for (const sel of [SEL.uit, SEL.bezig]) {
      await page.focus(sel);
      await druk(' ');
    }
    const n = await drukken();
    expect([n.uit, n.bezig]).toStrictEqual([0, 0]);
    expect(await page.getAttribute(SEL.bezig, 'aria-disabled')).toBe('true');
    expect(await scrollY()).toBe(0);
  });

  it('rol en element blijven: drie rollen, elk een div', async () => {
    const r = await page.$$eval('[role=radio],[role=switch],[role=checkbox]', (els) =>
      els.map((e) => `${e.tagName}:${e.getAttribute('role')}`),
    );
    expect(r).toStrictEqual(['DIV:radio', 'DIV:radio', 'DIV:switch', 'DIV:switch', 'DIV:checkbox', 'DIV:checkbox']);
  });

  it('het vaste lettertype is geladen, anders meet de stijltoets het systeemlettertype', () => {
    expect(geladen).toBe(true);
  });

  it('stijl: tag, bounding box en computed style zijn die van vóór de reparatie', async () => {
    expect(geladen).toBe(true);
    const r = await page.$$eval('[role=radio],[role=switch],[role=checkbox]', (els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        const box = [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100).join(',');
        const kenmerken = [s.display, s.padding, s.borderWidth, s.borderRadius, s.font, s.cursor, s.backgroundColor];
        return [e.getAttribute('aria-label') ?? e.textContent, e.tagName, box, ...kenmerken].join(' | ');
      }),
    );
    expect(r).toStrictEqual(STIJL_VOOR);
  });
});
