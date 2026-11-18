/**
 * Het kindproces van de QS8-702-grendel. Laadt `tests/rls/harness.ts` onder de
 * omgeving die de ouder meegeeft, probeert één verzoek te doen, en meldt wat
 * eruit komt als één JSON-regel op stdout.
 *
 * ⚠️ **Een kindproces en niet in-proces, met opzet.** De ouder is een vitest-run,
 *    en die heeft via `src/lib/test-env.ts` de `.env` van de machine al in
 *    `process.env` geladen — op de machine van Quinten mét productiesleutels. De
 *    module-constanten van de harness worden één keer bij het laden berekend,
 *    dus alleen een vers proces met een eigen, kale omgeving laat zien wat de
 *    harness doet onder precies die omgeving en niets anders.
 *
 * ⚠️⚠️ **`fetch` is hier een spion die nóóit verbindt.** Hij legt het adres van
 *    elk verzoek vast en antwoordt zelf met een lege lijst. Zo meet deze driver
 *    *waar* de harness heen zou praten zonder dat er ooit een pakket de deur uit
 *    gaat — ook niet als de
 *    grendel kapot is. Dat is de reden dat de ijking (de oude standaard
 *    terugzetten) veilig is: de omgeving draagt nepsleutels en een
 *    `.invalid`-adres, en de spion laat niets door.
 *
 * ⚠️ **De grens van de spion:** hij ziet `fetch` en niets anders — geen psql,
 *    geen realtime-WebSocket, geen `node:http`. De harness gebruikt vandaag alleen
 *    `fetch`; het psql-pad van de suite (`tests/rls/psql-stack.ts`) valt hier
 *    buiten en heeft een eigen dossierrij.
 *
 * Argument: het absolute pad naar `tests/rls/harness.ts`.
 */
import { register } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

register('./los-ts-op.mjs', import.meta.url);

/** @type {string[]} */
const verzoeken = [];
globalThis.fetch = (invoer) => {
  const adres = typeof invoer === 'string' ? invoer : invoer instanceof URL ? invoer.href : invoer.url;
  verzoeken.push(new URL(adres).host);
  // Een leeg antwoord en geen weigering: supabase-js probeert een mislukt
  // verzoek opnieuw met wachttijd, en dat kost seconden zonder iets te meten.
  return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
};

/** Alleen de eerste regel: genoeg om de melding te herkennen, niets meer. */
function eersteRegel(fout) {
  return String(fout instanceof Error ? fout.message : fout).split('\n')[0];
}

/**
 * Bouw een client en doe één verzoek, en maak een testaccount aan — de route
 * waarlangs de 1.865 accounts op productie kwamen. De spion vangt alles.
 */
async function probeer(harness) {
  try {
    await harness.adminDb().from('profiles').select('id').limit(1);
    await harness.anonDb().from('profiles').select('id').limit(1);
  } catch (fout) {
    return { clientGebouwd: false, clientFout: eersteRegel(fout) };
  }
  try {
    await harness.createTestUser('kindproces');
  } catch {
    // Het antwoord van de spion is geen echte gebruiker; dat deze stap daarop
    // strandt is verwacht. Wat telt is het verzoek dat hij probeerde.
  }
  return { clientGebouwd: true, clientFout: null };
}

async function meet(harnessPad) {
  let harness;
  try {
    harness = await import(pathToFileURL(harnessPad).href);
  } catch (fout) {
    return { geladen: false, laadfout: eersteRegel(fout), clientGebouwd: false, verzoeken };
  }

  const uitkomst = await probeer(harness);
  return {
    geladen: true,
    doelsoort: harness.doelsoort,
    rlsTestsConfigured: harness.rlsTestsConfigured,
    ...uitkomst,
    verzoeken,
  };
}

process.stdout.write(JSON.stringify(await meet(process.argv[2])));
