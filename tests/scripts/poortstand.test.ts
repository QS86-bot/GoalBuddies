import { describe, expect, it } from 'vitest';

import { BEGIN, EINDE, blokUit, poortstandRegels, vervangBlok } from '../../scripts/poortstand.mjs';

/**
 * De poortstand-generator — QS8-284.
 *
 * ⚠️ **De belofte is niet "het script draait".** Die is: *het getal in
 *    `WERKVOORRAAD` §2 kan niet uiteenlopen met wat de poort werkelijk draait*.
 *    Daarom toetst dit bestand de zuivere functie los, in élke vorm die hij moet
 *    vinden én in de vormen die hij met rust moet laten — zoals
 *    `tests/scripts/migratieregister.test.ts` dat doet.
 *
 * ## ⚠️⚠️ Waarom dit bestand bestaat, en de meting is beschamend genoeg
 *
 * Op 05-09/06-09 botste deze regel **vijf keer op één dag**, met drie
 * verschillende antwoorden: `36 / 38`, `34 / 38` en `35 / 39`. Ik heb er in twee
 * commit-berichten bij geschreven dat main ernaast zat.
 *
 * **Dat was omgekeerd.** `controlesUit()` op `package.json` geeft 34 controles en
 * dus 38 stappen; main had het goed en ik niet. Mijn getal kwam uit een `grep`
 * over de uitvóér van de poort, en die grep matchte óók de samenvattingsregel
 * *"· 4 controle(s) zonder database: …"* — één te veel, aan beide kanten. Een
 * tweede grep in dezelfde sessie gaf weer iets anders (`33 / 37`).
 *
 * ⚠️ **Dat is de eigenlijke bevinding: er is geen voor de hand liggende juiste
 *    manier om dit uit de uitvoer te tellen, dus iedereen verzint er een.** De
 *    bron is niet de uitvoer maar `STAPPEN` plus elke `*:controle` in
 *    `package.json`, en die is ondubbelzinnig. Vandaar dat `poortstand.mjs`
 *    letterlijk `poort.mjs` importeert in plaats van zelf te filteren.
 */
describe('poortstandRegels', () => {
  it('telt elke `*:controle` en telt de vier vaste stappen erbij op', () => {
    const regels = poortstandRegels({
      dev: 'expo start',
      typecheck: 'tsc',
      'stand:controle': 'node …',
      'migraties:controle': 'node …',
    });

    expect(regels).toContain('alle 2 controlescripts groen');
    expect(regels, 'twee controles plus typecheck, lint, tests en RLS-suite').toContain(
      'meldt 6 stappen',
    );
  });

  it('telt ook namen met cijfers en met meer dan één dubbele punt', () => {
    // ⚠️ **Precies de twee vormen waar mijn handmatige grep op stukliep.**
    //    `regel15:controle` draagt cijfers, `edge:sync:controle` twee dubbele
    //    punten. Een filter op `^[a-z]+:controle$` mist ze allebei — en dan telt
    //    de poort ze wél en het document niet.
    const regels = poortstandRegels({
      'regel15:controle': 'node …',
      'edge:sync:controle': 'node …',
    });

    expect(regels).toContain('alle 2 controlescripts groen');
  });

  it('laat alles wat geen controle is met rust', () => {
    // ⚠️ De andere helft, en die is even belangrijk: een teller die alles
    //    meetelt, is net zo fout als een die niets vindt — en je leert hem
    //    negeren.
    const regels = poortstandRegels({
      dev: 'expo start',
      poort: 'node scripts/poort.mjs',
      'rls:stack': 'bash …',
      controle: 'node …',
      'controle:iets': 'node …',
      test: 'vitest',
    });

    expect(regels, 'geen van deze namen eindigt op `:controle`').toContain(
      'alle 0 controlescripts groen',
    );
    expect(regels, 'alleen de vier vaste stappen blijven over').toContain('meldt 4 stappen');
  });

  it('geeft twee regels en geen datum', () => {
    // ⚠️ Zelfde reden als bij `stand.mjs`: een gegenereerd blok met "bijgewerkt
    //    op <vandaag>" verandert elke dag zonder dat er iets veranderd is, en dan
    //    is de conflictbron terug — met een stempel die betrouwbaar oogt.
    const regels = poortstandRegels({ 'a:controle': 'x' });

    expect(regels.split('\n')).toHaveLength(2);
    expect(regels).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('het blok in het document', () => {
  const omheen = (binnen: string): string => `voor\n${BEGIN}\n${binnen}\n${EINDE}\nna\n`;

  it('leest terug wat ertussen staat', () => {
    expect(blokUit(omheen('een regel'))).toBe('een regel');
  });

  it('geeft null als de markeringen ontbreken', () => {
    expect(blokUit('geen markeringen hier')).toBeNull();
  });

  it('vervangt alleen wat tussen de markeringen staat', () => {
    const uit = vervangBlok(omheen('oud'), 'nieuw');

    expect(uit).toContain('nieuw');
    expect(uit, 'de tekst eromheen hoort onaangeroerd te blijven').toContain('voor\n');
    expect(uit).toContain('\nna\n');
    expect(uit).not.toContain('oud');
  });

  it('werpt als de markeringen ontbreken, in plaats van het blok ergens te plakken', () => {
    // ⚠️ Een generator die zelf een plek kiest, zet het blok een keer middenin
    //    een andere alinea — en dan is het document stuk op een manier die
    //    niemand terugleest. Zelfde grendel als in `stand.mjs`.
    expect(() => vervangBlok('geen markeringen', 'nieuw')).toThrow(/markeringen/);
  });
});
