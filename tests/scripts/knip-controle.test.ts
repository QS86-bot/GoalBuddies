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
  GEEN_KNIP,
  isKnipLichaam,
  knipVormenIn,
  GEDEELD,
  klachten,
  knipt,
  leestBronMetNaampatroon,
  MET_REDEN,
  verweesdeRedenen,
  verweesdeVrijstellingen,
  ZONDER_KNIP,
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

// ---------------------------------------------------------------------------

/**
 * De tweede helft: **een bronlezer zónder knip is een keuze of een gat** — QS8-567.
 *
 * ⚠️⚠️ **Wat deze helft belooft is smal, en dat staat hier omdat het verschil
 *    de hele aanleiding was.** Hij belooft dat een nieuwe bronlezende controle
 *    geclassificeerd wordt. Hij belooft **niet** dat elke bronlezer correct
 *    knipt — "importeert de knip" is een neveneffect van de reparatie en geen
 *    eigenschap van het werk, en een grendel die daarop afgaat meet precies wat
 *    hij zegt te bewaken niet.
 *
 * 📏 **Vier instanties gemeten, alle vier falend open** (`foutsleutel`,
 *    `kolomrechten`, `aansluiting`, `avatar`). Die laatste vond deze controle
 *    zelf, nadat hij aan stond — en hij corrigeerde ook de telling waarmee het
 *    issue begon: `afstemgetal` leek een instantie omdat het een template
 *    literal gebruikt, maar zonder `${…}` erin is het de vorm niet.
 */
describe('leestBronMetNaampatroon', () => {
  const LEZER = "readFileSync(p); const r = new RegExp(`\\b${naam}\\s*\\(`);";

  it('ziet een bestand dat bron leest én een regex uit een naam bouwt', () => {
    expect(leestBronMetNaampatroon(LEZER)).toBe(true);
  });

  it('laat een template literal zónder interpolatie met rust', () => {
    // ⚠️ Dit is de vorm van `afstemgetal-controle.mjs`: een backtick-regex die
    //    geen naam inbouwt, en dus niet door een comment te misleiden is.
    expect(leestBronMetNaampatroon('readFileSync(p); new RegExp(`^\\s*const\\s+`, "u");')).toBe(
      false,
    );
  });

  it('laat een bestand dat geen bron leest met rust', () => {
    expect(leestBronMetNaampatroon('const r = new RegExp(`${naam}`);')).toBe(false);
  });

  /**
   * ⚠️ **Hij eet zijn eigen kost.** Deze controle beschrijft de vorm die hij
   *    zoekt in zijn eigen kop; zonder knip zou hij zichzelf melden.
   */
  it('telt de vorm niet mee als hij alleen in commentaar staat', () => {
    expect(leestBronMetNaampatroon('// readFileSync(p); new RegExp(`${naam}`)')).toBe(false);
  });
});

describe('knipt', () => {
  it('ziet de gedeelde import', () => {
    expect(knipt("import { zonderCommentaar } from './zonder-commentaar.mjs';", 'scripts/x.mjs')).toBe(
      true,
    );
  });

  it('ziet een eigen knip die in MET_REDEN staat', () => {
    const sleutel = Object.keys(MET_REDEN)[0] ?? '';
    const pad = sleutel.slice(0, sleutel.lastIndexOf(':'));
    expect(knipt('function zonderCommentaar(b) { return b; }', pad)).toBe(true);
  });

  it('ziet een bestand zonder knip als niet-knippend', () => {
    expect(knipt('const x = 1;', 'scripts/x.mjs')).toBe(false);
  });
});

describe('klachten over een bronlezer zonder knip', () => {
  const LEZER = "readFileSync(p); const r = new RegExp(`\\b${naam}\\s*\\(`);";

  it('meldt een ongeclassificeerde bronlezer in scripts/', () => {
    expect(klachten(LEZER, 'scripts/nieuw-controle.mjs')).toEqual([
      expect.stringContaining('knipt geen commentaar'),
    ]);
  });

  it('zwijgt over een bronlezer die in ZONDER_KNIP staat', () => {
    const pad = Object.keys(ZONDER_KNIP)[0] ?? '';
    expect(klachten(LEZER, pad)).toEqual([]);
  });

  it('zwijgt over een bronlezer die de gedeelde knip importeert', () => {
    const bron = `import { zonderCommentaar } from './zonder-commentaar.mjs';\n${LEZER}`;
    expect(klachten(bron, 'scripts/nieuw-controle.mjs')).toEqual([]);
  });

  it('kijkt niet buiten scripts/ — tests hebben hun eigen vormen', () => {
    expect(klachten(LEZER, 'tests/beloftes/x.test.ts')).toEqual([]);
  });
});

describe('verweesdeVrijstellingen', () => {
  const LEZER = "readFileSync(p); const r = new RegExp(`\\b${naam}\\s*\\(`);";

  it('meldt een rij waarvan het bestand weg is', () => {
    expect(verweesdeVrijstellingen(new Map())).toEqual(Object.keys(ZONDER_KNIP));
  });

  it('meldt een rij die inmiddels wél knipt', () => {
    const pad = Object.keys(ZONDER_KNIP)[0] ?? '';
    const bronnen = new Map(
      Object.keys(ZONDER_KNIP).map((p) => [
        p,
        p === pad ? `import { zonderCommentaar } from './zonder-commentaar.mjs';\n${LEZER}` : LEZER,
      ]),
    );
    expect(verweesdeVrijstellingen(bronnen)).toEqual([pad]);
  });

  it('zwijgt over een rij die zijn vrijstelling nog nodig heeft', () => {
    const bronnen = new Map(Object.keys(ZONDER_KNIP).map((p) => [p, LEZER]));
    expect(verweesdeVrijstellingen(bronnen)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * De derde helft: een knip die niet `zonderCommentaar` heet — QS8-579.
 *
 * ⚠️⚠️ **De tweede helft hieronder is hier de zwaarste.** Deze detector kijkt
 *    naar een lichaamsvorm, en een vormdetector die te ruim staat meldt elke
 *    `git('diff', '--name-only', …)` en elke URL-regex. 📏 Dat is precies wat
 *    een eerdere versie deed. Een controle die je leert negeren, bewaakt de
 *    échte elfde knip ook niet meer.
 */
describe('isKnipLichaam — de operatie, niet het teken', () => {
  it.each([
    "return bron.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');",
    "return bron.replace(/\\/\\/[^\\n]*/g, '');",
    "return sql.replace(/--[^\\n]*/g, ' ');",
    "return bron.split('\\n').filter((r) => !r.trimStart().startsWith('//')).join('\\n');",
  ])('herkent %s', (lichaam) => {
    expect(isKnipLichaam(lichaam)).toBe(true);
  });

  /**
   * ⚠️ **Een commentaarteken is geen knip.** Een CLI-vlag begint met `--` en een
   *    URL bevat `//`; allebei zijn ze geen uitleg die weggeknipt hoort te
   *    worden.
   */
  it.each([
    "return git('diff', '--name-only', basis, naam);",
    "return argv.filter((v) => v !== '--stil').join(' ');",
    "return /https:\\/\\/[^\\s]+/.exec(bron)?.[0] ?? null;",
    "return bron.toUpperCase();",
    "const opener = '/*';",
  ])('laat %s met rust', (lichaam) => {
    expect(isKnipLichaam(lichaam)).toBe(false);
  });
});

describe('knipVormenIn — welke functie knipt, ongeacht zijn naam', () => {
  it('vindt een knip onder een willekeurige naam', () => {
    const bron = "function plat(bron) {\n  return bron.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');\n}";

    expect(knipVormenIn(bron)).toEqual(['plat']);
  });

  it('en ook een knip die middenin een grotere functie zit', () => {
    const bron = [
      'function beoordeel(inhoud) {',
      "  const regels = inhoud.split('\\n');",
      "  regels.forEach((r) => { const code = r.replace(/^\\s*(\\/\\/|\\*)/, ''); tel(code); });",
      '  return regels.length;',
      '}',
    ].join('\n');

    expect(knipVormenIn(bron)).toEqual(['beoordeel']);
  });

  /**
   * ⚠️ **Eén parameter, en dat is een keuze die precisie koopt.** Een knip neemt
   *    bron en geeft bron terug. De prijs staat in de randtabel van het script:
   *    een knip met twee parameters ziet hij niet.
   */
  it('maar niet een functie met twee parameters', () => {
    const bron = "function knip(bron, vlag) {\n  return bron.replace(/\\/\\/[^\\n]*/g, vlag);\n}";

    expect(knipVormenIn(bron)).toEqual([]);
  });

  it('en niet een functie zonder parameters', () => {
    const bron = "function knip() {\n  return X.replace(/\\/\\/[^\\n]*/g, '');\n}";

    expect(knipVormenIn(bron)).toEqual([]);
  });

  /**
   * ⚠️ De gedeelde knip loopt er eerst overheen: een knip die alléén in een
   *    voorbeeld in commentaar staat, is er geen. Zelfde stap en zelfde reden
   *    als in `definitiesIn()`.
   */
  it('en niet een vorm die alleen in commentaar staat', () => {
    const bron = "// function plat(b) { return b.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' '); }";

    expect(knipVormenIn(bron)).toEqual([]);
  });
});

describe('de derde helft van klachten', () => {
  const KNIP = "function plat(bron) {\n  return bron.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');\n}";

  it('meldt een knip die niet zo heet', () => {
    const uit = klachten(KNIP, 'scripts/nieuw-controle.mjs');

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('`plat` knipt commentaar maar heet niet zo');
  });

  it('en doet dat ook in de testboom — daar zaten er vier', () => {
    expect(klachten(KNIP, 'tests/beloftes/x.test.ts')).toHaveLength(1);
  });

  /**
   * ⚠️ Een naam die `DEFINITIE` al vangt, hoort niet twee keer gemeld te worden:
   *    dan staat er één knip met twee klachten en weet de lezer niet welke rij
   *    hij moet zetten.
   */
  it('meldt een `zonderCommentaar`-knip precies één keer', () => {
    const bron = "function zonderCommentaarX(bron) {\n  return bron.replace(/\\/\\/[^\\n]*/g, '');\n}";

    expect(klachten(bron, 'scripts/nieuw-controle.mjs')).toHaveLength(1);
  });

  it('zwijgt over een vormtreffer die in GEEN_KNIP staat', () => {
    const [sleutel] = Object.keys(GEEN_KNIP);
    const [pad, naam] = (sleutel ?? ':').split(':');
    const bron = `function ${naam}(bron) {\n  return bron.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');\n}`;

    expect(klachten(bron, pad)).toEqual([]);
  });

  it('maar niet over diezelfde naam in een ánder bestand', () => {
    const [sleutel] = Object.keys(GEEN_KNIP);
    const naam = (sleutel ?? ':').split(':')[1];
    const bron = `function ${naam}(bron) {\n  return bron.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');\n}`;

    expect(klachten(bron, 'scripts/ergens-anders.mjs')).toHaveLength(1);
  });

  /**
   * ⚠️⚠️ **Elke rij in `GEEN_KNIP` draagt een reden die iets uitlegt.** Een
   *    register met lege rijen is de vorm die dit project elders afwijst — zie
   *    de eis bij `dml:controle`.
   */
  it('en elke rij in GEEN_KNIP zegt waaróm het geen knip is', () => {
    for (const [sleutel, reden] of Object.entries(GEEN_KNIP)) {
      expect(sleutel, `${sleutel} mist een functienaam`).toMatch(/^[^:]+:[A-Za-z_$][\w$]*$/);
      expect(reden.length, `${sleutel} staat er zonder reden`).toBeGreaterThan(30);
    }
  });
});
