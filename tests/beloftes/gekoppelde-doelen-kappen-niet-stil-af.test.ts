/**
 * `fetchGekoppeldeDoelIds()` geeft nooit een halve lijst — QS8-342.
 *
 * ⚠️ **Waarom dit bestand er is.** De functie kapte af op `.limit(50)` zonder
 *    teller: doelen daarboven lazen als "niet gekoppeld" en werden opnieuw
 *    aangeboden. Die `limit` is in deze branch een genoemd plafond geworden, en
 *    de kop erboven zei dat de afkapping daarmee weg was. **Dat was niet waar** —
 *    een `range(0, 199)` zonder `count` kapt even stil af als een `limit(50)`,
 *    alleen bij een ander getal. Gevonden in de security-review van 07-09-2026.
 *
 * ⚠️ **De belofte is niet "er staat een plafond in de code".** Dat is een
 *    eigenschap van het onderdeel. De belofte is: *wie deze functie om de
 *    gekoppelde doelen vraagt, krijgt ze allemaal of een fout.* Een halve lijst
 *    onder die naam is de klasse "succes dat er geen is" — dezelfde die dit
 *    issue op het koppelscherm repareert.
 */
import { describe, expect, it, vi } from 'vitest';

const GROEP = '99999999-9999-4999-8999-999999999999';
const PLAFOND = 200;

/** Hoeveel koppelingen de nagemaakte server zegt te hébben, los van wat hij géeft. */
let totaal = 0;

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    from: () => {
      const schil = {
        select: () => schil,
        eq: () => schil,
        order: () => schil,
        // ⚠️ Precies wat PostgREST doet: het venster geeft hooguit `PLAFOND`
        //    rijen, en `content-range` noemt het echte totaal. Dat verschil ís
        //    de stille afkapping.
        range: async (van: number, tot: number) => ({
          data: Array.from({ length: Math.min(totaal, tot - van + 1) }, (_, i) => ({
            goal_id: `0a000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          })),
          error: null,
          count: totaal,
        }),
      };

      return schil;
    },
  }),
}));

const { fetchGekoppeldeDoelIds } = await import('../../src/modules/buddies/api');

describe('de gekoppelde doelen van een groep', () => {
  it('werpt zodra er meer zijn dan er teruggegeven worden', async () => {
    totaal = PLAFOND + 1;

    await expect(
      fetchGekoppeldeDoelIds(GROEP),
      'boven het plafond hoort deze functie te werpen — een halve lijst leest als "die zijn niet gekoppeld"',
    ).rejects.toThrow();
  });

  it('geeft de lijst gewoon terug zolang hij past', async () => {
    // ⚠️ De tegenproef. Zonder deze regel is "werp altijd" ook groen, en dan
    //    bewaakt het geval hierboven niets.
    totaal = PLAFOND;

    const uit = await fetchGekoppeldeDoelIds(GROEP);
    expect(uit).toHaveLength(PLAFOND);
  });

  it('werpt niet bij een lege groep', async () => {
    totaal = 0;

    await expect(fetchGekoppeldeDoelIds(GROEP)).resolves.toHaveLength(0);
  });
});
