import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stackOordeel } from '../rls/psql-stack';

/**
 * De belofte: **een suite die zegt te meten, meet — of valt om.**
 *
 * ⚠️ **Waarom dit bestaat.** Drie RLS-testbestanden stonden op poort 5432 terwijl
 *    `scripts/lokale-stack.sh` op `${PGPORT:-5433}` draait. Zonder `PGPORT` in de
 *    omgeving verbond geen van drieën ergens mee, sloegen ze zichzelf over, en gaf
 *    vitest **exitcode 0**. Dertig tests weg, en `poort.mjs` las groen. Gemeten:
 *    863/31 zonder `PGPORT` tegen 893/1 ermee. QS8-270.
 *
 * ⚠️ **Het poortnummer was de oorzaak; de skip is het defect.** Een reparatie die
 *    alleen het getal rechtzet, laat het mechanisme staan waarmee de vólgende
 *    verkeerde instelling weer stil wordt. Daarom toetst dit bestand de regel en
 *    niet het getal — en daarnaast dat het getal nog maar op één plek staat.
 *
 * ⚠️ **Tweezijdig.** Naast elk geval dat om moet vallen staat het geval dat
 *    juist mág zwijgen: een kale `npm test` op een machine zonder stack is geen
 *    fout, want daar beweerde niemand iets te meten.
 */

describe('stackOordeel — zwijgen mag alleen als niemand beweerde te meten', () => {
  it('meet zodra de proef klopt, ook zonder RLS_DOEL', () => {
    expect(stackOordeel('1', undefined)).toBe('meten');
    expect(stackOordeel('1', 'lokaal')).toBe('meten');
  });

  it('slaat stil over als er geen database is en niemand iets beweerde', () => {
    expect(stackOordeel(null, undefined)).toBe('overslaan');
  });

  it('slaat stil over als het schema achterloopt en niemand iets beweerde', () => {
    expect(stackOordeel('0', undefined)).toBe('overslaan');
  });

  it('valt om als er geen database is terwijl RLS_DOEL gezet is', () => {
    expect(stackOordeel(null, 'lokaal')).toBe('geen-verbinding');
  });

  it('valt om als het schema het object niet kent terwijl RLS_DOEL gezet is', () => {
    expect(stackOordeel('0', 'lokaal')).toBe('schema-loopt-achter');
  });

  it('houdt die twee foutstanden uit elkaar — dat was de les van QS8-268', () => {
    expect(stackOordeel(null, 'lokaal')).not.toBe(stackOordeel('0', 'lokaal'));
  });

  it('leest een leeg RLS_DOEL als een bewering en niet als afwezigheid', () => {
    // `RLS_DOEL=` op de commandoregel geeft een lege string, geen undefined.
    // Wie dat als "niemand beweerde iets" leest, heeft het gat terug.
    expect(stackOordeel(null, '')).toBe('geen-verbinding');
  });
});

const RLS = fileURLToPath(new URL('../rls', import.meta.url));

/** Een bestand dat zijn eigen poort kiest. */
const EIGEN_POORT = /\bPGPORT\b/;

/**
 * Het bestand dat de poort wél mag noemen.
 *
 * ⚠️ Precies één. Vier kopieën van hetzelfde getal is hoe QS8-270 ontstond, en
 *    drie ervan hadden het verkeerd zonder dat iemand het kon zien.
 */
const MAG_DE_POORT_NOEMEN = 'psql-stack.ts';

export function bestandenMetEigenPoort(
  bestanden: readonly { readonly naam: string; readonly inhoud: string }[],
): string[] {
  return bestanden
    .filter((b) => b.naam !== MAG_DE_POORT_NOEMEN)
    .filter((b) => EIGEN_POORT.test(b.inhoud))
    .map((b) => b.naam);
}

describe('bestandenMetEigenPoort — geijkt op losse vormen', () => {
  it('meldt een testbestand dat zelf een poort kiest', () => {
    expect(
      bestandenMetEigenPoort([
        { naam: 'nieuw.test.ts', inhoud: "PGPORT: process.env.PGPORT ?? '5432'," },
      ]),
    ).toEqual(['nieuw.test.ts']);
  });

  it('meldt hem ook als hij toevallig het juiste getal kiest', () => {
    // Het gaat niet om 5432 tegen 5433 maar om de tweede plek waar het staat.
    expect(
      bestandenMetEigenPoort([
        { naam: 'nieuw.test.ts', inhoud: "PGPORT: process.env.PGPORT ?? '5433'," },
      ]),
    ).toEqual(['nieuw.test.ts']);
  });

  it('laat een bestand met rust dat de gedeelde omgeving gebruikt', () => {
    expect(
      bestandenMetEigenPoort([
        { naam: 'nieuw.test.ts', inhoud: "import { psql } from './psql-stack';" },
      ]),
    ).toEqual([]);
  });

  it('laat het gedeelde bestand zelf met rust', () => {
    expect(
      bestandenMetEigenPoort([{ naam: 'psql-stack.ts', inhoud: "PGPORT: '5433'" }]),
    ).toEqual([]);
  });
});

describe('de RLS-map zelf', () => {
  const bestanden = readdirSync(RLS)
    .filter((naam) => naam.endsWith('.ts'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(RLS, naam), 'utf8') }));

  it('kent het poortnummer op precies één plek', () => {
    expect(bestandenMetEigenPoort(bestanden)).toEqual([]);
  });

  it('en dat ene bestand bestaat, anders bewaakt dit niets', () => {
    const gedeeld = bestanden.find((b) => b.naam === MAG_DE_POORT_NOEMEN);
    expect(gedeeld?.inhoud).toMatch(/PGPORT/);
  });

  it('elk bestand dat psql aanroept, haalt zijn omgeving uit het gedeelde bestand', () => {
    const zonder = bestanden
      .filter((b) => b.naam !== MAG_DE_POORT_NOEMEN)
      .filter((b) => /\bpsql\s*\(|execFileSync\(\s*'psql'/.test(b.inhoud))
      .filter((b) => !/from '\.\/psql-stack'/.test(b.inhoud))
      .map((b) => b.naam);

    expect(zonder).toEqual([]);
  });

  it('en er zijn er ook echt een paar, anders bewaakt dat niets', () => {
    const met = bestanden.filter((b) => /from '\.\/psql-stack'/.test(b.inhoud));
    expect(met.length).toBeGreaterThanOrEqual(4);
  });
});
