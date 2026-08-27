import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { releaseVoor as releaseVanDeApp } from '../../src/lib/observability/release';
// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `deploy-htaccess.test.ts`.
import {
  achtergeblevenMaps,
  ontbrekendeSentryVars,
  releaseVoor as releaseVanDeDeploy,
  SENTRY_VARS,
  stripSourceMapVerwijzing,
  verwijderSourceMaps,
} from '../../scripts/deploy-web.mjs';

/**
 * QS8-24 criterium 2 — de source maps en de release waar ze aan hangen.
 *
 * ⚠️ **De belangrijkste test hier is `de app en de deploy noemen dezelfde
 *    release`.** Die naam staat op twee plekken en kán niet gedeeld worden: de
 *    ene kant is TypeScript in de app, de andere een `.mjs`-script. Lopen ze
 *    uiteen, dan komen de maps netjes aan, staan de gebeurtenissen er netjes in,
 *    en matcht er niets — precies het stille soort fout waar dit project op
 *    26-08 een dag aan kwijt was.
 *
 *    Dit is de naad, en dat is waar CLAUDE.md regel 18 om vraagt: niet twee
 *    onderdelen los toetsen, maar de plek waar ze aan elkaar knopen.
 */

describe('de release-naam', () => {
  it.each([
    ['0.1.0', 'goalbuddies@0.1.0'],
    ['1.2.3', 'goalbuddies@1.2.3'],
    ['  0.4.0  ', 'goalbuddies@0.4.0'],
  ])('maakt van %s de naam %s', (versie, verwacht) => {
    expect(releaseVanDeApp(versie)).toBe(verwacht);
  });

  /** Weglaten en niet verzinnen: een verzonnen naam koppelt maps aan de verkeerde build. */
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['leeg', ''],
    ['alleen witruimte', '   '],
  ])('geeft undefined bij %s', (_naam, versie) => {
    expect(releaseVanDeApp(versie)).toBeUndefined();
  });

  /**
   * ⚠️ **De naadtest.** Twee implementaties, dezelfde invoer, dezelfde uitkomst
   *    — inclusief de versie die er vandaag écht in `app.json` staat.
   */
  it('de app en de deploy noemen dezelfde release', () => {
    const echteVersie = (
      JSON.parse(readFileSync('app.json', 'utf8')) as { expo?: { version?: string } }
    ).expo?.version;

    expect(typeof echteVersie).toBe('string');

    for (const versie of [echteVersie, '0.1.0', '9.9.9', '  1.0.0 ', '', undefined]) {
      expect(releaseVanDeDeploy(versie)).toBe(releaseVanDeApp(versie));
    }
  });
});

describe('ontbrekendeSentryVars — de overslaan-stap', () => {
  /**
   * ⚠️ De stap moet zeggen wélke variabele mist. "Sentry niet geconfigureerd"
   *    laat je alle drie nalopen, en dan is de melding een zoekopdracht.
   */
  it('noemt alle drie als er niets gezet is', () => {
    expect(ontbrekendeSentryVars({})).toEqual(SENTRY_VARS);
  });

  it('noemt alleen wat er mist', () => {
    expect(
      ontbrekendeSentryVars({ SENTRY_AUTH_TOKEN: 'geheim', SENTRY_ORG: 'q-projects' }),
    ).toEqual(['SENTRY_PROJECT']);
  });

  it('telt een lege of witruimte-waarde als ontbrekend', () => {
    expect(
      ontbrekendeSentryVars({ SENTRY_AUTH_TOKEN: '', SENTRY_ORG: '   ', SENTRY_PROJECT: 'gb' }),
    ).toEqual(['SENTRY_AUTH_TOKEN', 'SENTRY_ORG']);
  });

  it('is leeg als alle drie er staan', () => {
    expect(
      ontbrekendeSentryVars({ SENTRY_AUTH_TOKEN: 'a', SENTRY_ORG: 'b', SENTRY_PROJECT: 'c' }),
    ).toEqual([]);
  });
});

describe('stripSourceMapVerwijzing', () => {
  /**
   * ⚠️ De map zelf gaat weg uit de bundel, dus de verwijzing ook. Blijft hij
   *    staan, dan haalt elke browser met de devtools open een 404 op.
   */
  it('haalt de verwijzing aan het eind weg', () => {
    expect(stripSourceMapVerwijzing('code();\n//# sourceMappingURL=bundel.js.map')).toBe('code();');
  });

  it('kent ook de oude apenstaart-vorm', () => {
    expect(stripSourceMapVerwijzing('code();\n//@ sourceMappingURL=bundel.js.map')).toBe('code();');
  });

  it('laat code zonder verwijzing ongemoeid', () => {
    const bron = 'const a = 1;\nconst b = 2;\n';
    expect(stripSourceMapVerwijzing(bron)).toBe(bron);
  });

  /**
   * ⚠️ Alleen de verwijzing en niets anders. In een geminificeerde bundel staat
   *    van alles dat op commentaar lijkt; verder snijden is vragen om een bundel
   *    die stukgaat op een manier die je pas in productie ziet.
   */
  it('raakt een gewone regel met het woord sourceMappingURL niet aan', () => {
    const bron = 'const uitleg = "zie sourceMappingURL in de docs";';
    expect(stripSourceMapVerwijzing(bron)).toBe(bron);
  });
});

describe('verwijderSourceMaps — de veiligheidsstap', () => {
  const mappen: string[] = [];

  function bundel(bestanden: Readonly<Record<string, string>>): string {
    const map = mkdtempSync(join(tmpdir(), 'gb-dist-'));
    mappen.push(map);

    for (const [naam, inhoud] of Object.entries(bestanden)) {
      const pad = join(map, naam);
      mkdirSync(join(pad, '..'), { recursive: true });
      writeFileSync(pad, inhoud);
    }

    return map;
  }

  afterEach(() => {
    for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
  });

  /**
   * ⚠️ **Dit is de test die ertoe doet.** Een `.map` naast een publieke bundel
   *    geeft iedereen je volledige broncode, inclusief commentaar. Deze stap is
   *    de enige in de deploy die dat tegenhoudt, en tot deze test bestond was
   *    hij niet te voeden — precies het soort onijkbare controle waar dit
   *    project vandaag twee keer op is omgevallen.
   */
  it('haalt elke map weg, ook uit onderliggende mappen', () => {
    const map = bundel({
      'bundel.js': 'code();\n//# sourceMappingURL=bundel.js.map',
      'bundel.js.map': '{"version":3}',
      '_expo/static/js/web/index.js': 'meer();\n//# sourceMappingURL=index.js.map',
      '_expo/static/js/web/index.js.map': '{"version":3}',
      'index.html': '<!doctype html>',
    });

    const uit = verwijderSourceMaps(map);

    expect(uit.verwijderd).toBe(2);
    expect(uit.achtergebleven).toEqual([]);
    expect(readFileSync(join(map, 'bundel.js'), 'utf8')).toBe('code();');
    expect(readFileSync(join(map, '_expo/static/js/web/index.js'), 'utf8')).toBe('meer();');
  });

  it('laat de rest van de bundel met rust', () => {
    const map = bundel({ 'index.html': '<!doctype html>', 'stijl.css': 'body{color:red}' });

    const uit = verwijderSourceMaps(map);

    expect(uit.verwijderd).toBe(0);
    expect(readFileSync(join(map, 'index.html'), 'utf8')).toBe('<!doctype html>');
    expect(readFileSync(join(map, 'stijl.css'), 'utf8')).toBe('body{color:red}');
  });

  /**
   * ⚠️ **De beslissing die telt, apart getoetst.** Een verwijdering laten
   *    mislukken vraagt een bestandssysteem dat weigert, en dat is hier niet na
   *    te bootsen: de tests draaien als root, dus zelfs een read-only map houdt
   *    `rmSync` niet tegen. Wat wél te voeden is, is de vraag die de deploy
   *    afbreekt — en die staat daarom los.
   *
   * ⚠️ Wat hierdoor ongetoetst blijft: de bedrading die bij een niet-lege lijst
   *    `process.exit(1)` aanroept. Dat is één regel en hij staat direct onder
   *    deze functie; het alternatief was een test die niets bewijst.
   */
  it.each([
    ['een map in de wortel', ['dist/index.html', 'dist/bundel.js.map'], ['dist/bundel.js.map']],
    ['een map diep in de boom', ['dist/_expo/static/js/web/i.js.map'], ['dist/_expo/static/js/web/i.js.map']],
    ['meerdere tegelijk', ['dist/a.js.map', 'dist/b.js', 'dist/c.css.map'], ['dist/a.js.map', 'dist/c.css.map']],
  ])('meldt %s', (_naam, bestanden, verwacht) => {
    expect(achtergeblevenMaps(bestanden)).toEqual(verwacht);
  });

  it('zwijgt over een bundel zonder maps', () => {
    expect(achtergeblevenMaps(['dist/index.html', 'dist/bundel.js', 'dist/stijl.css'])).toEqual([]);
  });

  /** ⚠️ `.map` in een bestandsnaam is niet hetzelfde als een source map. */
  it('slaat niet aan op een bestand dat toevallig zo heet', () => {
    expect(achtergeblevenMaps(['dist/sitemap.xml', 'dist/roadmap.html'])).toEqual([]);
  });
});
