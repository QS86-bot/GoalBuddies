import { describe, expect, it } from 'vitest';

import { dubbeleSleutels, sluitNiet } from '../../scripts/json-controle.mjs';

/**
 * `json:controle` — de ijking, en niet alleen de vangst.
 *
 * ⚠️ **Waarom deze controle bestaat.** De rij van 22-08-2026 over het
 *    hulpscript dat twee keer liep, zei: "nu is TypeScript het vangnet, en dat
 *    is toeval". Op 28-08 nagemeten en dat klopt niet: `tsc` (TS1117) én ESLint
 *    (`no-dupe-keys`) worden allebei rood op elke dubbele sleutel in elk
 *    object-literal. Structureel, geen toeval. De testsuite was de toevallige —
 *    met een dubbele sleutel die dezelfde parameters draagt bleven alle 1088
 *    tests groen.
 *
 *    Wat de rij wél goed zag, is dat er ergens géén vangnet is. Alleen niet
 *    daar: ESLint leest `**\/*.ts` en `**\/*.tsx`, `tsc` leest geen JSON, en
 *    `JSON.parse` houdt bij een dubbele sleutel stilzwijgend de láátste. Zes
 *    JSON-bestanden zonder enige toets — inclusief `public/manifest.json`, dat
 *    door `pwa:controle` wordt beoordeeld mét `JSON.parse` en dus mét die
 *    blindheid.
 *
 * ⚠️ **De tweede helft van dit bestand is de belangrijkste.** Een controle die
 *    alles meldt, leert je hem te negeren. `"version"` staat in `package.json`
 *    op vier plekken en dat is doodgewoon; alleen twee keer dezelfde naam in
 *    hetzélfde object is de fout. Elke vorm die met rust gelaten moet worden,
 *    staat hieronder los.
 */

describe('dubbeleSleutels vindt', () => {
  it('twee keer dezelfde sleutel in de wortel', () => {
    expect(dubbeleSleutels('{"a": 1, "a": 2}')).toEqual(['a']);
  });

  it('een dubbele sleutel diep in een object, met het pad erbij', () => {
    // Het pad is wat je nodig hebt om hem te vinden in een bestand van 400 regels.
    expect(dubbeleSleutels('{"compilerOptions": {"strict": true, "strict": false}}')).toEqual([
      'compilerOptions.strict',
    ]);
  });

  it('een dubbele sleutel in een object binnen een array', () => {
    // ⚠️ Een array heeft geen sleutels, maar de objecten erin wel. Zonder deze
    //    toets zou `icons` in het manifest een blinde vlek zijn.
    expect(dubbeleSleutels('{"icons": [{"src": "a", "src": "b"}]}')).toEqual(['icons.src']);
  });

  it('een dubbele sleutel waarvan de waarden identiek zijn', () => {
    // ⚠️ Dit is precies het geval uit de bevinding: een script dat een blok
    //    twee keer plakt, plakt hetzelfde blok. Geen enkel verschil in waarde
    //    om aan te zien.
    expect(dubbeleSleutels('{"naam": "x", "naam": "x"}')).toEqual(['naam']);
  });

  it('een dubbele sleutel met commentaar ertussen', () => {
    // ⚠️ JSONC. `tsconfig.json` en `deno.json` staan er vol mee, en dat zijn de
    //    twee bestanden die niemand anders leest.
    expect(dubbeleSleutels('{"a": 1, // uitleg\n "a": 2}')).toEqual(['a']);
    expect(dubbeleSleutels('{"a": 1, /* uitleg */ "a": 2}')).toEqual(['a']);
  });

  it('meerdere dubbele sleutels tegelijk', () => {
    expect(dubbeleSleutels('{"a": 1, "a": 2, "b": 3, "b": 4}')).toEqual(['a', 'b']);
  });

  it('een dubbele sleutel met een escape erin', () => {
    // De scanner ontleedt de sleutel voor hij hem vergelijkt; `\"` is één teken
    // in de naam en geen stringeinde.
    expect(dubbeleSleutels('{"a\\"b": 1, "a\\"b": 2}')).toEqual(['a"b']);
  });
});

describe('dubbeleSleutels laat met rust', () => {
  it('dezelfde naam in twee verschillende objecten', () => {
    // ⚠️ Dit is de vorm die het vaakst voorkomt en nooit fout is. `"version"`
    //    staat in `package.json` op vier plekken.
    expect(dubbeleSleutels('{"x": {"version": 1}, "y": {"version": 2}}')).toEqual([]);
  });

  it('een naam die eerst sleutel is en daarna waarde', () => {
    expect(dubbeleSleutels('{"naam": "naam"}')).toEqual([]);
  });

  it('een sleutelnaam die in een stringwaarde voorkomt', () => {
    // ⚠️ Zou een regex over de tekst wél melden, en dat is de reden dat dit een
    //    scanner is en geen zoekopdracht.
    expect(dubbeleSleutels('{"a": 1, "b": "\\"a\\": 2"}')).toEqual([]);
  });

  it('een sleutelnaam die in commentaar voorkomt', () => {
    expect(dubbeleSleutels('{"a": 1, // hier stond ooit "a": 2\n "b": 3}')).toEqual([]);
  });

  it('dezelfde waarde twee keer in een array', () => {
    expect(dubbeleSleutels('{"lijst": ["a", "a", "a"]}')).toEqual([]);
  });

  it('een sleutel die dezelfde naam heeft als zijn ouder', () => {
    expect(dubbeleSleutels('{"a": {"a": 1}}')).toEqual([]);
  });

  it('twee objecten in dezelfde array met dezelfde sleutels', () => {
    // Het manifest heeft precies deze vorm: een `icons`-array met per element
    // een `src`, een `sizes` en een `type`.
    expect(dubbeleSleutels('{"icons": [{"src": "a"}, {"src": "b"}]}')).toEqual([]);
  });

  it('een leeg object en een lege array', () => {
    expect(dubbeleSleutels('{}')).toEqual([]);
    expect(dubbeleSleutels('{"a": [], "b": {}}')).toEqual([]);
  });
});

describe('sluitNiet', () => {
  it('zegt niets over een bestand dat klopt', () => {
    expect(sluitNiet('{"a": [1, {"b": 2}]}')).toBeNull();
  });

  it('meldt een bestand dat halverwege ophoudt', () => {
    // ⚠️ Dít is het geval uit de bevinding: een script dat halverwege stopt.
    //    Zonder deze toets leest de scanner een afgekapt bestand, vindt geen
    //    dubbele sleutel meer, en meldt groen.
    expect(sluitNiet('{"a": {"b": 1')).toMatch(/nooit dicht/);
  });

  it('meldt een sluithaakje te veel', () => {
    expect(sluitNiet('{"a": 1}}')).toMatch(/te veel/);
  });

  it('meldt een accolade die met een blokhaak wordt gesloten', () => {
    expect(sluitNiet('{"a": 1]')).toMatch(/gesloten met/);
  });

  it('telt geen haakjes die in een string staan', () => {
    expect(sluitNiet('{"a": "}}}["}')).toBeNull();
  });

  it('telt geen haakjes die in commentaar staan', () => {
    expect(sluitNiet('{"a": 1} // en dan {{{ nog wat')).toBeNull();
  });
});
