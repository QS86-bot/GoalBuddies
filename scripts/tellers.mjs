#!/usr/bin/env node
/**
 * tellers — de testtellers in WERKVOORRAAD §2 worden gemeten, niet overgetypt.
 *
 * ⚠️ **Waarom dit bestaat (QS8-284).** Vier getallen in §2 waren een kopie van
 *    een meetbaar feit, en op 05-09 botsten ze **drie keer op rij** bij het
 *    samengaan met `main` — elke keer met twee verschillende antwoorden, en
 *    minstens één keer met een derde dat aan géén van beide kanten stond. Git
 *    struikelt alleen over de regel waar de tekst verschilt; de regel ernaast
 *    erft de aanname stilzwijgend.
 *
 *    `npm run stand` lost precies dit op voor het migratieblok, en dát blok
 *    botst nooit — want niemand schrijft het met de hand. Dit is hetzelfde
 *    recept voor de tellers.
 *
 * ## ⚠️ De telling komt uit de definitie en niet uit de uitvoer
 *
 * **Dit is het ontwerpwerk van dit issue en niet een detail.** Er lagen twee
 * even redelijke antwoorden op "hoeveel stappen heeft de poort" — 35/39 en
 * 36/38 — en allebei kwamen ze uit het *tellen van geprinte regels*. Die uitvoer
 * draagt naast de stappen ook samenvattingsregels die met hetzelfde teken
 * beginnen, dus wie regels telt, telt er te veel of moet raden welke niet
 * meetellen. Zo ontstaan twee tellingen die allebei kloppen voor hun eigen
 * regel, en geen van beide voor de poort.
 *
 * Hier wordt daarom de bron gelezen die de poort zélf gebruikt: `STAPPEN` plus
 * `controlesUit(package.json)`. Gemeten op 06-09-2026: **34 controles, 4 vaste
 * stappen, 38 samen.** Dat is per constructie hetzelfde getal dat de poort
 * afwerkt, en het is niet te betwisten met een andere manier van kijken.
 *
 * ## ⚠️ En de suites worden echt gedraaid
 *
 * Het aantal geslaagde tests is niet uit een bestand af te leiden. Deze
 * generator draait ze dus, en `--controle` doet dat ook. Dat kost de poort een
 * tweede testronde, en dat is de prijs voor een getal dat klopt in plaats van
 * een getal dat er stond.
 *
 * Zonder database is er niets te meten en meldt hij zich **overgeslagen** —
 * niet groen. Dat is de regel uit QS8-268/QS8-270, en de poort telt hem dan als
 * ongemeten.
 *
 * Draaien: `npm run tellers` (schrijft) of `npm run tellers:controle` (toetst).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STAPPEN, controlesUit } from './poort.mjs';
import { verbindingsoordeel } from './psql.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DOCUMENT = 'docs/WERKVOORRAAD.md';

export const BEGIN = '<!-- TELLERS:BEGIN — gegenereerd door `npm run tellers` -->';
export const EINDE = '<!-- TELLERS:EINDE -->';

/**
 * Hoeveel stappen de poort afwerkt, gelezen uit zijn eigen definitie.
 *
 * ⚠️ Niet uit zijn uitvoer. Zie de kop: dáár komen de twee onverenigbare
 *    tellingen vandaan die dit issue veroorzaakt hebben.
 */
export function tellingUitPakket(scripts) {
  const controles = controlesUit(scripts).length;
  return { controles, stappen: STAPPEN.length + controles };
}

/**
 * Leest `Test Files  N passed` en `Tests  N passed | M skipped` uit de uitvoer
 * van vitest.
 *
 * ⚠️ **Geeft `null` bij een uitvoer die hij niet herkent, en gooit niet.** Een
 *    generator die op een gewijzigd reporterformaat een half getal wegschrijft,
 *    is erger dan een die zegt dat hij het niet weet.
 */
export function leesVitestUitvoer(tekst) {
  const bestanden = /Test Files\s+(\d+) passed/.exec(String(tekst ?? ''));
  const tests = /Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?/.exec(String(tekst ?? ''));
  if (bestanden === null || tests === null) return null;

  return {
    bestanden: Number(bestanden[1]),
    geslaagd: Number(tests[1]),
    overgeslagen: Number(tests[2] ?? 0),
  };
}

/** De regels zoals ze in het document horen te staan. */
export function tellersRegels({ geslaagd, overgeslagen, bestanden, controles, stappen }) {
  return [
    `De hele suite geeft met de stack **${geslaagd} geslaagd en ${overgeslagen} overgeslagen**`,
    `over ${bestanden} bestanden.`,
    `Typecheck, lint en alle ${controles} controlescripts groen;`,
    `\`npm run poort\` meldt ${stappen} stappen.`,
  ].join('\n');
}

/** Het blok zoals het nu in het document staat, of `null` als het er niet is. */
export function blokUit(document) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1 || tot < van) return null;
  return document.slice(van + BEGIN.length, tot).trim();
}

/** Zet een nieuw blok in het document. */
export function vervangBlok(document, tekst) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1 || tot < van) {
    throw new Error(`De markeringen ${BEGIN} … ${EINDE} staan niet in het document.`);
  }
  return `${document.slice(0, van + BEGIN.length)}\n${tekst}\n${document.slice(tot)}`;
}

/* c8 ignore start */
function meetSuite() {
  const uit = execFileSync('npx', ['vitest', 'run'], {
    cwd: WORTEL,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RLS_DOEL: 'lokaal' },
  });
  return leesVitestUitvoer(uit);
}

function hoofd() {
  const alleenControleren = process.argv.includes('--controle');
  const pad = join(WORTEL, DOCUMENT);
  const document = readFileSync(pad, 'utf8');
  const pakket = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8'));

  let gemeten;
  try {
    gemeten = meetSuite();
  } catch (fout) {
    const melding = `${String(fout?.stdout ?? '')}\n${String(fout?.stderr ?? '')}`;
    const oordeel = verbindingsoordeel(melding);

    if (oordeel === 'geen-server' || oordeel === 'geen-database') {
      // ⚠️ **Een eigen tekst en niet `verbindingsmelding()`, en dat is gemeten.**
      //    Die helper sluit af met "psql zei: …", en deze controle roept geen
      //    psql aan — hij draait vitest. Bij de eerste versie stond er dus een
      //    lege `psql zei:` onder een verder kloppende melding, en een regel die
      //    suggereert dat er een programma gesproken heeft dat niet gedraaid is,
      //    is precies het soort halve waarheid dat QS8-268 uit deze meldingen
      //    haalde. Het oordeel komt wél uit `verbindingsoordeel()`: dat is de
      //    gedeelde kennis over hoe "geen server" eruitziet.
      process.stderr.write(
        `⚠ tellers: OVERGESLAGEN — ${
          oordeel === 'geen-database' ? 'de database bestaat niet' : 'er draait geen database'
        }.\n\n` +
          'Hij draait beide testsuites om te weten hoeveel er slagen; zonder de\n' +
          'lokale stack blijft de RLS-helft leeg en telt hij iets anders dan hij\n' +
          'schrijft. Start hem met `npm run rls:stack`.\n',
      );
      return;
    }

    process.stderr.write('✗ tellers: de suite kwam niet groen door, dus er valt niets te tellen.\n');
    process.stderr.write(`${melding.split('\n').slice(-15).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  if (gemeten === null) {
    process.stderr.write('✗ tellers: de uitvoer van vitest was niet te lezen.\n');
    process.exitCode = 1;
    return;
  }

  const verwacht = tellersRegels({ ...gemeten, ...tellingUitPakket(pakket.scripts) });
  const huidig = blokUit(document);

  if (huidig === verwacht) {
    if (!alleenControleren) process.stdout.write('tellers: het blok klopt al.\n');
    return;
  }

  if (alleenControleren) {
    process.stderr.write('✗ De tellers in WERKVOORRAAD §2 kloppen niet met wat er gemeten is.\n\n');
    process.stderr.write(`  er staat:\n${(huidig ?? '(geen blok gevonden)').replace(/^/gm, '    ')}\n\n`);
    process.stderr.write(`  het hoort te zijn:\n${verwacht.replace(/^/gm, '    ')}\n\n`);
    process.stderr.write('Draai `npm run tellers`. Met de hand bijwerken heeft geen zin —\n');
    process.stderr.write('dit blok is een kopie van een meting en hoort er ook een te blijven.\n');
    process.exitCode = 1;
    return;
  }

  writeFileSync(pad, vervangBlok(document, verwacht));
  process.stdout.write('✓ tellers-blok bijgewerkt in WERKVOORRAAD §2.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
/* c8 ignore stop */
