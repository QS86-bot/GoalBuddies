import { describe, expect, it } from 'vitest';

import { paginas } from './index';

/**
 * De ijking van `paginas()` — QS8-206.
 *
 * ⚠️ **De belofte is "elke rij komt precies één keer langs", en niet "de
 *    rekenkunde klopt".** Daarom bouwen deze tests een bron met genummerde rijen
 *    en leggen ze de únie naast het origineel. Een test die `start` en `aantal`
 *    naspeelt, blijft groen als de lus en de test dezelfde denkfout delen.
 *
 * ⚠️ **Het geval dat de bevinding was, staat er als eerste:** een bron die stil
 *    afkapt op een maximum. Dat is wat PostgREST met `max-rows` doet, en het is
 *    de reden dat de rollover een deel van de gebruikers oversloeg zonder dat er
 *    iets rood werd.
 */

/** Een bron van `n` genummerde rijen, die hoogstens `max` rijen per keer geeft. */
function bron(n: number, max = Infinity) {
  const rijen = Array.from({ length: n }, (_, i) => i);
  return async (start: number, aantal: number) =>
    rijen.slice(start, start + Math.min(aantal, max));
}

async function alles(gen: AsyncGenerator<readonly number[], void, undefined>) {
  const uit: number[] = [];
  for await (const pagina of gen) uit.push(...pagina);
  return uit;
}

describe('paginas', () => {
  it('ziet elke rij precies één keer', async () => {
    const gezien = await alles(paginas(bron(47), 10));

    expect(gezien).toHaveLength(47);
    expect(new Set(gezien).size).toBe(47);
    expect(gezien).toEqual([...gezien].sort((a, b) => a - b));
  });

  it('slaat niemand over als het aantal precies op de paginagrootte uitkomt', async () => {
    // ⚠️ Het klassieke randgeval: 40 rijen bij een pagina van 10 geeft vier volle
    //    pagina's, en dan hangt alles af van of de lus nog één keer vraagt.
    const gezien = await alles(paginas(bron(40), 10));

    expect(gezien).toHaveLength(40);
  });

  it('geeft niets terug op een lege bron', async () => {
    expect(await alles(paginas(bron(0), 10))).toEqual([]);
  });

  it('werkt als alles op één pagina past', async () => {
    expect(await alles(paginas(bron(3), 10))).toHaveLength(3);
  });

  it('stopt als de bron minder geeft dan gevraagd — en dát was de bug', async () => {
    // ⚠️ **Dit is de vorm van de bevinding.** Een bron die stil afkapt op 25 —
    //    zoals PostgREST met `max-rows` — geeft bij een pagina van 10 gewoon
    //    tien, tien, vijf. De lus ziet die vijf als het einde en stopt, en dat is
    //    correct gedrag van de lus: hij kán niet weten dat er meer was.
    //
    //    Wat deze test vastlegt is dus niet dat de lus het oplost, maar dat hij
    //    hem niet erger maakt — en dat de paginagrootte daarom kleiner moet zijn
    //    dan elke `max-rows` die er ooit gezet wordt. Die aanname staat bij
    //    `PROFIELEN_PER_PAGINA` in de rollover.
    const gezien = await alles(paginas(bron(100, 25), 10));

    expect(gezien).toHaveLength(100);
  });

  it('weigert een paginagrootte van nul in plaats van eeuwig te draaien', async () => {
    // ⚠️ Zonder deze grendel vraagt de lus eindeloos nul rijen op vanaf nul. Een
    //    job die niet stopt is erger dan een job die valt: hij verbruikt zijn
    //    tijdslimiet en laat niets achter waaruit blijkt waarom.
    await expect(alles(paginas(bron(10), 0))).rejects.toThrow(RangeError);
  });
});
