import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De belofte: **een browser kan een Edge Function aanroepen.**
 *
 * ⚠️ **Dit is de naad van QS8-195, en de reden dat deze test er anders uitziet
 *    dan de rest van `tests/beloftes/`.** Elk onderdeel van de Doelcoach was af
 *    en getest — de job-tabel, het quotum, de dedup, het schema, de
 *    Zod-validatie, het polling-scherm, de terugval naar handmatig. De keten was
 *    verbroken op precies één plek: de eerste regel van de handler wees élk
 *    niet-POST-verzoek af met 405, dus de CORS-preflight kreeg 405 en de browser
 *    verstuurde de POST daarna niet. Twee jobs bleven op `queued` staan.
 *
 * ⚠️ **Daarom voert deze test de échte handler een écht `Request`,** en toetst
 *    hij niet de vorm van `_shared/cors.ts` en ook niet of er ergens het woord
 *    `OPTIONS` in een bestand staat. Een test die naar een plek grijpt in plaats
 *    van naar de belofte, verhuist niet mee (regel 18, vraag 4) — en een test op
 *    `metCors` alleen zou groen blijven terwijl iemand de wrapper uit één
 *    `index.ts` haalt, wat exact de fout is die dit issue is (vraag 3).
 *
 * ⚠️ **Hoe een Deno-module in vitest terechtkomt.** `jsr:@supabase/supabase-js@2`
 *    is in `vitest.config.mts` naar een stub gewezen die bij elke aanroep
 *    omvalt; `Deno` wordt hieronder als globale gezet vóór de import, want
 *    `Deno.serve()` draait op moduleniveau. De handler die de functie daaraan
 *    meegeeft, is precies wat er op productie draait.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (28-08-standaard), en per
 *    grendel apart, want één mutatie voor de hele controle ijkt de ijking niet:
 *
 *    1. `metCors` uit `doelcoach/index.ts` gehaald → "beantwoordt de preflight"
 *       rood met 405 voor doelcoach, de andere twee groen. Dit is de bug zelf.
 *    2. In `metCors` de `OPTIONS`-tak weggehaald → alle drie rood met 405.
 *    3. In `metCors` alleen de preflight beantwoord en de headers níét op het
 *       echte antwoord gezet → "zet dezelfde headers op het echte antwoord" rood,
 *       de preflight-toets groen. Dat is de halve reparatie die eruitziet als
 *       een hele.
 *    4. In `corsKoppen` de allowlist genegeerd en altijd de herkomst
 *       teruggegeven → "laat een vreemde herkomst niet toe" rood.
 *    5. `Vary: Origin` weggehaald → de cachetoets rood, de rest groen.
 */

const APP = 'https://goalbuddies.q-projects.tech';

/** Elke functie in `supabase/functions/` die een `Deno.serve()` heeft. */
const FUNCTIES = ['doelcoach', 'rollover', 'notificaties'] as const;

type Afhandelaar = (verzoek: Request) => Response | Promise<Response>;

let omgeving: Record<string, string> = {};

/**
 * Importeert de échte module en geeft de handler terug die hij aan `Deno.serve`
 * meegeeft.
 *
 * ⚠️ De specifier is een template en geen letterlijke string: zo laat
 *    TypeScript hem met rust (`supabase/functions` staat buiten `tsconfig.json`)
 *    terwijl vite hem wél oplost. Een gewone `import` zou `npm run typecheck`
 *    laten omvallen op `jsr:`-imports en `Deno`-globals.
 */
async function handlerVan(naam: string): Promise<Afhandelaar> {
  let gevangen: Afhandelaar | undefined;

  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (sleutel: string): string | undefined => omgeving[sleutel] },
    serve: (afhandelen: Afhandelaar) => {
      gevangen = afhandelen;
      return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
    },
  };

  await import(`../../supabase/functions/${naam}/index.ts`);

  if (gevangen === undefined) {
    throw new Error(`${naam}/index.ts heeft geen handler aan Deno.serve meegegeven`);
  }
  return gevangen;
}

function preflight(herkomst: string = APP): Request {
  return new Request('https://project.supabase.co/functions/v1/x', {
    method: 'OPTIONS',
    headers: {
      Origin: herkomst,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, apikey, content-type',
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  omgeving = {};
});

afterEach(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

describe('elke Edge Function is vanaf het web aanroepbaar', () => {
  it.each(FUNCTIES)('%s beantwoordt de preflight zonder de POST te blokkeren', async (naam) => {
    const antwoord = await (await handlerVan(naam))(preflight());

    // 405 is precies wat er stond, en het is de enige fout die telt: de browser
    // stuurt de POST dan niet.
    expect(antwoord.status).toBeLessThan(300);
    expect(antwoord.headers.get('Access-Control-Allow-Origin')).toBe(APP);
  });

  it.each(FUNCTIES)('%s staat de headers toe die functions.invoke() meestuurt', async (naam) => {
    const antwoord = await (await handlerVan(naam))(preflight());
    const toegestaan = (antwoord.headers.get('Access-Control-Allow-Headers') ?? '').toLowerCase();

    // Zonder deze drie is de preflight alsnog een blokkade, en dan is er niets
    // opgelost: supabase-js zet ze op élke aanroep.
    for (const kop of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(toegestaan).toContain(kop);
    }
    expect((antwoord.headers.get('Access-Control-Allow-Methods') ?? '')).toContain('POST');
  });

  it.each(FUNCTIES)('%s zet dezelfde headers op het echte antwoord', async (naam) => {
    // ⚠️ De helft van de reparatie is geen reparatie: beantwoordt de functie wél
    //    de preflight maar zet ze niet op het antwoord erna, dan slaagt de POST
    //    en leest de browser hem alsnog niet.
    const verzoek = new Request('https://project.supabase.co/functions/v1/x', {
      method: 'POST',
      headers: { Origin: APP, 'Content-Type': 'application/json' },
      body: '{}',
    });

    const antwoord = await (await handlerVan(naam))(verzoek);
    expect(antwoord.headers.get('Access-Control-Allow-Origin')).toBe(APP);
  });

  it.each(FUNCTIES)('%s laat een vreemde herkomst niet toe', async (naam) => {
    const antwoord = await (await handlerVan(naam))(preflight('https://kwaadaardig.example'));

    // Geen wildcard, en dus ook geen echo van wat de aanvrager toevallig
    // meestuurt: de functies draaien onder het JWT van de aanroeper.
    expect(antwoord.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it.each(FUNCTIES)('%s laat een cache de herkomsten niet door elkaar halen', async (naam) => {
    const antwoord = await (await handlerVan(naam))(preflight());

    // Zonder `Vary: Origin` mag een cache het antwoord voor de ene herkomst aan
    // de andere geven, en dan is de allowlist alsnog een wildcard.
    expect(antwoord.headers.get('Vary')).toContain('Origin');
  });

  it('volgt de allowlist uit de omgeving in plaats van een vaste waarde', async () => {
    omgeving['TOEGESTANE_HERKOMSTEN'] = 'https://test.example, https://tweede.example';
    const afhandelen = await handlerVan('doelcoach');

    expect((await afhandelen(preflight('https://test.example'))).headers.get(
      'Access-Control-Allow-Origin',
    )).toBe('https://test.example');

    // En dan geldt die lijst óók: het standaardadres staat er niet meer op.
    expect((await afhandelen(preflight())).headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('doet niets bij een aanroep zonder Origin', async () => {
    // De rollover en de meldingenjob worden server-side aangeroepen. Een
    // `Access-Control-*`-kop op dat antwoord is geen fout, maar wel ruis die
    // suggereert dat er een browser in het spel is.
    const antwoord = await (await handlerVan('rollover'))(
      new Request('https://project.supabase.co/functions/v1/rollover', { method: 'POST' }),
    );

    expect(antwoord.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(antwoord.headers.get('Vary')).toBeNull();
  });
});
