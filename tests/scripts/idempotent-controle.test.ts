/**
 * IJking van `scripts/idempotent-controle.mjs` — QS8-413.
 *
 * ⚠️ **Wat hier wél te ijken is en wat niet.** De controle zelf vraagt een
 *    Postgres; die helft is met de hand gemeten (zie het beslisdocument, en de
 *    tabel in de PR). Wat hier los aangeboden wordt is het oordeel over de
 *    uitvoer van de opbouw — inclusief de stílle uitkomst, die anders als
 *    geslaagd telt.
 *
 * ⚠️⚠️ **De stille uitkomst is de reden dat `beoordeelOpbouw()` bestaat en niet
 *    gewoon een exitcode-vergelijking is.** Dit project heeft drie keer betaald
 *    voor een stap die exitcode 0 gaf zonder iets gemeten te hebben: de
 *    RLS-suite die zichzelf oversloeg (QS8-270), de controles die "OVERGESLAGEN"
 *    printten en 0 teruggaven, en de deploy die op Windows stil eindigde. Een
 *    opbouw zonder slotregel valt in diezelfde klasse.
 */
import { describe, expect, it } from 'vitest';

import {
  beoordeelOpbouw,
  DUBBEL_DB,
  KLAAR,
  roodregels,
  staart,
} from '../../scripts/idempotent-controle.mjs';

const GESLAAGD = '→ goalbuddies_dubbel opnieuw aanmaken\n✓ 255 migraties elk twee keer afgespeeld op een lege database (Postgres 16)\n';

describe('beoordeelOpbouw', () => {
  it('noemt een geslaagde opbouw groen, met het aantal', () => {
    expect(beoordeelOpbouw({ code: 0, uitvoer: GESLAAGD })).toEqual({
      stand: 'groen',
      aantal: 255,
    });
  });

  it('noemt het bestand dat omviel', () => {
    const uit = beoordeelOpbouw({
      code: 1,
      uitvoer: '→ opnieuw aanmaken\n✗ 0252_de_goedkeuring.sql viel om — draai hem los\n',
    });

    expect(uit.stand).toBe('rood');
    expect(uit.reden).toContain('0252_de_goedkeuring.sql');
    expect(uit.reden).toContain('botst op zichzelf');
  });

  it('meldt ook een mislukking die niet zegt waar', () => {
    const uit = beoordeelOpbouw({ code: 1, uitvoer: 'psql: iets ging mis\n' });

    expect(uit.stand).toBe('rood');
    expect(uit.reden).toContain('zonder te zeggen waar');
  });

  /**
   * ⚠️⚠️ **Exitcode 0 zonder slotregel is rood en niet groen.** Zou dit script
   *    alleen naar de exitcode kijken, dan telt een opbouw die halverwege stopt
   *    als bewijs — precies de vorm die CLAUDE.md bij de poort beschrijft en die
   *    dit project al drie keer betaald heeft.
   */
  it('vertrouwt exitcode 0 niet zonder slotregel', () => {
    const uit = beoordeelOpbouw({ code: 0, uitvoer: '→ goalbuddies_dubbel opnieuw aanmaken\n' });

    expect(uit.stand).toBe('rood');
    expect(uit.reden).toContain('halverwege');
  });

  /**
   * ⚠️ **En de slotregel van een gewone opbouw telt niet mee.** Zonder deze
   *    grens zou `schema-opbouwen.sh` zónder `--dubbel` als bewijs doorgaan, en
   *    dan meet deze controle precies niets van wat hij belooft.
   */
  it('accepteert de slotregel van een enkele opbouw níét', () => {
    const enkel = '✓ 255 migraties afgespeeld op een lege database (Postgres 16)\n';

    expect(KLAAR.test(enkel)).toBe(false);
    expect(beoordeelOpbouw({ code: 0, uitvoer: enkel }).stand).toBe('rood');
  });
});

/**
 * ⚠️⚠️ **Het advies hoort bij de gemeten oorzaak — QS8-562.** Hieronder stond
 *    één advies voor élke rode uitslag: *zet de opruiming van álle objecten
 *    bovenaan, in omgekeerde afhankelijkheidsvolgorde*. 📏 Gemeten op
 *    19-09-2026 met een rol die geen eigenaar van de database is: de opbouw zei
 *    `ERROR: must be owner of database goalbuddies_dubbel`, en deze controle
 *    drukte dat constraint-advies eroverheen — mét *"de opbouw viel om zonder
 *    te zeggen waar"*, terwijl de opbouw precies zei waar.
 *
 *    Dat is dezelfde fout als in `schema-opbouwen.sh` zelf, één laag hoger: een
 *    plausibele oorzaak in plaats van de gemeten.
 */
describe('het soort rood bepaalt het advies', () => {
  it('noemt een omgevallen migratie soort migratie', () => {
    const uit = beoordeelOpbouw({
      code: 1,
      uitvoer: '→ opnieuw aanmaken\n✗ 0252_de_goedkeuring.sql viel om — draai hem los\n',
    });

    expect(uit.soort).toBe('migratie');
  });

  it('⚠️ noemt een opbouw die op iets anders omviel juist níet zo', () => {
    // De vorm van QS8-562: de drop mislukte, er viel geen migratie om.
    const uit = beoordeelOpbouw({
      code: 1,
      uitvoer:
        '→ goalbuddies_dubbel opnieuw aanmaken\n' +
        '✗ goalbuddies_dubbel kon niet weg: deze rol is geen eigenaar van die database.\n' +
        'psql zei letterlijk:\nERROR:  must be owner of database goalbuddies_dubbel\n',
    });

    expect(uit.soort).toBe('onbekend');
  });
});

describe('staart — de opbouw komt altijd aan het woord', () => {
  it('houdt de laatste regels over, want daar stopt de opbouw', () => {
    expect(staart('a\nb\nc\nd', 2)).toBe('c\nd');
  });

  it('⚠️ begraaft de fout niet onder de ruis van een halve opbouw', () => {
    const ruis = Array.from({ length: 400 }, (_, i) => `psql:0003_rls.sql:${i}: NOTICE:  iets`);
    const uitvoer = [...ruis, 'psql zei letterlijk:', 'ERROR:  must be owner of database x'].join(
      '\n',
    );

    expect(staart(uitvoer)).toContain('must be owner of database x');
    expect(staart(uitvoer).split('\n')).toHaveLength(20);
  });

  it('slaat lege regels over, zodat de staart ook echt twintig regels draagt', () => {
    expect(staart('a\n\n\nb', 2)).toBe('a\nb');
  });
});

describe('roodregels — wat de lezer bij rood te zien krijgt', () => {
  const OPBOUWFOUT =
    '→ goalbuddies_dubbel opnieuw aanmaken\n' +
    '✗ goalbuddies_dubbel kon niet weg: deze rol is geen eigenaar van die database.\n' +
    'psql zei letterlijk:\nERROR:  must be owner of database goalbuddies_dubbel';

  it('⚠️ zet de uitvoer van de opbouw er altijd onder — criterium 1 van QS8-562', () => {
    for (const soort of ['migratie', 'onbekend']) {
      expect(roodregels({ reden: 'iets', soort }, OPBOUWFOUT).join('\n')).toContain(
        'must be owner of database goalbuddies_dubbel',
      );
    }
  });

  it('geeft het opruimadvies bij een omgevallen migratie', () => {
    expect(roodregels({ reden: 'x', soort: 'migratie' }, '').join('\n')).toContain(
      'omgekeerde\nafhankelijkheidsvolgorde',
    );
  });

  it('⚠️ houdt dat advies weg als er geen migratie omviel — anders is het een gok', () => {
    expect(roodregels({ reden: 'x', soort: 'onbekend' }, OPBOUWFOUT).join('\n')).not.toContain(
      'omgekeerde\nafhankelijkheidsvolgorde',
    );
  });
});

describe('de eigen database', () => {
  /**
   * ⚠️ Niet `goalbuddies_rls`. Deze controle gooit zijn database weg en bouwt
   *    hem opnieuw op; zou dat de stack zijn, dan sloopt een poortrun de
   *    opstelling waar de RLS-suite tegen draait — en dan is de volgende suite
   *    groen over een schema dat er net niet meer was.
   */
  it('is niet die van de RLS-stack', () => {
    expect(DUBBEL_DB).toBe('goalbuddies_dubbel');
    expect(DUBBEL_DB).not.toBe('goalbuddies_rls');
  });
});
