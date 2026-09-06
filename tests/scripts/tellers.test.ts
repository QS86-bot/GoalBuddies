import { describe, expect, it } from 'vitest';

import { tellersUit } from '../../scripts/tellers.mjs';

/**
 * `npm run tellers` — QS8-302.
 *
 * ⚠️ **De belofte is niet "het script drukt een getal af".** Die is: *er staat
 *    nooit een testteller in de repo die niemand kan navertellen*. Een teller
 *    die bij twijfel iets plausibels afdrukt, is erger dan geen teller — dan
 *    staat er een getal dat er gemeten uitziet en het niet is. Vandaar dat de
 *    ontleder wérpt in plaats van terugvalt.
 *
 * ⚠️⚠️ **Het getal tussen haakjes is het totaal en niet wat er slaagde**, en dat
 *    is de val waar dit script omheen moet. `3543 passed | 1 skipped (3544)`
 *    betekent 3543 geslaagd van 3544; wie het haakje leest als "geslaagd", telt
 *    een overgeslagen test mee als bewijs. Dat is dezelfde soort fout als de
 *    OVERGESLAGEN-controles uit QS8-268, die als groen meetelden.
 */
describe('tellersUit', () => {
  it('leest de vorm mét overgeslagen tests', () => {
    const uitvoer = ' Test Files  253 passed (253)\n      Tests  3543 passed | 1 skipped (3544)';
    expect(tellersUit(uitvoer)).toEqual({
      geslaagd: 3543,
      overgeslagen: 1,
      totaal: 3544,
      bestanden: 253,
    });
  });

  it('leest de vorm zónder overgeslagen tests', () => {
    const uitvoer = ' Test Files  12 passed (12)\n      Tests  100 passed (100)';
    expect(tellersUit(uitvoer)).toEqual({
      geslaagd: 100,
      overgeslagen: 0,
      totaal: 100,
      bestanden: 12,
    });
  });

  it('houdt geslaagd en totaal uit elkaar', () => {
    // ⚠️ De kern: 3543 ≠ 3544. Zou de ontleder het haakje als "geslaagd" lezen,
    //    dan telt een overgeslagen test mee als bewijs.
    const { geslaagd, totaal } = tellersUit(
      ' Test Files  1 passed (1)\n      Tests  9 passed | 3 skipped (12)',
    );
    expect(geslaagd).toBe(9);
    expect(totaal).toBe(12);
  });

  it('werpt als de samenvatting er niet staat, in plaats van een getal te raden', () => {
    // ⚠️ De helft die de belofte draagt. Een terugval op 0 of op het laatst
    //    bekende getal zou hier een cijfer opleveren dat er gemeten uitziet.
    expect(() => tellersUit('vitest is omgevallen voordat hij iets afdrukte')).toThrow(
      /samenvatting van vitest is niet gevonden/,
    );
  });

  it('werpt ook als alleen de bestandsregel ontbreekt', () => {
    expect(() => tellersUit('      Tests  10 passed (10)')).toThrow(/niet gevonden/);
  });

  it('neemt de láátste samenvatting als er meer dan één staat', () => {
    // ⚠️ **Deze test bestaat omdat de ijking hem afdwong.** De mutatie "neem de
    //    eerste treffer" maakte niets rood: het regelanker deed al het werk in
    //    het geval hieronder. Een stuk implementatie dat geen enkele test nodig
    //    heeft, is óf overbodig óf onbewaakt — en hier is het het tweede: een
    //    run die twee samenvattingen afdrukt (een herhaalde run in dezelfde
    //    uitvoer) moet op de laatste uitkomen en niet op de eerste.
    const uitvoer = [
      ' Test Files  1 passed (1)',
      '      Tests  5 passed (5)',
      ' Test Files  9 passed (9)',
      '      Tests  90 passed (90)',
    ].join('\n');
    expect(tellersUit(uitvoer).geslaagd).toBe(90);
    expect(tellersUit(uitvoer).bestanden).toBe(9);
  });

  it('laat zich niet misleiden door een regel die er alleen op lijkt', () => {
    // Een testnaam die de woorden bevat mag de meting niet kapen.
    const uitvoer =
      "     ✓ meldt 'Tests  1 passed (1)' netjes door\n" +
      ' Test Files  2 passed (2)\n' +
      '      Tests  7 passed (7)';
    expect(tellersUit(uitvoer).geslaagd).toBe(7);
    expect(tellersUit(uitvoer).bestanden).toBe(2);
  });

  it('laat zich ook niet misleiden door zo n regel ná de samenvatting', () => {
    // ⚠️ **Ook deze test is door de ijking afgedwongen.** Het regelanker en
    //    "neem de laatste" dekken elkaar gedeeltelijk: met alleen "de laatste"
    //    bleef het geval hierboven groen, en met alleen het anker dit geval.
    //    Twee grendels waarvan er maar één getoetst wordt, is er één te veel —
    //    dus staan ze er nu allebei mét een geval dat precies hém nodig heeft.
    const uitvoer =
      ' Test Files  2 passed (2)\n' +
      '      Tests  7 passed (7)\n' +
      "     ✓ een naregel met Tests  1 passed (1) erin";
    expect(tellersUit(uitvoer).geslaagd).toBe(7);
  });
});
