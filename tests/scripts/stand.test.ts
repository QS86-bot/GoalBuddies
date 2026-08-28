/**
 * IJking van `scripts/stand.mjs`.
 *
 * ⚠️ **De belofte is niet "het blok bevat een getal".** De belofte is: *deze
 *    alinea is geen kopie meer die uiteen kán lopen met de map*. Op 28-08-2026
 *    gaf hij vier PR's achter elkaar een merge-conflict, en twee van die vier
 *    keer stond er daarna een getal in dat niet klopte. Toen dit script voor het
 *    eerst draaide, was de handgeschreven 124 al 126 — binnen het uur.
 *
 * ⚠️ **Twee sessies die allebei regenereren, schrijven letterlijk hetzelfde.**
 *    Dat is de hele reden dat het conflict weg is, en het is ook de reden dat er
 *    géén datum in het blok staat: een stempel met "vandaag" verandert elke dag
 *    zonder dat er iets veranderd is, en dan is de conflictbron terug.
 */
import { describe, expect, it } from 'vitest';

import { BEGIN, EINDE, blokUit, standRegels, vervangBlok } from '../../scripts/stand.mjs';

const MAP = [
  '0001_begin.sql',
  '0039_iets.sql',
  '0039a_nazorg.sql',
  '0040_verder.sql',
  'README.md',
];

describe('standRegels', () => {
  it('telt de bestanden en noemt het bereik', () => {
    const tekst = standRegels(MAP);
    expect(tekst).toContain('`0001` t/m `0040`');
    expect(tekst).toContain('**4 bestanden**');
  });

  it('telt een letter-achtervoegsel wel als bestand en niet als nummer', () => {
    const tekst = standRegels(MAP);
    expect(tekst).toContain('1 met een letter-achtervoegsel (`0039a`)');
    // 0039a schuift het bereik niet op naar 0041.
    expect(tekst).toContain('t/m `0040`');
  });

  it('laat niet-sql buiten de telling', () => {
    expect(standRegels(MAP)).toContain('**4 bestanden**');
    expect(standRegels([...MAP, 'notities.txt'])).toContain('**4 bestanden**');
  });

  it('meldt aaneengesloten nummering als die klopt', () => {
    expect(standRegels(['0001_a.sql', '0002_b.sql'])).toContain('aaneengesloten');
  });

  // ⚠️ Een gat is het gevaarlijkste geval uit onwrikbare regel 20: dan bouwt de
  //    map het schema van productie niet op, en toetst de RLS-suite iets anders.
  it('noemt een gat met nummer en al', () => {
    const tekst = standRegels(['0001_a.sql', '0003_c.sql']);
    expect(tekst).toContain('ontbreken nummers: 0002');
    expect(tekst).not.toContain('aaneengesloten');
  });

  it('is stabiel: dezelfde map geeft letterlijk dezelfde tekst', () => {
    expect(standRegels(MAP)).toBe(standRegels([...MAP].reverse()));
  });

  it('draagt geen datum — anders verandert het blok elke dag voor niets', () => {
    expect(standRegels(MAP)).not.toMatch(/20\d\d/);
  });
});

describe('blokUit', () => {
  it('haalt de inhoud tussen de markeringen op', () => {
    const document = `kop\n\n${BEGIN}\nregel een\nregel twee\n${EINDE}\n\nstaart`;
    expect(blokUit(document)).toBe('regel een\nregel twee');
  });

  it('geeft null als de markeringen ontbreken', () => {
    expect(blokUit('een document zonder markeringen')).toBeNull();
  });

  it('geeft null als de markeringen omgekeerd staan', () => {
    expect(blokUit(`${EINDE}\niets\n${BEGIN}`)).toBeNull();
  });
});

describe('vervangBlok', () => {
  it('vervangt alleen het blok en laat de rest staan', () => {
    const document = `kop\n\n${BEGIN}\noud\n${EINDE}\n\nstaart`;
    const nieuw = vervangBlok(document, 'nieuw');
    expect(blokUit(nieuw)).toBe('nieuw');
    expect(nieuw.startsWith('kop')).toBe(true);
    expect(nieuw.endsWith('staart')).toBe(true);
  });

  // ⚠️ Geen stille toevoeging: een generator die het blok zelf ergens neerplakt,
  //    zet de stand een keer middenin een andere paragraaf.
  it('weigert een document zonder markeringen in plaats van er iets bij te plakken', () => {
    expect(() => vervangBlok('geen markeringen hier', 'iets')).toThrow(/markeringen/);
  });

  it('is idempotent — twee keer draaien geeft hetzelfde document', () => {
    const document = `${BEGIN}\noud\n${EINDE}`;
    const een = vervangBlok(document, 'nieuw');
    expect(vervangBlok(een, 'nieuw')).toBe(een);
  });
});
