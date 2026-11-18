/**
 * Het kindproces van de QS8-700-grendel. Laadt `tests/rls/harness.ts` onder de
 * omgeving die de ouder meegeeft en meldt wat eruit komt, als één JSON-regel op
 * stdout.
 *
 * ⚠️ **Een kindproces en niet in-proces, met opzet.** De ouder is een vitest-run,
 *    en die heeft via `src/lib/test-env.ts` de échte `.env` met de
 *    productiesleutels al in `process.env` geladen. Alleen een eigen, kale
 *    omgeving bewijst dat de belofte óók houdt met die sleutels aanwezig — en de
 *    module-constanten in de harness worden één keer bij het laden berekend, dus
 *    een vers proces is de enige manier om ze onder een gekozen omgeving te zien.
 *
 * Argument: het absolute pad naar `tests/rls/harness.ts`.
 */
import { register } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

register('./los-ts-op.mjs', import.meta.url);

const harnessPad = process.argv[2];

// ⚠️ Een spion op `fetch` als tweede net. Supabase-js legt bij `createClient()`
//    nog geen verbinding, dus dit vangt alleen een verbinding die al bij het
//    láden geprobeerd zou worden. Het echte bewijs van "geen verbinding" is dat
//    `requireEnv()` wérpt vóór er een client bestaat — zie `clientGebouwd`.
let netwerkGeprobeerd = false;
const echteFetch = globalThis.fetch;
globalThis.fetch = (...args) => {
  netwerkGeprobeerd = true;
  return echteFetch ? echteFetch(...args) : Promise.reject(new Error('geen fetch'));
};

const harness = await import(pathToFileURL(harnessPad).href);

// ⚠️ `adminDb()` roept `requireEnv()` aan. Bij een ontbrekend doel hoort dat te
//    wérpen — vóór `createClient()`, en dus vóór er iets naar het netwerk kan.
let clientGebouwd = false;
try {
  harness.adminDb();
  clientGebouwd = true;
} catch {
  clientGebouwd = false;
}

process.stdout.write(
  JSON.stringify({
    doelsoort: harness.doelsoort,
    rlsTestsConfigured: harness.rlsTestsConfigured,
    echteSessieBeschikbaar: harness.echteSessieBeschikbaar,
    clientGebouwd,
    netwerkGeprobeerd,
  }),
);
