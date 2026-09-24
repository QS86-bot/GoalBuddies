import { describe, expect, it } from 'vitest';

import {
  DEKKENDE_FUNCTIE,
  beoordeel,
  dekkendeKolommen,
  spiegelkolommen,
} from '../../scripts/spiegeling-controle.mjs';

/**
 * QS8-610 — de premisse onder de vrijstelling `interview.ts → goals`.
 *
 * ⚠️ **Beide helften staan hier, en de tweede is even belangrijk als de eerste:**
 *    de vormen die de controle moet vinden, én de vormen die hij met rust moet
 *    laten. Een controle die alles meldt, leert je hem te negeren.
 */

const SPIEGEL_GOED = `
export const SPIEGELING = {
  identity: 'identity_statement',
  hours_per_week: 'available_hours_per_week',
} as const;
`;

const DEKKING_GOED = `
export async function wijzigDoel(doelId: string, patch: DoelPatch) {
  const update: TablesUpdate<'goals'> = {};
  if (velden.title !== undefined) update.title = velden.title;
  if (velden.description !== undefined) update.description = velden.description;
  if (velden.category !== undefined) update.category = velden.category;
  if (velden.identity_statement !== undefined) update.identity_statement = velden.identity_statement;
  if (velden.available_hours_per_week !== undefined) {
    update.available_hours_per_week = velden.available_hours_per_week;
  }
}
`;

describe('spiegelkolommen', () => {
  it('leest de waarden en niet de sleutels', () => {
    expect(spiegelkolommen(SPIEGEL_GOED)).toEqual([
      'identity_statement',
      'available_hours_per_week',
    ]);
  });

  it('geeft null als de tabel er niet is, zodat dat geen stil groen wordt', () => {
    expect(spiegelkolommen('export const IETS_ANDERS = { a: 1 };')).toBeNull();
  });

  /**
   * ⚠️ Een `SPIEGELING` in commentaar is geen spiegeling. Zou de knip die niet
   *    weghalen, dan toetst deze controle een voorbeeld in plaats van de code.
   */
  it('trapt niet in een uitgecommentarieerde tabel', () => {
    const bron = `// export const SPIEGELING = { a: 'ritme' } as const;\n${SPIEGEL_GOED}`;
    expect(spiegelkolommen(bron)).toEqual(['identity_statement', 'available_hours_per_week']);
  });
});

describe('dekkendeKolommen', () => {
  it('leest de toewijzingen op het updateobject', () => {
    expect(dekkendeKolommen(DEKKING_GOED)).toEqual([
      'title',
      'description',
      'category',
      'identity_statement',
      'available_hours_per_week',
    ]);
  });

  it('geeft null als de functie niet gevonden wordt', () => {
    expect(dekkendeKolommen('export async function ietsAnders() {}')).toBeNull();
  });

  /**
   * ⚠️⚠️ **De grens van het lichaam is de kern van deze lezer.** `api.ts` schrijft
   *    op meer plekken naar `goals`; de premisse noemt uitsluitend
   *    `wijzigDoel()`. Telt een kolom uit een búúrfunctie mee, dan rekt de
   *    bovengrens mee met code die er niets mee te maken heeft — en dan bewaakt
   *    deze controle een ruimere belofte dan hij zegt te bewaken.
   */
  it('telt geen kolom mee uit een functie die erna komt', () => {
    const bron = `${DEKKING_GOED}
export async function zetRitme(doelId: string) {
  const update: TablesUpdate<'goals'> = {};
  update.ritme = 'weekly';
}
`;
    expect(dekkendeKolommen(bron)).not.toContain('ritme');
  });
});

describe('beoordeel', () => {
  it('zwijgt als elke gespiegelde kolom gedekt is', () => {
    expect(beoordeel(SPIEGEL_GOED, DEKKING_GOED)).toEqual([]);
  });

  /**
   * Het geval dat dossierrij 444 bij naam noemt, en waarvoor deze controle
   * bestaat: `ritme` valt buiten de UPDATE-kolomgrant van `goals`.
   */
  it('meldt een gespiegelde kolom die de dekkende functie niet schrijft', () => {
    const metRitme = SPIEGEL_GOED.replace(
      "} as const;",
      "  ritme: 'ritme',\n} as const;",
    );
    const klachten = beoordeel(metRitme, DEKKING_GOED);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('goals.ritme');
    expect(klachten[0]).toContain(DEKKENDE_FUNCTIE);
  });

  it('meldt elke ongedekte kolom apart en niet als één zin', () => {
    const metTwee = SPIEGEL_GOED.replace(
      "} as const;",
      "  ritme: 'ritme',\n  status: 'status',\n} as const;",
    );
    expect(beoordeel(metTwee, DEKKING_GOED)).toHaveLength(2);
  });

  /**
   * ⚠️⚠️ **De twee kanaries.** Een lezer die niets vindt ziet er precies zo uit
   *    als een codebase waar niets mis is — bij `SPIEGELING` levert dat stil
   *    groen op, bij de dekking juist een storm van valse bevindingen. Allebei
   *    zijn ze hier een eigen, benoemde fout.
   */
  it('noemt een onvindbare SPIEGELING een fout in plaats van groen', () => {
    const klachten = beoordeel('export const X = 1;', DEKKING_GOED);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('niet gevonden');
    expect(klachten[0]).toContain('geen groen');
  });

  it('noemt een lege dekkingslijst een kapotte lezer en geen storm', () => {
    const klachten = beoordeel(SPIEGEL_GOED, 'export async function ietsAnders() {}');

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('kapotte lezer');
  });
});
