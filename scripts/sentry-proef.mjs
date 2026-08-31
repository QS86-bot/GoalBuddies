#!/usr/bin/env node
/**
 * Stuurt één echte foutmelding naar Sentry — QS8-24.
 *
 * ⚠️ **Waarom dit bestaat.** `edge-rapport.test.ts` toetst de envelope regel
 *    voor regel, maar een test die mijn eigen aanname over de draadvorm
 *    bevestigt is geen bewijs. Tot 26-08-2026 was er geen account en dus nooit
 *    een envelope aangekomen; de kop van `edge-rapport.ts` zei dat ook met
 *    zoveel woorden. Dit script is de controle die dat verschil dichtzet.
 *
 * ⚠️ **En het is meteen de les van CLAUDE.md regel 18: een controle die je niet
 *    kunt draaien, is een aanname.** De eerste keer dat deze envelope naar een
 *    echte ingest ging, kwam er 403 uit — en de code meldde `'verstuurd'`,
 *    omdat `fetch()` alleen bij een netwerkfout verwerpt. Dát gat is met deze
 *    handeling gevonden en niet met achttien groene tests.
 *
 * ⚠️ **Het bouwt de envelope niet zelf.** Hij komt uit
 *    `supabase/functions/_shared/observability/edge-rapport.ts`, dus uit precies
 *    het bestand dat de Edge Function draait. Een tweede opvatting van de
 *    draadvorm in dit script zou de kopie zijn die in dit project al een keer
 *    geruisloos uit elkaar liep.
 *
 * ⚠️ **De proeffout draagt met opzet vuil**: een e-mailadres, een token, een
 *    geciteerde Postgres-waarde en een notitie, én dezelfde melding nog eens in
 *    de eerste regel van de stack. Wat er over de lijn gaat wordt afgedrukt, dus
 *    de run is meteen een lekcontrole op de échte bytes.
 *
 * ⚠️ **Twee kanten, want het zijn twee ketens.** Zonder vlag stuurt hij de
 *    envelope van een Edge Function (`server_name: edge`, `runtime: deno`); met
 *    `--app` die van de app (`server_name: app`, `runtime: web`). Die tweede
 *    bestaat omdat er tot 30-08-2026 nooit één fout uit de app in Sentry was
 *    aangekomen: de edge-kant was bewezen, de app-kant nooit, en "het is
 *    dezelfde bouwer" is een afleiding en geen meting.
 *
 * ⚠️ **Wat `--app` níét bewijst.** Dat `app/_layout.tsx` de sink daadwerkelijk
 *    aansluit, en dat de DSN in de gedeployde bundel staat. Dat zijn de andere
 *    twee schakels: de eerste bewaakt `npm run deploy` sinds 30-08, de tweede
 *    vraagt een echte browser. Dit script sluit de envelope en de ingest.
 *
 * ⚠️ **Beide kanten sturen `environment: proef`**, en dat is met opzet: een
 *    rooktest die in `production` belandt vervuilt precies het signaal dat we
 *    hier aan het opbouwen zijn.
 *
 * Gebruik:
 *   npm run sentry:proef              — de Edge-envelope, versturen
 *   npm run sentry:proef -- --app     — de app-envelope, versturen
 *   npm run sentry:proef -- --droog   — alleen bouwen en afdrukken
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { standaardDsnUit } from './dsn-controle.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const KOPIE = join(WORTEL, 'supabase', 'functions', '_shared', 'observability', 'edge-rapport.ts');
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
    // Geen .env is geen fout; de variabele mag ook uit de omgeving komen.
  }
  return uit;
}

/** Toont een sleutel zonder hem te verklappen. */
function gemaskeerd(sleutel) {
  return sleutel.length <= 8 ? '********' : `${sleutel.slice(0, 4)}…${sleutel.slice(-4)}`;
}

const droog = process.argv.includes('--droog');
const app = process.argv.includes('--app');
const env = leesEnv();

/**
 * ⚠️ **De twee kanten lezen een andere variabele, en dat is geen slordigheid.**
 *    De Edge Functions krijgen `SENTRY_DSN` uit hun eigen omgeving
 *    (`npx supabase secrets set`); de app leest `EXPO_PUBLIC_SENTRY_DSN`, en die
 *    heeft sinds 30-08 een standaard in `src/lib/env.ts` — dus voor `--app` is
 *    er niets meer te configureren. Dezelfde volgorde als `clientEnv()`: een
 *    expliciet gezette waarde wint, ook een lege.
 */
function dsnVoorDeApp() {
  const gezet = env['EXPO_PUBLIC_SENTRY_DSN'];
  if (gezet !== undefined) return gezet;

  const standaard = standaardDsnUit(readFileSync(join(WORTEL, 'src', 'lib', 'env.ts'), 'utf8'));
  if (standaard === null) {
    console.error('  ✗ Kon STANDAARD_SENTRY_DSN niet vinden in src/lib/env.ts.');
    console.error('    Is de constante hernoemd? Werk standaardDsnUit() bij.');
    process.exit(1);
  }
  return standaard;
}

const dsn = app ? dsnVoorDeApp() : (env['SENTRY_DSN'] ?? '');

if (dsn === '') {
  if (app) {
    console.error('  ✗ EXPO_PUBLIC_SENTRY_DSN staat expliciet op leeg — de app meldt dan niets.');
    console.error('    Haal hem uit .env om op de standaard uit src/lib/env.ts terug te vallen.');
  } else {
    console.error('  ✗ SENTRY_DSN ontbreekt. Zet hem in .env of in de omgeving:');
    console.error("      SENTRY_DSN='https://<sleutel>@<host>/<project-id>'");
  }
  process.exit(1);
}

console.log(`  · kant       ${app ? 'app (server_name: app, runtime: web)' : 'edge (server_name: edge, runtime: deno)'}`);

let rapport;
try {
  // ⚠️ **Een `file://`-URL en niet het kale pad.** Op Windows begint dat pad met
  //    een stationsletter, en Node's ESM-lader leest `C:` dan als een protocol:
  //    "Only URLs with a scheme in: file, data, and node are supported. Received
  //    protocol 'c:'". Op Linux werkt het kale pad wél, dus CI en deze
  //    ontwikkelomgeving zagen er niets van — het brak pas op de machine waar
  //    het script juist gedraaid moest worden, op 26-08-2026, bij de allereerste
  //    echte run.
  //
  //    Vijf andere scripts in deze map gebruiken `pathToFileURL` al voor hun
  //    entrypoint-controle. Het huispatroon was er; dit script volgde het niet.
  rapport = await import(pathToFileURL(KOPIE).href);
} catch (fout) {
  console.error(`  ✗ Kon ${KOPIE} niet laden: ${fout instanceof Error ? fout.message : 'onbekend'}`);
  console.error('    Draai `npm run edge:sync` — de kopie voor de Edge Functions ontbreekt of is stuk.');
  process.exit(1);
}

const ontleed = rapport.ontleedDsn(dsn);
if (ontleed === null) {
  console.error('  ✗ SENTRY_DSN is onbruikbaar. Verwacht: https://<sleutel>@<host>/<project-id>');
  process.exit(1);
}

console.log(`  · host       ${ontleed.host}`);
console.log(`  · project    ${ontleed.projectId}`);
console.log(`  · sleutel    ${gemaskeerd(ontleed.sleutel)}`);

const fout = new Error(
  "proefmelding van npm run sentry:proef voor iemand@voorbeeld.nl " +
    "met token eyJhbGciOi.JIUzI1NiJ9.abc en waarde 'Mijn gemiste week'",
);
fout.stack = `Error: ${fout.message}\n    at proef (file:///scripts/sentry-proef.mjs:1:1)`;

const beschrijving = rapport.beschrijf(fout, {
  code: '23514',
  notitie: 'deze notitie hoort er niet doorheen te komen',
});
const id = rapport.gebeurtenisId(crypto.randomUUID());

/**
 * ⚠️ **`runtime` en `server` stonden hier tot 30-08-2026 niet in, en dat was een
 *    stille fout.** `maakVerzending()` eist ze allebei, maar dit is een `.mjs`
 *    met type-stripping: TypeScript kijkt er niet naar, dus ze waren `undefined`
 *    en vielen uit de JSON. De proef van 26-08 kwam dus aan met HTTP 200 — maar
 *    zónder `server_name` en zónder de `runtime`-tag, precies de twee velden
 *    waaraan je app van edge onderscheidt.
 *
 *    Dat is de vorm die dit project kent: een controle die groen was en iets
 *    anders bewees dan hij beloofde. De ingest accepteert een envelope zonder
 *    die velden nu eenmaal.
 */
const kant = app
  ? { waar: 'proef.app', runtime: 'web', server: 'app', release: releaseVanDeApp() }
  : { waar: 'proef.edge', runtime: 'deno', server: 'edge' };

const verzending = rapport.maakVerzending(
  ontleed,
  { id, ...kant, ...beschrijving, omgeving: 'proef' },
  new Date(),
);

/** `goalbuddies@<versie>` uit `app.json`, of `undefined`. Zelfde vorm als de app. */
function releaseVanDeApp() {
  try {
    const versie = JSON.parse(readFileSync(join(WORTEL, 'app.json'), 'utf8')).expo?.version;
    return typeof versie === 'string' && versie.trim() !== ''
      ? `goalbuddies@${versie.trim()}`
      : undefined;
  } catch {
    return undefined;
  }
}

console.log(`  · url        ${verzending.url}`);
console.log('\n  Wat er over de lijn gaat:\n');
for (const regel of verzending.body.split('\n')) console.log(`    ${regel}`);

const VUIL = [
  'iemand@voorbeeld.nl',
  'voorbeeld.nl',
  'eyJhbGciOi',
  'Mijn gemiste week',
  'deze notitie hoort er niet doorheen te komen',
];
const gelekt = VUIL.filter((stuk) => verzending.body.includes(stuk));

console.log('');
if (gelekt.length > 0) {
  console.error(`  ✗ Er gaat gebruikerstekst mee: ${gelekt.join(', ')}`);
  process.exit(1);
}
console.log('  ✓ Geen e-mailadres, token, geciteerde waarde of notitie in de bytes');

if (droog) {
  console.log('  · --droog: niets verstuurd');
  process.exit(0);
}

let antwoord;
try {
  antwoord = await fetch(verzending.url, {
    method: 'POST',
    headers: verzending.headers,
    body: verzending.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch (netwerk) {
  console.error(`  ✗ De ingest was niet te bereiken: ${netwerk instanceof Error ? netwerk.message : 'onbekend'}`);
  process.exit(1);
}

const tekst = await antwoord.text();

if (!antwoord.ok) {
  // ⚠️ Dit is het geval dat de code tot 26-08 als 'verstuurd' meldde.
  console.error(`  ✗ De ingest weigerde de melding: HTTP ${antwoord.status}`);
  console.error(`    ${tekst.slice(0, 300)}`);
  process.exit(1);
}

console.log(`  ✓ HTTP ${antwoord.status} — de ingest heeft hem aangenomen`);
console.log(`    antwoord: ${tekst.slice(0, 200)}`);
console.log(`\n  Zoek in Sentry op event-id ${id}.`);
console.log('  Staat hij er, dan is de draadvorm bewezen in plaats van aangenomen.');
process.exit(0);
