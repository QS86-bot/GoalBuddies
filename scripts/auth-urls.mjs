/**
 * Leest en zet de Auth-URL's van het Supabase-project — QS8-99.
 *
 * ⚠️ **Waarom dit een script is en geen dashboardhandeling.** De Site URL bepaalt
 *    waar de bevestigingslink in élke aanmeldmail heen wijst. Staat hij verkeerd,
 *    dan is de eerste ervaring van een nieuwe gebruiker een link die nergens
 *    heen gaat — en dat merk je pas als iemand het meldt. Met de hand is dat
 *    twee minuten en bij het volgende domein opnieuw twee minuten; zo staat het
 *    vast en is het na te lezen.
 *
 * ⚠️ **Dit vraagt een personal access token, niet de service-role-key.** De
 *    Management API is een ander systeem dan je project: de service-role-key
 *    werkt er niet. Maak er een op
 *    https://supabase.com/dashboard/account/tokens en zet hem in `.env` als
 *    `SUPABASE_ACCESS_TOKEN`.
 *
 *    Die token geeft toegang tot je hele Supabase-account, niet alleen tot dit
 *    project. Behandel hem als zodanig: nooit in de client, nooit in een commit.
 *
 * Gebruik:
 *   node scripts/auth-urls.mjs          — laat zien wat er nu staat
 *   node scripts/auth-urls.mjs --zet    — zet het goed
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com';
const TIMEOUT_MS = 15_000;

/** Leest `.env` zonder dependency; bestaande omgevingsvariabelen winnen. */
function leesEnv() {
  const uit = { ...process.env };
  try {
    for (const regel of readFileSync(join(WORTEL, '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(regel);
      if (m && !uit[m[1]]) uit[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Geen .env is prima zolang de variabelen in de omgeving staan.
  }
  return uit;
}

const GEEN_TOKEN = [
  'SUPABASE_ACCESS_TOKEN ontbreekt.',
  '',
  '⚠️ Dit is niet de service-role-key. De Management API vraagt een personal',
  '   access token: https://supabase.com/dashboard/account/tokens',
  '',
  'Zet hem daarna in .env als SUPABASE_ACCESS_TOKEN.',
].join('\n');

/**
 * De adressen waarheen Supabase mag terugsturen na een bevestiging of
 * wachtwoordherstel.
 *
 * ⚠️ Komma-gescheiden string en geen array — zo wil de API het.
 *
 * ⚠️ `localhost` staat erbij zodat aanmelden lokaal blijft werken. Dat is geen
 *    gat: deze lijst zegt alleen waar Supabase naartoe mag terugsturen ná een
 *    geslaagde bevestiging, en wie op jouw localhost kan luisteren zit al op je
 *    machine. De poort is die van `expo start --web`.
 */
export function redirectsVoor(app) {
  return [
    `${app}/**`,
    'http://localhost:8081/**',
    // Voor de latere native build; het schema staat in app.json.
    'goalbuddies://**',
  ].join(',');
}

/**
 * De echte aanroep naar de Management API.
 *
 * ⚠️ Dit is de enige plek die een verzoek verstuurt. Tests geven `draai()` een
 *    eigen `api` mee en raken dit nooit — `--zet` schrijft op productie.
 *
 * @param {{ token: string, ref: string }} invoer
 * @returns {(methode: 'GET' | 'PATCH', body?: object) => Promise<any>}
 */
export function maakApi({ token, ref }) {
  return async (methode, body) => {
    const antwoord = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const tekst = await antwoord.text();
    if (!antwoord.ok) {
      throw new Error(`${methode} config/auth gaf HTTP ${antwoord.status}: ${tekst.slice(0, 400)}`);
    }
    return JSON.parse(tekst);
  };
}

/** Wat er nu staat en wat er straks hoort te staan; geeft terug of ze gelijk zijn. */
function toonStand({ ref, app, redirects, huidig, zet }) {
  console.log('Project        :', ref);
  console.log('Site URL nu    :', huidig.site_url || '(leeg)');
  console.log('Redirects nu   :', huidig.uri_allow_list || '(leeg)');
  console.log('');
  console.log('Site URL straks:', app);
  console.log('Redirects straks:', redirects);

  const klopt = huidig.site_url === app && huidig.uri_allow_list === redirects;
  if (!zet) {
    console.log('');
    console.log(klopt ? 'Staat al goed. Niets te doen.' : 'Wijkt af. Draai opnieuw met --zet.');
  }
  return klopt;
}

/** Schrijft de waarden en leest ze terug. Geeft de exitcode. */
async function zetEnLeesTerug({ app, redirects, api }) {
  await api('PATCH', { site_url: app, uri_allow_list: redirects });

  const na = await api('GET');
  const gelukt = na.site_url === app && na.uri_allow_list === redirects;

  console.log('');
  console.log('Site URL na    :', na.site_url);
  console.log('Redirects na   :', na.uri_allow_list);
  console.log('');

  // ⚠️ Teruglezen en vergelijken, niet vertrouwen op HTTP 200. De API accepteert
  //    een veld dat hij niet kent zonder te klagen, en dan denk je dat het staat.
  if (!gelukt) {
    console.error('⚠️ De waarden na afloop komen niet overeen met wat er is gestuurd.');
    return 1;
  }
  console.log('Goed gezet en teruggelezen.');
  return 0;
}

function meldFout(fout) {
  const melding = fout instanceof Error ? fout.message : String(fout);
  console.error(melding);

  // ⚠️ De netwerkoorzaak eerst. Een proxy geeft ook 403, en dan wijst een
  //    hint over je token je precies de verkeerde kant op.
  if (/allowlist|egress|ENOTFOUND|timed out|fetch failed/i.test(melding)) {
    console.error('');
    console.error('⚠️ api.supabase.com was niet bereikbaar — dit lijkt een netwerkblokkade');
    console.error('   en niet je token. Draai dit vanaf je eigen machine.');
  } else if (/\b(401|403)\b/.test(melding)) {
    console.error('');
    console.error('⚠️ Controleer of SUPABASE_ACCESS_TOKEN een personal access token is');
    console.error('   (sbp_…) en niet de service-role-key, en of hij nog geldig is.');
  }
}

/**
 * Draait het script en geeft de **exitcode terug** — hij sluit het proces niet af.
 *
 * ⚠️ **Geen `process.exit()` na een `await fetch()`** (QS8-684). Op Windows
 *    stort libuv dan in met een assertion in `src\win\async.c`, nadat de uitslag
 *    al geprint was; gemeten op 18-11-2026 (exit -1073740791). De aanroeper zet
 *    `process.exitCode` en laat de event loop leeglopen.
 *
 * ⚠️ **`zet` schrijft op productie.** `api` is injecteerbaar zodat de tests het
 *    pad zonder netwerk kunnen doorlopen; er wordt hier niets aan het gedrag
 *    van `--zet` veranderd.
 *
 * @param {{ token?: string | undefined, ref: string, app: string, zet?: boolean }} invoer
 * @param {(methode: 'GET' | 'PATCH', body?: object) => Promise<any>} [api]
 * @returns {Promise<number>}
 */
export async function draai({ token, ref, app, zet }, api = maakApi({ token: token ?? '', ref })) {
  if (!token) {
    console.error(GEEN_TOKEN);
    return 1;
  }

  const redirects = redirectsVoor(app);
  try {
    const huidig = await api('GET');
    toonStand({ ref, app, redirects, huidig, zet });
    if (!zet) return 0;
    return await zetEnLeesTerug({ app, redirects, api });
  } catch (fout) {
    meldFout(fout);
    return 1;
  }
}

// ⚠️ De ingang staat achter de main-guard, zodat importeren niets doet (QS8-608).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = leesEnv();
  process.exitCode = await draai({
    token: env.SUPABASE_ACCESS_TOKEN,
    ref: env.SUPABASE_PROJECT_REF ?? 'wehgocadxehottiiyvsc',
    app: (env.EXPO_PUBLIC_APP_URL ?? 'https://goalbuddies.q-projects.tech').replace(/\/+$/, ''),
    zet: process.argv.includes('--zet'),
  });
}
