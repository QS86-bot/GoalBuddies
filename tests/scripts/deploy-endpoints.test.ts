import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const SCRIPT = join(WORTEL, 'scripts', 'deploy-web.mjs');

/**
 * De deploy bouwt zijn eigen API-URL niet — QS8-504.
 *
 * ⚠️ **Waarom dit een belofte is en geen netheid.** Op 16-09-2026 herstructureerde
 *    Hostinger zijn API en gaven twee routes 404. Het script had die twee URL's
 *    elk apart en voluit opgeschreven, dus het waren twee losse reparaties —
 *    precies de vorm die CLAUDE.md bij `psqlArgumenten()` beschrijft als *zesmaal
 *    dezelfde vergeten vlag*. Eén constante voor de basis maakt van een derde
 *    route geen derde plek die kan afdrijven.
 *
 * ⚠️ **Wat dit níet toetst, en dat is de eerlijke helft:** of de routes kloppen.
 *    Dat is alleen te weten door te deployen. De vormen hier komen uit een deploy
 *    die daadwerkelijk slaagde, niet uit een gelezen spec — de sessie die ze
 *    schreef kon `developers.hostinger.com` niet bereiken. Deze grendel bewaakt
 *    dus dat ze niet stilletjes terugvallen, niet dat ze juist zijn.
 */

/** De routes die op 16-09-2026 aantoonbaar 404 gaven. */
const VERDWENEN = [
  { vorm: /\/upload-url\b/, was: 'websites/{user}/{domein}/upload-url' },
  { vorm: /\bstatic-deploy\b/, was: 'websites/{user}/{domein}/static-deploy' },
] as const;

describe('de deploy roept de Hostinger-API aan via één basis', () => {
  it('vindt het script — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(SCRIPT),
      'scripts/deploy-web.mjs is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  it('heeft precies één plek waar de basis-URL staat', () => {
    const bron = readFileSync(SCRIPT, 'utf8');
    const voluit = bron.match(/https:\/\/developers\.hostinger\.com/g) ?? [];

    expect(
      voluit.length,
      `de basis-URL staat ${voluit.length}× voluit in het script; één constante, anders drijft de volgende route los af`,
    ).toBe(1);
  });

  it.each(VERDWENEN)('roept $was niet meer aan', ({ vorm, was }) => {
    // ⚠️ Op de kale bron en niet op commentaar-vrije: de uitleg hierboven en in
    //    het script nóemt deze namen met opzet, en een grendel die daarop afgaat
    //    zou zijn eigen documentatie verbieden. Vandaar een patroon dat alleen
    //    op een echte padcomponent past — een `/upload-url` of een los woord
    //    `static-deploy` in prozatekst staat er niet zo.
    const bron = readFileSync(SCRIPT, 'utf8');
    const code = bron
      .split('\n')
      .filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r) && !/^\s*#/.test(r))
      .join('\n');

    expect(vorm.test(code), `${was} gaf 404 op 16-09-2026 en staat weer in de code`).toBe(false);
  });

  /**
   * ⚠️ De must-allow-helft. Zonder deze toets is alles hierboven te bevredigen
   *    door de twee aanroepen wég te halen, en dan deployt er niets meer.
   */
  it('roept allebei de vervangende routes wél aan', () => {
    const bron = readFileSync(SCRIPT, 'utf8');

    expect(bron, 'geen upload-urls-aanroep meer').toMatch(/\$\{API\}\/files\/upload-urls/);
    expect(bron, 'geen deploy-aanroep meer').toMatch(/\$\{API\}\/accounts\/\$\{[^}]+\}\/websites\//);
  });
});
