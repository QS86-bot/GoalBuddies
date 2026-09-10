import { describe, expect, it } from 'vitest';

// ⚠️ Geen `@ts-expect-error`: TypeScript leidt de vorm uit het `.mjs`-bestand zelf
//    af, net als bij `migratieregister-vergelijk.mjs` en `tekst-controle.mjs`.
import { REGISTER, gedefinieerdeFuncties, kopieenIn } from '../../scripts/afstemgetal-controle.mjs';

/**
 * De ijking van `afstemgetal-controle` — QS8-204.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md,
 *    regel 18). Daarom staan hier beide helften: de vormen die hij moet vínden
 *    én de vormen die hij met rust moet laten. Die tweede helft weegt even
 *    zwaar — een controle die alles meldt, leer je te negeren.
 *
 * IJKING — met de hand, 10-09-2026:
 *
 *   A  `const WEEKPAS_MAXIMUM = 2;` in `src/modules/goals/weekpas.ts` zetten
 *      -> `npm run afstemgetal:controle` rood, met bestand, regel en de reden
 *         uit het register.
 *   B  `weekpas_maximum` in het register hernoemen naar iets dat niet bestaat
 *      -> rood op de andere kant: het register noemt een functie die de
 *         migratiemap niet kent.
 */

describe('kopieenIn — de vormen die hij moet raken', () => {
  it('vindt een kale constante', () => {
    expect(kopieenIn('const WEEKPAS_MAXIMUM = 2;', 'weekpas[a-z_]*max')).toEqual([
      { regel: 1, naam: 'WEEKPAS_MAXIMUM' },
    ]);
  });

  it('vindt een geëxporteerde constante met een type', () => {
    expect(kopieenIn('export const weekpasMaximum: number = 2;', 'weekpas[a-z_]*max')).toEqual([
      { regel: 1, naam: 'weekpasMaximum' },
    ]);
  });

  it('vindt hem ook als hij ingesprongen staat', () => {
    const bron = 'function f() {\n  const maxWeekpassen = 2;\n}';
    expect(kopieenIn(bron, 'max[a-z_]*weekpas')).toEqual([{ regel: 2, naam: 'maxWeekpassen' }]);
  });

  it('geeft het regelnummer van de treffer en niet van het bestand', () => {
    const bron = 'const a = 1;\nconst b = 2;\nconst BEDENKTIJD_MIN = 15;';
    expect(kopieenIn(bron, 'bedenktijd')).toEqual([{ regel: 3, naam: 'BEDENKTIJD_MIN' }]);
  });
});

describe('kopieenIn — de vormen die hij met rust moet laten', () => {
  /** ⚠️ De belangrijkste must-allow: de app mág het begrip benoemen. */
  it('trapt niet in een zin in commentaar', () => {
    const bron = ' * Het maximum komt uit de database (`weekpas_maximum()`) en niet hieruit.';
    expect(kopieenIn(bron, 'weekpas[a-z_]*max')).toEqual([]);
  });

  it('trapt niet in een aanroep van de databasefunctie', () => {
    expect(kopieenIn("await db.rpc('weekpas_maximum');", 'weekpas[a-z_]*max')).toEqual([]);
  });

  it('trapt niet in een veldnaam in een type', () => {
    expect(kopieenIn('type R = { weekpas_maximum: number };', 'weekpas[a-z_]*max')).toEqual([]);
  });

  it('meldt niets bij een constante over iets anders', () => {
    expect(kopieenIn('const TAKEN_PLAFOND = 200;', 'weekpas[a-z_]*max')).toEqual([]);
  });
});

describe('gedefinieerdeFuncties', () => {
  it('leest de namen uit create or replace', () => {
    const bron = 'create or replace function public.weekpas_maximum()\n  returns integer';
    expect([...gedefinieerdeFuncties([bron])]).toEqual(['weekpas_maximum']);
  });

  it('leest ze ook zonder schemaprefix en over meer bestanden', () => {
    const namen = gedefinieerdeFuncties([
      'create or replace function bedenktijd()',
      'CREATE OR REPLACE FUNCTION public.ai_dag_budget_cent(\n)',
    ]);
    expect([...namen].sort()).toEqual(['ai_dag_budget_cent', 'bedenktijd']);
  });
});

describe('het register', () => {
  /**
   * ⚠️ **Een reden en geen vinkje.** Een rij zonder gevolg-in-woorden is een
   *    naam die iemand heeft neergezet zonder de vraag te beantwoorden.
   */
  it('geeft bij elk getal op wat er stukgaat bij een tweede bron', () => {
    for (const rij of REGISTER) {
      expect(rij.reden.length, `${rij.functie} heeft geen reden`).toBeGreaterThan(80);
      expect(() => new RegExp(rij.patroon, 'u'), `${rij.functie} heeft een kapot patroon`).not.toThrow();
    }
  });

  /** ⚠️ Het patroon moet zijn eigen functienaam raken, anders bewaakt hij niets. */
  it('elk patroon raakt de naam van zijn eigen functie', () => {
    for (const rij of REGISTER) {
      expect(new RegExp(rij.patroon, 'iu').test(rij.functie), `${rij.functie} valt buiten zijn patroon`).toBe(
        true,
      );
    }
  });
});
