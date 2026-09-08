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

/** Bij welke aanroep (nul-gebaseerd) de mock een fout teruggeeft. `null` = nooit. */
let faalBij: number | null = null;

/** Rijen die de mock teruggeeft, per aanroep. Leeg als er niets voor is gezet. */
const rijenPerAanroep: { goal_id: string; status: string; reason: null; computed_at: string }[][] =
  [];

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      select: () => ({
        in: (_kolom: string, ids: readonly string[]) => {
          const nummer = inAanroepen.length;
          inAanroepen.push([...ids]);

          if (faalBij === nummer) {
            return Promise.resolve({
              // De vorm die postgrest-js van een headers-overflow maakt: geen
              // code, de diagnose in de hint. Zie `shared/idlijst`.
              data: null,
              error: { message: 'TypeError: fetch failed', code: '', hint: 'headers exceeded' },
            });
          }

          return Promise.resolve({ data: rijenPerAanroep[nummer] ?? [], error: null });
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
  rijenPerAanroep.length = 0;
  faalBij = null;
});

/** Eén rij zoals `goal_risk` hem teruggeeft. */
function rij(goalId: string) {
  return { goal_id: goalId, status: 'on_track', reason: null, computed_at: '2026-09-08T00:00:00Z' };
}

describe('fetchRisicos() en de 16 KB-klif', () => {
  it('doet één verzoek voor een lijst die past', async () => {
    // ⚠️ De must-allow. "Nooit boven de klif" is ook te halen met een functie
    //    die elk id apart opvraagt, en dat is de N+1 uit regel 12.
    await fetchRisicos(ids(20));

    expect(inAanroepen).toHaveLength(1);
    expect(inAanroepen[0]).toHaveLength(20);
  });

  it('stuurt nooit meer dan de gemeten brokgrootte in één verzoek', async () => {
    // ⚠️ **De belofte.** 📏 De klif ligt ergens boven de 400 (zie `shared/idlijst`);
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

/**
 * ⚠️⚠️ **Dit blok bestaat omdat de security-review het gat vond.** 📏 Gemeten:
 *    `return kaart` in het foutpad vervangen door `continue` — dus dóórvragen na
 *    een fout — liet 14 van de 14 tests groen, en de volledige suite ook. Het
 *    besluit dat deze branch invoert (teruggeven wat je hebt, in plaats van
 *    niets) had daarmee geen enkele grendel. Regel 18 vraag 3, op een tak die op
 *    deze branch nieuw is.
 */
describe('fetchRisicos() als een brok mislukt', () => {
  it('houdt wat er vóór de fout binnenkwam', async () => {
    const alle = ids(500);
    const [eerste, tweede] = alle as [string, string];
    rijenPerAanroep[0] = [rij(eerste), rij(tweede)];
    faalBij = 1;

    const uit = await fetchRisicos(alle);

    expect(uit.size, 'het eerste brok hoort niet weggegooid te worden').toBe(2);
    expect(uit.get(eerste)?.stand).toBe('on_track');
  });

  it('stopt na de fout en vuurt geen gedoemde verzoeken meer af', async () => {
    // ⚠️ De andere helft, en de gevaarlijkste mutatie: bij een echte storing
    //    zou `continue` hier ⌈n/200⌉ verzoeken achter elkaar afvuren, elk met de
    //    timeout van `fetchMetTimeout()` eronder.
    faalBij = 0;

    await fetchRisicos(ids(1000));

    expect(inAanroepen, 'na de eerste fout hoort er niets meer uit te gaan').toHaveLength(1);
  });

  it('geeft een lege kaart als het éérste brok al mislukt', async () => {
    faalBij = 0;

    expect((await fetchRisicos(ids(500))).size).toBe(0);
  });
});
