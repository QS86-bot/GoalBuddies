import { describe, expect, it } from 'vitest';

import { groepeerPerWeekdoel } from './afvinkvorm';

/**
 * ⚠️ **De belofte is: geen enkele afgevinkte dag raakt onderweg zoek.** Vóór
 *    QS8-301 gooide de aanroeper de datums weg om er een aantal van te maken, en
 *    de functie die ze wél gaf werd door geen scherm aangeroepen. Nu voedt één
 *    lijst zowel de teller als de strook, en dan is *waar de rijen blijven* de
 *    enige vraag die hier misgaat.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   C  stilletjes ontdubbelen met `includes()`
 *      → 1 rood: 'telt een dubbele dag niet weg'
 *   D  de dagen zelf sorteren
 *      → 1 rood: 'houdt de volgorde aan waarin de rijen binnenkomen'
 */
describe('groepeerPerWeekdoel', () => {
  it('houdt elke dag bij zijn eigen weekdoel', () => {
    const uit = groepeerPerWeekdoel([
      { weekly_goal_id: 'a', local_date: '2026-09-07' },
      { weekly_goal_id: 'b', local_date: '2026-09-07' },
      { weekly_goal_id: 'a', local_date: '2026-09-09' },
    ]);

    expect(uit.get('a')).toEqual(['2026-09-07', '2026-09-09']);
    expect(uit.get('b')).toEqual(['2026-09-07']);
  });

  it('houdt de volgorde aan waarin de rijen binnenkomen', () => {
    // ⚠️ De query sorteert op `local_date`; deze functie hoort dat niet nog eens
    //    te doen en al helemaal niet om te gooien. Zou hij zelf sorteren, dan is
    //    er een tweede opvatting over volgorde en valt niet meer te zien welke
    //    geldt.
    const uit = groepeerPerWeekdoel([
      { weekly_goal_id: 'a', local_date: '2026-09-09' },
      { weekly_goal_id: 'a', local_date: '2026-09-07' },
    ]);

    expect(uit.get('a')).toEqual(['2026-09-09', '2026-09-07']);
  });

  it('geeft een lege map bij geen rijen, en geen map met lege lijsten', () => {
    // Een weekdoel zonder afvinkingen hoort er niet in te staan: de aanroeper
    // valt terug op een lege lijst, en een sleutel met `[]` erin zou suggereren
    // dat we van dat weekdoel iets wéten.
    expect(groepeerPerWeekdoel([]).size).toBe(0);
  });

  it('telt een dubbele dag niet weg', () => {
    // ⚠️ De unieke index `day_checkins_een_per_dag` maakt dit onmogelijk, en
    //    juist daarom mag deze functie er niet stilletjes voor corrigeren: zou
    //    die index ooit sneuvelen, dan hoort het zichtbaar te worden in de
    //    teller en niet weggepoetst te zijn in een hulpfunctie.
    const uit = groepeerPerWeekdoel([
      { weekly_goal_id: 'a', local_date: '2026-09-07' },
      { weekly_goal_id: 'a', local_date: '2026-09-07' },
    ]);

    expect(uit.get('a')).toHaveLength(2);
  });
});
