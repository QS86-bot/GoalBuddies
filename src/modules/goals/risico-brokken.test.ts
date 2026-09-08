import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `fetchRisicos()` hakt zijn id-lijst — QS8-368.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat de ijking van de klif zonder hem groen bleef.**
 *    `tests/rls/idlijstklif.test.ts` toetst de klif tegen de echte stack en
 *    `brokken()` als rekenkunde — maar het bouwde de lus zélf op in de test, en
 *    raakte `fetchRisicos()` dus nooit aan. 📏 Gemeten: de brokken eruit halen en
 *    één kale `.in()` over de hele lijst doen liet 10 van de 10 tests groen. De
 *    grendel zat op de onderdelen en niet op de náád ertussen — regel 18 vraag 3
 *    op de test die zelf beweert de belofte te toetsen.
 *
 * ⚠️ Met een gemockte client en niet tegen de stack, om dezelfde reden als in
 *    `completions/beoordelingen-bladeren.test.ts`: hier gaat het om wat de client
 *    verstúurt, en dat is precies wat een echte database niet laat zien.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, mutatie per grendel:
 *
 *   A  `brokken(goalIds)` → `[goalIds]` (de vorm van vóór deze branch)
 *      → 2 rood: de brokgrootte én 'geen enkel verzoek voor een lege lijst'
 *   B  `brokken(goalIds)` → `[goalIds.slice(0, 200)]` (afkappen)
 *      → 3 rood, waaronder 'laat geen enkel doel vallen'
 *   C  `brokken(goalIds, 1)` (de N+1 van regel 12)
 *      → 1 rood: 'doet één verzoek voor een lijst die past'
 *
 * ⚠️ Dat A óók de lege-lijsttest rood maakt, is geen ruis: `[goalIds]` levert
 *    voor een lege lijst één lege brok op, en `.in('x', [])` is een verzoek dat
 *    gegarandeerd niets oplevert. Twee defecten in één mutatie, allebei gemeld.
 */

/** Elke `.in()`-aanroep die de datalaag doet, met de lijst die hij meestuurde. */
const inAanroepen: (readonly string[])[] = [];

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      select: () => ({
        in: (_kolom: string, ids: readonly string[]) => {
          inAanroepen.push([...ids]);
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }),
  }),
}));

vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));

const { fetchRisicos } = await import('./risico');
const { IDS_PER_VERZOEK } = await import('../../shared/idlijst');

const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`);

beforeEach(() => {
  inAanroepen.length = 0;
});

describe('fetchRisicos() en de 16 KB-klif', () => {
  it('doet één verzoek voor een lijst die past', async () => {
    // ⚠️ De must-allow. "Nooit boven de klif" is ook te halen met een functie
    //    die elk id apart opvraagt, en dat is de N+1 uit regel 12.
    await fetchRisicos(ids(20));

    expect(inAanroepen).toHaveLength(1);
    expect(inAanroepen[0]).toHaveLength(20);
  });

  it('stuurt nooit meer dan de gemeten brokgrootte in één verzoek', async () => {
    // ⚠️ **De belofte.** 📏 De klif ligt op 416 id's (zie `shared/idlijst`);
    //    `doelen.tsx` stapelt zijn pagina's, dus 500 is bereikbaar met
    //    vijfentwintig keer "meer laden".
    await fetchRisicos(ids(500));

    expect(inAanroepen.length, 'vijfhonderd hoort niet in één verzoek').toBeGreaterThan(1);
    for (const lijst of inAanroepen) {
      expect(lijst.length, 'geen brok boven de gemeten grens').toBeLessThanOrEqual(IDS_PER_VERZOEK);
    }
  });

  it('laat geen enkel doel vallen en houdt de volgorde', async () => {
    // ⚠️ Afkappen zou deze test óók halen als hij alleen naar de brokgrootte
    //    keek. Een doel zonder stand leest als "nog niet berekend", en dat is
    //    een betekenisvolle stand — de bug van QS8-342 in een andere jas.
    const alle = ids(500);
    await fetchRisicos(alle);

    expect(inAanroepen.flat()).toEqual(alle);
  });

  it('doet geen enkel verzoek voor een lege lijst', async () => {
    await fetchRisicos([]);

    expect(inAanroepen).toEqual([]);
  });
});
