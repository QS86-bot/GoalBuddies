import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`.
import { functiesIn, normaliseer, vergelijk } from '../../scripts/edge-tijd-controle.mjs';

/**
 * De ijking van `npm run edge:controle`.
 *
 * ⚠️ De controle bewaakt dat de twee exemplaren van `shared/time` hetzelfde
 *    rekenen: één in `src/` voor de app, één in `supabase/functions/_shared/`
 *    voor de rollover en de notificatiejob. Die tweede kopie bestaat omdat Deno
 *    niet uit `src/` kan importeren — de prijs van twee runtimes.
 *
 * ⚠️ **Weglaten mag, afwijken niet.** De Edge-kopie laat bewust de helpers weg
 *    die `Intl` en de browser nodig hebben. Een controle die volledige gelijkheid
 *    eist, zou daar op afgaan en dus meteen uitgezet worden.
 */

const paar = (app: string, edge: string) => [{ bestand: 'zoned.ts', app, edge }];

describe('wat de controle moet vinden', () => {
  it('een gedeelde functie die anders rekent', () => {
    const app = 'export function addDays(d: string) {\n  return d + 1;\n}';
    const edge = 'export function addDays(d: string) {\n  return d + 2;\n}';

    expect(vergelijk(paar(app, edge))).toEqual([{ bestand: 'zoned.ts', functie: 'addDays', soort: 'anders' }]);
  });

  it('een verschil diep in het lichaam, voorbij de eerste regel', () => {
    // ⚠️ Haakjes tellen en niet op een lege regel stoppen: anders vergelijkt de
    //    controle twee halve functies, en die kunnen gelijk zijn terwijl de
    //    staart verschilt.
    const app = 'export function f() {\n  const a = 1;\n\n  if (a) {\n    return 1;\n  }\n  return 0;\n}';
    const edge = 'export function f() {\n  const a = 1;\n\n  if (a) {\n    return 9;\n  }\n  return 0;\n}';

    expect(vergelijk(paar(app, edge))).toHaveLength(1);
  });
});

describe('wat de controle met rust moet laten', () => {
  // ⚠️ **Hier stond tot 25-08-2026 het omgekeerde**: "de Edge-kopie is een subset,
  //    en dat is de bedoeling", met een test die een ontbrekende functie
  //    goedkeurde. Die aanname is achterhaald sinds `scripts/sync-edge-shared.mjs`
  //    bestaat: dat script kopieert héle bestanden en zet er
  //    "GEGENEREERD BESTAND — niet met de hand bewerken" boven. Een functie die
  //    wel in `src/` staat en niet in de kopie, is dus geen keuze maar drift.
  //
  //    En die drift was er: op 25-08 miste de Edge-kopie van `zoned.ts` vier
  //    exports en `clock.ts` de hele `ouderDan()`, terwijl deze controle groen
  //    stond en meldde dat de twee kopieën hetzelfde rekenen. De test die dat
  //    goedkeurde is nu de test die het afkeurt; zie de `ontbreekt`-tak hieronder.

  it('verschillend commentaar bij dezelfde code', () => {
    // ⚠️ De Edge-kopie legt terecht andere dingen uit — bijvoorbeeld waarom hij
    //    `clock.ts` niet via `index.ts` importeert. Wat gelijk moet zijn is wat
    //    er rékent.
    const app = 'export function f() {\n  // de app-uitleg\n  return 1;\n}';
    const edge = 'export function f() {\n  /* een heel ander verhaal */\n  return 1;\n}';

    expect(vergelijk(paar(app, edge))).toEqual([]);
  });

  it('andere inspringing of lege regels', () => {
    const app = 'export function f() {\n  return 1;\n}';
    const edge = 'export function f() {\n\n    return 1;\n\n}';

    expect(vergelijk(paar(app, edge))).toEqual([]);
  });
});

describe('de ontleding zelf', () => {
  it('vindt elke geëxporteerde functie', () => {
    const bron =
      'export function een() {\n  return 1;\n}\n' +
      'const x = 2;\n' +
      'export function twee(a: string) {\n  return a;\n}';

    expect([...functiesIn(bron).keys()]).toEqual(['een', 'twee']);
  });

  it('laat een niet-geëxporteerde functie liggen', () => {
    // Alleen wat de andere kant kan aanroepen, hoeft gelijk te zijn.
    expect([...functiesIn('function intern() {\n  return 1;\n}').keys()]).toEqual([]);
  });

  it('haalt commentaar en witruimte weg maar niet de code', () => {
    expect(normaliseer('const a = 1; // uitleg\n\n/* blok */\nconst b = 2;')).toBe(
      'const a = 1;\nconst b = 2;',
    );
  });
});

describe('een kopie die achterloopt', () => {
  /**
   * ⚠️ **Het gat dat deze controle zelf had, gevonden op 25-08-2026.** Hij liep
   *    over de functies van de Edge-kopie en sloeg alles over wat daar niet in
   *    stond — `if (!inApp.has(naam)) continue` — en meldde vervolgens dat de
   *    twee kopieën hetzelfde rekenen. Een functie die alleen in `src/` bestond,
   *    was per definitie niet gedeeld en dus onzichtbaar. In de praktijk miste de
   *    Edge-kopie van `zoned.ts` vier exports en `clock.ts` de hele `ouderDan()`,
   *    met een groene controle erboven.
   *
   *    Het gevaarlijke geval is niet de ontbrekende functie zelf — `deno check`
   *    valt daarover zodra iemand hem gebruikt — maar een kopie die achterloopt
   *    op een gerepareerde weekberekening. Dan rekent de rollover met de oude
   *    versie en zegt de controle dat alles gelijk is.
   */
  it('meldt een functie die wel in `src/` staat en niet in de Edge-kopie', () => {
    const klachten = vergelijk([
      {
        bestand: 'clock.ts',
        app: 'export function now() { return new Date(); }\nexport function ouderDan() { return true; }',
        edge: 'export function now() { return new Date(); }',
      },
    ]);

    expect(klachten).toEqual([{ bestand: 'clock.ts', functie: 'ouderDan', soort: 'ontbreekt' }]);
  });

  it('blijft stil als de Edge-kopie compleet is', () => {
    const bron = 'export function now() { return new Date(); }\nexport function ouderDan() { return true; }';

    expect(vergelijk([{ bestand: 'clock.ts', app: bron, edge: bron }])).toEqual([]);
  });

  it('meldt een functie die alleen aan de Edge-kant bestaat níét', () => {
    // ⚠️ Die kant is een andere zaak: `edge:sync` kopieert hele bestanden, dus
    //    een extra functie aan de Edge-kant komt van een mens en niet van drift.
    //    Hem hier melden zou de controle laten klagen over iets wat hij niet kan
    //    repareren, en dat is hoe je hem leert negeren.
    const klachten = vergelijk([
      {
        bestand: 'clock.ts',
        app: 'export function now() { return new Date(); }',
        edge: 'export function now() { return new Date(); }\nexport function extra() { return 1; }',
      },
    ]);

    expect(klachten).toEqual([]);
  });

  it('houdt "rekent anders" en "ontbreekt" uit elkaar', () => {
    const klachten = vergelijk([
      {
        bestand: 'zoned.ts',
        app: 'export function a() { return 1; }\nexport function b() { return 2; }',
        edge: 'export function a() { return 99; }',
      },
    ]);

    expect(klachten).toEqual([
      { bestand: 'zoned.ts', functie: 'a', soort: 'anders' },
      { bestand: 'zoned.ts', functie: 'b', soort: 'ontbreekt' },
    ]);
  });
});

