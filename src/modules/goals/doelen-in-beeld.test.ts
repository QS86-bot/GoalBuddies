import { describe, expect, it } from 'vitest';

import { doelIdsInBeeld } from './doelen-in-beeld';
import type { DoelStand } from './stand';

/**
 * De naad tussen "hoeveel doelen heb je" en "welke titels haalt het scherm op" —
 * QS8-226.
 *
 * ⚠️ **Het gat dat hier bewaakt wordt, was onzichtbaar bij twintig doelen.** Het
 *    hoofdscherm bouwde zijn titelkaart uit `fetchDoelen(userId)` — pagina 0 —
 *    en `StandBlok` filtert elke stand weg waarvan hij de titel niet kent, met
 *    als reden *"dat is een gearchiveerd of verwijderd doel"*. Bij eenentwintig
 *    actieve doelen klopte die reden niet meer: het eenentwintigste verdween
 *    stilzwijgend van het dashboard. Geen fout, geen melding, gewoon weg.
 *
 *    Onwrikbare regel 18 vraag 6 in zijn zuiverste vorm: een aanname die van
 *    "ze passen op één pagina" naar "er kunnen er meer zijn" gaat, en die de
 *    bestaande tests niet kónden raken omdat geen enkele opstelling meer dan een
 *    handvol doelen had.
 */

function stand(goalId: string): DoelStand {
  return { goalId, huidigeReeks: 0, besteReeks: 0, punten: 0, weekpas: null };
}

describe('doelIdsInBeeld', () => {
  it('noemt elk doel waar een stand bij hoort, ook voorbij de eerste pagina', () => {
    // ⚠️ Eenentwintig, en dat getal is niet willekeurig: `PER_PAGINA` is 20.
    //    Precies hier viel het oude gedrag om, en precies hier hoort de test
    //    dus te staan.
    const standen = new Map(
      Array.from({ length: 21 }, (_, i) => [`doel-${i}`, stand(`doel-${i}`)] as const),
    );

    const ids = doelIdsInBeeld(standen, []);

    expect(ids).toHaveLength(21);
    expect(ids).toContain('doel-20');
  });

  it('neemt ook doelen mee die alleen een weekdoel hebben', () => {
    // Een doel dat deze week een weekdoel heeft maar nog geen reeksrij — een
    // doel van vanmorgen. Zonder deze tak rendert zijn kaart zonder titel en
    // zonder gebied.
    const ids = doelIdsInBeeld(new Map(), [{ goal_id: 'vers-doel' }]);

    expect(ids).toEqual(['vers-doel']);
  });

  it('noemt een doel dat in allebei zit precies één keer', () => {
    // Anders vraagt het scherm dezelfde titel twee keer op, en bij een lange
    // lijst duwt dat echte doelen voorbij de grens van `fetchDoelnamen()`.
    const ids = doelIdsInBeeld(new Map([['x', stand('x')]]), [
      { goal_id: 'x' },
      { goal_id: 'y' },
    ]);

    expect([...ids].sort()).toEqual(['x', 'y']);
  });

  it('geeft een lege lijst als er niets te tonen is', () => {
    // De lege staat hoort geen verzoek te veroorzaken; `fetchDoelnamen()` keert
    // op een lege lijst meteen terug.
    expect(doelIdsInBeeld(new Map(), [])).toEqual([]);
  });
});
