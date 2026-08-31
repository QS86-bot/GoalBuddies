import { describe, expect, it } from 'vitest';

import { MAX_MIJLPALEN, rijenUitPlan } from './plan-rijen';
import type { VoorstelPlan } from './uitvoer';

/**
 * De naad die QS8-201 aanwijst — regel 18, vraag 1.
 *
 * ⚠️ **De belofte is niet "de mapping klopt" maar "wat de gebruiker op het
 *    scherm ziet, staat straks zo in de database".** Dat is precies de plek waar
 *    "de AI stelde zes mijlpalen voor" en "er staan zes mijlpalen met de goede
 *    volgorde en één weekdoel in de goede cyclus" uit elkaar lopen.
 *
 * ⚠️ De cyclus zelf staat hier niet onder test: die komt uit `maakWeekdoel()` en
 *    `huidigeCyclus()`, en dat is de klok van `shared/time` — correctheidsregel
 *    7 zegt dat dit bestand daar niet zelf aan mag rekenen.
 */

function plan(over: Partial<VoorstelPlan> = {}): VoorstelPlan {
  return {
    title: '20 kg afvallen voor de zomer',
    category: 'other',
    identity_statement: 'Ik ben iemand die elke week beweegt.',
    milestones: [
      { title: 'Eerste 5 kg', description: 'Rustig beginnen.', target_date: '2026-10-01' },
      { title: 'Volgende 10 kg', description: null, target_date: '2026-12-01' },
    ],
    first_weekly_goal: {
      title: 'Drie keer wandelen',
      floor_text: 'Eén keer twintig minuten',
      ceiling_text: 'Drie keer veertig minuten',
    },
    haalbaarheid: null,
    ...over,
  };
}

describe('rijenUitPlan — het doel', () => {
  it('neemt de streefdatum van de gebruiker en niet iets uit het model', () => {
    // ⚠️ De datum is het tweede van de twee velden op het scherm. Zou het model
    //    hem mogen zetten, dan is "wanneer" geen vraag meer maar een suggestie.
    const rijen = rijenUitPlan(plan(), '2027-06-01');
    expect(rijen.doel.target_date).toBe('2027-06-01');
  });

  it('draagt titel, categorie en identiteitszin door', () => {
    const rijen = rijenUitPlan(plan(), '2027-06-01');
    expect(rijen.doel.title).toBe('20 kg afvallen voor de zomer');
    expect(rijen.doel.category).toBe('other');
    expect(rijen.doel.identity_statement).toBe('Ik ben iemand die elke week beweegt.');
  });
});

describe('rijenUitPlan — de mijlpalen', () => {
  it('nummert vanaf 1, want daar begint maakMijlpaal ook', () => {
    const rijen = rijenUitPlan(plan(), '2027-06-01');
    expect(rijen.mijlpalen.map((m) => m.order_index)).toEqual([1, 2]);
  });

  it('houdt de nummering aaneengesloten als er een mijlpaal wegvalt', () => {
    // ⚠️ Dit is het geval dat stil misgaat. Zou de index de plek in de ónbewerkte
    //    lijst volgen, dan ontstaat er een gat en klopt de volgorde op het scherm
    //    niet meer met die eronder.
    const rijen = rijenUitPlan(
      plan({
        milestones: [
          { title: 'Eerste', description: null, target_date: null },
          { title: '   ', description: null, target_date: null },
          { title: 'Derde', description: null, target_date: null },
        ],
      }),
      '2027-06-01',
    );

    expect(rijen.mijlpalen.map((m) => m.title)).toEqual(['Eerste', 'Derde']);
    expect(rijen.mijlpalen.map((m) => m.order_index)).toEqual([1, 2]);
  });

  it('houdt de volgorde van het model aan', () => {
    const rijen = rijenUitPlan(
      plan({
        milestones: [
          { title: 'C', description: null, target_date: null },
          { title: 'A', description: null, target_date: null },
          { title: 'B', description: null, target_date: null },
        ],
      }),
      '2027-06-01',
    );
    expect(rijen.mijlpalen.map((m) => m.title)).toEqual(['C', 'A', 'B']);
  });

  it(`kapt af op ${MAX_MIJLPALEN}`, () => {
    const veel = Array.from({ length: 30 }, (_, i) => ({
      title: `Stap ${i + 1}`,
      description: null,
      target_date: null,
    }));
    const rijen = rijenUitPlan(plan({ milestones: veel }), '2027-06-01');
    expect(rijen.mijlpalen).toHaveLength(MAX_MIJLPALEN);
    expect(rijen.mijlpalen.at(-1)?.order_index).toBe(MAX_MIJLPALEN);
  });

  it('maakt een datum ná de streefdatum leeg in plaats van de mijlpaal weg te gooien', () => {
    // ⚠️ Een mijlpaal zonder datum is een bestaande, geldige toestand. Een
    //    mijlpaal ná het einde van het doel is dat niet. Het model schat die
    //    tussendatums; dat maakt de stáp niet onzinnig.
    const rijen = rijenUitPlan(
      plan({
        milestones: [{ title: 'Te laat', description: null, target_date: '2028-01-01' }],
      }),
      '2027-06-01',
    );

    expect(rijen.mijlpalen).toHaveLength(1);
    expect(rijen.mijlpalen[0]?.target_date).toBeNull();
  });

  it('houdt een datum die precies op de streefdatum valt', () => {
    const rijen = rijenUitPlan(
      plan({ milestones: [{ title: 'Op de dag', description: null, target_date: '2027-06-01' }] }),
      '2027-06-01',
    );
    expect(rijen.mijlpalen[0]?.target_date).toBe('2027-06-01');
  });

  it.each([
    ['een losse tekst', 'volgende maand'],
    ['een tijdstempel', '2027-06-01T12:00:00Z'],
    ['een omgekeerde notatie', '01-06-2027'],
  ])('maakt %s leeg', (_naam, datum) => {
    const rijen = rijenUitPlan(
      plan({ milestones: [{ title: 'Iets', description: null, target_date: datum }] }),
      '2027-06-01',
    );
    expect(rijen.mijlpalen[0]?.target_date).toBeNull();
  });
});

describe('rijenUitPlan — het eerste weekdoel', () => {
  it('hangt onder de eerste mijlpaal', () => {
    expect(rijenUitPlan(plan(), '2027-06-01').weekdoel?.milestone_index).toBe(0);
  });

  it('valt weg als er geen mijlpalen zijn', () => {
    // ⚠️ Een weekdoel zonder mijlpaal is een rij die nergens bij hoort. Het doel
    //    blijft wél staan — de gebruiker vult zijn eerste week dan zelf in.
    const rijen = rijenUitPlan(plan({ milestones: [] }), '2027-06-01');
    expect(rijen.weekdoel).toBeNull();
    expect(rijen.doel.title).toBe('20 kg afvallen voor de zomer');
  });

  it('valt weg als het model er geen bruikbare gaf', () => {
    const rijen = rijenUitPlan(plan({ first_weekly_goal: null }), '2027-06-01');
    expect(rijen.weekdoel).toBeNull();
    expect(rijen.mijlpalen).toHaveLength(2);
  });

  it('draagt vloer en plafond ongewijzigd door', () => {
    const rijen = rijenUitPlan(plan(), '2027-06-01');
    expect(rijen.weekdoel?.floor_text).toBe('Eén keer twintig minuten');
    expect(rijen.weekdoel?.ceiling_text).toBe('Drie keer veertig minuten');
  });
});
