import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eisEenNeutralePrerender } from '../../scripts/deploy-web.mjs';
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * `npm run deploy` weigert een prerender met tekst — QS8-742.
 *
 * ⚠️ **De belofte is "wat live gaat heeft een neutrale prerender".** De CI draait de
 *    controle niet (die bouwt niet), dus het enige pad waar de fout ontstaat — de
 *    bouwmachine van Quinten met zijn `LANG` — moet de controle zelf dragen. De
 *    functie staat onder toets in `prerender-controle.test.ts`; hier de aansluiting:
 *    de deploy roept hem aan, vóór er iets geüpload wordt, en breekt af.
 *
 * ⚠️ `main()` in `deploy-web.mjs` is niet te voeden zonder Hostinger en een build. De
 *    stap zelf (`eisEenNeutralePrerender`) draait hier tegen een echte map; dat hij in
 *    `main()` staat en vóór het uploaden, wordt uit de bron gelezen (met de gedeelde
 *    commentaarknip). Dat het in een echte deploy werkt, is **niet** gemeten:
 *    `npm run deploy:droog` draait de stap, maar die vraagt de bouw en `.env`.
 *
 * IJKING QS8-767 — met de hand, 20-11-2026: `kanarieFaalt(lees)` uit
 *   `eisEenNeutralePrerender` halen -> rood: 'een kapotte zoekfunctie laat de stap
 *   falen' en 'de kanarie gaat af vóór …'.
 *
 * IJKING — met de hand, 19-11-2026, vooraf en achteraf 7 groen:
 *
 *   A  de aanroep `eisEenNeutralePrerender()` uit `main()` halen
 *      -> rood: 'de deploy roept de prerender-controle aan'
 *   B  de aanroep ná `stuurSourceMapsNaarSentry` zetten
 *      -> rood: 'de controle draait vóór er iets geüpload wordt'
 *   C  `fail(` uit `eisEenNeutralePrerender` halen
 *      -> rood: 'een bezwaar breekt de deploy af' en 'tekst in een pagina laat de stap falen'
 */

const bron = zonderCommentaar(readFileSync(join(__dirname, '..', '..', 'scripts', 'deploy-web.mjs'), 'utf8'));
const main = bron.slice(bron.indexOf('async function main()'));
const functie = bron.slice(
  bron.indexOf('function eisEenNeutralePrerender('),
  bron.indexOf('function eisEenSchoneBundel()'),
);

describe('de deploy en de prerender-controle', () => {
  it('de deploy leest de pagina’s en de bezwaren uit prerender-controle.mjs', () => {
    expect(bron).toMatch(/from '\.\/prerender-controle\.mjs'/);
    expect(functie).toContain('prerenderBezwaren(leesPaginas(map), lees)');
    expect(bron).toContain('kanarieFaalt');
  });

  it('de deploy roept de prerender-controle aan', () => {
    expect(main).toContain('eisEenNeutralePrerender()');
  });

  it('de controle draait vóór er iets geüpload wordt', () => {
    const controle = main.indexOf('eisEenNeutralePrerender()');
    expect(controle).toBeGreaterThan(-1);
    for (const later of ['stuurSourceMapsNaarSentry(', 'pakIn(', 'upload(']) {
      const plek = main.indexOf(later);
      expect(plek, `${later} hoort in main() te staan`).toBeGreaterThan(-1);
      expect(controle, `de controle hoort vóór ${later}`).toBeLessThan(plek);
    }
  });

  it('een bezwaar breekt de deploy af', () => {
    expect(functie).toMatch(/if \(afwijkend\.length === 0\) \{[\s\S]*?return;[\s\S]*?\}\s*fail\(/);
  });
});

describe('de stap zelf, tegen een echte map', () => {
  let map: string;
  const pagina = (body: string) => `<html><head></head><body>${body}</body></html>`;

  beforeEach(() => {
    map = mkdtempSync(join(tmpdir(), 'deploy-prerender-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(map, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const schrijf = (pad: string, html: string) => {
    const delen = pad.split('/');
    if (delen.length > 1) mkdirSync(join(map, ...delen.slice(0, -1)), { recursive: true });
    writeFileSync(join(map, pad), html);
  };

  it('een export zonder tekst laat de deploy door', () => {
    schrijf('index.html', pagina('<div id="root"></div>'));
    schrijf('aanmelden.html', pagina('<div id="root"></div>'));
    expect(() => eisEenNeutralePrerender(map)).not.toThrow();
  });

  it('tekst in een pagina laat de stap falen, met de pagina en de tekst in de melding', () => {
    schrijf('index.html', pagina('<div id="root"></div>'));
    schrijf('aanmelden.html', pagina('<p>Welcome back</p>'));
    expect(() => eisEenNeutralePrerender(map)).toThrow(/prerender/i);
    const uit = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(uit).toContain('aanmelden.html');
    expect(uit).toContain('Welcome back');
    expect(uit).toContain('Er is niets geüpload');
  });

  it('een kapotte zoekfunctie laat de stap falen, ook op een export zonder tekst (QS8-767)', () => {
    // ⚠️ Zonder kanarie meldt een `zichtbareTekst()` die altijd '' geeft overal
    //    "geen tekst": groen op precies het pad dat in productie meet.
    schrijf('index.html', pagina('<div id="root"></div>'));
    schrijf('aanmelden.html', pagina('<div id="root"></div>'));
    expect(() => eisEenNeutralePrerender(map, () => '')).toThrow(/prerender/i);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('Er is niets geüpload');
  });

  it('de kanarie gaat af vóór er pagina’s gelezen worden', () => {
    expect(functie.indexOf('kanarieFaalt(')).toBeGreaterThan(-1);
    expect(functie.indexOf('kanarieFaalt(')).toBeLessThan(functie.indexOf('leesPaginas('));
  });

  it('een onvolledige export (geen index.html) laat de stap falen', () => {
    schrijf('aanmelden.html', pagina('<div></div>'));
    expect(() => eisEenNeutralePrerender(map)).toThrow();
  });
});
