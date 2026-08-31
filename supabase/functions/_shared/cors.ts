/**
 * CORS voor de Edge Functions — QS8-195.
 *
 * ⚠️ **Waarom dit bestaat, en waarom het een gedeelde laag is en geen regel per
 *    functie.** `doelcoach` wees élk niet-POST-verzoek af met 405, en de
 *    allereerste regel van de handler deed dat. `functions.invoke()` stuurt
 *    `Authorization`, `apikey` en `content-type: application/json` mee; dat zijn
 *    geen simple headers, dus een browser stuurt eerst een preflight. De app
 *    draait op `goalbuddies.q-projects.tech` en de functie op `*.supabase.co` —
 *    een andere origin, dus die preflight is verplicht. Hij kreeg 405 zonder een
 *    enkele `Access-Control-Allow-*`, en de POST die erop hoorde te volgen is
 *    nooit verstuurd. Twee jobs bleven op `queued` staan en het scherm wachtte
 *    twee minuten op een functie die nooit is aangeroepen.
 *
 * ⚠️ **De naad zat tussen twee correcte onderdelen** (onwrikbare regel 18): de
 *    job-tabel, het quotum, de dedup, de validatie en het polling-scherm waren
 *    allemaal af en getest. Wat ontbrak was de verbinding, en geen enkele
 *    onderdeeltest kon dat zien. Daarom wordt hier de *belofte* bewaakt — "een
 *    browser kan deze functie aanroepen" — en niet de vorm van één handler; zie
 *    `tests/beloftes/edge-cors.test.ts`, die de échte handlers een `OPTIONS`
 *    voert.
 *
 * ⚠️ **Geen wildcard.** De issue vraagt er met zoveel woorden om: de functies
 *    draaien onder het JWT van de aanroeper, dus `*` levert niets op wat een
 *    allowlist niet ook levert, en het zet elk ander domein in staat om met de
 *    sessie van een ingelogde gebruiker mee te lezen. De lijst komt uit
 *    `TOEGESTANE_HERKOMSTEN`; ontbreekt die, dan geldt het adres uit CLAUDE.md.
 */

/**
 * ⚠️ Dezelfde waarde als `STANDAARD_APP_URL` in `src/lib/env.ts`, en om dezelfde
 *    reden: zonder configuratie moet de app werken. Een lege standaard zou de
 *    functie precies zo onbereikbaar maken als de bug die dit bestand repareert,
 *    alleen dan stil en pas op productie.
 */
const STANDAARD_HERKOMSTEN: readonly string[] = ['https://goalbuddies.q-projects.tech'];

/**
 * De headers die `functions.invoke()` meestuurt en die daarom in de preflight
 * toegestaan moeten worden. `x-client-info` zet supabase-js er zelf op.
 */
export const TOEGESTANE_KOPPEN = 'authorization, apikey, content-type, x-client-info';

/** Alle drie de functies zijn POST. `OPTIONS` staat erbij omdat de preflight dat vraagt. */
export const TOEGESTANE_METHODEN = 'POST, OPTIONS';

/** Twee uur. Scheelt een preflight per aanroep zonder dat een wijziging lang blijft hangen. */
const MAX_AGE_SECONDEN = '7200';

/**
 * Leest de allowlist uit een ruwe env-waarde.
 *
 * ⚠️ Puur en apart geëxporteerd zodat hij te voeden is. Een controle of een
 *    grens die je niet los kunt aanbieden, kun je niet ijken — dat is de les van
 *    `tekst:controle`.
 *
 * Lege en witruimte-invoer valt terug op de standaard: een verkeerd gezette
 * variabele mag de app niet onbereikbaar maken.
 */
export function ontleedHerkomsten(ruw: string | undefined | null): readonly string[] {
  const stukken = (ruw ?? '')
    .split(',')
    .map((stuk) => stuk.trim().replace(/\/+$/, ''))
    .filter((stuk) => stuk.length > 0);

  return stukken.length > 0 ? stukken : STANDAARD_HERKOMSTEN;
}

/** De allowlist zoals hij op dit moment in de omgeving staat. */
export function toegestaneHerkomsten(): readonly string[] {
  return ontleedHerkomsten(Deno.env.get('TOEGESTANE_HERKOMSTEN'));
}

/**
 * De CORS-headers die bij dit verzoek horen.
 *
 * Geen `Origin` betekent geen browser: de rollover en de meldingenjob worden
 * server-side aangeroepen en hebben hier niets aan. Een `Origin` die niet op de
 * lijst staat krijgt géén `Access-Control-Allow-Origin` — de browser blokkeert
 * het antwoord dan zelf, en dat is precies de bedoeling.
 *
 * ⚠️ `Vary: Origin` staat er altijd op zodra er een `Origin` was. Zonder die kop
 *    mag een cache het antwoord voor de ene herkomst aan de andere geven, en dan
 *    is de allowlist alsnog een wildcard.
 */
export function corsKoppen(
  herkomst: string | null,
  toegestaan: readonly string[],
): Record<string, string> {
  if (herkomst === null || herkomst === '') return {};

  const koppen: Record<string, string> = { Vary: 'Origin' };
  if (!toegestaan.includes(herkomst.replace(/\/+$/, ''))) return koppen;

  koppen['Access-Control-Allow-Origin'] = herkomst;
  koppen['Access-Control-Allow-Headers'] = TOEGESTANE_KOPPEN;
  koppen['Access-Control-Allow-Methods'] = TOEGESTANE_METHODEN;
  koppen['Access-Control-Max-Age'] = MAX_AGE_SECONDEN;
  return koppen;
}

type Afhandelaar = (verzoek: Request) => Response | Promise<Response>;

/**
 * Legt CORS om een handler heen.
 *
 * Twee dingen, en ze zijn allebei nodig: de preflight wordt hier beantwoord —
 * vóór de handler, want die kent alleen POST — en dezelfde headers gaan op het
 * échte antwoord mee. Alleen de preflight beantwoorden is niet genoeg: de
 * browser leest het antwoord op de POST dan alsnog niet.
 *
 * ⚠️ Een nieuwe `Response` in plaats van `antwoord.headers.set()`. Een antwoord
 *    dat uit een `fetch()` komt heeft onveranderlijke headers, en dan zou het
 *    zetten stil mislukken.
 */
export function metCors(afhandelen: Afhandelaar): (verzoek: Request) => Promise<Response> {
  return async (verzoek: Request): Promise<Response> => {
    const koppen = corsKoppen(verzoek.headers.get('Origin'), toegestaneHerkomsten());

    if (verzoek.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: koppen });
    }

    const antwoord = await afhandelen(verzoek);
    const samen = new Headers(antwoord.headers);
    for (const [naam, waarde] of Object.entries(koppen)) samen.set(naam, waarde);

    return new Response(antwoord.body, {
      status: antwoord.status,
      statusText: antwoord.statusText,
      headers: samen,
    });
  };
}
