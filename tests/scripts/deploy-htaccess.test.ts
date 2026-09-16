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
    //
    // ⚠️⚠️ **Niet `indexOf('<Files \"sw.js\">')`, en dat is sinds QS8-504 het
    //    verschil tussen meten en gokken.** Er zijn nu twee blokken met die
    //    naam — één voor de cache, één voor het content-type — en `indexOf`
    //    pakt het eerste dat langskomt. Die toets zou dus stil van blok kunnen
    //    wisselen zodra iemand de volgorde verzet, en dan bewaakt hij iets
    //    anders dan zijn naam zegt. Zoek daarom het blok aan zijn ínhoud.
    //
    // 📏 **Gemeten, niet aangenomen.** Met de oude assertie en het ForceType-blok
    //    vóór het cacheblok wordt deze toets **rood** — op een verplaatsing die
    //    niets kapotmaakt, want `ForceType` en `Header set` zijn verschillende
    //    directives en hun onderlinge volgorde is geen belofte. Een vals alarm
    //    dus, en in de spiegelstand een vals groen: `indexOf` meet wie er
    //    toevallig eerst staat, niet wie de toets bedoelt. Met de vorm hieronder
    //    blijft hij groen op die verplaatsing en rood zodra het cacheblok
    //    daadwerkelijk boven de algemene regel belandt.
    const algemeen = HTACCESS.indexOf('max-age=31536000');
    const cacheblok = HTACCESS.search(
      /<Files "sw\.js">\s*\n\s*Header set Cache-Control "no-cache, no-store, must-revalidate"/,
    );

    expect(algemeen, 'geen algemene .js-cacheregel meer').toBeGreaterThan(-1);
    expect(cacheblok, 'geen <Files "sw.js"> met een Cache-Control erin').toBeGreaterThan(-1);
    expect(cacheblok).toBeGreaterThan(algemeen);
  });
});

/**
 * De service worker moet als JavaScript binnenkomen — QS8-504.
 *
 * ⚠️ **Gemeten bij de echte deploy van 16-09-2026.** Hostinger levert `.js` als
 *    `application/x-javascript`, en daar registreert geen enkele browser een
 *    service worker op. `pwa:controle` keurde dat af en de deploy liep vast.
 *
 * ⚠️ **Dit is niet hetzelfde als het cacheblok hierboven**, ook al heten de
 *    `<Files>`-blokken gelijk. Dat gaat over hóelang de browser hem vasthoudt,
 *    dit over wát hij denkt dat het is. Een service worker die een jaar
 *    gecachet wordt is oud; een service worker met het verkeerde content-type
 *    bestaat niet — er is geen push, geen offline, niets.
 */
describe('de service worker komt binnen als JavaScript', () => {
  it('zet het type voor .js en .mjs', () => {
    expect(HTACCESS).toMatch(/AddType\s+text\/javascript\s+\.js\s+\.mjs/);
  });

  it('forceert het op sw.js, ook als een AddType overruled wordt', () => {
    // Een `AddType` is te overrulen door een hogere .htaccess of een
    // servermapping; dit is het ene bestand waarvoor dat niet mag misgaan.
    expect(HTACCESS).toMatch(
      /<Files "sw\.js">\s*\n\s*ForceType\s+text\/javascript\s*\n\s*<\/Files>/,
    );
  });

  /**
   * ⚠️ De must-allow-helft: het cacheblok mag hier niet door verdwijnen. Twee
   *    blokken met dezelfde naam is precies de vorm waarin er per ongeluk één
   *    overblijft — en dan is de reparatie van vandaag de regressie van morgen.
   */
  it('laat het cacheblok van sw.js staan', () => {
    expect(HTACCESS).toMatch(
      /<Files "sw\.js">\s*\n\s*Header set Cache-Control "no-cache, no-store, must-revalidate"/,
    );
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
