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

// ---------------------------------------------------------------------------

/**
 * QS8-709: **een `/*` in een string of template is geen commentaar.**
 *
 * 📏 De vorm die dit kostte: `` const a = [`${app}/**`]; process.exit(1); /** later *\/ ``.
 *    De oude knip las `/**` uit de template als begin van een blok en at alles tot
 *    de volgende `*\/` op — dus ook de `process.exit`. Gemeten over 892 bronbestanden:
 *    in 60 bestanden at hij code op (scripts/ en tests/, nul in src/ en app/).
 */
describe('een blokopening in een string is geen commentaar (QS8-709)', () => {
  it('laat code staan achter `/**` in een template, ook met een `*/` verderop', () => {
    const bron = 'const a = [`${app}/**`];\nprocess.exit(1);\n/** later */\nconst b = 2;';
    const uit = zonderCommentaar(bron);

    expect(uit).toContain('process.exit(1);');
    expect(uit).toContain('const b = 2;');
    expect(uit).not.toContain('later');
  });

  it.each([
    "const a = 'goalbuddies://**'; run(); /* x */",
    'const a = "http://localhost:8081/**"; run(); /* x */',
    "const re = /'/; run(); /* x */",
    'const re = /`/; run(); /* x */',
    "const re = /[/*]/; run(); /* x */",
  ])('laat de code staan in %s', (bron) => {
    const uit = zonderCommentaar(bron);

    expect(uit).toContain('run();');
    expect(uit).not.toContain('x */');
  });

  it('laat een `*/` in een string staan en knipt het blok erna wel', () => {
    const uit = zonderCommentaar("const s = '*/'; keep(); /* weg */ end();");

    expect(uit).toContain("'*/'");
    expect(uit).toContain('keep();');
    expect(uit).toContain('end();');
    expect(uit).not.toContain('weg');
  });

  it('volgt een template in een template-expressie', () => {
    const bron = 'const a = `x ${`${b}/**`} y`; keep(); /* weg */';
    const uit = zonderCommentaar(bron);

    expect(uit).toContain('keep();');
    expect(uit).not.toContain('weg');
  });

  it('knipt een regelcommentaar dat in een template staat niet weg', () => {
    const bron = 'const a = `\n// geen commentaar\n`;';

    expect(zonderCommentaar(bron)).toBe(bron);
  });

  it('knipt een JSDoc-blok en de JSX-vorm nog steeds', () => {
    const uit = zonderCommentaar('/** weg */\n{/* ook weg */}\nkeep();');

    expect(uit).not.toContain('weg');
    expect(uit).toContain('keep();');
  });

  it('een deling is geen regex', () => {
    const uit = zonderCommentaar("const a = b / c; const t = 'x'; keep(); /* weg */");

    expect(uit).toContain('keep();');
    expect(uit).not.toContain('weg');
  });
});
