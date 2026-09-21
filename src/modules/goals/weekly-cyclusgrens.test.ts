import { describe, expect, it } from 'vitest';

import { kiesLaatsteCyclus, mogelijkeCyclusstarts } from './cyclusgrens';

import type { Tables } from '../../lib/database.types';

type Weekdoel = Tables<'weekly_goals'>;

/**
 * De cyclusgrens overleeft een zonesprong — reviewrij 14-09-2026.
 *
 * ⚠️⚠️ **De bevinding.** De cyclus komt uit de zone van het apparaat, en sinds
 *    QS8-472 verzet die zone zichzelf. 📏 Nagemeten met `userCycle()` op
 *    `2026-09-13T22:30Z`, week-start maandag: `Europe/Amsterdam` geeft
 *    `2026-09-14` en `Pacific/Honolulu` `2026-09-07` — zeven dagen, en
 *    westwaarts terúg. Met de exacte match die hier stond verdween een net
 *    aangemaakt weekdoel daardoor uit de lijst.
 *
 * ⚠️ **De database is hier niets ontnomen.** `zet_week_startdag()` blijft de
 *    enige schrijver van `cycle_start_date` en de invariant van 0198 staat, want
 *    de week-startdág verandert niet. Wat er misging is dat de lijst de
 *    verkeerde week opvroeg.
 */

const rij = (start: string, id: string): Weekdoel =>
  ({ id, cycle_start_date: start }) as unknown as Weekdoel;

describe('mogelijkeCyclusstarts', () => {
  it('geeft de berekende cyclus en die van een week later', () => {
    expect(mogelijkeCyclusstarts({ startDate: '2026-09-07' } as never)).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('geeft de week ervóór juist níet', () => {
    // ⚠️ Dit is de helft die voorkomt dat elke maandag de vorige week terugkomt.
    //    Rijen op `start - 7` zijn gewoon verlopen; alleen `start + 7` kan niet
    //    anders dan door een zonesprong zijn ontstaan.
    expect(mogelijkeCyclusstarts({ startDate: '2026-09-14' } as never)).not.toContain('2026-09-07');
  });

  it('rekent over een maandgrens heen', () => {
    expect(mogelijkeCyclusstarts({ startDate: '2026-09-28' } as never)).toEqual([
      '2026-09-28',
      '2026-10-05',
    ]);
  });
});

describe('kiesLaatsteCyclus', () => {
  it('houdt de latere cyclus over als er twee in de uitslag zitten', () => {
    // De zonesprong: je maakte het weekdoel in Amsterdam (14e) en je apparaat
    // rekent nu in Honolulu (7e). De 14e is wat je voert.
    const uit = kiesLaatsteCyclus([rij('2026-09-07', 'oud'), rij('2026-09-14', 'nieuw')]);

    expect(uit.map((r) => r.id)).toEqual(['nieuw']);
  });

  it('laat één cyclus ongemoeid — het normale geval', () => {
    const rijen = [rij('2026-09-14', 'a'), rij('2026-09-14', 'b')];

    expect(kiesLaatsteCyclus(rijen).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('houdt de volgorde van de aanroeper aan', () => {
    // ⚠️ Filteren en niet sorteren: het scherm toont op `created_at`, en die
    //    volgorde komt uit de query.
    const rijen = [rij('2026-09-14', 'eerst'), rij('2026-09-14', 'daarna')];

    expect(kiesLaatsteCyclus(rijen).map((r) => r.id)).toEqual(['eerst', 'daarna']);
  });

  it('geeft een lege lijst terug op een lege lijst', () => {
    expect(kiesLaatsteCyclus([])).toEqual([]);
  });
});
