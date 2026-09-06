#!/usr/bin/env node
/**
 * poortstand — hoeveel controles en hoeveel stappen de poort kent, gegenereerd
 * in plaats van overgetypt.
 *
 * ⚠️ **Waarom dit bestaat, en het is precies de reden die in `stand.mjs` staat.**
 *    Op 05-09-2026 botste `WERKVOORRAAD` §2 **vijf keer op één dag** op deze twee
 *    regels, en er stonden drie verschillende antwoorden in:
 *
 *      ronde 1   main 36 controles / 38 stappen   branch 35 / 39
 *      ronde 2   main 36 / 38                     branch 35 / 39
 *      ronde 3   main 34 / 38                     branch 35 / 39
 *
 *    Gemeten uit de poort zelf: 35 en 39. Twee van de drie handmatige antwoorden
 *    waren dus fout, en de derde had geluk. Dat is geen slordigheid van iemand;
 *    het is een kopie zonder generator, precies wat QS8-125 verbiedt.
 *
 * ⚠️ **Deze twee getallen zijn exact af te leiden en vragen geen database, geen
 *    testrun en geen netwerk.** De poort bouwt zijn lijst uit `STAPPEN` plus
 *    élke `*:controle` in `package.json` (`controlesUit`), en dit script leest
 *    dezelfde twee bronnen. Het blok kán daarom niet meer uiteenlopen met wat de
 *    poort werkelijk draait — en twee sessies die allebei regenereren, schrijven
 *    letterlijk dezelfde regel: geen conflict meer.
 *
 * ⚠️ **De testtellers staan hier bewust níet in.** Die zijn geen eigenschap van
 *    de repo maar van een dráaiende suite, en ze verschillen legitiem per branch.
 *    Een generator zou daar de botsing niet wegnemen — hij zou hem alleen juist
 *    beslechten, en dan pas ná een volledige run met stack. De ijking van díe
 *    getallen is `npm run poort` zelf; wie ze bijwerkt, meet ze en telt ze niet
 *    op. **Een generator die meer belooft dan hij zonder run kan weten, is een
 *    kopie met extra stappen.** Zie de dossierrij van 06-09.
 *
 * Draaien: `npm run poortstand` schrijft het blok. `npm run poortstand -- --controle`
 * zegt alleen of het achterloopt, en die vorm draait mee als `poortstand:controle`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STAPPEN, controlesUit } from './poort.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DOCUMENT = 'docs/WERKVOORRAAD.md';

export const BEGIN = '<!-- POORTSTAND:BEGIN — gegenereerd door `npm run poortstand` -->';
export const EINDE = '<!-- POORTSTAND:EINDE -->';

/**
 * De regel zoals hij in het document hoort te staan.
 *
 * ⚠️ **De poort is de bron en niet een tweede telling.** Dit gebruikt letterlijk
 *    `STAPPEN` en `controlesUit()` uit `poort.mjs`. Zou het hier zelf de scripts
 *    filteren, dan bestaan er weer twee definities van "een stap", en dan is het
 *    verschil tussen 38 en 39 terug — alleen ditmaal tussen twee scripts in
 *    plaats van tussen twee mensen.
 */
export function poortstandRegels(scripts) {
  const controles = controlesUit(scripts).length;
  const stappen = STAPPEN.length + controles;

  return [
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

/**
 * Zet een nieuw blok in het document.
 *
 * ⚠️ Ontbreken de markeringen, dan is dat een fout en geen stille toevoeging —
 *    zelfde reden als in `stand.mjs`: een generator die zelf een plek kiest, zet
 *    het blok een keer middenin een andere alinea.
 */
export function vervangBlok(document, tekst) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1 || tot < van) {
    throw new Error(`De markeringen ${BEGIN} … ${EINDE} staan niet in het document.`);
  }
  return `${document.slice(0, van + BEGIN.length)}\n${tekst}\n${document.slice(tot)}`;
}

function hoofd() {
  const alleenControleren = process.argv.includes('--controle');
  const pad = join(WORTEL, DOCUMENT);
  const document = readFileSync(pad, 'utf8');
  const pakket = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8'));
  const verwacht = poortstandRegels(pakket.scripts);
  const huidig = blokUit(document);

  if (huidig === verwacht) {
    if (!alleenControleren) process.stdout.write('poortstand: het blok klopt al.\n');
    return;
  }

  if (alleenControleren) {
    process.stderr.write('✗ Het poortstand-blok in WERKVOORRAAD §2 loopt achter op de poort.\n\n');
    process.stderr.write(`  er staat:\n${(huidig ?? '(geen blok gevonden)').replace(/^/gm, '    ')}\n\n`);
    process.stderr.write(`  het hoort te zijn:\n${verwacht.replace(/^/gm, '    ')}\n\n`);
    process.stderr.write('Draai `npm run poortstand`. Met de hand bijwerken heeft geen zin —\n');
    process.stderr.write('dit blok is een kopie van `STAPPEN` plus elke `*:controle`,\n');
    process.stderr.write('en hoort er ook een te blijven.\n');
    process.exitCode = 1;
    return;
  }

  writeFileSync(pad, vervangBlok(document, verwacht));
  process.stdout.write('✓ poortstand-blok bijgewerkt in WERKVOORRAAD §2.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
