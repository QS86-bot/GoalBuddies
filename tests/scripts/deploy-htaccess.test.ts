import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `levend-controle.test.ts`.
import { htaccessInhoud } from '../../scripts/deploy-web.mjs';

/**
 * De `.htaccess` die `npm run deploy` naar Hostinger schrijft.
 *
 * ⚠️ **`docs/DEPLOY.md` stelde twee eisen aan dit bestand en het script kende ze
 *    niet.** Datzelfde document verbiedt om `dist/.htaccess` met de hand bij te
 *    werken, en terecht — hij wordt bij elke deploy opnieuw gegenereerd. Een eis
 *    in een document dat door een generator wordt overschreven is geen eis maar
 *    een wens, en dit is precies de vorm uit onwrikbare regel 18: allebei de
 *    stukken klopten, de naad ertussen was van niemand.
 *
 * ⚠️ Gevonden bij het nameten van QS8-124 en QS8-117 op 25-08-2026, vóór de
 *    eerste echte deploy. Was hij later gevonden, dan had een browser al een
 *    `sw.js` vastgehouden die een jaar geldig was.
 */

const HTACCESS: string = htaccessInhoud(['groep/[id].html', 'doel/[id].html']);

describe('de service worker mag nooit uit de cache komen', () => {
  it('geeft sw.js een no-store', () => {
    // Zonder dit blok valt `sw.js` onder de `.js`-regel hieronder en houdt een
    // browser hem een jaar vast — inclusief de meldingscode van vorige week.
    expect(HTACCESS).toContain('<Files "sw.js">');
    expect(HTACCESS).toMatch(/<Files "sw\.js">[\s\S]*?no-cache, no-store, must-revalidate/);
  });

  it('zet die regel ná de algemene .js-regel, want de laatste wint', () => {
    // ⚠️ Apache past `Header set` in volgorde toe. Staat het `<Files>`-blok
    //    eerder, dan overschrijft `immutable` het alsnog en is de reparatie een
    //    regel tekst zonder werking.
    const algemeen = HTACCESS.indexOf('max-age=31536000');
    const specifiek = HTACCESS.indexOf('<Files "sw.js">');

    expect(algemeen).toBeGreaterThan(-1);
    expect(specifiek).toBeGreaterThan(algemeen);
  });
});

describe('het manifest', () => {
  it('krijgt een content-type dat Safari accepteert', () => {
    // Stuurt Apache `text/plain`, dan negeert Safari het manifest stil — geen
    // "zet op beginscherm", en op iOS dus geen push (QS8-117).
    expect(HTACCESS).toContain('application/manifest+json');
  });
});

describe('wat er al werkte en moet blijven werken', () => {
  it('houdt de HTML uit de cache', () => {
    expect(HTACCESS).toMatch(/<FilesMatch "\\\.html\$">[\s\S]*?no-cache, must-revalidate/);
  });

  it('schrijft een rewrite per dynamische route', () => {
    // Zonder deze regels geeft elke uitnodigingslink een 404.
    expect(HTACCESS).toContain('/groep/[id].html [L]');
    expect(HTACCESS).toContain('/doel/[id].html [L]');
  });

  it('laat een bestaand bestand met rust vóór het naar index.html valt', () => {
    const bestaat = HTACCESS.indexOf('REQUEST_FILENAME} -f');
    const terugval = HTACCESS.indexOf('RewriteRule ^ /index.html');

    expect(bestaat).toBeGreaterThan(-1);
    expect(terugval).toBeGreaterThan(bestaat);
  });
});
