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

import { beoordeel, controlesUit, draai, HEEFT_DATABASE_NODIG, STAPPEN } from '../../scripts/poort.mjs';

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


/**
 * De naad tussen `draai()` en `beoordeel()` — QS8-239.
 *
 * ⚠️ **Beide helften waren af, en samen logen ze.** `beoordeel()` staat hierboven
 *    uitgebreid onder test en deelde altijd correct in: uitvoer met
 *    `OVERGESLAGEN` erin is *ongemeten*. Maar `draai()` gaf hem die uitvoer niet.
 *    `execFileSync` levert bij een geslaagde afloop alléén stdout; stderr komt er
 *    pas uit via de foutafhandeling. En juist de twee controles waarvoor de
 *    drieverdeling geschreven ís — `functies:controle` en `register:controle` —
 *    schrijven hun `OVERGESLAGEN` naar stderr en eindigen met exitcode 0.
 *
 * ⚠️ **Er was geen test die dit kón zien**, want er was geen test die `draai()`
 *    raakte. Regel 18 vraag 1: waar knopen twee correcte onderdelen aan elkaar?
 *    Daar hoort een test, en niet alleen op weerszijden ervan.
 *
 * ⚠️ Deze tests draaien een écht subproces via een npm-script, want dat is de
 *    naad. Een `spawnSync` die hier gemockt wordt, toetst niets: de bug zát in
 *    welke stromen het echte subproces teruggeeft.
 */
describe('draai geeft stderr óók terug als de stap slaagt', () => {
  it('vangt een OVERGESLAGEN op stderr bij exitcode 0', () => {
    const { code, uitvoer } = draai('poort:proef:overgeslagen');

    expect(code).toBe(0);
    expect(uitvoer).toContain('OVERGESLAGEN');

    // Dit is de belofte, en niet dat de string er staat: de poort moet hem
    // hierna als ongemeten indelen en niet als groen.
    expect(beoordeel({ code, uitvoer, heeftDatabaseNodig: false })).toBe('ongemeten');
  });

  it('geeft stdout en stderr allebei terug bij een rode stap', () => {
    const { code, uitvoer } = draai('poort:proef:rood');

    expect(code).not.toBe(0);
    expect(uitvoer).toContain('op stdout');
    expect(uitvoer).toContain('op stderr');
  });

  it('noemt een stap die niet bestaat rood en niet overgeslagen', () => {
    // ⚠️ Een niet-bestaand script mag nooit als overslag tellen. Dat is hoe een
    //    hernoemde controle stil uit de poort verdwijnt.
    const { code, uitvoer } = draai('poort:proef:bestaat-niet');
    expect(beoordeel({ code, uitvoer, heeftDatabaseNodig: false })).toBe('rood');
  });
});


/**
 * Een rode suite mag nooit "ongemeten" heten — QS8-239, derde ronde.
 *
 * ⚠️ **Dit is dezelfde val voor de derde keer, en de eerste twee reparaties
 *    waren allebei tekstpatronen.** Eerst stond de heuristiek op het kale woord
 *    `OVERGESLAGEN`; een falende test toonde een diff waar dat woord in stond en
 *    de poort noemde de suite ongemeten in plaats van rood. Toen is het patroon
 *    verankerd op de regelvorm die een controle zélf schrijft.
 *
 *    Op 31-08-2026 viel `tests/scripts/adviseur-controle.test.ts` om en toonde
 *    vitest een diff met de regel `⚠ adviseur-controle: OVERGESLAGEN — geen
 *    SUPABASE_ACCESS_TOKEN` — de bróncode van het script, en dus exact de
 *    verankerde vorm. Rood werd weer ongemeten.
 *
 * ⚠️ **Geen enkel tekstpatroon kan dit oplossen**, en dat is de les: elk patroon
 *    dat de échte melding vindt, vindt ook een citaat ervan. Een testsuite kan
 *    geen sleutel missen — alleen een controle kan zichzelf overslaan. De grens
 *    ligt dus om de stapsoort en niet om de tekst.
 */
describe('alleen een controle mag zichzelf overslaan', () => {
  const alsofControleGeslaagd = 'adviseur-controle: OVERGESLAGEN — geen SUPABASE_ACCESS_TOKEN';

  it('noemt een controle die dat zegt ongemeten', () => {
    expect(
      beoordeel({ code: 0, uitvoer: alsofControleGeslaagd, heeftDatabaseNodig: false, soort: 'controle' }),
    ).toBe('ongemeten');
  });

  it('noemt een rode suite die dat woord in zijn uitvoer heeft gewoon rood', () => {
    // De uitvoer van een vitest-run die een diff van het script toont.
    const rodeSuite = [
      'FAIL tests/scripts/adviseur-controle.test.ts',
      '- verwacht',
      `+ ${alsofControleGeslaagd}`,
      'Tests  1 failed | 17 passed (18)',
    ].join('\n');

    expect(
      beoordeel({ code: 1, uitvoer: rodeSuite, heeftDatabaseNodig: false, soort: 'suite' }),
    ).toBe('rood');
  });

  it('noemt een groene suite met dat woord erin gewoon groen', () => {
    expect(
      beoordeel({ code: 0, uitvoer: alsofControleGeslaagd, heeftDatabaseNodig: false, soort: 'suite' }),
    ).toBe('groen');
  });

  it('laat een suite zonder database wél ongemeten heten', () => {
    // ⚠️ Die route loopt via GEEN_DATABASE en niet via de overslag, en moet
    //    blijven werken: een RLS-suite zonder stack heeft niets bewezen.
    expect(
      beoordeel({
        code: 1,
        uitvoer: 'Error: fetch failed',
        heeftDatabaseNodig: true,
        soort: 'suite',
      }),
    ).toBe('ongemeten');
  });
});
