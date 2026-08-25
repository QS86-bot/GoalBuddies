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

    expect(vergelijk(paar(app, edge))).toEqual([{ bestand: 'zoned.ts', functie: 'addDays' }]);
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
  it('een functie die alleen aan de app-kant bestaat', () => {
    // De Edge-kopie is een subset, en dat is de bedoeling.
    const app = 'export function tijdzones() {\n  return [];\n}\nexport function f() {\n  return 1;\n}';
    const edge = 'export function f() {\n  return 1;\n}';

    expect(vergelijk(paar(app, edge))).toEqual([]);
  });

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
