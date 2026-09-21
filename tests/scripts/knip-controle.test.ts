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
  BEOORDEELD,
  definitiesIn,
  GEDEELD,
  klachten,
  knipt,
  leestBronMetNaampatroon,
  MET_REDEN,
  verweesdeBeoordelingen,
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

/**
 * De verbreding van QS8-572 — elke vorm los aangeboden, in beide richtingen.
 *
 * ⚠️⚠️ **De tweede helft weegt hier het zwaarst.** De reden dat de
 *    stringmethode-vormen er níet in zitten, is gemeten precisie: 📏 van de vijf
 *    treffers op `.includes`, `.split` en `.startsWith` met een template is er
 *    één een échte bronscan; de rest zijn pad- en sleutelvergelijkingen. Zou
 *    iemand ze later alsnog toevoegen, dan horen deze vier toetsen rood te
 *    worden — dat is het enige wat die meting vasthoudt.
 */
describe('leestBronMetNaampatroon — de vormen van QS8-572', () => {
  const LEEST = 'readFileSync(p); ';

  it.each([
    ['new + template', 'const r = new RegExp(`\\b${naam}\\s*\\(`);'],
    ['zonder new, met template', 'const r = RegExp(`\\b${naam}\\s*\\(`);'],
    ['new + concatenatie met enkele quotes', "const r = new RegExp('`((?:' + MAPPEN + ')/x)`', 'g');"],
    ['zonder new, concatenatie met dubbele quotes', 'const r = RegExp("^" + naam, "g");'],
    ['een newline ná de haak', 'const r = new RegExp(\n  `${naam}`,\n);'],
  ])('ziet %s', (_naam, vorm) => {
    expect(leestBronMetNaampatroon(LEEST + vorm)).toBe(true);
  });

  it.each([
    ['een includes op een template', 'if (bron.includes(`const ${naam} =`)) return true;'],
    ['een split op een template', 'const delen = bron.split(`const ${naam} =`);'],
    ['een startsWith op een template', 'if (regel.startsWith(`${vorm} `)) return true;'],
    ['een concatenatie zonder stringliteraal ervoor', 'const r = new RegExp(naam + suffix);'],
    ['een template zonder interpolatie', 'const r = new RegExp(`^\\s*const\\s+`, "u");'],
    ['een naam die op RegExp eindigt', 'const r = XRegExp(`${naam}`);'],
  ])('laat %s met rust', (_naam, vorm) => {
    expect(leestBronMetNaampatroon(LEEST + vorm)).toBe(false);
  });

  it('eist nog steeds dat er bron gelezen wordt', () => {
    expect(leestBronMetNaampatroon("const r = RegExp('^' + naam);")).toBe(false);
  });

  it('telt een verbrede vorm niet mee als hij alleen in commentaar staat', () => {
    expect(leestBronMetNaampatroon("// readFileSync(p); RegExp('^' + naam)")).toBe(false);
  });
});

/**
 * `BEOORDEELD` is met de hand bijgehouden, dus zijn ratel is het enige wat hem
 * eerlijk houdt — QS8-572.
 */
describe('verweesdeBeoordelingen', () => {
  const PAD = Object.keys(BEOORDEELD)[0] ?? '';
  const SCAN = "readFileSync(p); if (regel.startsWith(`${vorm} `)) return true;";

  it('meldt een rij waarvan het bestand weg is', () => {
    expect(verweesdeBeoordelingen(new Map())).toEqual(Object.keys(BEOORDEELD));
  });

  it('meldt een rij die inmiddels wél knipt', () => {
    const bron = `import { zonderCommentaar } from './zonder-commentaar.mjs';\n${SCAN}`;
    expect(verweesdeBeoordelingen(new Map([[PAD, bron]]))).toEqual([PAD]);
  });

  it('meldt een rij die inmiddels gedetecteerd wordt — die hoort in ZONDER_KNIP', () => {
    const bron = 'readFileSync(p); const r = new RegExp(`${naam}`);';
    expect(verweesdeBeoordelingen(new Map([[PAD, bron]]))).toEqual([PAD]);
  });

  it('meldt een rij waarvan het bestand geen bron meer leest', () => {
    expect(verweesdeBeoordelingen(new Map([[PAD, 'const x = 1;']]))).toEqual([PAD]);
  });

  it('zwijgt over een rij die zijn beoordeling nog nodig heeft', () => {
    expect(verweesdeBeoordelingen(new Map([[PAD, SCAN]]))).toEqual([]);
  });

  it('elke rij draagt een reden die iets uitlegt', () => {
    for (const [pad, reden] of Object.entries(BEOORDEELD)) {
      expect(reden.length, `${pad} heeft een te korte reden`).toBeGreaterThan(80);
    }
  });
});
