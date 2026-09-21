/**
 * De belofte: **`belofteknip:controle` vindt een bevestigende toets op ruwe
 * bestandsinhoud, en laat elke vorm die dícht faalt met rust** — QS8-574.
 *
 * ⚠️⚠️ **Die tweede helft is hier de zwaarste.** De gevaarlijke vorm is smal:
 *    een *bevestigende* `toContain`/`toMatch` op een waarde die rechtstreeks uit
 *    `readFileSync` komt. Alles eromheen — een `.not.`-toets, een geknipte
 *    waarde, een afgeleide lijst — faalt dicht en hoort níet gemeld te worden.
 *    Een controle die dat wél doet, staat meteen vol met tientallen regels in
 *    `tests/beloftes/`, en die leer je uitzetten. Het issue waarschuwde er met
 *    zoveel woorden voor: *niet "elk bestand dat bron leest moet knippen"*.
 *
 * ⚠️ De vormen hieronder staan als **string** in deze test en niet als echte
 *    code, want een zeef ijk je door hem zijn geval los aan te bieden. Deze map
 *    valt buiten het bereik van de controle zelf (die kijkt in
 *    `tests/beloftes/`), dus zijn eigen ijking maakt hem niet rood.
 */
import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import {
  bevestigendeToetsen,
  klachten,
  MAP,
  MET_REDEN,
  ruweNamen,
  ruweProducenten,
  verweesdeRedenen,
} from '../../scripts/belofteknip-controle.mjs';

const PAD = 'tests/beloftes/verzonnen.test.ts';

// ---------------------------------------------------------------------------

describe('ruweNamen — welke waarde is ongeknipte bestandsinhoud', () => {
  it.each([
    ["const BRON = readFileSync('x.ts', 'utf8');", 'BRON'],
    ["const bron: string = readFileSync(pad, 'utf8');", 'bron'],
    ["let bron = readFileSync(join(W, 'a', 'b.tsx'), 'utf8');", 'bron'],
    ["const paren = paden.map((p) => ({ pad: p, inhoud: readFileSync(p, 'utf8') }));", 'inhoud'],
  ])('vindt %s', (bron, naam) => {
    expect([...ruweNamen(bron)]).toContain(naam);
  });

  /**
   * ⚠️ **De kern van de zeef.** Gaat de waarde ergens langs, dan is dit
   *    gereedschap er klaar mee — of die functie nu knipt of niet. Dat is een
   *    bewuste rand en hij staat in de kop van de controle.
   */
  it.each([
    "const bron = zonderCommentaar(readFileSync('x.ts', 'utf8'));",
    "const bron = plat(readFileSync('x.ts', 'utf8'));",
    "const sql = readFileSync('x.sql', 'utf8').replace(/--[^\\n]*/g, '');",
    "const regels = readFileSync('x.ts', 'utf8').split('\\n');",
  ])('laat %s met rust', (bron) => {
    expect([...ruweNamen(bron)]).toHaveLength(0);
  });

  /**
   * ⚠️⚠️ **Deze laag zit erin omdat hij een échte instantie droeg.**
   *    `weekpas-bereikt-je.test.ts` gaf zijn ruwe bron via een hulpfunctie door,
   *    en zonder deze regel zag de controle vijf bevestigende toetsen niet. Zie
   *    de randtabel in de kop van het script.
   */
  it('volgt een hulpfunctie die de ruwe inhoud teruggeeft', () => {
    const bron = [
      "function lees(pad: string): string {\n  return readFileSync(join(W, pad), 'utf8');\n}",
      "const job = lees(JOB);",
    ].join('\n');

    expect([...ruweProducenten(bron)]).toEqual(['lees']);
    expect([...ruweNamen(bron)]).toContain('job');
  });

  it('en een pijlfunctie die hetzelfde doet', () => {
    const bron = ["const lees = (pad: string) => readFileSync(pad, 'utf8');", 'const a = lees(P);'].join(
      '\n',
    );

    expect([...ruweNamen(bron)]).toContain('a');
  });

  /**
   * ⚠️ De spiegelzijde: een hulpfunctie die zélf knipt, maakt zijn uitkomst niet
   *    ruw. Zonder dit onderscheid meldt de controle juist de bestanden die het
   *    goed doen — `aanmeldscherm.test.ts` is precies deze vorm.
   */
  it('maar niet een hulpfunctie die onderweg knipt', () => {
    const bron = [
      "function schermbron(): string {\n  return plat(readFileSync(SCHERM, 'utf8'));\n}",
      'const b = schermbron();',
    ].join('\n');

    expect([...ruweProducenten(bron)]).toHaveLength(0);
    expect([...ruweNamen(bron)]).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('bevestigendeToetsen — alleen wat open kan falen', () => {
  const lees = "const bron = readFileSync('x.ts', 'utf8');\n";

  it.each([
    ["expect(bron).toContain('koppel(');", 'toContain'],
    ['expect(bron).toMatch(/koppel\\(/);', 'toMatch'],
    ["expect(bron, 'een melding die uitlegt wat er stuk is').toContain('koppel(');", 'toContain'],
  ])('meldt %s', (toets, soort) => {
    expect(bevestigendeToetsen(lees + toets)).toEqual([{ naam: 'bron', toets: soort }]);
  });

  it('en ook een toets die prettier over meerdere regels heeft gezet', () => {
    const toets = [
      'expect(',
      '  bron,',
      "  'de onboarding leidt zijn tijdzone niet meer af van het apparaat',",
      ').toMatch(/apparaatTijdzone\\(\\)/);',
    ].join('\n');

    expect(bevestigendeToetsen(lees + toets)).toHaveLength(1);
  });

  it('en een toets op een eigenschap van een gelezen object', () => {
    const bron = [
      "const alle = namen.map((n) => ({ naam: n, inhoud: readFileSync(n, 'utf8') }));",
      'expect(gedeeld?.inhoud).toMatch(/PGPORT/);',
    ].join('\n');

    expect(bevestigendeToetsen(bron)).toEqual([{ naam: 'inhoud', toets: 'toMatch' }]);
  });

  /**
   * ⚠️⚠️ **De helft die de controle bruikbaar houdt.** Een `.not.toContain()` op
   *    ruwe bron faalt **dicht**: commentaar erbij kan hem alleen rood maken,
   *    nooit stil groen. 📏 In `tests/beloftes/` staan er tientallen; ze melden
   *    zou de controle onbruikbaar maken.
   */
  it.each([
    "expect(bron).not.toContain('tabBarPosition');",
    'expect(bron).not.toMatch(/t\\(.weekpas\\./);',
    "expect(bron, 'de oude balkopmaak hoort weg te zijn').not.toContain('tabBarPosition');",
  ])('zwijgt over %s', (toets) => {
    expect(bevestigendeToetsen(lees + toets)).toEqual([]);
  });

  it.each([
    'expect(bron).toHaveLength(0);',
    "expect(bron).toBe('');",
    'expect(bron.split(/\\n/)).toEqual([]);',
    'expect(SCHERMEN).toContain(\'app/groep/leden/[id].tsx\');',
  ])('en over %s', (toets) => {
    expect(bevestigendeToetsen(lees + toets)).toEqual([]);
  });

  /**
   * ⚠️ Een geknipte waarde is het doel van deze controle en niet zijn onderwerp.
   *    Zonder deze toets zou hij ná elke reparatie blijven melden — en dan is
   *    hij een controle die je niet groen kúnt krijgen.
   */
  it('en over een toets op een geknipte waarde', () => {
    const bron = [
      "const bron = zonderCommentaar(readFileSync('x.ts', 'utf8'));",
      "expect(bron).toContain('koppel(');",
    ].join('\n');

    expect(bevestigendeToetsen(bron)).toEqual([]);
  });

  /**
   * ⚠️ De gedeelde knip loopt er eerst overheen, dus een vorm die alleen in een
   *    comment staat telt niet mee. Dezelfde stap en dezelfde reden als in
   *    `knip-controle.mjs`: een controle die zijn eigen uitleg rood maakt, leer
   *    je uitzetten.
   */
  it('en over een vorm die alleen in commentaar staat', () => {
    const bron = [
      "// const bron = readFileSync('x.ts', 'utf8');",
      "// expect(bron).toContain('koppel(');",
      "/** expect(bron).toMatch(/koppel/); */",
    ].join('\n');

    expect(bevestigendeToetsen(bron)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('klachten — de melding en de vrijstelling', () => {
  const bron = ["const bron = readFileSync('x.ts', 'utf8');", "expect(bron).toContain('koppel(');"].join(
    '\n',
  );

  it('meldt het bestand, de naam en de matcher', () => {
    const uit = klachten(bron, PAD);

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain(PAD);
    expect(uit[0]).toContain('expect(bron).toContain()');
  });

  it('telt gelijke toetsen samen in plaats van ze te herhalen', () => {
    const drie = [
      "const bron = readFileSync('x.ts', 'utf8');",
      "expect(bron).toContain('a(');",
      "expect(bron).toContain('b(');",
      "expect(bron).toContain('c(');",
    ].join('\n');

    expect(klachten(drie, PAD)).toHaveLength(1);
    expect(klachten(drie, PAD)[0]).toContain('3×');
  });

  /**
   * ⚠️⚠️ **Het register is vandaag leeg en dus niet te ijken op de echte boom.**
   *    Daarom neemt `klachten()` er een als derde parameter: zo blijft de vraag
   *    *"werkt vrijstellen eigenlijk"* toetsbaar zonder een ongemeten rij in de
   *    code te zetten. Een register met ongemeten rijen is de vorm die dit
   *    project elders afwijst.
   */
  it('zwijgt over een bestand dat met een reden in het register staat', () => {
    expect(klachten(bron, PAD, { [PAD]: 'een gemeten reden' })).toEqual([]);
  });

  it('maar niet over een ánder bestand', () => {
    expect(klachten(bron, PAD, { 'tests/beloftes/iets-anders.test.ts': 'reden' })).toHaveLength(1);
  });

  /**
   * ⚠️ **Normaliseren vóór élke padvergelijking.** Op Windows geeft `relative()`
   *    `tests\beloftes\x.test.ts`, en dan matcht een registerrij met schuine
   *    strepen nooit — zelfde val als bij `knip-controle` (QS8-567).
   */
  it('en herkent een registerrij ook bij een Windows-pad', () => {
    const windows = 'tests\\beloftes\\verzonnen.test.ts';

    expect(klachten(bron, windows, { [PAD]: 'reden' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('verweesdeRedenen — het register groeit niet stil door', () => {
  const metVorm = ["const b = readFileSync('x.ts', 'utf8');", "expect(b).toContain('q(');"].join('\n');

  it('meldt een rij waarvan het bestand niet meer bestaat', () => {
    expect(verweesdeRedenen(new Map(), { [PAD]: 'reden' })).toEqual([PAD]);
  });

  /**
   * ⚠️ De tweede kant, en die is de stillere: het bestand bestaat nog maar
   *    draagt de vorm niet meer. De rij stelt dan niets meer vrij, en de
   *    volgende lezer leest hem als een reden om er niet aan te twijfelen.
   */
  it('en een rij waarvan het bestand de vorm niet meer draagt', () => {
    const geknipt = "const b = zonderCommentaar(readFileSync('x.ts', 'utf8'));\nexpect(b).toContain('q(');";

    expect(verweesdeRedenen(new Map([[PAD, geknipt]]), { [PAD]: 'reden' })).toEqual([PAD]);
  });

  it('maar laat een rij die nog iets vrijstelt met rust', () => {
    expect(verweesdeRedenen(new Map([[PAD, metVorm]]), { [PAD]: 'reden' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('de afbakening staat vast en niet per ongeluk', () => {
  it('kijkt in tests/beloftes en niet breder', () => {
    expect(MAP).toBe('tests/beloftes');
  });

  /**
   * ⚠️⚠️ **Leeg is hier de gemeten uitkomst.** Alle acht bestanden die QS8-574
   *    vond, faalden open en zijn gerepareerd; er was geen rij te
   *    verantwoorden. Deze toets wordt rood zodra iemand er een bijzet — en dan
   *    hoort daar een mutatie bij te staan, geen argument. Zie de kop van
   *    `MET_REDEN` en het beslisdocument.
   */
  it('en het register is leeg tot iemand een dichte vorm méét', () => {
    expect(Object.keys(MET_REDEN)).toEqual([]);
  });
});
