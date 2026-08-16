#!/usr/bin/env node
/**
 * Backup vóór een migratie.
 *
 * ⚠️ De gratis tier van Supabase heeft geen automatische backups. Draait er een
 *    migratie op data die je niet kunt missen, dan is dit bestand het enige wat
 *    tussen jou en dataverlies staat. CLAUDE.md maakt het daarom verplicht.
 *
 * Bewust een eigen script en geen losse `pg_dump`-regel in de handleiding: een
 * regel die je moet onthouden, sla je op het verkeerde moment over. Dit script
 * weigert door te gaan als er iets niet klopt, in plaats van een leeg of half
 * bestand achter te laten waar je later op vertrouwt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { config } from 'dotenv';

config({ path: '.env', quiet: true });

const OUT_DIR = 'backups';

function fail(message, hint) {
  console.error(`\n  ✗ ${message}\n`);
  if (hint) console.error(`    ${hint}\n`);
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  fail(
    'SUPABASE_DB_URL ontbreekt.',
    'Staat in het Supabase-dashboard onder Project Settings → Database → Connection string (URI). Zet hem in .env.',
  );
}

const probe = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
if (probe.error) {
  fail(
    'pg_dump staat niet op deze machine.',
    'Installeer de PostgreSQL client tools. Windows: `winget install PostgreSQL.PostgreSQL` of de installer van postgresql.org — je hebt alleen "Command Line Tools" nodig, niet de server.',
  );
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Tot op de minuut: twee dumps in dezelfde minuut zou betekenen dat je twee
// migraties binnen een minuut draait, en dan is er een groter probleem.
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const target = join(OUT_DIR, `goalbuddies-${stamp}.sql`);

if (existsSync(target)) {
  fail(`${target} bestaat al.`, 'Verplaats of verwijder hem eerst — een backup overschrijven is nooit de bedoeling.');
}

console.log(`\n  ${probe.stdout.trim()}`);
console.log(`  Dumpen naar ${target} …\n`);

const dump = spawnSync(
  'pg_dump',
  [url, '--no-owner', '--no-privileges', '--file', target],
  { stdio: 'inherit' },
);

if (dump.status !== 0) {
  // Een half bestand is gevaarlijker dan geen bestand: daar vertrouw je op.
  if (existsSync(target)) unlinkSync(target);
  fail('pg_dump is gestopt met een fout. De onvolledige dump is weggegooid.');
}

const { size } = statSync(target);
if (size < 1024) {
  unlinkSync(target);
  fail(
    `De dump was maar ${size} bytes en is weggegooid.`,
    'Dat betekent bijna zeker dat de verbinding niet klopte. Controleer SUPABASE_DB_URL.',
  );
}

console.log(`\n  ✓ ${target} — ${(size / 1024 / 1024).toFixed(2)} MB\n`);
