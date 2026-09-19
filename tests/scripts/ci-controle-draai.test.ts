import { describe, expect, it } from 'vitest';

import { draaiAlle, draaiControle, regels, samenvatting, voerUit } from '../../scripts/ci-controle-draai.mjs';
import { beoordeel } from '../../scripts/poort.mjs';

/**
 * De classificatie die CI gebruikt — QS8-563.
 *
 * ⚠️⚠️ **De helft die telt is de tweede: een échte bevinding blijft rood.**
 *    Zonder die toets is de reparatie van dit issue niet te onderscheiden van
 *    "zet de melder uit", en dat is precies wat acceptatiecriterium 3 vraagt.
 *
 * ⚠️ De toetsen voeden een uitvoerder mee in plaats van echt `npm run` te
 *    draaien. Dat is geen versimpeling: het gaat hier om de **beoordeling** van
 *    een uitslag, en die is alleen scherp te toetsen als je elke uitslag los
 *    kunt aanbieden — ook de ene die je in het echt niet op commando krijgt
 *    (een 400 van npm).
 */

/** Wat `audit-controle` schrijft als npm's endpoint een 400 geeft. */
const NPM_VIERHONDERD = `⚠ audit-controle: OVERGESLAGEN — \`npm audit\` gaf geen rapport met \`vulnerabilities\`.
  Reden van npm: 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request
  Deze controle heeft het register van npm nodig; zonder netwerk kan hij niets
  meten. Dat is geen groene uitslag maar een ongemeten.`;

/** Wat hij schrijft als hij écht iets vindt — de vorm uit QS8-375. */
const ECHTE_BEVINDING = `✗ audit-controle: de verzameling kwetsbare wortels is veranderd.
  nieuw: js-yaml (moderate)
  zwaarder: @xmldom/xmldom moderate -> high
  Draai \`npm run build\` en kijk of ze in de bundel zitten.`;

function vast(code: number, uitvoer: string) {
  return () => ({ code, uitvoer });
}

describe('draaiControle — de drie uitkomsten', () => {
  it('noemt een geslaagde controle groen', () => {
    const uit = draaiControle('audit:controle', vast(0, 'audit-controle: 5 wortels, allemaal nagekeken.'));
    expect(uit.oordeel).toBe('groen');
  });

  it('⚠️ noemt een 400 van npm ongemeten en niet rood, ook al is de exitcode 1', () => {
    const uit = draaiControle('audit:controle', vast(1, NPM_VIERHONDERD));
    expect(uit.oordeel).toBe('ongemeten');
  });

  it('⚠️⚠️ noemt een échte bevinding rood — de helft die deze reparatie eerlijk houdt', () => {
    const uit = draaiControle('audit:controle', vast(1, ECHTE_BEVINDING));
    expect(uit.oordeel).toBe('rood');
  });

  it('⚠️ leest OVERGESLAGEN ook als het uitsluitend naar stderr ging', () => {
    // ⚠️⚠️ Deze toets ging eerst langs `draaiControle` met een eigen uitvoerder,
    //    en toetste daarmee niets van de samenvoeging: `voerUit` kwam er niet
    //    aan te pas. 📏 Geijkt — met alleen `stdout` in `voerUit` bleven alle
    //    twaalf toetsen groen. Nu gaat hij door `voerUit` heen, met een spawner
    //    die de melding uitsluitend op stderr zet, zoals `audit-controle` doet.
    const spawn = (() => ({ status: 1, stdout: '', stderr: NPM_VIERHONDERD })) as never;
    const { code, uitvoer } = voerUit('audit:controle', spawn);
    expect(uitvoer).toContain('OVERGESLAGEN');
    expect(beoordeel({ code, uitvoer, heeftDatabaseNodig: false, soort: 'controle' })).toBe(
      'ongemeten',
    );
  });
});

describe('regels — wat CI te zien krijgt', () => {
  it('schrijft een ongemeten controle als waarschuwing, niet als kruis', () => {
    const uit = regels({ naam: 'audit:controle', oordeel: 'ongemeten', uitvoer: NPM_VIERHONDERD, code: 1 });
    expect(uit[0]).toContain('::warning');
    expect(uit.join('\n')).toContain('ONGEMETEN');
    expect(uit.join('\n')).not.toContain('✗');
  });

  it('schrijft een rode controle als kruis in een groep', () => {
    const uit = regels({ naam: 'audit:controle', oordeel: 'rood', uitvoer: ECHTE_BEVINDING, code: 1 });
    expect(uit[0]).toContain('✗');
    expect(uit[0]).toContain('::group::');
  });

  it('schrijft een groene controle als één regel zonder groep', () => {
    const uit = regels({ naam: 'docs:controle', oordeel: 'groen', uitvoer: 'ok', code: 0 });
    expect(uit).toEqual(['✓ docs:controle']);
  });
});

describe('samenvatting — de exitcode', () => {
  it('⚠️ faalt niet op ongemeten', () => {
    expect(samenvatting({ groen: ['a'], ongemeten: ['audit:controle'], rood: [] })).toBe(0);
  });

  it('faalt wél op rood', () => {
    expect(samenvatting({ groen: ['a'], ongemeten: [], rood: ['audit:controle'] })).toBe(1);
  });

  it('faalt op rood ook als er daarnaast ongemeten staat', () => {
    expect(samenvatting({ groen: [], ongemeten: ['x'], rood: ['y'] })).toBe(1);
  });
});

describe('draaiAlle', () => {
  it('deelt een reeks uitslagen in drie hopen', () => {
    const uitslagen: Record<string, { code: number; uitvoer: string }> = {
      'a:controle': { code: 0, uitvoer: 'ok' },
      'b:controle': { code: 1, uitvoer: NPM_VIERHONDERD },
      'c:controle': { code: 1, uitvoer: ECHTE_BEVINDING },
    };
    const uit = draaiAlle(Object.keys(uitslagen), (naam: string) => uitslagen[naam]!);
    expect(uit.groen).toEqual(['a:controle']);
    expect(uit.ongemeten).toEqual(['b:controle']);
    expect(uit.rood).toEqual(['c:controle']);
  });

  it('⚠️ stopt niet bij de eerste rode — één run toont álle bevindingen', () => {
    const uit = draaiAlle(['x:controle', 'y:controle'], () => ({ code: 1, uitvoer: ECHTE_BEVINDING }));
    expect(uit.rood).toEqual(['x:controle', 'y:controle']);
  });
});
