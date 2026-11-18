/**
 * Welk doel kiest de RLS-suite? — QS8-702.
 *
 * ⚠️ **Productie is nooit een stille standaard.** Tot 18-11-2026 stond hier
 *    `RLS_DOEL === 'lokaal' ? 'lokaal' : 'productie'`: elke andere waarde, ook
 *    een afwezige, was productie. En `src/lib/test-env.ts` laadt `.env` bij élke
 *    `npm test`, dus een machine met productiesleutels in `.env` maakte
 *    testaccounts aan op het echte project zonder dat iemand iets koos. De
 *    teardown kon ze niet meer weghalen (QS8-692), en de rest groeide.
 *
 * ⚠️ **Een kale `npm test` zonder sleutels blijft stil overslaan** — niemand
 *    beweerde iets te meten (zelfde afspraak als `stackBeschikbaarOfFaal()`).
 *    Wát er niet stil mag: sleutels voor productie in de omgeving, zonder dat
 *    iemand een doel koos. Dat is het gevaarlijke geval en het faalt luid.
 *
 * ⚠️ **Productie vraagt twee bewuste handelingen:** `RLS_DOEL=productie` én het
 *    bestaande slot `RLS_TEST_ALLOW_PROD=1` (zie `guardProductie()` in het
 *    harnas). Het productiecommando staat in de kop van `harness.ts`.
 *
 * ⚠️ `RLS_DOEL=` (lege string) telt als een bewering en wordt geweigerd, net als
 *    in `psql-stack.ts`: wie het veld noemt, bedoelde iets.
 *
 * Pure functie met de omgeving als argument, zodat hij met de hand te voeden is.
 */
export type DoelOordeel =
  | { readonly soort: 'lokaal' }
  | { readonly soort: 'productie' }
  | { readonly soort: 'geen' }
  | { readonly soort: 'geweigerd'; readonly melding: string };

type Omgeving = Readonly<Record<string, string | undefined>>;

/** Staan er sleutels in de omgeving waarmee dit naar het echte project kan schrijven? */
export function heeftProductiesleutels(env: Omgeving): boolean {
  // Alleen de service-role-key telt: de URL en de anon-key zijn publiek en staan
  // in elke app-`.env`; een kale `npm test` daarmee moet stil blijven overslaan.
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

const KEUZE =
  'Kies een doel:\n' +
  '  lokaal (aanbevolen):  npm run rls:stack   &&   npm run rls:lokaal\n' +
  '  productie (bewust):   npx cross-env RLS_DOEL=productie RLS_TEST_ALLOW_PROD=1 vitest run tests/rls/<bestand>';

export function bepaalDoel(env: Omgeving): DoelOordeel {
  const doel = env.RLS_DOEL;

  if (doel === 'lokaal') return { soort: 'lokaal' };
  if (doel === 'productie') return { soort: 'productie' };

  if (doel === undefined) {
    if (!heeftProductiesleutels(env)) return { soort: 'geen' };
    return {
      soort: 'geweigerd',
      melding:
        'RLS_DOEL is niet gezet, terwijl er Supabase-sleutels in de omgeving staan (.env?). ' +
        'De RLS-suite kiest productie nooit uit zichzelf: ze maakt daar echte accounts aan.\n' +
        KEUZE,
    };
  }

  return {
    soort: 'geweigerd',
    melding: `RLS_DOEL="${doel}" is geen doel dat deze suite kent (alleen "lokaal" of "productie").\n${KEUZE}`,
  };
}

/**
 * De uitslag van het opruimen van accounts — QS8-702.
 *
 * ⚠️ **Een mislukte verwijdering is een rode suite en geen waarschuwing.**
 *    Accountverwijdering faalt op productie voor iedereen (QS8-692); omgezet in
 *    een `console.warn` bleef elke run groen en groeide het aantal achtergebleven
 *    accounts van 260 (09-11) naar 1.865 (18-11; meting van Quinten op `auth.users`, niet door
 *    deze test). `null` betekent: alles weg.
 */
export function achtergeblevenMelding(
  achtergebleven: readonly string[],
  totaal: number,
): string | null {
  if (achtergebleven.length === 0) return null;

  return [
    `Opruimen mislukt: ${achtergebleven.length} van de ${totaal} testaccounts zijn achtergebleven.`,
    `Eerste: ${achtergebleven[0] ?? '(onbekend)'}`,
    'Op productie faalt accountverwijdering zolang QS8-692 niet is uitgerold; draai daar niet verder.',
  ].join('\n');
}
