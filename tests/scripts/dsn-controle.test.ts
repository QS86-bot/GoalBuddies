import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `release-naam.test.ts`.
import {
  bestandenMetSleutel,
  isFataal,
  oordeel,
  sleutelUit,
  standaardDsnUit,
} from '../../scripts/dsn-controle.mjs';

/**
 * IJking van de DSN-poort in de deploy — QS8-24, stap 3 van 30-08-2026.
 *
 * ⚠️ **De belofte is niet "de bundel bevat een string".** Die is triviaal. De
 *    belofte is: *een bundel die zegt te melden maar het niet kan, gaat niet
 *    live*. Dat is het geval waarin je dénkt dat je bewaakt wordt — dezelfde
 *    vorm als `setErrorSink()` dat nergens werd aangeroepen, `profiles.locale`
 *    zonder schrijfpad en `verwijderPushToken()` zonder aanroeper. Vier dagen
 *    lang kwam er geen enkele fout uit de app in Sentry aan en niemand kon zien
 *    waar het spaak liep; deze controle sluit de eerste van de vier schakels.
 *
 * ⚠️ **De tegenhelft telt even zwaar.** Géén DSN is een geldige keuze en mag
 *    door — een app onbereikbaar maken om een leesbaarheidsprobleem is de
 *    verkeerde ruil. Een controle die alles meldt, leert je hem te negeren.
 */

describe('sleutelUit', () => {
  it('pakt het deel vóór de apenstaart', () => {
    expect(sleutelUit('https://abc123@o1.ingest.de.sentry.io/42')).toBe('abc123');
  });

  it('kent ook http', () => {
    expect(sleutelUit('http://sleutel@localhost:9000/1')).toBe('sleutel');
  });

  it('trimt witruimte eromheen', () => {
    expect(sleutelUit('  https://abc@host/1  ')).toBe('abc');
  });

  it.each([
    ['leeg', ''],
    ['geen apenstaart', 'https://o1.ingest.de.sentry.io/42'],
    ['geen protocol', 'abc123@o1.ingest.de.sentry.io/42'],
    ['onzin', 'dit is geen dsn'],
    ['undefined', undefined],
    ['een getal', 42],
  ])('geeft null bij %s', (_naam, dsn) => {
    expect(sleutelUit(dsn)).toBeNull();
  });
});

describe('bestandenMetSleutel', () => {
  const bundel = [
    { pad: 'dist/_expo/static/js/web/index.js', inhoud: 'var d="https://abc123@o1.sentry.io/42";' },
    { pad: 'dist/index.html', inhoud: '<!doctype html><body></body>' },
    { pad: 'dist/stijl.css', inhoud: 'body{color:red}' },
  ];

  it('noemt het bestand waarin de sleutel staat', () => {
    expect(bestandenMetSleutel('abc123', bundel)).toEqual([
      'dist/_expo/static/js/web/index.js',
    ]);
  });

  it('is leeg als de sleutel nergens staat', () => {
    expect(bestandenMetSleutel('xyz789', bundel)).toEqual([]);
  });

  /** Zonder sleutel valt er niets te zoeken; dan is "overal" net zo fout als "nergens". */
  it.each([
    ['null', null],
    ['leeg', ''],
  ])('is leeg bij een %s sleutel', (_naam, sleutel) => {
    expect(bestandenMetSleutel(sleutel, bundel)).toEqual([]);
  });
});

describe('oordeel', () => {
  /**
   * ⚠️ **De assertie waar deze controle om bestaat.** Zou dit iets anders dan
   *    `ontbreekt` opleveren, dan gaat een bundel live die geen enkele fout kan
   *    melden terwijl het dashboard suggereert van wel.
   */
  it('noemt een geldige DSN die niet in de bundel staat ontbreekt', () => {
    expect(oordeel({ dsn: 'https://abc@host/1', gevonden: [] })).toBe('ontbreekt');
  });

  it('en dat geval breekt de deploy af', () => {
    expect(isFataal('ontbreekt')).toBe(true);
  });

  it('noemt een DSN die wél in de bundel staat aanwezig', () => {
    expect(oordeel({ dsn: 'https://abc@host/1', gevonden: ['dist/index.js'] })).toBe('aanwezig');
  });

  /**
   * ⚠️ **De tegenhelft.** Geen DSN is een keuze, geen defect. Zelfde afweging
   *    als `stuurSourceMapsNaarSentry()`, dat zichzelf overslaat: de app moet
   *    live kunnen, ook als de foutrapportage niet compleet is.
   */
  it.each([
    ['undefined', undefined],
    ['leeg', ''],
    ['alleen witruimte', '   '],
  ])('noemt een %s DSN uit, en dat mag door', (_naam, dsn) => {
    expect(oordeel({ dsn, gevonden: [] })).toBe('uit');
    expect(isFataal('uit')).toBe(false);
  });

  /** Iets dat er staat maar niet deugt, is erger dan niets — dan denk je dat het werkt. */
  it('noemt een onbruikbare DSN onbruikbaar, en dat is fataal', () => {
    expect(oordeel({ dsn: 'dit is geen dsn', gevonden: [] })).toBe('onbruikbaar');
    expect(isFataal('onbruikbaar')).toBe(true);
  });

  it('aanwezig is nooit fataal', () => {
    expect(isFataal('aanwezig')).toBe(false);
  });
});

describe('standaardDsnUit', () => {
  /**
   * ⚠️ **De naadtest, en de belangrijkste van dit bestand.** De standaard staat
   *    in TypeScript en de deploy is een `.mjs`; die twee kunnen de constante
   *    niet delen. Wordt hij hernoemd of van vorm veranderd, dan vindt de deploy
   *    hem niet meer — en zonder deze test zou dat pas blijken bij een deploy
   *    die stilletjes iets anders meet dan hij belooft.
   */
  it('vindt de echte constante in src/lib/env.ts', () => {
    const dsn = standaardDsnUit(readFileSync('src/lib/env.ts', 'utf8'));

    expect(dsn).not.toBeNull();
    expect(sleutelUit(dsn)).not.toBeNull();
    expect(dsn).toMatch(/^https:\/\/[^@]+@[^/]+\/\d+$/);
  });

  it('leest de waarde over een regeleinde heen', () => {
    const bron = "const STANDAARD_SENTRY_DSN =\n  'https://abc@host/1';";
    expect(standaardDsnUit(bron)).toBe('https://abc@host/1');
  });

  it('leest hem ook op één regel', () => {
    expect(standaardDsnUit("const STANDAARD_SENTRY_DSN = 'https://abc@host/1';")).toBe(
      'https://abc@host/1',
    );
  });

  /** Hernoemd of weg: `null`, zodat de aanroeper kan stoppen in plaats van niets te meten. */
  it.each([
    ['een andere naam', "const SENTRY_DSN_STANDAARD = 'https://abc@host/1';"],
    ['helemaal afwezig', 'const STANDAARD_APP_URL = "https://voorbeeld.nl";'],
  ])('geeft null bij %s', (_naam, bron) => {
    expect(standaardDsnUit(bron)).toBeNull();
  });
});
