/**
 * De belofte: **`knip:controle` vindt een nieuwe eigen knip, en laat een
 * geregistreerde met rust** — QS8-446.
 *
 * ⚠️⚠️ **Die tweede helft is hier zwaarder dan gewoonlijk.** Twintig knippen
 *    houden met reden hun eigen vorm — vier voor SQL, één die ook strings
 *    wegknipt, en een handvol die regelnummers heel moeten houden. Een controle
 *    die die twintig blijft melden, is een controle die je uitzet, en dan
 *    bewaakt hij de éénentwintigste ook niet meer.
 */
import { describe, expect, it } from 'vitest';

import {
  definitiesIn,
  GEDEELD,
  klachten,
  MET_REDEN,
  verweesdeRedenen,
  ZONDER_TOETS,
} from '../../scripts/knip-controle.mjs';

// ---------------------------------------------------------------------------

describe('hij vindt een definitie', () => {
  it.each([
    'function zonderCommentaar(bron) { return bron; }',
    'export function zonderCommentaar(bron: string): string { return bron; }',
    'export function zonderCommentaarEnTekst(bron) { return bron; }',
  ])('in %s', (bron) => {
    expect(definitiesIn(bron)).toHaveLength(1);
  });

  it('en telt er twee als er twee staan', () => {
    const bron = 'function zonderCommentaar(a) {}\nfunction zonderCommentaarEnTekst(b) {}';

    expect(definitiesIn(bron)).toEqual(['zonderCommentaar', 'zonderCommentaarEnTekst']);
  });

  /**
   * ⚠️ Een import is geen definitie. Zonder dit onderscheid meldt de controle
   *    juist de bestanden die het goed doen — en dat is de vorm waarmee een
   *    grendel zichzelf om zeep helpt.
   */
  it('maar niet een import of een aanroep', () => {
    const bron = [
      "import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';",
      'const schoon = zonderCommentaar(bron);',
      'export { zonderCommentaar };',
    ].join('\n');

    expect(definitiesIn(bron)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('wat er gemeld wordt en wat niet', () => {
  it('een nieuwe eigen knip is een klacht', () => {
    const uit = klachten('function zonderCommentaar(b) { return b; }', 'tests/beloftes/nieuw.test.ts');

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('tests/beloftes/nieuw.test.ts');
    expect(uit[0]).toContain(GEDEELD);
  });

  it('een geregistreerde knip is dat niet', () => {
    expect(
      klachten('function zonderCommentaar(sql) { return sql; }', 'scripts/definers-controle.mjs'),
    ).toEqual([]);
  });

  it('de gedeelde bron mag zichzelf definiëren', () => {
    expect(klachten('export function zonderCommentaar(bron) { return bron; }', GEDEELD)).toEqual([]);
  });

  it('een bestand dat hem alleen importeert is stil', () => {
    expect(
      klachten("import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';", 'tests/x.ts'),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De andere kant van het register, en die is even belangrijk.** Een rij
 *    die blijft staan nadat zijn knip weg is, is een vrijstelling voor een
 *    bestand dat niemand meer leest — en de volgende knip die er toevallig zo
 *    heet, komt er gratis langs. Zelfde vorm als `ZONDER_CI` in
 *    `ci-controles.mjs`.
 */
describe('het register veroudert niet stil', () => {
  it('meldt een rij waarvan de knip verdwenen is', () => {
    const gevonden = new Set(Object.keys(MET_REDEN));
    gevonden.delete('scripts/definers-controle.mjs:zonderCommentaar');

    expect(verweesdeRedenen(gevonden)).toEqual(['scripts/definers-controle.mjs:zonderCommentaar']);
  });

  it('en zwijgt als elke rij nog bestaat', () => {
    expect(verweesdeRedenen(new Set(Object.keys(MET_REDEN)))).toEqual([]);
  });

  it('elke rij draagt een reden die iets uitlegt', () => {
    for (const [sleutel, reden] of Object.entries(MET_REDEN)) {
      expect(reden.length, `${sleutel} heeft een reden die niets zegt`).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De uitzondering die deze toets zélf mogelijk maakt.** Dit bestand voedt
 *    de controle de vormen die hij moet vinden — als string, want anders zijn ze
 *    niet te voeden. 📏 Zonder de uitzondering meldde de controle bij zijn eerste
 *    run acht treffers in dit bestand. Een controle die zijn eigen ijking rood
 *    maakt, leer je uitzetten.
 */
describe('de ijkingsmap valt erbuiten, en dat staat vast', () => {
  it('meldt niets over een bestand in `tests/scripts/`', () => {
    expect(klachten('function zonderCommentaar(b) { return b; }', `${ZONDER_TOETS}/x.test.ts`)).toEqual(
      [],
    );
  });

  it('maar wel over een bestand ernaast', () => {
    expect(
      klachten('function zonderCommentaar(b) { return b; }', 'tests/beloftes/x.test.ts'),
    ).toHaveLength(1);
  });
});
