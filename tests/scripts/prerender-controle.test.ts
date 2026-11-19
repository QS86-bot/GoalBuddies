import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VERPLICHT, bezwaren, hoofd, zichtbareTekst } from '../../scripts/prerender-controle.mjs';

/**
 * `npm run prerender:controle` — QS8-742.
 *
 * ⚠️ **De belofte is "de geëxporteerde pagina's tekenen vóór de hydratie geen tekst".**
 *    Dat is wat QS8-740 aan #418 deed, en `tests/beloftes/prerender-is-neutraal.test.ts`
 *    toetst alleen de bron. Deze tests voeden het script met pagina's in alle
 *    vormen die hij moet vinden én de vormen die hij met rust moet laten — een
 *    controle die alles meldt, leer je negeren (CLAUDE.md, regel 18).
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Vandaar de
 *    geëxporteerde functies. De ijking op een echte bouw staat in de kop van het
 *    script: vóór QS8-740 (`origin/main`) meldt hij tekst op 6+ pagina's, mét
 *    de tekst; na QS8-740 meldt hij 36 pagina's zonder tekst.
 *
 * IJKING — met de hand, 19-11-2026, tegen deze tests (vooraf en achteraf 17 groen):
 *
 *   B  `zichtbareTekst()` altijd `''`
 *      -> rood: 'tekst in een body wordt gevonden'
 *   C  `zichtbareTekst()` geeft de hele pagina terug
 *      -> rood: 'een lege body is geen tekst' (en de drie die dat uitsluiten)
 *   D  de `<body`-eis weghalen in `bezwaren()`
 *      -> rood: 'een pagina zonder body is geen geslaagde meting'
 */

const pagina = (body: string, kop = '<title>GoalBuddies</title>') =>
  `<!DOCTYPE html><html lang="nl"><head>${kop}</head><body>${body}</body></html>`;

describe('zichtbareTekst', () => {
  it('tekst in een body wordt gevonden', () => {
    expect(zichtbareTekst(pagina('<div>Welkom terug</div>'))).toBe('Welkom terug');
  });

  it('tekst diep in een kind wordt gevonden', () => {
    expect(zichtbareTekst(pagina('<div><div><span>Vandaag</span></div></div>'))).toBe('Vandaag');
  });

  it('een lege body is geen tekst', () => {
    expect(zichtbareTekst(pagina('<div id="root"><div style="flex:1"></div></div>'))).toBe('');
  });

  it('scripts, stijlen en commentaar tellen niet mee', () => {
    const body = '<div id="root"></div><script>var t = "Welkom";</script><style>.a{content:"tekst"}</style><!-- Hallo -->';
    expect(zichtbareTekst(pagina(body))).toBe('');
  });

  it('de titel in de head telt niet mee, want die staat niet in de body', () => {
    expect(zichtbareTekst(pagina('<div></div>', '<title>Welkom terug</title>'))).toBe('');
  });

  it('witruimte en niet-afbrekende spaties tellen niet mee', () => {
    expect(zichtbareTekst(pagina('<div> \n\t &nbsp; &#160; </div>'))).toBe('');
  });

  it('attributen tellen niet mee', () => {
    expect(zichtbareTekst(pagina('<div aria-label="Hoofdmenu" title="x"><img alt="logo"/></div>'))).toBe('');
  });

  it('een hoofdletter-BODY wordt ook gevonden', () => {
    expect(zichtbareTekst('<html><BODY><p>Tekst</p></BODY></html>')).toBe('Tekst');
  });

  it('zonder body is het niet te meten (null, niet leeg)', () => {
    expect(zichtbareTekst('<html><head></head></html>')).toBeNull();
  });
});

describe('bezwaren', () => {
  const compleet = VERPLICHT.map((pad: string) => ({ pad, html: pagina('<div></div>') }));

  it('een complete bouw zonder tekst heeft geen bezwaren', () => {
    expect(bezwaren(compleet)).toEqual([]);
  });

  it('een pagina met tekst wordt bij naam genoemd, met de tekst erbij', () => {
    const uit = bezwaren([...compleet, { pad: 'groep.html', html: pagina('<p>Je groepen</p>') }]);
    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('groep.html');
    expect(uit[0]).toContain('Je groepen');
  });

  it('een pagina zonder body is geen geslaagde meting', () => {
    const uit = bezwaren([...compleet, { pad: 'raar.html', html: '<html></html>' }]);
    expect(uit.some((r: string) => r.includes('raar.html') && r.includes('geen <body>'))).toBe(true);
  });

  it('een bouw zonder index.html of aanmelden.html is niet compleet', () => {
    const uit = bezwaren([{ pad: 'groep.html', html: pagina('<div></div>') }]);
    expect(uit.some((r: string) => r.includes('index.html ontbreekt'))).toBe(true);
    expect(uit.some((r: string) => r.includes('aanmelden.html ontbreekt'))).toBe(true);
  });
});

describe('hoofd — de eindtoets op een echte map', () => {
  let map: string;

  beforeEach(() => {
    map = mkdtempSync(join(tmpdir(), 'prerender-controle-'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(map, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const schrijf = (pad: string, inhoud: string) => {
    const delen = pad.split('/');
    if (delen.length > 1) mkdirSync(join(map, ...delen.slice(0, -1)), { recursive: true });
    writeFileSync(join(map, pad), inhoud);
  };

  it('zonder dist is het OVERGESLAGEN en exit 0 (ongemeten, geen groen)', () => {
    expect(hoofd(join(map, 'bestaat-niet'))).toBe(0);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('OVERGESLAGEN');
  });

  it('een lege map is ook OVERGESLAGEN', () => {
    expect(hoofd(map)).toBe(0);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('OVERGESLAGEN');
  });

  it('een complete bouw zonder tekst is groen, ook met pagina\'s in submappen', () => {
    for (const p of VERPLICHT) schrijf(p, pagina('<div></div>'));
    schrijf('doel/[id].html', pagina('<div></div>'));
    expect(hoofd(map)).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('3 pagina');
  });

  it('tekst in één pagina in een submap maakt de controle rood, en noemt het pad', () => {
    for (const p of VERPLICHT) schrijf(p, pagina('<div></div>'));
    schrijf('onboarding/uitleg.html', pagina('<p>Welkom</p>'));
    expect(hoofd(map)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('onboarding/uitleg.html');
  });
});
