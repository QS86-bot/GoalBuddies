#!/usr/bin/env node
/**
 * Hergenereert `src/lib/database.types.ts`.
 *
 * ⚠️ Waarom dit een script is en niet één regel in `package.json`. Daar stond
 *    `supabase gen types typescript ... > src/lib/database.types.ts`, en de shell
 *    kapt het doelbestand af vóórdat het commando draait. Staat `supabase` niet
 *    op het PATH — en dat is hier het geval, zie Q-TODO C3 — dan is het resultaat
 *    een leeg typesbestand en een build die overal stukloopt, zonder dat één
 *    foutmelding naar de oorzaak wijst. Dat is één keer echt gebeurd.
 *
 *    Dit script schrijft alleen bij een geslaagde generatie, en weigert output
 *    die te klein is om echt te zijn.
 *
 * ⚠️ Werkt dit niet, dan is er nog een tweede route: de Supabase MCP-tool
 *    `generate_typescript_types`. Die vraagt geen access token en geen Docker, en
 *    is waarmee de types van EPIC 7 gemaakt zijn.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const DOEL = 'src/lib/database.types.ts';
const PROJECT_REF = 'wehgocadxehottiiyvsc';

/** Onder deze grens is het geen schema maar een foutmelding. */
const MINIMAAL_AANTAL_BYTES = 5000;

function fail(bericht, hint) {
  console.error(`\n  ✗ ${bericht}\n`);
  if (hint) console.error(`    ${hint}\n`);
  process.exit(1);
}

const uitvoer = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', PROJECT_REF],
  { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 },
);

if (uitvoer.error) {
  fail(
    `De Supabase CLI kon niet gestart worden: ${uitvoer.error.message}`,
    'Probeer `npx supabase --version`, of gebruik de MCP-tool generate_typescript_types.',
  );
}

const tekst = uitvoer.stdout ?? '';

if (uitvoer.status !== 0 || !tekst.includes('export type Database')) {
  fail(
    'De CLI gaf geen schema terug.',
    (uitvoer.stderr || tekst || '').trim().split('\n').slice(0, 4).join('\n    ') ||
      'Geen verdere uitleg. Meestal ontbreekt SUPABASE_ACCESS_TOKEN (Q-TODO C3).',
  );
}

if (tekst.length < MINIMAAL_AANTAL_BYTES) {
  fail(
    `De uitvoer is maar ${tekst.length} bytes en dat is te klein voor dit schema.`,
    `${DOEL} is niet aangeraakt.`,
  );
}

const oud = (() => {
  try {
    return readFileSync(DOEL, 'utf8');
  } catch {
    return '';
  }
})();

if (oud === tekst) {
  console.log(`\n  = ${DOEL} was al bij.\n`);
  process.exit(0);
}

writeFileSync(DOEL, tekst);
console.log(`\n  ✓ ${DOEL} bijgewerkt (${tekst.length} bytes).\n`);
