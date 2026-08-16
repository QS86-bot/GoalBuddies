#!/usr/bin/env node
/**
 * Kopieert `src/shared/time` naar `supabase/functions/_shared/time`.
 *
 * ⚠️ Waarom kopiëren en niet importeren. Edge Functions draaien op Deno en
 *    worden apart gedeployd; ze kunnen niet bij `src/`. Tegelijk verbiedt
 *    CLAUDE.md correctheidsregel 7 elke week- of tijdberekening buiten
 *    `shared/time` — dus de rollover-job mag zijn cyclusrekenwerk niet zelf
 *    overdoen, en al helemaal niet in SQL.
 *
 *    Kopiëren met een generator is het minst slechte van drie kwaden: de code
 *    blijft één bron van waarheid, de kopie is duidelijk gemarkeerd als
 *    gegenereerd, en `npm run edge:sync` maakt hem opnieuw.
 *
 *    Draai dit vóór elke deploy van een Edge Function die met tijd rekent.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const BRON = join('src', 'shared', 'time');
const DOEL = join('supabase', 'functions', '_shared', 'time');

const KOP = [
  '// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.',
  '//',
  '// Kopie van src/shared/time, gemaakt door `npm run edge:sync`. Bewerk het',
  '// origineel en draai het script opnieuw; een wijziging hier gaat verloren en,',
  '// erger, laat de app en de rollover-job met verschillende weken rekenen.',
  '',
  '',
].join('\n');

mkdirSync(DOEL, { recursive: true });

const bestanden = readdirSync(BRON).filter(
  (naam) => naam.endsWith('.ts') && !naam.endsWith('.test.ts'),
);

for (const naam of bestanden) {
  const inhoud = readFileSync(join(BRON, naam), 'utf8');

  // Deno wil expliciete extensies in relatieve imports.
  const metExtensies = inhoud.replace(
    /from '\.\/([a-zA-Z0-9_-]+)'/g,
    (_treffer, module) => `from './${module}.ts'`,
  );

  writeFileSync(join(DOEL, naam), KOP + metExtensies);
}

void copyFileSync;

console.log(`  ✓ ${bestanden.length} bestanden gekopieerd naar ${DOEL}`);
process.exit(0);
