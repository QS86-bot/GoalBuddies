import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VERPLICHT,
  bezwaren,
  bouwIsOuderDanBron,
  hoofd,
  kanarieFaalt,
  zichtbareTekst,
} from '../../scripts/prerender-controle.mjs';

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
 *    script: vóór QS8-740 (`origin/main`) meldt hij tekst op 32 van de 36
 *    pagina's, mét de tekst; na QS8-740 meldt hij 36 pagina's zonder tekst.
 *
 * IJKING — met de hand, 19-11-2026, tegen deze tests (vooraf en achteraf 31 groen):
 *
 *   B  `zichtbareTekst()` altijd `''`
 *      -> rood: 'tekst in een body wordt gevonden'
 *   C  `zichtbareTekst()` geeft de hele pagina terug
 *      -> rood: 'een lege body is geen tekst' (en de drie die dat uitsluiten)
 *   D  de `<body`-eis weghalen in `bezwaren()`
 *      -> rood: 'een pagina zonder body is geen geslaagde meting'
 *   E  de ouderdomscheck uit `hoofd()` halen
 *      -> rood: 'een verouderde bouw met tekst is OVERGESLAGEN' (en de schone variant)
 *   F  de knip weer in drie opeenvolgende stappen
 *      -> rood: 'een `<!--` in het ene script en een `-->` in het andere …'
 *   G  de kanarie uit `hoofd()` halen
 *      -> rood: 'een kapotte zoekfunctie maakt een echte run rood'
 *   H  de melding op UTF-16 afkappen
 *      -> rood: 'tekst met een emoji wordt op codepunten afgekapt'
 *   I  de `catch` weer alles laten verzwelgen
 *      -> rood: 'een andere fout dan "bestaat niet" gooit'
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

  it('een `<!--` in het ene script en een `-->` in het andere eet de tekst ertussen niet op', () => {
    // De knip gaat in één pas van links naar rechts; drie opeenvolgende knippen
    // lieten hier `''` over (code-critic, gemeten).
    const body = '<script>var a="<!--";</script><p>Tekst</p><script>/*-->*/</script>';
    expect(zichtbareTekst(pagina(body))).toBe('Tekst');
  });

  it('een `<script>` in een commentaar eet de tekst erna niet op', () => {
    expect(zichtbareTekst(pagina('<!-- <script> --><p>Tekst</p><script>x()</script>'))).toBe('Tekst');
  });

  it('tekst met een emoji wordt op codepunten afgekapt in de melding', () => {
    // 'a' + emoji's: afkappen op 80 UTF-16-eenheden valt midden in een emoji en laat
    // een los surrogaat achter (rendert als een vervangingsteken).
    const uit = bezwaren([
      ...VERPLICHT.map((pad: string) => ({ pad, html: pagina('<div></div>') })),
      { pad: 'x.html', html: pagina(`<p>a${'😀'.repeat(100)}</p>`) },
    ]);
    expect(uit[0]).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('kanarieFaalt', () => {
  it('de echte zoekfunctie vindt tekst op de kanariepagina', () => {
    expect(kanarieFaalt()).toBe(false);
  });

  it('een zoekfunctie die altijd niets vindt, faalt de kanarie', () => {
    expect(kanarieFaalt(() => '')).toBe(true);
  });

  it('een zoekfunctie die iets anders vindt, faalt de kanarie', () => {
    expect(kanarieFaalt(() => 'iets anders')).toBe(true);
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

describe('bouwIsOuderDanBron en hoofd — een verouderde bouw is ongemeten, niet groen', () => {
  let werk: string;
  let dist: string;
  let bron: string;

  beforeEach(() => {
    werk = mkdtempSync(join(tmpdir(), 'prerender-oud-'));
    dist = join(werk, 'dist');
    bron = join(werk, 'src');
    mkdirSync(dist);
    mkdirSync(bron);
    for (const p of VERPLICHT) writeFileSync(join(dist, p), pagina('<div></div>'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(werk, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const zetTijd = (pad: string, secondenGeleden: number) => {
    const t = (Date.now() - secondenGeleden * 1000) / 1000;
    utimesSync(pad, t, t);
  };

  it('een bron nieuwer dan de bouw geeft een positief aantal ms', () => {
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(dist, 'index.html'), 7200);
    zetTijd(join(bron, 'a.ts'), 60);
    expect(bouwIsOuderDanBron(dist, [bron])).toBeGreaterThan(0);
  });

  it('een bouw nieuwer dan de bron geeft nul of minder', () => {
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(bron, 'a.ts'), 7200);
    zetTijd(join(dist, 'index.html'), 60);
    expect(bouwIsOuderDanBron(dist, [bron])).toBeLessThanOrEqual(0);
  });

  it('een verouderde bouw met tekst is OVERGESLAGEN (exit 0) en niet rood, met de leeftijd erbij', () => {
    writeFileSync(join(dist, 'index.html'), pagina('<p>Welkom</p>'));
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(dist, 'index.html'), 3 * 3600);
    zetTijd(join(bron, 'a.ts'), 60);
    expect(hoofd(dist, [bron])).toBe(0);
    const uit = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(uit).toContain('OVERGESLAGEN');
    expect(uit).toMatch(/~3 uur/);
  });

  it('een verouderde schone bouw is óók OVERGESLAGEN: ongemeten is geen groen', () => {
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(dist, 'index.html'), 3600);
    zetTijd(join(bron, 'a.ts'), 10);
    expect(hoofd(dist, [bron])).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).not.toContain('geen zichtbare tekst');
  });

  it('een kapotte zoekfunctie maakt een echte run rood, ook op een schone bouw', () => {
    // Zonder deze toets kan de kanarie uit `hoofd()` verdwijnen: een `lees` die
    // altijd '' geeft meldt anders bij elke bouw "geen tekst".
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(bron, 'a.ts'), 3600);
    zetTijd(join(dist, 'index.html'), 10);
    expect(hoofd(dist, [bron], () => '')).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('zoekfunctie');
  });

  it('een verse bouw wordt gemeten', () => {
    writeFileSync(join(dist, 'aanmelden.html'), pagina('<p>Welkom</p>'));
    writeFileSync(join(bron, 'a.ts'), 'x');
    zetTijd(join(bron, 'a.ts'), 3600);
    zetTijd(join(dist, 'index.html'), 10);
    expect(hoofd(dist, [bron])).toBe(1);
  });

  it('een bestand waar een map hoort is "bestaat niet": OVERGESLAGEN', () => {
    const bestand = join(werk, 'geen-map');
    writeFileSync(bestand, 'x');
    expect(hoofd(join(bestand, 'dist'), [bron])).toBe(0);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('OVERGESLAGEN');
  });

  it('een andere fout dan "bestaat niet" gooit en heet geen ongemeten', () => {
    // Een pad met een NUL-teken geeft `ERR_INVALID_ARG_VALUE`: een kapotte invoer,
    // geen afwezige bouw. Ook als root te veroorzaken (rechten-fouten niet).
    expect(() => hoofd(`${dist}\0kapot`, [bron])).toThrow();
  });
});
