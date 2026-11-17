#!/usr/bin/env node
/**
 * Ruimt achtergebleven RLS-testaccounts op een Supabase-project op — QS8-693.
 *
 * ⚠️⚠️ **Standaard doet dit niets behalve tellen.** Verwijderen gebeurt alleen met
 *    `--uitvoeren` én `--backup-gedaan=<bestand>`, en het bestand moet bestaan.
 *    Het is bulk-verwijderen van gebruikers op productie (grens 2 in CLAUDE.md):
 *    dat draait Quinten, of een sessie ná zijn "backup gedaan". Dit script is
 *    gebouwd, niet gedraaid.
 *
 * ⚠️ **Een account is alleen een kandidaat als álle drie waar zijn:**
 *    1. het e-mailadres heeft exact de vorm die `tests/rls/harness.ts` maakt
 *       (`rls-<label>-<uuid>@example.com`) — niet een los `like 'rls-%'`;
 *    2. `last_sign_in_at` is leeg (niemand is ooit ingelogd);
 *    3. `created_at` valt op een van de opgegeven dagen (`--dagen=2026-11-09,2026-11-16`).
 *    Wat één van de drie niet haalt, wordt nooit verwijderd en staat met reden in
 *    de uitvoer — ook de twee accounts die wél ooit inlogden.
 *
 * ⚠️ **Via de auth-admin-API en niet met een `delete` in SQL**, zodat de cascade
 *    en de triggers lopen zoals bij een echte verwijdering.
 *
 * ⚠️ **De eerste mislukking stopt de run.** Zolang QS8-692 niet gedeployd is,
 *    geeft elke verwijdering HTTP 500 (`protect_delete`); duizend keer proberen
 *    helpt niemand en vervuilt de logs.
 *
 * Gebruik (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/testaccounts-opruimen.mjs --dagen=2026-11-09,2026-11-16
 *   node scripts/testaccounts-opruimen.mjs --dagen=… --uitvoeren --backup-gedaan=dump.sql
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Dezelfde vorm als `TEST_EMAIL` in `tests/rls/harness.ts`. */
export const TEST_EMAIL = /^rls-[a-z0-9-]+-[0-9a-f-]{36}@example\.com$/;

const TIMEOUT_MS = 15_000;
const PAGINA = 200;

/**
 * Deelt gebruikers in: kandidaat, of overgeslagen met de reden.
 *
 * @param {Array<{id: string, email?: string|null, last_sign_in_at?: string|null, created_at: string}>} gebruikers
 * @param {readonly string[]} dagen ISO-datums (UTC) waarop een account is aangemaakt
 */
export function deelIn(gebruikers, dagen) {
  const kandidaten = [];
  const overgeslagen = { geenTestmail: 0, ooitIngelogd: 0, andereDag: 0 };

  for (const g of gebruikers) {
    if (!TEST_EMAIL.test(g.email ?? '')) overgeslagen.geenTestmail += 1;
    else if (g.last_sign_in_at) overgeslagen.ooitIngelogd += 1;
    else if (!dagen.includes(String(g.created_at).slice(0, 10))) overgeslagen.andereDag += 1;
    else kandidaten.push(g.id);
  }

  return { kandidaten, overgeslagen };
}

/** Leest `--naam=waarde` en `--vlag` uit argv. */
export function leesArgumenten(argv) {
  const uit = { uitvoeren: false, dagen: [], backup: null };
  for (const arg of argv) {
    const [naam, ...rest] = arg.split('=');
    const waarde = rest.join('=');
    if (naam === '--uitvoeren') uit.uitvoeren = true;
    if (naam === '--dagen') uit.dagen = waarde.split(',').filter(Boolean);
    if (naam === '--backup-gedaan') uit.backup = waarde;
  }
  return uit;
}

/** Waarom deze aanroep niet mag draaien, of `null`. */
export function weigering(args, bestaat = existsSync) {
  if (args.dagen.length === 0) return 'geef --dagen=<datum>[,<datum>] mee; zonder dagen is er niets om tegen te toetsen';
  if (!args.uitvoeren) return null;
  if (!args.backup) return '--uitvoeren vraagt --backup-gedaan=<bestand>: een dump vóór bulk-verwijderen';
  if (!bestaat(args.backup)) return `het backupbestand ${args.backup} bestaat niet`;
  return null;
}

async function api(url, sleutel, pad, opties = {}) {
  const antwoord = await fetch(`${url}${pad}`, {
    ...opties,
    headers: { apikey: sleutel, Authorization: `Bearer ${sleutel}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status} op ${opties.method ?? 'GET'} ${pad.split('?')[0]}`);
  return antwoord;
}

async function alleGebruikers(url, sleutel) {
  const uit = [];
  for (let pagina = 1; ; pagina += 1) {
    const { users } = await (await api(url, sleutel, `/auth/v1/admin/users?page=${pagina}&per_page=${PAGINA}`)).json();
    uit.push(...users);
    if (users.length < PAGINA) return uit;
  }
}

async function verwijder(url, sleutel, ids) {
  let weg = 0;
  for (const id of ids) {
    try {
      await api(url, sleutel, `/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      weg += 1;
    } catch (fout) {
      console.error(`gestopt na ${weg} verwijderd: ${fout.message}. Is QS8-692 gedeployd?`);
      return { weg, gestopt: true };
    }
  }
  return { weg, gestopt: false };
}

async function hoofd() {
  const args = leesArgumenten(process.argv.slice(2));
  const nee = weigering(args);
  if (nee) {
    console.error(`testaccounts-opruimen: ${nee}`);
    return 2;
  }

  const url = process.env.SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sleutel) {
    console.error('testaccounts-opruimen: zet SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }

  const { kandidaten, overgeslagen } = deelIn(await alleGebruikers(url, sleutel), args.dagen);
  console.log(`kandidaten: ${kandidaten.length}; overgeslagen: ${JSON.stringify(overgeslagen)}`);
  if (!args.uitvoeren) {
    console.log('niets verwijderd (zonder --uitvoeren is dit een telling).');
    return 0;
  }

  const { weg, gestopt } = await verwijder(url, sleutel, kandidaten);
  console.log(`verwijderd: ${weg} van ${kandidaten.length}`);
  return gestopt ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().then(
    (code) => process.exit(code),
    (fout) => {
      console.error(`testaccounts-opruimen: ${fout.message}`);
      process.exit(1);
    },
  );
}
