/**
 * De belofte: **de gedeelde knip haalt commentaar weg en laat code staan** —
 * QS8-446.
 *
 * ⚠️⚠️ **Waarom deze toets zwaarder weegt dan zijn omvang suggereert.** Elke
 *    bronzeef in dit project leunt op deze knip: hij bepaalt wat er *code* heet
 *    en wat *uitleg*. Knipt hij te veel weg, dan blijft de zeef groen terwijl de
 *    belofte breekt — en een zeef die niets meer vindt, ziet er precies zo uit
 *    als een zeef die niets te vinden heeft.
 *
 * 📏 **De vorm die dit project geld kostte (QS8-412):** `/\/\/[^\n]*\/g` at
 *    alles op ná de `//` van een URL. De suite werd toen rood op een ándere
 *    toets dan de grendel die de mutatie noemde, en de bedoelde grendel bleef
 *    groen. Die vorm staat hieronder als eerste geval.
 *
 * 📏 De ijking staat in
 *    `docs/decisions/2026-09-13-zeventien-knippen-met-een-naam.md` §4.
 */
import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

// ---------------------------------------------------------------------------

describe('een url is geen commentaar', () => {
  /** 📏 Het geval van QS8-412, letterlijk. */
  it('laat `https://` in een string staan', () => {
    const bron = "const x = 'https://opslag/x';\nLinking.openURL(x);";

    expect(zonderCommentaar(bron)).toBe(bron);
  });

  it.each([
    "fetch('http://a/b');",
    "const u = `https://${host}/pad`;",
    "// zie https://voorbeeld/x",
  ])('en knipt niet midden in %s', (regel) => {
    const uit = zonderCommentaar(regel);
    // De derde is écht commentaar en hoort weg; de eerste twee horen te blijven.
    if (regel.trimStart().startsWith('//')) expect(uit).toBe('');
    else expect(uit).toBe(regel);
  });
});

// ---------------------------------------------------------------------------

describe('commentaar gaat er wél af', () => {
  it('een regel die met // begint', () => {
    expect(zonderCommentaar('a\n  // weg\nb')).toBe('a\nb');
  });

  it('een JSDoc-blok', () => {
    expect(zonderCommentaar('a\n/**\n * weg\n */\nb').replace(/ +/g, ' ')).toBe('a\n \nb');
  });

  // ⚠️ Drie spaties en niet twee: de spatie vóór het blok, de spatie die het
  //    blok vervangt, en de spatie erna. Dat staat hier uitgeschreven omdat de
  //    eerste versie van deze toets er twee verwachtte en dus mijn telling
  //    toetste in plaats van de knip.
  it('een blok op één regel', () => {
    expect(zonderCommentaar('const a = /* weg */ 1;')).toBe('const a =   1;');
  });

  /**
   * ⚠️ De JSX-vorm die `roept-aan.ts` bij zijn eigen ijking miste: zo'n regel
   *    begint met een `{` en niet met `//` of `*`, dus een regelfilter alleen
   *    laat hem staan. Het blok gaat er als blok af; de accolades blijven, en
   *    dat is voor een zeef onschadelijk.
   */
  it('de JSX-vorm `{/* … */}`', () => {
    const uit = zonderCommentaar('{/* De knop bij wijzigMijlpaal(), die ontbrak. */}');

    expect(uit).not.toContain('wijzigMijlpaal');
    expect(uit).toBe('{ }');
  });

  it('meerdere blokken op één regel', () => {
    expect(zonderCommentaar('a /* x */ b /* y */ c')).toBe('a   b   c');
  });
});

// ---------------------------------------------------------------------------

describe('de randen', () => {
  it('een lege bron blijft leeg', () => {
    expect(zonderCommentaar('')).toBe('');
  });

  it('een bron zonder commentaar verandert niet', () => {
    const bron = 'const a = 1;\nconst b = 2;';

    expect(zonderCommentaar(bron)).toBe(bron);
  });

  /**
   * ⚠️⚠️ **Dit is de bekende beperking en hij staat hier als toets, niet als
   *    voetnoot.** Een `//` binnen een string die niet op een URL lijkt, wordt
   *    niet geknipt — de regel begint er immers niet mee — maar een regel die
   *    mét een string-`//` begint bestaat niet in deze codebase. Wie die vorm
   *    ooit nodig heeft, heeft een parser nodig en niet deze knip.
   */
  it('knipt niet in een string die niet aan het regelbegin staat', () => {
    const bron = "const deler = 'a//b';";

    expect(zonderCommentaar(bron)).toBe(bron);
  });

  it('laat een regel met alleen inspringing staan', () => {
    expect(zonderCommentaar('a\n   \nb')).toBe('a\n   \nb');
  });
});
