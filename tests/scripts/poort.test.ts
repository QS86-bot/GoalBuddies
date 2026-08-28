/**
 * IJking van `scripts/poort.mjs`.
 *
 * ⚠️ **De belofte is niet "de poort draait alles".** Dat is een eigenschap van
 *    de lijst. De belofte is: *een controle die niets gemeten heeft, telt niet
 *    als geslaagd*. Dat is precies waar #100 op viel — daar was het een mens die
 *    er vier draaide, maar een poort die een controle zonder database groen
 *    noemt, maakt dezelfde fout automatisch en stiller.
 *
 * ⚠️ **En de lijst mag niet met de hand bijgehouden worden.** Een vaste lijst
 *    raakt achter zodra iemand een `*:controle` toevoegt, en dan bestáát die
 *    controle wel maar draait hij niet mee. Daarom leest `controlesUit()` de
 *    scripts, en toetst deze suite dat hij een nieuwe zelf oppikt.
 */
import { describe, expect, it } from 'vitest';

import { beoordeel, controlesUit, HEEFT_DATABASE_NODIG, STAPPEN } from '../../scripts/poort.mjs';

describe('controlesUit', () => {
  it('pikt élk script op dat op :controle eindigt', () => {
    const gevonden = controlesUit({
      'docs:controle': 'node x',
      'emoji:controle': 'node y',
      typecheck: 'tsc',
      lint: 'eslint',
      'edge:sync:controle': 'node z',
    });
    expect(gevonden).toEqual(['docs:controle', 'edge:sync:controle', 'emoji:controle']);
  });

  it('pikt een nieuwe controle vanzelf op — daar is het voor', () => {
    const zonder = controlesUit({ 'docs:controle': 'node x' });
    const met = controlesUit({ 'docs:controle': 'node x', 'nieuw:controle': 'node n' });
    expect(met.length).toBe(zonder.length + 1);
    expect(met).toContain('nieuw:controle');
  });

  it('laat alles met rust wat géén controle is', () => {
    expect(controlesUit({ typecheck: 'tsc', build: 'x', 'controle:iets': 'y' })).toEqual([]);
  });
});

describe('beoordeel', () => {
  it('noemt een geslaagde stap groen', () => {
    expect(beoordeel({ code: 0, uitvoer: 'alles goed', heeftDatabaseNodig: false })).toBe('groen');
  });

  it('noemt een gefaalde stap rood', () => {
    expect(beoordeel({ code: 1, uitvoer: '✗ twee regels kloppen niet', heeftDatabaseNodig: false })).toBe(
      'rood',
    );
  });

  // ⚠️ Dit is de assertie waar het script om bestaat. Zou dit "groen" of zelfs
  //    "rood" opleveren, dan is het verschil tussen *gemeten* en *niet gemeten*
  //    weg — en dat verschil is de hele reden dat een RLS-controle zonder stack
  //    geen bewijs is.
  it('noemt een controle zonder database ongemeten en niet groen', () => {
    expect(
      beoordeel({
        code: 1,
        uitvoer: '✗ Geen database om tegen te meten (goalbuddies_rls).',
        heeftDatabaseNodig: true,
      }),
    ).toBe('ongemeten');
  });

  it('herkent ook de kale psql-melding als ongemeten', () => {
    expect(
      beoordeel({
        code: 1,
        uitvoer: 'psql: error: connection to server on socket failed',
        heeftDatabaseNodig: true,
      }),
    ).toBe('ongemeten');
  });

  // De andere helft: een echte fout in een database-controle blijft rood.
  it('noemt een echte bevinding in een database-controle gewoon rood', () => {
    expect(
      beoordeel({
        code: 1,
        uitvoer: '✗ 2 regel(s) in het register bestaan niet meer',
        heeftDatabaseNodig: true,
      }),
    ).toBe('rood');
  });

  // ⚠️ **De belangrijkste van de suite.** Twee controles printen "OVERGESLAGEN"
  //    en geven daarna exitcode 0. Wie alleen naar de exitcode kijkt, telt ze
  //    als groen — en dan meldt de poort dat er iets bewezen is wat niemand
  //    gemeten heeft.
  it('noemt een controle die zichzelf overslaat ongemeten, óók bij exitcode 0', () => {
    expect(
      beoordeel({
        code: 0,
        uitvoer:
          '⚠ functies-controle: OVERGESLAGEN — geen EXPO_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving.',
        heeftDatabaseNodig: true,
      }),
    ).toBe('ongemeten');
  });

  // ⚠️ **De tegenhelft, en die is met een echte rode test gevonden.** Het
  //    patroon stond eerst op het kále woord OVERGESLAGEN. Een falende test
  //    toonde een diff van `poort.mjs`, daar stond het woord in het commentaar,
  //    en de poort noemde de hele testsuite "ongemeten" in plaats van rood. Een
  //    grendel die een fout stil omzet in een overslag is erger dan geen.
  it('trapt niet in het woord OVERGESLAGEN ergens in een lap uitvoer', () => {
    const testuitvoer = [
      'FAIL tests/scripts/padvormen.test.ts',
      "+   //    `functies:controle` en `register:controle` printen \"OVERGESLAGEN\" en",
      '      Tests  2 failed | 1278 passed',
    ].join('\n');
    expect(beoordeel({ code: 1, uitvoer: testuitvoer, heeftDatabaseNodig: false })).toBe('rood');
  });

  it('geldt ook voor een controle die geen database nodig heeft', () => {
    expect(beoordeel({ code: 0, uitvoer: 'vapid: OVERGESLAGEN', heeftDatabaseNodig: false })).toBe(
      'ongemeten',
    );
  });

  it('noemt een RLS-suite zonder stack ongemeten en niet rood', () => {
    expect(
      beoordeel({
        code: 1,
        uitvoer: 'Error: Testgebruiker aanmaken mislukte: TypeError: fetch failed. Draait scripts/lokale-stack.sh?',
        heeftDatabaseNodig: true,
      }),
    ).toBe('ongemeten');
  });

  it('laat een controle zonder database-eis niet ontsnappen op die tekst', () => {
    expect(
      beoordeel({ code: 1, uitvoer: 'geen database gevonden', heeftDatabaseNodig: false }),
    ).toBe('rood');
  });
});

describe('de opstelling zelf', () => {
  it('draait de twee suites én de basis', () => {
    expect(STAPPEN.map((s: { commando: string }) => s.commando)).toEqual([
      'typecheck',
      'lint',
      'test',
      'rls:lokaal',
    ]);
  });

  it('kent de database-afhankelijke controles bij naam', () => {
    expect(HEEFT_DATABASE_NODIG.has('klokgrens:controle')).toBe(true);
    expect(HEEFT_DATABASE_NODIG.has('emoji:controle')).toBe(false);
  });
});
