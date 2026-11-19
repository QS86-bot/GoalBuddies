import { describe, expect, it } from 'vitest';

import type { DoelStand } from '@/modules/goals';

import { tellers } from './tellers-vorm';

function stand(goalId: string, huidigeReeks: number, voorraad: number | null, punten = 0): DoelStand {
  return {
    goalId,
    huidigeReeks,
    besteReeks: huidigeReeks,
    punten,
    weekpas:
      voorraad === null
        ? null
        : { voorraad, maximum: 3, voltooideCycli: 0, totVolgende: 2, laatstVerbruikt: null },
  };
}

const kaart = (...s: DoelStand[]) => new Map(s.map((x) => [x.goalId, x]));

describe('de drie tellers uit de standen per doel — QS8-747', () => {
  it('vangnet is de som van de weekpassen en reeks de hoogste lopende reeks', () => {
    expect(tellers(kaart(stand('a', 4, 1), stand('b', 7, 2), stand('c', 0, 0)))).toEqual({
      vangnet: 3,
      reeks: 7,
    });
  });

  it('zonder doelen is er niets te tellen: onbekend en geen nul', () => {
    expect(tellers(new Map())).toEqual({ vangnet: null, reeks: null });
  });

  it('een doel zonder antwoord over weekpassen telt als nul passen, niet als fout', () => {
    expect(tellers(kaart(stand('a', 2, null)))).toEqual({ vangnet: 0, reeks: 2 });
  });

  it('een doel zonder reeks en zonder passen geeft een echte nul', () => {
    expect(tellers(kaart(stand('a', 0, 0)))).toEqual({ vangnet: 0, reeks: 0 });
  });

  it('het puntentotaal per doel speelt geen rol: weekpas en punt blijven gescheiden', () => {
    const laag = tellers(kaart(stand('a', 3, 1, -5)));
    const hoog = tellers(kaart(stand('a', 3, 1, 500)));
    expect(laag).toEqual(hoog);
    expect(Object.keys(laag)).toEqual(['vangnet', 'reeks']);
  });
});
