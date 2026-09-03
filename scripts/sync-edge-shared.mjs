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

// ⚠️ `--check` (via `npm run edge:sync:controle`) schrijft niets: het rekent uit
//    wat `edge:sync` zóu wegschrijven en vergelijkt dat met wat er nu op schijf
//    staat. Zo kan de controle per definitie niet uit de pas lopen met de sync —
//    het is dezelfde generatorcode. Groen betekent dat de kopieën in
//    `_shared/` kloppen met `src/`; rood betekent: draai `npm run edge:sync` en
//    commit het verschil vóór je deployt.
//
// ⚠️ Dit is de tweede helft van wat `edge:gedeployd` doet. Die vergelijkt de
//    gedéployde bundel met de repo; deze vergelijkt de gegenereerde kopie met
//    zijn origineel. Een achtergebleven kopie is groen bij de eerste en rood bij
//    deze — en dat is precies het gat waardoor de app en de jobs op 26-08-2026
//    met verschillende regels konden gaan werken.
const CONTROLE = process.argv.includes('--check');

/** De afwijkingen die `--check` gevonden heeft. */
const afwijkingen = [];

/** Wat er gekopieerd wordt, en waarheen. */
const SETS = [
  { bron: join('src', 'shared', 'time'), doel: join('supabase', 'functions', '_shared', 'time') },
  // ⚠️ Sinds QS8-206. `paginas()` is de lus waarmee de rollover zijn profielen
  //    afloopt; hij staat in `src/` omdat daar vitest draait, en hier omdat de
  //    Edge Function hem aanroept. Zelfde reden als `webpush-crypto.ts`.
  {
    bron: join('src', 'shared', 'bladeren'),
    doel: join('supabase', 'functions', '_shared', 'bladeren'),
    alleen: ['index.ts'],
  },
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
  {
    bron: join('src', 'lib', 'observability'),
    doel: join('supabase', 'functions', '_shared', 'observability'),
    // ⚠️ `index.ts` blijft hier bewust buiten: die trekt `../env` mee, en dat is
    //    de clientomgeving. De Edge Function leest zijn DSN uit `Deno.env`.
    //
    // ⚠️ `scrub.ts` gaat mee en wordt niet overgeschreven. Een tweede versie van
    //    de schoonmaakregels is precies de kopie die in dit project al een keer
    //    geruisloos uit elkaar liep — en hier zou dat betekenen dat de app en de
    //    jobs een verschillende opvatting hebben van wat een persoonsgegeven is.
    alleen: ['scrub.ts', 'edge-rapport.ts'],
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

  if (!CONTROLE) mkdirSync(set.doel, { recursive: true });

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

    const doelpad = join(set.doel, naam);
    const verwacht = kop(set.bron) + metExtensies;

    if (CONTROLE) {
      const huidig = lees(doelpad);
      if (huidig === null) {
        afwijkingen.push(`${doelpad} ontbreekt`);
      } else if (huidig !== verwacht) {
        afwijkingen.push(`${doelpad} loopt achter op ${join(set.bron, naam)}`);
      }
    } else {
      writeFileSync(doelpad, verwacht);
    }

    totaal += 1;
  }

  if (!CONTROLE) console.log(`  ✓ ${bestanden.length} bestanden gekopieerd naar ${set.doel}`);
}

if (CONTROLE) {
  if (afwijkingen.length > 0) {
    console.error(`  ✗ ${afwijkingen.length} kopie(ën) lopen niet gelijk met src/:`);
    for (const regel of afwijkingen) console.error(`    - ${regel}`);
    console.error('  → Draai `npm run edge:sync` en commit het verschil vóór je deployt.');
    process.exit(1);
  }

  console.log(`  ✓ alle ${totaal} gedeelde kopieën lopen gelijk met src/`);
  process.exit(0);
}

function lees(pad) {
  try {
    return readFileSync(pad, 'utf8');
  } catch {
    return null;
  }
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
