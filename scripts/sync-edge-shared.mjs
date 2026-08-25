#!/usr/bin/env node
/**
 * Kopieert gedeelde regels naar `supabase/functions/_shared`.
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
 *    Draai dit vóór elke deploy van een Edge Function.
 *
 * ⚠️ Sinds EPIC 11 gaat hier ook `modules/notifications/regels.ts` doorheen. Die
 *    regels bepalen wie er een melding krijgt en wie niet — inclusief "niets
 *    tijdens een adempauze" en "niets vanuit slapende groepen" — en ze staan
 *    onder test in `src/`. Een tweede versie in de Edge Function zou precies de
 *    kopie zijn die in dit project al een keer geruisloos uit elkaar liep.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** Wat er gekopieerd wordt, en waarheen. */
const SETS = [
  { bron: join('src', 'shared', 'time'), doel: join('supabase', 'functions', '_shared', 'time') },
  {
    bron: join('src', 'modules', 'notifications'),
    doel: join('supabase', 'functions', '_shared', 'notificaties'),
    // ⚠️ Alleen de pure bestanden. `tokens.ts` en `index.ts` trekken de
    //    Supabase-client mee, en die maakt de Edge Function zelf al aan.
    //
    // ⚠️ `webpush-crypto.ts` staat hier sinds 23-08-2026. De kop van dat bestand
    //    beweerde dat `edge:sync` hem meenam terwijl deze lijst hem niet kende —
    //    en juist die belofte is de hele motivering om hem in `src/` te zetten in
    //    plaats van in `supabase/functions/`. Hij heeft nul imports en gebruikt
    //    alleen WebCrypto, dus hij kán mee; dit maakt de belofte waar in plaats
    //    van hem te schrappen. Gevonden in de security-review van 23-08.
    // ⚠️ `webpush-verzenden.ts` staat hier sinds 25-08-2026 — het verzendpad dat
    //    er nooit was. Zelfde reden als hierboven: hij hoort in `src/` te staan
    //    omdat daar vitest draait, en hier omdat de Edge Function hem aanroept.
    alleen: ['regels.ts', 'webpush-crypto.ts', 'webpush-verzenden.ts'],
  },
];

function kop(bron) {
  return [
    '// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.',
    '//',
    `// Kopie van ${bron.replace(/\\/g, '/')}, gemaakt door \`npm run edge:sync\`.`,
    '// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat',
    '// verloren en, erger, laat de app en de jobs met verschillende regels werken.',
    '',
    '',
  ].join('\n');
}

let totaal = 0;

for (const set of SETS) {
  if (!bestaat(set.bron)) {
    console.error(`  ✗ Bron ontbreekt: ${set.bron}`);
    process.exit(1);
  }

  mkdirSync(set.doel, { recursive: true });

  const bestanden = readdirSync(set.bron).filter((naam) => {
    if (!naam.endsWith('.ts') || naam.endsWith('.test.ts')) return false;
    return set.alleen === undefined || set.alleen.includes(naam);
  });

  if (set.alleen !== undefined && bestanden.length !== set.alleen.length) {
    // ⚠️ Luid falen en niet stil minder kopiëren. Een hernoemd bestand zou
    //    anders een Edge Function opleveren die een oude kopie blijft gebruiken.
    console.error(
      `  ✗ Verwacht ${set.alleen.join(', ')} in ${set.bron}, gevonden: ${bestanden.join(', ') || 'niets'}`,
    );
    process.exit(1);
  }

  for (const naam of bestanden) {
    const inhoud = readFileSync(join(set.bron, naam), 'utf8');

    // Deno wil expliciete extensies in relatieve imports.
    const metExtensies = inhoud.replace(
      /from '\.\/([a-zA-Z0-9_-]+)'/g,
      (_treffer, module) => `from './${module}.ts'`,
    );

    writeFileSync(join(set.doel, naam), kop(set.bron) + metExtensies);
    totaal += 1;
  }

  console.log(`  ✓ ${bestanden.length} bestanden gekopieerd naar ${set.doel}`);
}

function bestaat(pad) {
  try {
    return statSync(pad).isDirectory();
  } catch {
    return false;
  }
}

console.log(`  ✓ ${totaal} bestanden in totaal`);
process.exit(0);
